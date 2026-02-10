import { describe, expect, it } from 'vitest';
import {
  AiSettingsRepository,
  CodexAppServerClient,
  CodexAppServerTransportError,
  type CodexAppServerGenerationTransport,
  type CodexAppServerTurnCompletion
} from '../src/ai/index.js';
import { AppError } from '../src/shared/ipc/errors.js';
import { createTempDb } from './helpers/db.js';

class RecordingTransport implements CodexAppServerGenerationTransport {
  initializeCalls = 0;

  startSessionCalls = 0;

  sendTurnCalls = 0;

  cancelTurnCalls: Array<{ threadId: string; turnId: string }> = [];

  lastPrompt: string | null = null;

  initializeError: unknown = null;

  waitForTurnCompletionImpl: (signal: AbortSignal) => Promise<CodexAppServerTurnCompletion> = async () => ({
    turnStatus: 'completed',
    outputText: 'Generated via app server'
  });

  async initialize(): Promise<void> {
    this.initializeCalls += 1;
    if (this.initializeError) {
      throw this.initializeError;
    }
  }

  async startSession(): Promise<{ threadId: string }> {
    this.startSessionCalls += 1;
    return { threadId: 'thread-1' };
  }

  async sendTurn(input: {
    params: { threadId: string; input: Array<{ type: 'text'; text: string }> };
  }): Promise<{ turnId: string }> {
    this.sendTurnCalls += 1;
    this.lastPrompt = input.params.input[0]?.text ?? null;
    return { turnId: 'turn-1' };
  }

  async waitForTurnCompletion(input: {
    signal: AbortSignal;
  }): Promise<CodexAppServerTurnCompletion> {
    return this.waitForTurnCompletionImpl(input.signal);
  }

  async cancelTurn(input: { params: { threadId: string; turnId: string } }): Promise<void> {
    this.cancelTurnCalls.push({
      threadId: input.params.threadId,
      turnId: input.params.turnId
    });
  }
}

const setupClient = (transport: RecordingTransport, timeoutMs = 25_000): CodexAppServerClient => {
  const { dbPath } = createTempDb();
  const settings = new AiSettingsRepository(dbPath);
  settings.updateWorkspaceSettings({ generationModel: 'gpt-4.1-mini' });
  return new CodexAppServerClient({
    settingsRepository: settings,
    transport,
    timeoutMs
  });
};

describe('codex app server generation client', () => {
  it('generates via initialize -> start session -> send turn flow', async () => {
    const transport = new RecordingTransport();
    const client = setupClient(transport);

    const result = await client.generateProvocation({
      requestId: 'req-success',
      prompt: 'Challenge this claim.'
    });

    expect(result).toEqual({
      text: 'Generated via app server',
      model: 'gpt-4.1-mini'
    });
    expect(transport.initializeCalls).toBe(1);
    expect(transport.startSessionCalls).toBe(1);
    expect(transport.sendTurnCalls).toBe(1);
    expect(transport.lastPrompt).toBe('Challenge this claim.');
  });

  it('maps runtime unavailable errors to actionable fallback guidance', async () => {
    const transport = new RecordingTransport();
    transport.initializeError = new CodexAppServerTransportError(
      'runtime_unavailable',
      'codex runtime missing'
    );

    const client = setupClient(transport);

    await expect(
      client.generateProvocation({
        requestId: 'req-unavailable',
        prompt: 'Prompt'
      })
    ).rejects.toMatchObject({
      code: 'E_PROVIDER',
      details: expect.objectContaining({
        action: 'switch_to_api_key'
      })
    } satisfies Partial<AppError>);
  });

  it('times out long-running requests and maps to E_PROVIDER', async () => {
    const transport = new RecordingTransport();
    transport.waitForTurnCompletionImpl = async (signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            reject(new Error('aborted'));
          },
          { once: true }
        );
      });

    const client = setupClient(transport, 10);

    await expect(
      client.generateProvocation({
        requestId: 'req-timeout',
        prompt: 'Prompt'
      })
    ).rejects.toMatchObject({
      code: 'E_PROVIDER',
      message: 'Codex App Server request timed out'
    } satisfies Partial<AppError>);
  });

  it('supports request-scoped cancellation and interrupts the active turn', async () => {
    const transport = new RecordingTransport();
    transport.waitForTurnCompletionImpl = async (signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            reject(new Error('aborted'));
          },
          { once: true }
        );
      });

    const client = setupClient(transport);
    const pending = client.generateProvocation({
      requestId: 'req-cancel',
      prompt: 'Prompt'
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(client.cancel('req-cancel')).toBe(true);

    await expect(pending).rejects.toMatchObject({
      code: 'E_CONFLICT',
      message: 'AI request cancelled'
    } satisfies Partial<AppError>);
    expect(transport.cancelTurnCalls).toEqual([{ threadId: 'thread-1', turnId: 'turn-1' }]);
  });

  it('maps malformed completion output to protocol/provider errors', async () => {
    const transport = new RecordingTransport();
    transport.waitForTurnCompletionImpl = async () => ({
      turnStatus: 'completed',
      outputText: '   '
    });
    const client = setupClient(transport);

    await expect(
      client.generateProvocation({
        requestId: 'req-malformed',
        prompt: 'Prompt'
      })
    ).rejects.toMatchObject({
      code: 'E_PROVIDER',
      message: 'Codex App Server returned malformed generation output.',
      details: expect.objectContaining({ reason: 'protocol_error' })
    } satisfies Partial<AppError>);
  });
});
