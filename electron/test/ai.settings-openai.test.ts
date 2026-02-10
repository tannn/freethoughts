import { describe, expect, it } from 'vitest';
import {
  AiSettingsRepository,
  OpenAIClient,
  type OpenAiGenerationRequest,
  type OpenAiGenerationResponse,
  type OpenAiTransport
} from '../src/ai/index.js';
import { createTempDb, seedDocumentRevision } from './helpers/db.js';

class RecordingTransport implements OpenAiTransport {
  readonly requests: OpenAiGenerationRequest[] = [];

  async generate(request: OpenAiGenerationRequest): Promise<OpenAiGenerationResponse> {
    this.requests.push(request);
    return { text: 'Generated provocation' };
  }
}

describe('ai settings and openai model configuration', () => {
  it('round-trips configurable generation model and default provocation style via settings repository', () => {
    const { dbPath, sqlite } = createTempDb();
    seedDocumentRevision(sqlite, {
      documentId: 'doc-settings',
      revisionId: 'rev-1',
      sections: [{ id: 'sec-1', anchorKey: 'intro#1', heading: 'Intro', orderIndex: 0, content: 'text' }]
    });

    const settings = new AiSettingsRepository(dbPath);
    expect(settings.getWorkspaceSettings()).toEqual({
      generationModel: 'gpt-4.1-mini',
      defaultProvocationStyle: 'skeptical'
    });

    const updated = settings.updateWorkspaceSettings({
      generationModel: 'gpt-4.1-nano',
      defaultProvocationStyle: 'creative'
    });

    expect(updated).toEqual({
      generationModel: 'gpt-4.1-nano',
      defaultProvocationStyle: 'creative'
    });
    expect(settings.getWorkspaceSettings()).toEqual(updated);

    expect(settings.getDocumentSettings('doc-settings')).toEqual({
      documentId: 'doc-settings',
      provocationsEnabled: true
    });

    const disabled = settings.updateDocumentSettings('doc-settings', {
      provocationsEnabled: false
    });

    expect(disabled).toEqual({
      documentId: 'doc-settings',
      provocationsEnabled: false
    });
  });

  it('uses configured generation model by default and supports request-level override', async () => {
    const { dbPath } = createTempDb();
    const settings = new AiSettingsRepository(dbPath);
    settings.updateWorkspaceSettings({ generationModel: 'gpt-4.1-custom' });

    const transport = new RecordingTransport();
    const client = new OpenAIClient(
      settings,
      { getApiKey: async () => 'test-key' },
      transport,
      { timeoutMs: 5000, retryDelaysMs: [5, 15] },
      async () => Promise.resolve(),
      () => 0
    );

    await client.generateProvocation({
      requestId: 'req-a',
      prompt: 'First prompt'
    });

    await client.generateProvocation({
      requestId: 'req-b',
      prompt: 'Second prompt',
      modelOverride: 'gpt-4.1-override'
    });

    expect(transport.requests.map((request) => request.model)).toEqual([
      'gpt-4.1-custom',
      'gpt-4.1-override'
    ]);
  });
});
