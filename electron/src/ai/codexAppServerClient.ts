import { AppError } from '../shared/ipc/errors.js';
import { AiSettingsRepository } from './settingsRepository.js';
import type {
  CodexAppServerInitializeParams,
  CodexAppServerThreadStartParams,
  CodexAppServerTurnInterruptParams,
  CodexAppServerTurnStartParams
} from './codexAppServerProtocol.js';
import type {
  GenerationRequest,
  GenerationResult,
  ProvocationGenerationClient
} from './generationClient.js';

export type CodexAppServerTransportErrorKind =
  | 'runtime_unavailable'
  | 'runtime_inaccessible'
  | 'permission_denied'
  | 'protocol_error'
  | 'provider_error';

export class CodexAppServerTransportError extends Error {
  readonly kind: CodexAppServerTransportErrorKind;

  readonly details?: unknown;

  constructor(kind: CodexAppServerTransportErrorKind, message: string, details?: unknown) {
    super(message);
    this.kind = kind;
    this.details = details;
  }
}

export interface CodexAppServerTurnCompletion {
  turnStatus: 'completed' | 'failed' | 'interrupted';
  outputText: string | null;
  errorMessage?: string | null;
}

export interface CodexAppServerGenerationTransport {
  initialize(input: {
    params: CodexAppServerInitializeParams;
    signal: AbortSignal;
  }): Promise<void>;

  startSession(input: {
    params: CodexAppServerThreadStartParams;
    signal: AbortSignal;
  }): Promise<{ threadId: string }>;

  sendTurn(input: {
    params: CodexAppServerTurnStartParams;
    signal: AbortSignal;
  }): Promise<{ turnId: string }>;

  waitForTurnCompletion(input: {
    threadId: string;
    turnId: string;
    signal: AbortSignal;
  }): Promise<CodexAppServerTurnCompletion>;

  cancelTurn(input: { params: CodexAppServerTurnInterruptParams }): Promise<void>;
}

const unavailableDetails = {
  action: 'switch_to_api_key',
  options: ['switch_to_api_key']
} as const;

export class UnavailableCodexAppServerTransport implements CodexAppServerGenerationTransport {
  private unavailable(kind: 'runtime_unavailable' | 'runtime_inaccessible'): never {
    throw new CodexAppServerTransportError(
      kind,
      'Codex App Server runtime unavailable in this environment.'
    );
  }

  async initialize(): Promise<void> {
    this.unavailable('runtime_unavailable');
  }

  async startSession(): Promise<{ threadId: string }> {
    this.unavailable('runtime_unavailable');
  }

  async sendTurn(): Promise<{ turnId: string }> {
    this.unavailable('runtime_unavailable');
  }

  async waitForTurnCompletion(): Promise<CodexAppServerTurnCompletion> {
    this.unavailable('runtime_unavailable');
  }

  async cancelTurn(): Promise<void> {
    this.unavailable('runtime_unavailable');
  }
}

const appServerModel = (value: string): string => {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : 'gpt-4.1-mini';
};

export interface CodexAppServerClientOptions {
  settingsRepository: AiSettingsRepository;
  transport?: CodexAppServerGenerationTransport;
  timeoutMs?: number;
  clientInfo?: {
    name: string;
    version: string;
  };
}

interface ActiveTurnContext {
  controller: AbortController;
  threadId?: string;
  turnId?: string;
}

export class CodexAppServerClient implements ProvocationGenerationClient {
  private readonly activeByRequestId = new Map<string, ActiveTurnContext>();

  private readonly transport: CodexAppServerGenerationTransport;

  private readonly timeoutMs: number;

  private readonly clientInfo: {
    name: string;
    version: string;
  };

  constructor(private readonly options: CodexAppServerClientOptions) {
    this.transport = options.transport ?? new UnavailableCodexAppServerTransport();
    this.timeoutMs = options.timeoutMs ?? 25_000;
    this.clientInfo = options.clientInfo ?? {
      name: 'toolsforthought',
      version: '0.0.1'
    };
  }

  cancel(requestId: string): boolean {
    const active = this.activeByRequestId.get(requestId);
    if (!active) {
      return false;
    }

    active.controller.abort('cancelled');
    this.activeByRequestId.delete(requestId);

    if (active.threadId && active.turnId) {
      void this.transport.cancelTurn({
        params: {
          threadId: active.threadId,
          turnId: active.turnId
        }
      });
    }

    return true;
  }

  async generateProvocation(input: GenerationRequest): Promise<GenerationResult> {
    const workspaceSettings = this.options.settingsRepository.getWorkspaceSettings();
    const model = appServerModel(input.modelOverride ?? workspaceSettings.generationModel);
    if (!model) {
      throw new AppError('E_VALIDATION', 'Generation model is required');
    }

    const controller = new AbortController();
    const active: ActiveTurnContext = { controller };
    this.activeByRequestId.set(input.requestId, active);
    const timeout = setTimeout(() => {
      controller.abort('timeout');
    }, this.timeoutMs);

    try {
      await this.transport.initialize({
        params: {
          clientInfo: this.clientInfo
        },
        signal: controller.signal
      });

      const session = await this.transport.startSession({
        params: {
          model
        },
        signal: controller.signal
      });
      active.threadId = session.threadId;

      const turn = await this.transport.sendTurn({
        params: {
          threadId: session.threadId,
          model,
          input: [{ type: 'text', text: input.prompt }]
        },
        signal: controller.signal
      });
      active.turnId = turn.turnId;

      const completion = await this.transport.waitForTurnCompletion({
        threadId: session.threadId,
        turnId: turn.turnId,
        signal: controller.signal
      });

      if (completion.turnStatus !== 'completed') {
        throw new CodexAppServerTransportError(
          'provider_error',
          completion.errorMessage?.trim() || 'Codex App Server turn did not complete successfully.',
          {
            turnStatus: completion.turnStatus
          }
        );
      }

      const outputText = completion.outputText?.trim() ?? '';
      if (!outputText) {
        throw new CodexAppServerTransportError(
          'protocol_error',
          'Codex App Server returned malformed generation output.'
        );
      }

      return {
        text: outputText,
        model
      };
    } catch (error) {
      if (controller.signal.aborted) {
        if (controller.signal.reason === 'timeout') {
          throw new AppError('E_PROVIDER', 'Codex App Server request timed out');
        }

        throw new AppError('E_CONFLICT', 'AI request cancelled');
      }

      if (error instanceof AppError) {
        throw error;
      }

      if (error instanceof CodexAppServerTransportError) {
        throw this.mapTransportError(error);
      }

      throw new AppError(
        'E_PROVIDER',
        `Codex App Server request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      clearTimeout(timeout);
      this.activeByRequestId.delete(input.requestId);
    }
  }

  private mapTransportError(error: CodexAppServerTransportError): AppError {
    if (error.kind === 'permission_denied') {
      return new AppError(
        'E_UNAUTHORIZED',
        'Codex login lacks required generation permission. Switch to API key mode.',
        {
          ...unavailableDetails,
          reason: 'permission_denied'
        }
      );
    }

    if (error.kind === 'runtime_unavailable' || error.kind === 'runtime_inaccessible') {
      return new AppError(
        'E_PROVIDER',
        'Codex App Server runtime unavailable. Switch to API key mode.',
        {
          ...unavailableDetails,
          reason: error.kind
        }
      );
    }

    if (error.kind === 'protocol_error') {
      return new AppError('E_PROVIDER', error.message, {
        reason: 'protocol_error'
      });
    }

    return new AppError('E_PROVIDER', error.message, {
      reason: 'provider_error',
      ...(error.details === undefined ? {} : { details: error.details })
    });
  }
}
