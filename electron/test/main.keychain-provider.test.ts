import { describe, expect, it } from 'vitest';
import { AiSettingsRepository, OpenAIClient } from '../src/ai/index.js';
import { MacOsKeychainApiKeyProvider } from '../src/main/security/index.js';
import { AppError } from '../src/shared/ipc/errors.js';
import { createTempDb } from './helpers/db.js';

type FakeExecError = Error & {
  status?: number;
  stderr?: string;
};

const keychainNotFoundError = (): FakeExecError => {
  const error = new Error('The specified item could not be found in the keychain.') as FakeExecError;
  error.status = 44;
  error.stderr = 'security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.';
  return error;
};

class FakeSecurityCli {
  private key: string | null = null;

  failAdd = false;

  exec = (_file: string, args: readonly string[]): string => {
    const command = args[0];
    if (!command) {
      throw new Error('Missing command');
    }

    if (command === 'find-generic-password') {
      if (!this.key) {
        throw keychainNotFoundError();
      }
      return args.includes('-w') ? `${this.key}\n` : 'keychain-item';
    }

    if (command === 'add-generic-password') {
      if (this.failAdd) {
        throw new Error('simulated add failure');
      }
      const valueIndex = args.indexOf('-w');
      this.key = valueIndex >= 0 ? (args[valueIndex + 1] ?? null) : null;
      return '';
    }

    if (command === 'delete-generic-password') {
      if (!this.key) {
        throw keychainNotFoundError();
      }
      this.key = null;
      return '';
    }

    throw new Error(`Unsupported security command: ${command}`);
  };
}

describe('macOS keychain API key provider', () => {
  it('supports key set/get/delete flow without SQLite persistence', async () => {
    const fakeSecurity = new FakeSecurityCli();
    const provider = new MacOsKeychainApiKeyProvider({
      platform: 'darwin',
      execFileSyncImpl: fakeSecurity.exec
    });

    expect(provider.hasApiKey()).toBe(false);
    await expect(provider.getApiKey()).rejects.toMatchObject({
      code: 'E_UNAUTHORIZED'
    } satisfies Partial<AppError>);

    provider.setApiKey('  sk-test-123  ');
    expect(provider.hasApiKey()).toBe(true);
    await expect(provider.getApiKey()).resolves.toBe('sk-test-123');

    expect(provider.deleteApiKey()).toBe(true);
    expect(provider.hasApiKey()).toBe(false);
    expect(provider.deleteApiKey()).toBe(false);
  });

  it('maps missing key to E_UNAUTHORIZED for OpenAI runtime calls', async () => {
    const fakeSecurity = new FakeSecurityCli();
    const provider = new MacOsKeychainApiKeyProvider({
      platform: 'darwin',
      execFileSyncImpl: fakeSecurity.exec
    });
    const { dbPath } = createTempDb();
    const settings = new AiSettingsRepository(dbPath);
    const client = new OpenAIClient(
      settings,
      provider,
      {
        async generate() {
          return { text: 'unused' };
        }
      },
      { timeoutMs: 5000, retryDelaysMs: [5, 15] },
      async () => Promise.resolve(),
      () => 0
    );

    await expect(
      client.generateProvocation({
        requestId: 'missing-key',
        prompt: 'test prompt'
      })
    ).rejects.toMatchObject({ code: 'E_UNAUTHORIZED' } satisfies Partial<AppError>);
  });

  it('does not leak API key text when keychain storage fails', () => {
    const fakeSecurity = new FakeSecurityCli();
    fakeSecurity.failAdd = true;
    const provider = new MacOsKeychainApiKeyProvider({
      platform: 'darwin',
      execFileSyncImpl: fakeSecurity.exec
    });

    expect(() => provider.setApiKey('sk-secret-value')).toThrowError(AppError);

    try {
      provider.setApiKey('sk-secret-value');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.code).toBe('E_INTERNAL');
      expect(appError.message).not.toContain('sk-secret-value');
      expect(appError.details).toBeUndefined();
    }
  });

  it('rejects usage on non-macOS platforms', async () => {
    const provider = new MacOsKeychainApiKeyProvider({
      platform: 'linux',
      execFileSyncImpl: () => {
        throw new Error('should not run');
      }
    });

    expect(() => provider.hasApiKey()).toThrowError(AppError);
    expect(() => provider.setApiKey('sk-test')).toThrowError(AppError);
    expect(() => provider.deleteApiKey()).toThrowError(AppError);
    await expect(provider.getApiKey()).rejects.toMatchObject({
      code: 'E_INTERNAL'
    } satisfies Partial<AppError>);
  });
});
