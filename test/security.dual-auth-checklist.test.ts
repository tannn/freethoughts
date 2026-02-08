import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type CodexAppServerGenerationTransport,
  type CodexAppServerTurnCompletion,
  FetchOpenAiTransport,
  type OpenAiGenerationRequest,
  type OpenAiGenerationResponse,
  type OpenAiTransport
} from '../src/ai/index.js';
import { DesktopRuntime, type RuntimeApiKeyProvider } from '../src/main/runtime/index.js';
import {
  type CodexAuthSessionState,
  type CodexLoginStartResult,
  type CodexSubscriptionAuthAdapter
} from '../src/main/runtime/codexSubscriptionAuthAdapter.js';
import { SqliteCli } from '../src/persistence/migrations/sqliteCli.js';
import { createTempDb, createTempDir } from './helpers/db.js';

class StaticApiKeyProvider implements RuntimeApiKeyProvider {
  constructor(private readonly apiKey: string) {}

  async getApiKey(): Promise<string> {
    return this.apiKey;
  }

  setApiKey(): void {
    throw new Error('unused in this test');
  }

  hasApiKey(): boolean {
    return true;
  }

  deleteApiKey(): boolean {
    return false;
  }
}

class StaticTransport implements OpenAiTransport {
  async generate(_request: OpenAiGenerationRequest): Promise<OpenAiGenerationResponse> {
    return { text: 'stable provocation output' };
  }
}

class StaticCodexGenerationTransport implements CodexAppServerGenerationTransport {
  async initialize(): Promise<void> {
    // no-op
  }

  async startSession(): Promise<{ threadId: string }> {
    return { threadId: 'thread-1' };
  }

  async sendTurn(): Promise<{ turnId: string }> {
    return { turnId: 'turn-1' };
  }

  async waitForTurnCompletion(): Promise<CodexAppServerTurnCompletion> {
    return { turnStatus: 'completed', outputText: 'stable codex output' };
  }

  async cancelTurn(): Promise<void> {
    // no-op
  }
}

class StaticCodexAdapter implements CodexSubscriptionAuthAdapter {
  loginStartResult: CodexLoginStartResult;

  loginCompleteResult: CodexAuthSessionState;

  statusResult: CodexAuthSessionState;

  accessToken: string;

  constructor(options: {
    authUrl: string;
    correlationState: string;
    accessToken: string;
    accountLabel: string;
    lastValidatedAt: string;
  }) {
    this.loginStartResult = {
      authUrl: options.authUrl,
      correlationState: options.correlationState
    };
    this.loginCompleteResult = {
      status: 'authenticated',
      accountLabel: options.accountLabel,
      lastValidatedAt: options.lastValidatedAt
    };
    this.statusResult = this.loginCompleteResult;
    this.accessToken = options.accessToken;
  }

  async loginStart(): Promise<CodexLoginStartResult> {
    return this.loginStartResult;
  }

  async loginComplete(): Promise<CodexAuthSessionState> {
    return this.loginCompleteResult;
  }

  async getStatus(): Promise<CodexAuthSessionState> {
    return this.statusResult;
  }

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }

  async logout(): Promise<void> {
    this.statusResult = { status: 'signed_out' };
  }
}

interface MatchRow {
  table_name: string;
  column_name: string;
  matches: number;
}

const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;

const sqlIdent = (value: string): string => `"${value.replaceAll('"', '""')}"`;

const findSecretMatches = (sqlite: SqliteCli, marker: string): MatchRow[] => {
  const tables = sqlite.queryJson<{ name: string }>(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%';
  `);

  const matches: MatchRow[] = [];

  for (const table of tables) {
    const columns = sqlite.queryJson<{ name: string; type: string }>(
      `PRAGMA table_info(${sqlIdent(table.name)});`
    );

    for (const column of columns) {
      const type = (column.type || '').toUpperCase();
      if (type !== 'TEXT') {
        continue;
      }

      const rows = sqlite.queryJson<{ matches: number }>(`
        SELECT COUNT(*) AS matches
        FROM ${sqlIdent(table.name)}
        WHERE ${sqlIdent(column.name)} LIKE ${sqlString(`%${marker}%`)};
      `);

      const count = rows[0]?.matches ?? 0;
      if (count > 0) {
        matches.push({
          table_name: table.name,
          column_name: column.name,
          matches: count
        });
      }
    }
  }

  return matches;
};

describe('dual-auth security and privacy checklist', () => {
  it('does not persist API/Codex secrets in SQLite during auth and generation flow', async () => {
    const apiKeySecret = 'sk-security-api-marker';
    const codexTokenSecret = 'codex-security-token-marker';
    const correlationSecret = 'corr-security-marker';
    const urlSecret = 'url-security-marker';

    const seeded = createTempDb();
    const workspaceDir = createTempDir();
    const sourcePath = join(workspaceDir, 'security-dual-auth.md');
    writeFileSync(sourcePath, '# Section\nSecurity verification content.', 'utf8');

    const runtime = new DesktopRuntime({
      dbPath: seeded.dbPath,
      apiKeyProvider: new StaticApiKeyProvider(apiKeySecret),
      codexAuthAdapter: new StaticCodexAdapter({
        authUrl: `https://example.com/codex-login?state=${urlSecret}`,
        correlationState: correlationSecret,
        accessToken: codexTokenSecret,
        accountLabel: 'reader@example.com',
        lastValidatedAt: '2026-02-06T12:20:00.000Z'
      }),
      onlineProvider: { isOnline: () => true },
      openAiTransport: new StaticTransport(),
      codexAppServerTransport: new StaticCodexGenerationTransport()
    });

    runtime.openWorkspace(workspaceDir);
    const imported = runtime.importDocument(sourcePath);
    const sectionId = imported.firstSectionId;
    if (!sectionId) {
      throw new Error('Expected imported section');
    }

    await runtime.generateProvocation({
      requestId: 'req-security-api',
      documentId: imported.document.id,
      sectionId,
      acknowledgeCloudWarning: true
    });

    await runtime.switchAuthMode('codex_subscription');
    const started = await runtime.startAuthLogin();
    await runtime.completeAuthLogin(started.correlationState);

    await runtime.generateProvocation({
      requestId: 'req-security-codex',
      documentId: imported.document.id,
      sectionId,
      confirmReplace: true
    });

    const authRows = seeded.sqlite.queryJson<{
      provider: string;
      status: string;
      account_label: string | null;
      last_validated_at: string | null;
    }>(`
      SELECT provider, status, account_label, last_validated_at
      FROM auth_sessions;
    `);

    expect(authRows).toEqual([
      {
        provider: 'codex_chatgpt',
        status: 'authenticated',
        account_label: 'reader@example.com',
        last_validated_at: '2026-02-06T12:20:00.000Z'
      }
    ]);

    for (const marker of [apiKeySecret, codexTokenSecret, correlationSecret, urlSecret]) {
      expect(findSecretMatches(seeded.sqlite, marker), `marker leaked: ${marker}`).toEqual([]);
    }
  });

  it('does not write auth bearer secrets into OpenAI response logs', async () => {
    const apiKeySecret = 'sk-log-api-marker';
    const codexTokenSecret = 'codex-log-token-marker';
    const logPath = join(createTempDir(), 'openai-responses.log');

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          output: [{ content: [{ type: 'output_text', text: 'Generated output text.' }] }]
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );

    try {
      const transport = new FetchOpenAiTransport({ logPath });

      await transport.generate({
        apiKey: apiKeySecret,
        model: 'gpt-4.1-mini',
        prompt: 'api key mode prompt',
        maxOutputTokens: 120,
        signal: new AbortController().signal
      });

      await transport.generate({
        apiKey: codexTokenSecret,
        model: 'gpt-4.1-mini',
        prompt: 'codex mode prompt',
        maxOutputTokens: 120,
        signal: new AbortController().signal
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const logContent = readFileSync(logPath, 'utf8');
    expect(logContent).toContain('"ok":true');
    expect(logContent).toContain('"status":200');
    expect(logContent).not.toContain(apiKeySecret);
    expect(logContent).not.toContain(codexTokenSecret);
    expect(logContent).not.toContain('Authorization');
  });
});
