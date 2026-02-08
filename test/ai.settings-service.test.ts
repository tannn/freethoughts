import { describe, expect, it } from 'vitest';
import {
  AiSettingsRepository,
  AiSettingsService,
  type ApiKeyManagementProvider
} from '../src/ai/index.js';
import { AppError } from '../src/shared/ipc/errors.js';
import { createTempDb } from './helpers/db.js';

class InMemoryApiKeyProvider implements ApiKeyManagementProvider {
  private key: string | null = null;

  setApiKey(apiKey: string): void {
    const normalized = apiKey.trim();
    if (!normalized) {
      throw new AppError('E_VALIDATION', 'OpenAI API key is required');
    }
    this.key = normalized;
  }

  hasApiKey(): boolean {
    return this.key !== null;
  }

  deleteApiKey(): boolean {
    const hadKey = this.key !== null;
    this.key = null;
    return hadKey;
  }
}

describe('ai settings service with managed API key boundary', () => {
  it('supports set/get/delete key state without persisting raw key in SQLite', () => {
    const { dbPath, sqlite } = createTempDb();
    const repository = new AiSettingsRepository(dbPath);
    const apiKeyProvider = new InMemoryApiKeyProvider();
    const service = new AiSettingsService(repository, apiKeyProvider);

    const initial = service.getSettings();
    expect(initial.apiKeyConfigured).toBe(false);

    const updated = service.updateSettings({
      generationModel: 'gpt-4.1-custom',
      defaultProvocationStyle: 'creative',
      openAiApiKey: 'sk-local-only'
    });

    expect(updated).toEqual({
      generationModel: 'gpt-4.1-custom',
      defaultProvocationStyle: 'creative',
      apiKeyConfigured: true
    });

    const persistedRows = sqlite.queryJson<{
      generation_model: string;
      default_provocation_style: string;
      created_at: string;
      updated_at: string;
    }>(`
      SELECT generation_model, default_provocation_style, created_at, updated_at
      FROM workspace_settings
      WHERE id = 1;
    `);

    expect(persistedRows).toHaveLength(1);
    expect(JSON.stringify(persistedRows)).not.toContain('sk-local-only');

    const afterClear = service.updateSettings({ clearOpenAiApiKey: true });
    expect(afterClear.apiKeyConfigured).toBe(false);
  });

  it('rejects requests that set and clear API key simultaneously', () => {
    const { dbPath } = createTempDb();
    const repository = new AiSettingsRepository(dbPath);
    const apiKeyProvider = new InMemoryApiKeyProvider();
    const service = new AiSettingsService(repository, apiKeyProvider);

    expect(() =>
      service.updateSettings({
        openAiApiKey: 'sk-test',
        clearOpenAiApiKey: true
      })
    ).toThrowError(AppError);
  });
});
