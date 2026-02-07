import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OpenAiTransportError,
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

class RecordingTransport implements OpenAiTransport {
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

  accessToken = 'codex-mode-token';

  unavailable = false;

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
    if (this.unavailable) {
      throw new AppError('E_PROVIDER', 'Codex auth runtime unavailable', {
        action: 'switch_to_api_key'
      });
    }

    return this.accessToken;
  }

  async logout(): Promise<void> {
    this.statusResult = {
      status: 'signed_out'
    };
  }
}

const setupRuntime = (options?: {
  apiKey?: string;
  online?: boolean;
  codexAdapter?: MockCodexAdapter;
  openAiTransport?: OpenAiTransport;
}): {
  runtime: DesktopRuntime;
  transport: RecordingTransport;
  apiKeyProvider: FakeApiKeyProvider;
  codexAdapter: MockCodexAdapter;
  documentId: string;
  sectionId: string;
} => {
  const seeded = createTempDb();
  const workspaceDir = createTempDir();
  const sourcePath = join(workspaceDir, 'auth-routing.md');

  writeFileSync(sourcePath, '# Section\nRouting test content.', 'utf8');

  const transport = new RecordingTransport();
  const openAiTransport = options?.openAiTransport ?? transport;
  const apiKeyProvider = new FakeApiKeyProvider(options?.apiKey ?? 'api-mode-key');
  const codexAdapter = options?.codexAdapter ?? new MockCodexAdapter();

  const runtime = new DesktopRuntime({
    dbPath: seeded.dbPath,
    apiKeyProvider,
    codexAuthAdapter: codexAdapter,
    onlineProvider: { isOnline: () => options?.online ?? true },
    openAiTransport
  });

  runtime.openWorkspace(workspaceDir);
  const imported = runtime.importDocument(sourcePath);
  const sectionId = imported.firstSectionId;
  if (!sectionId) {
    throw new Error('Expected imported section');
  }

  return {
    runtime,
    transport,
    apiKeyProvider,
    codexAdapter,
    documentId: imported.document.id,
    sectionId
  };
};

describe('runtime auth mode routing for provocation generation', () => {
  it('routes requests through API key mode and Codex mode without restart', async () => {
    const { runtime, transport, apiKeyProvider, documentId, sectionId } = setupRuntime();

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

    expect(transport.seenApiKeys).toEqual(['api-mode-key', 'codex-mode-token']);
  });

  it('returns actionable unauthorized guidance when Codex session is expired', async () => {
    const codexAdapter = new MockCodexAdapter();
    codexAdapter.statusResult = {
      status: 'expired',
      accountLabel: 'reader@example.com',
      lastValidatedAt: '2026-02-06T12:00:00.000Z'
    };

    const { runtime, transport, documentId, sectionId } = setupRuntime({ codexAdapter });
    await runtime.switchAuthMode('codex_subscription');

    await expect(
      runtime.generateProvocation({
        requestId: 'req-expired',
        documentId,
        sectionId,
        acknowledgeCloudWarning: true
      })
    ).rejects.toMatchObject({ code: 'E_UNAUTHORIZED' } satisfies Partial<AppError>);

    expect(transport.seenApiKeys).toEqual([]);
  });

  it('returns actionable fallback guidance when Codex auth runtime is unavailable', async () => {
    const codexAdapter = new MockCodexAdapter();
    codexAdapter.unavailable = true;

    const { runtime, transport, documentId, sectionId } = setupRuntime({ codexAdapter });
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
    expect(transport.seenApiKeys).toEqual([]);
  });

  it('returns actionable guidance when Codex credentials lack responses.write scope', async () => {
    const codexAdapter = new MockCodexAdapter();
    const scopedTransport: OpenAiTransport = {
      async generate(): Promise<OpenAiGenerationResponse> {
        throw new OpenAiTransportError(
          401,
          'OpenAI request failed (401): Missing scopes: api.responses.write'
        );
      }
    };

    const { runtime, documentId, sectionId } = setupRuntime({
      codexAdapter,
      openAiTransport: scopedTransport
    });
    await runtime.switchAuthMode('codex_subscription');

    await expect(
      runtime.generateProvocation({
        requestId: 'req-missing-scope',
        documentId,
        sectionId,
        acknowledgeCloudWarning: true
      })
    ).rejects.toMatchObject({
      code: 'E_UNAUTHORIZED',
      details: expect.objectContaining({
        requiredScope: 'api.responses.write',
        action: 'switch_to_api_key'
      })
    } satisfies Partial<AppError>);
  });
});
