import { AppError } from '../shared/ipc/errors.js';
import { AiSettingsRepository } from './settingsRepository.js';
import { DEFAULT_OUTPUT_TOKEN_BUDGET } from './types.js';

export interface ApiKeyProvider {
  getApiKey(): Promise<string>;
}

export interface OpenAiGenerationRequest {
  apiKey: string;
  model: string;
  prompt: string;
  maxOutputTokens: number;
  signal: AbortSignal;
}

export interface OpenAiGenerationResponse {
  text: string;
}

export class OpenAiTransportError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface OpenAiTransport {
  generate(request: OpenAiGenerationRequest): Promise<OpenAiGenerationResponse>;
}

export interface OpenAiRuntimePolicy {
  timeoutMs: number;
  retryDelaysMs: readonly number[];
  outputTokenBudget: number;
}

export interface GenerateProvocationInput {
  requestId: string;
  prompt: string;
  modelOverride?: string;
  maxOutputTokens?: number;
}

export interface GenerateProvocationResult {
  text: string;
  model: string;
}

const DEFAULT_RUNTIME_POLICY: OpenAiRuntimePolicy = {
  timeoutMs: 25_000,
  retryDelaysMs: [500, 1500],
  outputTokenBudget: DEFAULT_OUTPUT_TOKEN_BUDGET
};

const retryableStatus = (status: number): boolean => status === 429 || status >= 500;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

const shorten = (value: string, max = 240): string => {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }

  return `${trimmed.slice(0, max - 3)}...`;
};

const extractProviderErrorMessage = (payload: unknown): string | null => {
  if (!isRecord(payload)) {
    return null;
  }

  const maybeError = payload.error;
  if (isRecord(maybeError) && typeof maybeError.message === 'string' && maybeError.message.trim()) {
    return shorten(maybeError.message);
  }

  if (typeof payload.message === 'string' && payload.message.trim()) {
    return shorten(payload.message);
  }

  return null;
};

export class FetchOpenAiTransport implements OpenAiTransport {
  async generate(request: OpenAiGenerationRequest): Promise<OpenAiGenerationResponse> {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${request.apiKey}`
      },
      body: JSON.stringify({
        model: request.model,
        input: request.prompt,
        max_output_tokens: request.maxOutputTokens
      }),
      signal: request.signal
    });

    if (!response.ok) {
      let providerMessage: string | null = null;
      try {
        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          providerMessage = extractProviderErrorMessage(await response.json());
        } else {
          const text = (await response.text()).trim();
          providerMessage = text ? shorten(text) : null;
        }
      } catch {
        providerMessage = null;
      }

      const message = providerMessage
        ? `OpenAI request failed (${response.status}): ${providerMessage}`
        : `OpenAI request failed (${response.status})`;
      throw new OpenAiTransportError(response.status, message);
    }

    const payload = (await response.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
    };

    const outputText =
      payload.output_text ??
      payload.output?.flatMap((item) => item.content ?? []).find((content) => content.text)?.text;

    if (!outputText || !outputText.trim()) {
      throw new OpenAiTransportError(502, 'OpenAI response did not include output text');
    }

    return { text: outputText.trim() };
  }
}

export class OpenAIClient {
  private readonly activeControllersByRequestId = new Map<string, AbortController>();

  private readonly runtimePolicy: OpenAiRuntimePolicy;

  constructor(
    private readonly settingsRepository: AiSettingsRepository,
    private readonly apiKeyProvider: ApiKeyProvider,
    private readonly transport: OpenAiTransport = new FetchOpenAiTransport(),
    runtimePolicy?: Partial<OpenAiRuntimePolicy>,
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => {
        setTimeout(resolve, ms);
      }),
    private readonly random: () => number = Math.random
  ) {
    this.runtimePolicy = {
      ...DEFAULT_RUNTIME_POLICY,
      ...runtimePolicy
    };
  }

  cancel(requestId: string): boolean {
    const controller = this.activeControllersByRequestId.get(requestId);
    if (!controller) {
      return false;
    }

    controller.abort('cancelled');
    this.activeControllersByRequestId.delete(requestId);
    return true;
  }

  async generateProvocation(input: GenerateProvocationInput): Promise<GenerateProvocationResult> {
    const settings = this.settingsRepository.getWorkspaceSettings();
    const model = input.modelOverride?.trim() || settings.generationModel;

    if (!model) {
      throw new AppError('E_VALIDATION', 'Generation model is required');
    }

    const controller = new AbortController();
    this.activeControllersByRequestId.set(input.requestId, controller);

    const timeout = setTimeout(() => {
      controller.abort('timeout');
    }, this.runtimePolicy.timeoutMs);

    try {
      const apiKey = await this.apiKeyProvider.getApiKey();
      if (!apiKey.trim()) {
        throw new AppError('E_UNAUTHORIZED', 'Missing OpenAI API key');
      }

      const result = await this.executeWithRetry({
        apiKey: apiKey.trim(),
        model,
        prompt: input.prompt,
        maxOutputTokens: input.maxOutputTokens ?? this.runtimePolicy.outputTokenBudget,
        signal: controller.signal
      });

      return {
        text: result.text,
        model
      };
    } catch (error) {
      if (controller.signal.aborted) {
        const reason = controller.signal.reason;
        if (reason === 'timeout') {
          throw new AppError('E_PROVIDER', 'OpenAI request timed out');
        }

        throw new AppError('E_CONFLICT', 'AI request cancelled');
      }

      if (error instanceof OpenAiTransportError && error.status === 401) {
        throw new AppError('E_UNAUTHORIZED', 'Invalid OpenAI API key');
      }

      if (error instanceof OpenAiTransportError) {
        throw new AppError('E_PROVIDER', error.message, {
          status: error.status
        });
      }

      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        'E_PROVIDER',
        `OpenAI provider request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      clearTimeout(timeout);
      this.activeControllersByRequestId.delete(input.requestId);
    }
  }

  private async executeWithRetry(request: OpenAiGenerationRequest): Promise<OpenAiGenerationResponse> {
    const delays = this.runtimePolicy.retryDelaysMs;

    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      try {
        return await this.transport.generate(request);
      } catch (error) {
        if (request.signal.aborted) {
          throw error;
        }

        const canRetry =
          error instanceof OpenAiTransportError &&
          retryableStatus(error.status) &&
          attempt < delays.length;

        if (!canRetry) {
          throw error;
        }

        const baseDelay = delays[attempt] ?? 0;
        const jitter = Math.floor(baseDelay * 0.2 * this.random());
        await this.sleep(baseDelay + jitter);
      }
    }

    throw new AppError('E_PROVIDER', 'OpenAI provider request failed after retries');
  }
}
