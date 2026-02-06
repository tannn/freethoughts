import { describe, expect, it } from 'vitest';
import {
  AiSettingsRepository,
  FetchOpenAiTransport,
  OpenAIClient,
  OpenAiTransportError,
  type OpenAiGenerationRequest,
  type OpenAiGenerationResponse,
  type OpenAiTransport
} from '../src/ai/index.js';
import { AppError } from '../src/shared/ipc/errors.js';
import { createTempDb, createTempDir } from './helpers/db.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('openai runtime policy defaults', () => {
  it('retries 429/5xx with configured backoff delays', async () => {
    const { dbPath } = createTempDb();
    const settings = new AiSettingsRepository(dbPath);

    let attempts = 0;
    const transport: OpenAiTransport = {
      async generate(_request: OpenAiGenerationRequest): Promise<OpenAiGenerationResponse> {
        attempts += 1;
        if (attempts === 1) {
          throw new OpenAiTransportError(429, 'rate limit');
        }
        if (attempts === 2) {
          throw new OpenAiTransportError(500, 'server error');
        }
        return { text: 'ok' };
      }
    };

    const delays: number[] = [];
    const client = new OpenAIClient(
      settings,
      { getApiKey: async () => 'key' },
      transport,
      { timeoutMs: 5000, retryDelaysMs: [50, 150] },
      async (delayMs) => {
        delays.push(delayMs);
      },
      () => 0
    );

    const result = await client.generateProvocation({
      requestId: 'retry-req',
      prompt: 'retry prompt'
    });

    expect(result.text).toBe('ok');
    expect(attempts).toBe(3);
    expect(delays).toEqual([50, 150]);
  });

  it('times out requests using the configured timeout policy', async () => {
    const { dbPath } = createTempDb();
    const settings = new AiSettingsRepository(dbPath);

    const transport: OpenAiTransport = {
      generate(request: OpenAiGenerationRequest): Promise<OpenAiGenerationResponse> {
        return new Promise((_resolve, reject) => {
          if (request.signal.aborted) {
            reject(new Error('aborted'));
            return;
          }

          request.signal.addEventListener(
            'abort',
            () => {
              reject(new Error('aborted'));
            },
            { once: true }
          );
        });
      }
    };

    const client = new OpenAIClient(settings, { getApiKey: async () => 'key' }, transport, {
      timeoutMs: 15,
      retryDelaysMs: [5, 10]
    });

    await expect(
      client.generateProvocation({
        requestId: 'timeout-req',
        prompt: 'timeout prompt'
      })
    ).rejects.toMatchObject({
      code: 'E_PROVIDER'
    } satisfies Partial<AppError>);
  });

  it('supports request-scoped cancellation via requestId', async () => {
    const { dbPath } = createTempDb();
    const settings = new AiSettingsRepository(dbPath);

    const transport: OpenAiTransport = {
      generate(request: OpenAiGenerationRequest): Promise<OpenAiGenerationResponse> {
        return new Promise((_resolve, reject) => {
          if (request.signal.aborted) {
            reject(new Error('aborted'));
            return;
          }

          request.signal.addEventListener(
            'abort',
            () => {
              reject(new Error('aborted'));
            },
            { once: true }
          );
        });
      }
    };

    const client = new OpenAIClient(settings, { getApiKey: async () => 'key' }, transport, {
      timeoutMs: 10_000,
      retryDelaysMs: [5, 10]
    });

    const inflight = client.generateProvocation({
      requestId: 'cancel-req',
      prompt: 'cancel prompt'
    });

    const cancelled = client.cancel('cancel-req');
    expect(cancelled).toBe(true);

    await expect(inflight).rejects.toMatchObject({
      code: 'E_CONFLICT'
    } satisfies Partial<AppError>);
  });

  it('preserves provider error details for non-retryable failures', async () => {
    const { dbPath } = createTempDb();
    const settings = new AiSettingsRepository(dbPath);

    const transport: OpenAiTransport = {
      async generate(): Promise<OpenAiGenerationResponse> {
        throw new OpenAiTransportError(400, 'OpenAI request failed (400): model not found');
      }
    };

    const client = new OpenAIClient(settings, { getApiKey: async () => 'key' }, transport);

    await expect(
      client.generateProvocation({
        requestId: 'provider-err',
        prompt: 'provider prompt'
      })
    ).rejects.toMatchObject({
      code: 'E_PROVIDER',
      message: 'OpenAI request failed (400): model not found',
      details: { status: 400 }
    } satisfies Partial<AppError>);
  });

  it('writes OpenAI responses to the configured logfile', async () => {
    const originalFetch = globalThis.fetch;
    const logPath = join(createTempDir(), 'openai-responses.log');
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          output: [{ content: [{ type: 'output_text', text: 'Generated output text.' }] }]
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );

    try {
      const transport = new FetchOpenAiTransport({ logPath });
      await transport.generate({
        apiKey: 'test-key',
        model: 'gpt-4.1-mini',
        prompt: 'Test prompt',
        maxOutputTokens: 120,
        signal: new AbortController().signal
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const logContent = readFileSync(logPath, 'utf8');
    expect(logContent).toContain('"ok":true');
    expect(logContent).toContain('"status":200');
    expect(logContent).toContain('"responseBody"');
  });

  it('fails fast on incomplete max_output_tokens responses without retrying', async () => {
    const { dbPath } = createTempDb();
    const settings = new AiSettingsRepository(dbPath);
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;

    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response(
        JSON.stringify({
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
          output: [{ type: 'reasoning', summary: [] }]
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    };

    try {
      const client = new OpenAIClient(settings, { getApiKey: async () => 'key' }, new FetchOpenAiTransport(), {
        timeoutMs: 5_000,
        retryDelaysMs: [5, 15]
      });

      await expect(
        client.generateProvocation({
          requestId: 'incomplete-req',
          prompt: 'incomplete prompt'
        })
      ).rejects.toMatchObject({
        code: 'E_PROVIDER',
        message: 'OpenAI response incomplete: max_output_tokens was reached before any text output.',
        details: { status: 400 }
      } satisfies Partial<AppError>);
      expect(fetchCalls).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
