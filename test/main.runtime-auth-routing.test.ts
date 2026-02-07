import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CodexAppServerTransportError,
  type CodexAppServerGenerationTransport,
  type CodexAppServerTurnCompletion,
  type OpenAiGenerationRequest,
  type OpenAiGenerationResponse,
  type OpenAiTransport
} from '../src/ai/index.js';
import { DesktopRuntime, type RuntimeApiKeyProvider } from '../src/main/runtime/index.js';
import { AppError } from '../src/shared/ipc/errors.js';
import {
  type CodexAuthSessionState,
  type CodexLoginStartResult,
  type CodexSubscriptionAuthAdapter
} from '../src/main/runtime/codexSubscriptionAuthAdapter.js';
import { createTempDb, createTempDir } from './helpers/db.js';

class FakeApiKeyProvider implements RuntimeApiKeyProvider {
  private apiKey: string;

  constructor(initialApiKey = 'api-mode-key') {
    this.apiKey = initialApiKey;
  }

  async getApiKey(): Promise<string> {
    return this.apiKey;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  hasApiKey(): boolean {
    return this.apiKey.trim().length > 0;
  }

  deleteApiKey(): boolean {
    const had = this.hasApiKey();
    this.apiKey = '';
    return had;
  }
}

class RecordingOpenAiTransport implements OpenAiTransport {
  readonly seenApiKeys: string[] = [];

  async generate(request: OpenAiGenerationRequest): Promise<OpenAiGenerationResponse> {
    this.seenApiKeys.push(request.apiKey);
    return { text: `provocation-via-${request.apiKey}` };
  }
}

class MockCodexAdapter implements CodexSubscriptionAuthAdapter {
  statusResult: CodexAuthSessionState = {
    status: 'authenticated',
    accountLabel: 'reader@example.com',
    lastValidatedAt: '2026-02-06T12:00:00.000Z'
  };

  loginStartResult: CodexLoginStartResult = {
    authUrl: 'https://example.com/codex-login',
    correlationState: 'state-1'
  };

  unavailable = false;

  accessTokenCalls = 0;

  async loginStart(): Promise<CodexLoginStartResult> {
    return this.loginStartResult;
  }

  async loginComplete(): Promise<CodexAuthSessionState> {
    return this.statusResult;
  }

  async getStatus(): Promise<CodexAuthSessionState> {
    if (this.unavailable) {
      throw new AppError('E_PROVIDER', 'Codex auth runtime unavailable', {
        action: 'switch_to_api_key'
      });
    }

    return this.statusResult;
  }

  async getAccessToken(): Promise<string> {
    this.accessTokenCalls += 1;
    return 'legacy-codex-token-should-not-be-used';
  }

  async logout(): Promise<void> {
    this.statusResult = {
      status: 'signed_out'
    };
  }
}

class RecordingCodexTransport implements CodexAppServerGenerationTransport {
  initializeCalls = 0;

  startSessionCalls = 0;

  sendTurnCalls = 0;

  waitCalls = 0;

  cancelTurnCalls = 0;

  prompts: string[] = [];

  mode: 'ok' | 'runtime_unavailable' | 'permission_denied' | 'malformed' = 'ok';

  async initialize(): Promise<void> {
    this.initializeCalls += 1;
    if (this.mode === 'runtime_unavailable') {
      throw new CodexAppServerTransportError('runtime_unavailable', 'runtime unavailable');
    }
  }

  async startSession(): Promise<{ threadId: string }> {
    this.startSessionCalls += 1;
    if (this.mode === 'permission_denied') {
      throw new CodexAppServerTransportError('permission_denied', 'permission denied');
    }
    return { threadId: 'thread-1' };
  }

  async sendTurn(input: {
    params: { input: Array<{ type: 'text'; text: string }> };
  }): Promise<{ turnId: string }> {
    this.sendTurnCalls += 1;
    this.prompts.push(input.params.input[0]?.text ?? '');
    return { turnId: 'turn-1' };
  }

  async waitForTurnCompletion(): Promise<CodexAppServerTurnCompletion> {
    this.waitCalls += 1;
    if (this.mode === 'malformed') {
      return { turnStatus: 'completed', outputText: ' ' };
    }
    return { turnStatus: 'completed', outputText: 'provocation-via-codex-appserver' };
  }

  async cancelTurn(): Promise<void> {
    this.cancelTurnCalls += 1;
  }
}

const setupRuntime = (options?: {
  apiKey?: string;
  online?: boolean;
  codexAdapter?: MockCodexAdapter;
  openAiTransport?: OpenAiTransport;
  codexTransport?: RecordingCodexTransport;
}): {
  runtime: DesktopRuntime;
  openAiTransport: RecordingOpenAiTransport;
  codexTransport: RecordingCodexTransport;
  apiKeyProvider: FakeApiKeyProvider;
  codexAdapter: MockCodexAdapter;
  documentId: string;
  sectionId: string;
} => {
  const seeded = createTempDb();
  const workspaceDir = createTempDir();
  const sourcePath = join(workspaceDir, 'auth-routing.md');

  writeFileSync(sourcePath, '# Section\nRouting test content.', 'utf8');

  const openAiTransport = new RecordingOpenAiTransport();
  const resolvedOpenAiTransport = options?.openAiTransport ?? openAiTransport;
  const apiKeyProvider = new FakeApiKeyProvider(options?.apiKey ?? 'api-mode-key');
  const codexAdapter = options?.codexAdapter ?? new MockCodexAdapter();
  const codexTransport = options?.codexTransport ?? new RecordingCodexTransport();

  const runtime = new DesktopRuntime({
    dbPath: seeded.dbPath,
    apiKeyProvider,
    codexAuthAdapter: codexAdapter,
    onlineProvider: { isOnline: () => options?.online ?? true },
    openAiTransport: resolvedOpenAiTransport,
    codexAppServerTransport: codexTransport
  });

  runtime.openWorkspace(workspaceDir);
  const imported = runtime.importDocument(sourcePath);
  const sectionId = imported.firstSectionId;
  if (!sectionId) {
    throw new Error('Expected imported section');
  }

  return {
    runtime,
    openAiTransport,
    codexTransport,
    apiKeyProvider,
    codexAdapter,
    documentId: imported.document.id,
    sectionId
  };
};

describe('runtime auth mode routing for provocation generation', () => {
  it('routes API key mode through OpenAI and codex mode through app server transport', async () => {
    const { runtime, openAiTransport, codexTransport, apiKeyProvider, codexAdapter, documentId, sectionId } =
      setupRuntime();

    const settingsInApiMode = await runtime.getSettings();
    expect(settingsInApiMode.auth.mode).toBe('api_key');

    await runtime.generateProvocation({
      requestId: 'req-api-mode',
      documentId,
      sectionId,
      acknowledgeCloudWarning: true
    });

    await runtime.switchAuthMode('codex_subscription');
    apiKeyProvider.deleteApiKey();

    const settingsInCodexMode = await runtime.getSettings();
    expect(settingsInCodexMode.auth.mode).toBe('codex_subscription');
    expect(settingsInCodexMode.auth.codex.status).toBe('authenticated');

    await runtime.generateProvocation({
      requestId: 'req-codex-mode',
      documentId,
      sectionId,
      confirmReplace: true
    });

    expect(openAiTransport.seenApiKeys).toEqual(['api-mode-key']);
    expect(codexTransport.sendTurnCalls).toBe(1);
    expect(codexAdapter.accessTokenCalls).toBe(0);
  });

  it('returns actionable unauthorized guidance when Codex session is expired', async () => {
    const codexAdapter = new MockCodexAdapter();
    codexAdapter.statusResult = {
      status: 'expired',
      accountLabel: 'reader@example.com',
      lastValidatedAt: '2026-02-06T12:00:00.000Z'
    };

    const { runtime, openAiTransport, codexTransport, documentId, sectionId } = setupRuntime({ codexAdapter });
    await runtime.switchAuthMode('codex_subscription');

    await expect(
      runtime.generateProvocation({
        requestId: 'req-expired',
        documentId,
        sectionId,
        acknowledgeCloudWarning: true
      })
    ).rejects.toMatchObject({ code: 'E_UNAUTHORIZED' } satisfies Partial<AppError>);

    expect(openAiTransport.seenApiKeys).toEqual([]);
    expect(codexTransport.sendTurnCalls).toBe(0);
  });

  it('returns actionable fallback guidance when Codex runtime transport is unavailable', async () => {
    const codexTransport = new RecordingCodexTransport();
    codexTransport.mode = 'runtime_unavailable';

    const { runtime, openAiTransport, documentId, sectionId } = setupRuntime({ codexTransport });
    await runtime.switchAuthMode('codex_subscription');

    let thrown: unknown;
    try {
      await runtime.generateProvocation({
        requestId: 'req-unavailable',
        documentId,
        sectionId,
        acknowledgeCloudWarning: true
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppError);
    const appError = thrown as AppError;
    expect(appError.code).toBe('E_PROVIDER');
    expect(appError.details).toEqual(
      expect.objectContaining({
        action: 'switch_to_api_key'
      })
    );
    expect(openAiTransport.seenApiKeys).toEqual([]);
  });

  it('returns actionable guidance when codex transport reports permission denial', async () => {
    const codexTransport = new RecordingCodexTransport();
    codexTransport.mode = 'permission_denied';

    const { runtime, openAiTransport, documentId, sectionId } = setupRuntime({ codexTransport });
    await runtime.switchAuthMode('codex_subscription');

    await expect(
      runtime.generateProvocation({
        requestId: 'req-permission-denied',
        documentId,
        sectionId,
        acknowledgeCloudWarning: true
      })
    ).rejects.toMatchObject({
      code: 'E_UNAUTHORIZED',
      details: expect.objectContaining({
        action: 'switch_to_api_key',
        reason: 'permission_denied'
      })
    } satisfies Partial<AppError>);

    expect(openAiTransport.seenApiKeys).toEqual([]);
  });
});
