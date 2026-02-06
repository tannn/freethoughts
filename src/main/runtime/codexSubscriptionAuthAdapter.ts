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
  logout(input: { workspaceId: string }): Promise<void>;
}

const unavailableDetails = {
  action: 'switch_auth_mode',
  recommendedMode: 'api_key'
} as const;

export class UnavailableCodexSubscriptionAuthAdapter implements CodexSubscriptionAuthAdapter {
  private unavailable(message: string): never {
    throw new AppError('E_PROVIDER', message, unavailableDetails);
  }

  async loginStart(): Promise<CodexLoginStartResult> {
    return this.unavailable('Codex subscription login is unavailable in this runtime');
  }

  async loginComplete(): Promise<CodexAuthSessionState> {
    return this.unavailable('Codex subscription login is unavailable in this runtime');
  }

  async getStatus(): Promise<CodexAuthSessionState> {
    return this.unavailable('Codex subscription login is unavailable in this runtime');
  }

  async logout(): Promise<void> {
    this.unavailable('Codex subscription login is unavailable in this runtime');
  }
}
