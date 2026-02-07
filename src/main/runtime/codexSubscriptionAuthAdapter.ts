import { randomUUID } from 'node:crypto';
import { execFileSync, type ExecFileSyncOptionsWithStringEncoding } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { AppError } from '../../shared/ipc/errors.js';
import type { AuthSessionStatus } from '../../persistence/authSessions.js';

export interface CodexAuthSessionState {
  status: AuthSessionStatus;
  accountLabel?: string | null;
  lastValidatedAt?: string | null;
}

export interface CodexLoginStartResult {
  authUrl: string;
  correlationState: string;
}

export interface CodexSubscriptionAuthAdapter {
  loginStart(input: { workspaceId: string }): Promise<CodexLoginStartResult>;
  loginComplete(input: { workspaceId: string; correlationState: string }): Promise<CodexAuthSessionState>;
  getStatus(input: { workspaceId: string }): Promise<CodexAuthSessionState>;
  getAccessToken(input: { workspaceId: string }): Promise<string>;
  logout(input: { workspaceId: string }): Promise<void>;
}

interface CodexAuthJson {
  tokens?: {
    access_token?: unknown;
    id_token?: unknown;
    account_id?: unknown;
  };
  last_refresh?: unknown;
}

type ExecFileSyncLike = (
  file: string,
  args: readonly string[],
  options: ExecFileSyncOptionsWithStringEncoding
) => string;

export interface CodexCliSubscriptionAuthAdapterOptions {
  authFilePath?: string;
  loginUrl?: string;
  codexCommand?: string;
  readFileSyncImpl?: typeof readFileSync;
  execFileSyncImpl?: ExecFileSyncLike;
  now?: () => Date;
}

const unavailableDetails = {
  action: 'switch_auth_mode',
  recommendedMode: 'api_key'
} as const;

const CODEX_DEFAULT_LOGIN_URL = 'https://chatgpt.com/auth/login';
const DEFAULT_CODEX_COMMAND = 'codex';
const DEFAULT_CODEX_AUTH_PATH = join(homedir(), '.codex', 'auth.json');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

const normalizeStringOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const extractJwtExpSeconds = (token: string): number | null => {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    return null;
  }
  return payload.exp;
};

const extractAccountLabel = (idToken: string | null, accountId: string | null): string | null => {
  const payload = idToken ? decodeJwtPayload(idToken) : null;
  if (payload) {
    const email = normalizeStringOrNull(payload.email);
    if (email) {
      return email;
    }
    const name = normalizeStringOrNull(payload.name);
    if (name) {
      return name;
    }
  }

  if (accountId) {
    return `ChatGPT (${accountId})`;
  }

  return 'ChatGPT';
};

const normalizeIsoTimestampOrNow = (value: unknown, now: () => Date): string => {
  const normalized = normalizeStringOrNull(value);
  if (normalized && !Number.isNaN(Date.parse(normalized))) {
    return normalized;
  }
  return now().toISOString();
};

export class UnavailableCodexSubscriptionAuthAdapter implements CodexSubscriptionAuthAdapter {
  private unavailable(message: string): never {
    throw new AppError('E_PROVIDER', message, unavailableDetails);
  }

  async loginStart(_input: { workspaceId: string }): Promise<CodexLoginStartResult> {
    return this.unavailable('Codex subscription login is unavailable in this runtime');
  }

  async loginComplete(_input: {
    workspaceId: string;
    correlationState: string;
  }): Promise<CodexAuthSessionState> {
    return this.unavailable('Codex subscription login is unavailable in this runtime');
  }

  async getStatus(_input: { workspaceId: string }): Promise<CodexAuthSessionState> {
    return this.unavailable('Codex subscription login is unavailable in this runtime');
  }

  async getAccessToken(_input: { workspaceId: string }): Promise<string> {
    return this.unavailable('Codex subscription login is unavailable in this runtime');
  }

  async logout(_input: { workspaceId: string }): Promise<void> {
    this.unavailable('Codex subscription login is unavailable in this runtime');
  }
}

export class CodexCliSubscriptionAuthAdapter implements CodexSubscriptionAuthAdapter {
  private readonly authFilePath: string;

  private readonly loginUrl: string;

  private readonly codexCommand: string;

  private readonly readFileSyncImpl: typeof readFileSync;

  private readonly execFileSyncImpl: ExecFileSyncLike;

  private readonly now: () => Date;

  private readonly pendingCorrelationStates = new Set<string>();

  constructor(options: CodexCliSubscriptionAuthAdapterOptions = {}) {
    this.authFilePath = options.authFilePath ?? DEFAULT_CODEX_AUTH_PATH;
    this.loginUrl = options.loginUrl ?? CODEX_DEFAULT_LOGIN_URL;
    this.codexCommand = options.codexCommand ?? DEFAULT_CODEX_COMMAND;
    this.readFileSyncImpl = options.readFileSyncImpl ?? readFileSync;
    this.execFileSyncImpl = options.execFileSyncImpl ?? execFileSync;
    this.now = options.now ?? (() => new Date());
  }

  async loginStart(_input: { workspaceId: string }): Promise<CodexLoginStartResult> {
    this.assertCodexRuntimeAvailable();
    const correlationState = `codex-${randomUUID()}`;
    this.pendingCorrelationStates.add(correlationState);
    return {
      authUrl: this.loginUrl,
      correlationState
    };
  }

  async loginComplete(input: {
    workspaceId: string;
    correlationState: string;
  }): Promise<CodexAuthSessionState> {
    this.assertCodexRuntimeAvailable();
    const correlationState = input.correlationState.trim();
    if (correlationState) {
      this.pendingCorrelationStates.delete(correlationState);
    }

    const status = this.computeStatusFromLocalAuthState();
    if (status.status === 'authenticated') {
      return status;
    }

    return { status: 'cancelled' };
  }

  async getStatus(_input: { workspaceId: string }): Promise<CodexAuthSessionState> {
    this.assertCodexRuntimeAvailable();
    return this.computeStatusFromLocalAuthState();
  }

  async getAccessToken(_input: { workspaceId: string }): Promise<string> {
    this.assertCodexRuntimeAvailable();
    const token = this.readAccessTokenFromAuthFile();
    if (!token) {
      throw new AppError('E_UNAUTHORIZED', 'Codex subscription login required.', {
        authStatus: 'signed_out',
        action: 'login',
        options: ['start_login', 'switch_to_api_key']
      });
    }

    const expirySeconds = extractJwtExpSeconds(token);
    if (expirySeconds !== null && expirySeconds <= Math.floor(this.now().getTime() / 1000)) {
      throw new AppError('E_UNAUTHORIZED', 'Codex subscription session expired.', {
        authStatus: 'expired',
        action: 'reauth',
        options: ['sign_in_again', 'switch_to_api_key']
      });
    }

    return token;
  }

  async logout(_input: { workspaceId: string }): Promise<void> {
    this.assertCodexRuntimeAvailable();
    this.pendingCorrelationStates.clear();

    try {
      this.execFileSyncImpl(this.codexCommand, ['logout'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch {
      throw new AppError('E_PROVIDER', 'Codex auth runtime unavailable', {
        action: 'switch_to_api_key'
      });
    }
  }

  private assertCodexRuntimeAvailable(): void {
    try {
      this.execFileSyncImpl(this.codexCommand, ['login', 'status'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
    } catch {
      throw new AppError('E_PROVIDER', 'Codex auth runtime unavailable', {
        action: 'switch_to_api_key'
      });
    }
  }

  private computeStatusFromLocalAuthState(): CodexAuthSessionState {
    const auth = this.readAuthFile();
    if (!auth) {
      return { status: 'signed_out' };
    }

    const accessToken = normalizeStringOrNull(auth.tokens?.access_token);
    if (!accessToken) {
      return { status: 'signed_out' };
    }

    const expirySeconds = extractJwtExpSeconds(accessToken);
    if (expirySeconds !== null && expirySeconds <= Math.floor(this.now().getTime() / 1000)) {
      return {
        status: 'expired',
        accountLabel: extractAccountLabel(
          normalizeStringOrNull(auth.tokens?.id_token),
          normalizeStringOrNull(auth.tokens?.account_id)
        ),
        lastValidatedAt: normalizeIsoTimestampOrNow(auth.last_refresh, this.now)
      };
    }

    return {
      status: 'authenticated',
      accountLabel: extractAccountLabel(
        normalizeStringOrNull(auth.tokens?.id_token),
        normalizeStringOrNull(auth.tokens?.account_id)
      ),
      lastValidatedAt: normalizeIsoTimestampOrNow(auth.last_refresh, this.now)
    };
  }

  private readAccessTokenFromAuthFile(): string | null {
    const auth = this.readAuthFile();
    if (!auth) {
      return null;
    }
    return normalizeStringOrNull(auth.tokens?.access_token);
  }

  private readAuthFile(): CodexAuthJson | null {
    let raw: string;
    try {
      raw = this.readFileSyncImpl(this.authFilePath, 'utf8');
    } catch {
      return null;
    }

    try {
      const parsed = JSON.parse(raw);
      return isRecord(parsed) ? (parsed as CodexAuthJson) : null;
    } catch {
      return null;
    }
  }
}
