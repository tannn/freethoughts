import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type OpenAiGenerationRequest, type OpenAiGenerationResponse, type OpenAiTransport } from '../src/ai/index.js';
import { DesktopRuntime, type RuntimeApiKeyProvider } from '../src/main/runtime/index.js';
import { AppError } from '../src/shared/ipc/errors.js';
import {
  type CodexAuthSessionState,
  type CodexLoginStartResult,
  type CodexSubscriptionAuthAdapter
} from '../src/main/runtime/codexSubscriptionAuthAdapter.js';
import { createTempDb, createTempDir } from './helpers/db.js';

class RecordingApiKeyProvider implements RuntimeApiKeyProvider {
  private apiKey: string;

  getCalls = 0;

  setCalls = 0;

  deleteCalls = 0;

  constructor(initialApiKey = 'api-mode-key') {
    this.apiKey = initialApiKey;
  }

  async getApiKey(): Promise<string> {
    this.getCalls += 1;
    return this.apiKey;
  }

  setApiKey(apiKey: string): void {
    this.setCalls += 1;
    this.apiKey = apiKey;
  }

  hasApiKey(): boolean {
    return this.apiKey.trim().length > 0;
  }

  deleteApiKey(): boolean {
    this.deleteCalls += 1;
    const had = this.hasApiKey();
    this.apiKey = '';
    return had;
  }
}

class RecordingTransport implements OpenAiTransport {
  readonly seenApiKeys: string[] = [];

  async generate(request: OpenAiGenerationRequest): Promise<OpenAiGenerationResponse> {
    this.seenApiKeys.push(request.apiKey);
    return { text: `provocation-${this.seenApiKeys.length}` };
  }
}

class MutableCodexAdapter implements CodexSubscriptionAuthAdapter {
  statusCalls = 0;

  statusResult: CodexAuthSessionState = {
    status: 'authenticated',
    accountLabel: 'reader@example.com',
    lastValidatedAt: '2026-02-06T12:00:00.000Z'
  };

  loginStartResult: CodexLoginStartResult = {
    authUrl: 'https://example.com/codex-login',
    correlationState: 'state-acceptance'
  };

  loginCompleteResult: CodexAuthSessionState = {
    status: 'authenticated',
    accountLabel: 'reader@example.com',
    lastValidatedAt: '2026-02-06T12:05:00.000Z'
  };

  accessToken = 'codex-mode-token';

  async loginStart(): Promise<CodexLoginStartResult> {
    return this.loginStartResult;
  }

  async loginComplete(): Promise<CodexAuthSessionState> {
    this.statusResult = this.loginCompleteResult;
    return this.loginCompleteResult;
  }

  async getStatus(): Promise<CodexAuthSessionState> {
    this.statusCalls += 1;
    return this.statusResult;
  }

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }

  async logout(): Promise<void> {
    this.statusResult = { status: 'signed_out' };
  }
}

const setupRuntime = (options?: { online?: boolean }): {
  runtime: DesktopRuntime;
  transport: RecordingTransport;
  apiKeyProvider: RecordingApiKeyProvider;
  codexAdapter: MutableCodexAdapter;
  documentId: string;
  sectionId: string;
  onlineState: { value: boolean };
} => {
  const seeded = createTempDb();
  const workspaceDir = createTempDir();
  const sourcePath = join(workspaceDir, 'phase10-auth-acceptance.md');

  writeFileSync(sourcePath, '# Section\nAcceptance test content.', 'utf8');

  const onlineState = { value: options?.online ?? true };
  const transport = new RecordingTransport();
  const apiKeyProvider = new RecordingApiKeyProvider('api-mode-key');
  const codexAdapter = new MutableCodexAdapter();

  const runtime = new DesktopRuntime({
    dbPath: seeded.dbPath,
    apiKeyProvider,
    codexAuthAdapter: codexAdapter,
    onlineProvider: {
      isOnline: () => onlineState.value
    },
    openAiTransport: transport
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
    sectionId,
    onlineState
  };
};

describe('phase 10 dual-auth acceptance harness', () => {
  it('covers API key mode, Codex mode, switch, logout, and expired-session recovery', async () => {
    const { runtime, transport, apiKeyProvider, codexAdapter, documentId, sectionId } = setupRuntime();

    await runtime.generateProvocation({
      requestId: 'req-api-1',
      documentId,
      sectionId,
      acknowledgeCloudWarning: true
    });

    await runtime.switchAuthMode('codex_subscription');
    await runtime.generateProvocation({
      requestId: 'req-codex-1',
      documentId,
      sectionId,
      confirmReplace: true
    });

    const loggedOut = await runtime.logoutAuth();
    expect(loggedOut.codex.status).toBe('signed_out');

    await expect(
      runtime.generateProvocation({
        requestId: 'req-after-logout',
        documentId,
        sectionId,
        confirmReplace: true
      })
    ).rejects.toMatchObject({ code: 'E_UNAUTHORIZED' } satisfies Partial<AppError>);

    codexAdapter.statusResult = {
      status: 'expired',
      accountLabel: 'reader@example.com',
      lastValidatedAt: '2026-02-06T12:10:00.000Z'
    };

    await expect(
      runtime.generateProvocation({
        requestId: 'req-expired',
        documentId,
        sectionId,
        confirmReplace: true
      })
    ).rejects.toMatchObject({
      code: 'E_UNAUTHORIZED',
      details: expect.objectContaining({ authStatus: 'expired', action: 'reauth' })
    } satisfies Partial<AppError>);

    codexAdapter.loginCompleteResult = {
      status: 'authenticated',
      accountLabel: 'reader@example.com',
      lastValidatedAt: '2026-02-06T12:12:00.000Z'
    };
    codexAdapter.accessToken = 'codex-mode-token-recovered';

    const started = await runtime.startAuthLogin();
    expect(started.authUrl).toContain('codex-login');

    const completed = await runtime.completeAuthLogin(started.correlationState);
    expect(completed.codex.status).toBe('authenticated');

    await runtime.generateProvocation({
      requestId: 'req-codex-recovered',
      documentId,
      sectionId,
      confirmReplace: true
    });

    await runtime.switchAuthMode('api_key');
    await runtime.generateProvocation({
      requestId: 'req-api-2',
      documentId,
      sectionId,
      confirmReplace: true
    });

    expect(transport.seenApiKeys).toEqual([
      'api-mode-key',
      'codex-mode-token',
      'codex-mode-token-recovered',
      'api-mode-key'
    ]);

    expect(apiKeyProvider.getCalls).toBe(2);
    expect(apiKeyProvider.setCalls).toBe(0);
    expect(apiKeyProvider.deleteCalls).toBe(0);
  });

  it('keeps cloud-warning and offline gates enforced in both auth modes', async () => {
    const { runtime, documentId, sectionId, codexAdapter, onlineState } = setupRuntime({ online: false });

    await expect(
      runtime.generateProvocation({
        requestId: 'req-api-offline',
        documentId,
        sectionId,
        acknowledgeCloudWarning: true
      })
    ).rejects.toMatchObject({ code: 'E_OFFLINE' } satisfies Partial<AppError>);

    await runtime.switchAuthMode('codex_subscription');
    const statusCallsAfterSwitch = codexAdapter.statusCalls;

    await expect(
      runtime.generateProvocation({
        requestId: 'req-codex-offline',
        documentId,
        sectionId,
        acknowledgeCloudWarning: true,
        confirmReplace: true
      })
    ).rejects.toMatchObject({ code: 'E_OFFLINE' } satisfies Partial<AppError>);

    expect(codexAdapter.statusCalls).toBe(statusCallsAfterSwitch);

    onlineState.value = true;

    await expect(
      runtime.generateProvocation({
        requestId: 'req-codex-cloud-warning',
        documentId,
        sectionId,
        confirmReplace: true
      })
    ).rejects.toMatchObject({
      code: 'E_CONFLICT',
      details: expect.objectContaining({ requiresCloudWarningAcknowledgment: true })
    } satisfies Partial<AppError>);

    await runtime.generateProvocation({
      requestId: 'req-codex-cloud-warning-ack',
      documentId,
      sectionId,
      acknowledgeCloudWarning: true,
      confirmReplace: true
    });
  });
});
