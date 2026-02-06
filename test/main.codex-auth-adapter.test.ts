import { describe, expect, it } from 'vitest';
import { DesktopRuntime, type RuntimeApiKeyProvider } from '../src/main/runtime/index.js';
import { AppError } from '../src/shared/ipc/errors.js';
import {
  type CodexAuthSessionState,
  type CodexLoginStartResult,
  type CodexSubscriptionAuthAdapter
} from '../src/main/runtime/codexSubscriptionAuthAdapter.js';
import { createTempDb, createTempDir } from './helpers/db.js';

class FakeApiKeyProvider implements RuntimeApiKeyProvider {
  private apiKey = 'test-key';

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

class MockCodexAdapter implements CodexSubscriptionAuthAdapter {
  loginStartResult: CodexLoginStartResult = {
    authUrl: 'https://example.com/codex-login',
    correlationState: 'state-1'
  };

  loginCompleteResult: CodexAuthSessionState = {
    status: 'authenticated',
    accountLabel: 'reader@example.com',
    lastValidatedAt: '2026-02-06T12:00:00.000Z'
  };

  statusResult: CodexAuthSessionState = {
    status: 'authenticated',
    accountLabel: 'reader@example.com',
    lastValidatedAt: '2026-02-06T12:00:00.000Z'
  };

  loginStartCalls = 0;
  loginCompleteCalls = 0;
  statusCalls = 0;
  logoutCalls = 0;

  async loginStart(): Promise<CodexLoginStartResult> {
    this.loginStartCalls += 1;
    return this.loginStartResult;
  }

  async loginComplete(): Promise<CodexAuthSessionState> {
    this.loginCompleteCalls += 1;
    return this.loginCompleteResult;
  }

  async getStatus(): Promise<CodexAuthSessionState> {
    this.statusCalls += 1;
    return this.statusResult;
  }

  async logout(): Promise<void> {
    this.logoutCalls += 1;
  }
}

const createRuntime = (adapter: CodexSubscriptionAuthAdapter): DesktopRuntime => {
  const { dbPath } = createTempDb();
  return new DesktopRuntime({
    dbPath,
    apiKeyProvider: new FakeApiKeyProvider(),
    codexAuthAdapter: adapter,
    onlineProvider: { isOnline: () => true }
  });
};

describe('codex subscription auth adapter orchestration', () => {
  it('runs login start/complete/status/logout flow with mocked adapter', async () => {
    const adapter = new MockCodexAdapter();
    const runtime = createRuntime(adapter);
    runtime.openWorkspace(createTempDir());

    await runtime.switchAuthMode('codex_subscription');

    const started = await runtime.startAuthLogin();
    expect(started).toEqual({
      authUrl: 'https://example.com/codex-login',
      correlationState: 'state-1'
    });

    const completed = await runtime.completeAuthLogin(started.correlationState);
    expect(completed.mode).toBe('codex_subscription');
    expect(completed.codex.available).toBe(true);
    expect(completed.codex.status).toBe('authenticated');
    expect(completed.codex.accountLabel).toBe('reader@example.com');

    adapter.statusResult = {
      status: 'authenticated',
      accountLabel: 'reader@example.com',
      lastValidatedAt: '2026-02-06T12:05:00.000Z'
    };
    const status = await runtime.getAuthStatus();
    expect(status.codex.status).toBe('authenticated');
    expect(status.codex.lastValidatedAt).toBe('2026-02-06T12:05:00.000Z');

    const loggedOut = await runtime.logoutAuth();
    expect(loggedOut.codex.status).toBe('signed_out');
    expect(loggedOut.codex.accountLabel).toBeNull();
    expect(loggedOut.codex.lastValidatedAt).toBeNull();

    expect(adapter.loginStartCalls).toBe(1);
    expect(adapter.loginCompleteCalls).toBe(1);
    expect(adapter.statusCalls).toBeGreaterThan(0);
    expect(adapter.logoutCalls).toBe(1);
  });

  it.each(['invalid', 'expired'] as const)(
    'maps %s codex session to actionable auth error',
    async (status) => {
      const adapter = new MockCodexAdapter();
      adapter.loginCompleteResult = { status };
      const runtime = createRuntime(adapter);
      runtime.openWorkspace(createTempDir());
      await runtime.switchAuthMode('codex_subscription');

      let thrown: unknown;
      try {
        await runtime.completeAuthLogin('state-2');
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(AppError);
      const appError = thrown as AppError;
      expect(appError.code).toBe('E_UNAUTHORIZED');
      expect(appError.details).toEqual(
        expect.objectContaining({
          authStatus: status,
          action: 'reauth'
        })
      );
    }
  );
});
