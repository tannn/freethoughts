import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from 'node:child_process';
import type { ApiKeyProvider } from '../../ai/openaiClient.js';
import { AppError } from '../../shared/ipc/errors.js';

const KEYCHAIN_ITEM_NOT_FOUND_STATUS = 44;
const DEFAULT_SERVICE_NAME = 'com.toolsforthought.openai';
const DEFAULT_ACCOUNT_NAME = 'default';

type ExecFileSyncLike = (
  file: string,
  args: readonly string[],
  options: ExecFileSyncOptionsWithStringEncoding
) => string;

type ExecErrorLike = Error & {
  status?: number;
  stderr?: string | Buffer;
};

const messageContainsMissingItem = (value: string): boolean => {
  const normalized = value.toLowerCase();
  return (
    normalized.includes('could not be found in the keychain') ||
    normalized.includes('the specified item could not be found in the keychain')
  );
};

const isMissingItemError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const candidate = error as ExecErrorLike;
  if (candidate.status === KEYCHAIN_ITEM_NOT_FOUND_STATUS) {
    return true;
  }

  const stderr = typeof candidate.stderr === 'string' ? candidate.stderr : candidate.stderr?.toString('utf8');
  if (stderr && messageContainsMissingItem(stderr)) {
    return true;
  }

  return messageContainsMissingItem(candidate.message);
};

export interface ManagedApiKeyProvider extends ApiKeyProvider {
  setApiKey(apiKey: string): void;
  hasApiKey(): boolean;
  deleteApiKey(): boolean;
}

export interface MacOsKeychainApiKeyProviderOptions {
  serviceName?: string;
  accountName?: string;
  platform?: NodeJS.Platform;
  execFileSyncImpl?: ExecFileSyncLike;
}

export class MacOsKeychainApiKeyProvider implements ManagedApiKeyProvider {
  private readonly serviceName: string;

  private readonly accountName: string;

  private readonly platform: NodeJS.Platform;

  private readonly execFileSyncImpl: ExecFileSyncLike;

  constructor(options: MacOsKeychainApiKeyProviderOptions = {}) {
    this.serviceName = options.serviceName ?? DEFAULT_SERVICE_NAME;
    this.accountName = options.accountName ?? DEFAULT_ACCOUNT_NAME;
    this.platform = options.platform ?? process.platform;
    this.execFileSyncImpl = options.execFileSyncImpl ?? execFileSync;
  }

  async getApiKey(): Promise<string> {
    this.assertMacOs();

    try {
      const apiKey = this.runSecurity([
        'find-generic-password',
        '-w',
        '-s',
        this.serviceName,
        '-a',
        this.accountName
      ]).trim();

      if (!apiKey) {
        throw new AppError('E_UNAUTHORIZED', 'Missing OpenAI API key');
      }

      return apiKey;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (isMissingItemError(error)) {
        throw new AppError('E_UNAUTHORIZED', 'Missing OpenAI API key');
      }

      throw new AppError('E_INTERNAL', 'Failed to read OpenAI API key from macOS Keychain');
    }
  }

  setApiKey(apiKey: string): void {
    this.assertMacOs();

    const normalizedApiKey = apiKey.trim();
    if (!normalizedApiKey) {
      throw new AppError('E_VALIDATION', 'OpenAI API key is required', { field: 'openAiApiKey' });
    }

    try {
      this.runSecurity([
        'add-generic-password',
        '-U',
        '-s',
        this.serviceName,
        '-a',
        this.accountName,
        '-w',
        normalizedApiKey
      ]);
    } catch {
      throw new AppError('E_INTERNAL', 'Failed to store OpenAI API key in macOS Keychain');
    }
  }

  hasApiKey(): boolean {
    this.assertMacOs();

    try {
      this.runSecurity(['find-generic-password', '-s', this.serviceName, '-a', this.accountName]);
      return true;
    } catch (error) {
      if (isMissingItemError(error)) {
        return false;
      }
      throw new AppError('E_INTERNAL', 'Failed to read OpenAI API key from macOS Keychain');
    }
  }

  deleteApiKey(): boolean {
    this.assertMacOs();

    try {
      this.runSecurity(['delete-generic-password', '-s', this.serviceName, '-a', this.accountName]);
      return true;
    } catch (error) {
      if (isMissingItemError(error)) {
        return false;
      }
      throw new AppError('E_INTERNAL', 'Failed to delete OpenAI API key from macOS Keychain');
    }
  }

  private assertMacOs(): void {
    if (this.platform !== 'darwin') {
      throw new AppError('E_INTERNAL', 'macOS Keychain provider is only available on macOS');
    }
  }

  private runSecurity(args: readonly string[]): string {
    return this.execFileSyncImpl('security', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  }
}
