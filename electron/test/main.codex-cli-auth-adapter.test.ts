import { describe, expect, it } from 'vitest';
import { AppError } from '../src/shared/ipc/errors.js';
import {
  CodexCliSubscriptionAuthAdapter,
  type CodexCliSubscriptionAuthAdapterOptions
} from '../src/main/runtime/codexSubscriptionAuthAdapter.js';

type ExecFileSyncLike = NonNullable<CodexCliSubscriptionAuthAdapterOptions['execFileSyncImpl']>;

const encodeBase64Url = (value: string): string => Buffer.from(value).toString('base64url');

const createJwt = (payload: Record<string, unknown>): string => {
  const header = encodeBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = encodeBase64Url(JSON.stringify(payload));
  return `${header}.${body}.sig`;
};

const createAdapter = (options: {
  authJson?: string;
  nowIso?: string;
  failStatusCheck?: boolean;
  failLogout?: boolean;
} = {}): {
  adapter: CodexCliSubscriptionAuthAdapter;
  commands: string[][];
} => {
  const commands: string[][] = [];

  const exec: ExecFileSyncLike = (_file, args) => {
    commands.push([...args]);
    if (args[0] === 'login' && args[1] === 'status' && options.failStatusCheck) {
      throw new Error('status unavailable');
    }
    if (args[0] === 'logout' && options.failLogout) {
      throw new Error('logout failed');
    }
    return 'ok';
  };

  const adapter = new CodexCliSubscriptionAuthAdapter({
    authFilePath: '/tmp/codex-auth.json',
    loginUrl: 'https://chatgpt.example/login',
    codexCommand: 'codex',
    execFileSyncImpl: exec,
    readFileSyncImpl: ((path: unknown, encoding: unknown) => {
      if (!path || !encoding || options.authJson === undefined) {
        throw new Error('ENOENT');
      }
      return options.authJson;
    }) as unknown as NonNullable<CodexCliSubscriptionAuthAdapterOptions['readFileSyncImpl']>,
    now: () => new Date(options.nowIso ?? '2026-02-06T12:00:00.000Z')
  });

  return { adapter, commands };
};

describe('codex cli subscription auth adapter', () => {
  it('reports authenticated status from local codex auth state', async () => {
    const futureExp = Math.floor(Date.parse('2026-02-06T13:00:00.000Z') / 1000);
    const authJson = JSON.stringify({
      tokens: {
        access_token: createJwt({ exp: futureExp }),
        id_token: createJwt({ email: 'reader@example.com' }),
        account_id: 'acct_123'
      },
      last_refresh: '2026-02-06T11:59:00.000Z'
    });

    const { adapter, commands } = createAdapter({ authJson });
    const status = await adapter.getStatus({ workspaceId: 'ws-1' });

    expect(status).toEqual({
      status: 'authenticated',
      accountLabel: 'reader@example.com',
      lastValidatedAt: '2026-02-06T11:59:00.000Z'
    });
    await expect(adapter.getAccessToken({ workspaceId: 'ws-1' })).resolves.toMatch(/\./);
    expect(commands).toEqual([
      ['login', 'status'],
      ['login', 'status']
    ]);
  });

  it('reports expired status when local codex token is expired', async () => {
    const pastExp = Math.floor(Date.parse('2026-02-06T11:00:00.000Z') / 1000);
    const authJson = JSON.stringify({
      tokens: {
        access_token: createJwt({ exp: pastExp }),
        id_token: createJwt({ name: 'Reader Name' }),
        account_id: 'acct_456'
      }
    });

    const { adapter } = createAdapter({ authJson });
    const status = await adapter.getStatus({ workspaceId: 'ws-1' });

    expect(status.status).toBe('expired');
    expect(status.accountLabel).toBe('Reader Name');

    await expect(adapter.getAccessToken({ workspaceId: 'ws-1' })).rejects.toMatchObject({
      code: 'E_UNAUTHORIZED',
      details: expect.objectContaining({ authStatus: 'expired' })
    } satisfies Partial<AppError>);
  });

  it('returns signed_out when no local codex auth file exists', async () => {
    const { adapter } = createAdapter();
    await expect(adapter.getStatus({ workspaceId: 'ws-1' })).resolves.toEqual({ status: 'signed_out' });
    await expect(adapter.getAccessToken({ workspaceId: 'ws-1' })).rejects.toMatchObject({
      code: 'E_UNAUTHORIZED',
      details: expect.objectContaining({ authStatus: 'signed_out' })
    } satisfies Partial<AppError>);
  });

  it('supports loginStart/loginComplete and logout command orchestration', async () => {
    const futureExp = Math.floor(Date.parse('2026-02-06T14:00:00.000Z') / 1000);
    const authJson = JSON.stringify({
      tokens: {
        access_token: createJwt({ exp: futureExp })
      }
    });

    const { adapter, commands } = createAdapter({ authJson });

    const started = await adapter.loginStart({ workspaceId: 'ws-1' });
    expect(started.authUrl).toBe('https://chatgpt.example/login');
    expect(started.correlationState).toMatch(/^codex-/);

    const completed = await adapter.loginComplete({
      workspaceId: 'ws-1',
      correlationState: started.correlationState
    });
    expect(completed.status).toBe('authenticated');

    await adapter.logout({ workspaceId: 'ws-1' });

    expect(commands).toEqual([
      ['login', 'status'],
      ['login', 'status'],
      ['login', 'status'],
      ['logout']
    ]);
  });

  it('maps codex runtime command failures to E_PROVIDER', async () => {
    const { adapter } = createAdapter({ failStatusCheck: true });

    await expect(adapter.getStatus({ workspaceId: 'ws-1' })).rejects.toMatchObject({
      code: 'E_PROVIDER'
    } satisfies Partial<AppError>);

    const { adapter: logoutAdapter } = createAdapter({
      authJson: JSON.stringify({ tokens: { access_token: createJwt({ exp: 1896620400 }) } }),
      failLogout: true
    });

    await expect(logoutAdapter.logout({ workspaceId: 'ws-1' })).rejects.toMatchObject({
      code: 'E_PROVIDER'
    } satisfies Partial<AppError>);
  });
});
