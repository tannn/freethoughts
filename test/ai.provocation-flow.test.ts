import { describe, expect, it } from 'vitest';
import {
  AiSettingsRepository,
  OpenAIClient,
  ProvocationService,
  type OpenAiGenerationRequest,
  type OpenAiGenerationResponse,
  type OpenAiTransport
} from '../src/ai/index.js';
import { AppError } from '../src/shared/ipc/errors.js';
import { createTempDb, seedDocumentRevision } from './helpers/db.js';

class StaticTransport implements OpenAiTransport {
  private count = 0;
  readonly prompts: string[] = [];

  async generate(request: OpenAiGenerationRequest): Promise<OpenAiGenerationResponse> {
    this.count += 1;
    this.prompts.push(request.prompt);
    return { text: `provocation-${this.count}` };
  }
}

describe('provocation generation flow', () => {
  it('supports section and note targets with additive provocation history', async () => {
    const seeded = createTempDb();
    seedDocumentRevision(seeded.sqlite, {
      documentId: 'doc-1',
      revisionId: 'rev-1',
      sections: [
        { id: 'sec-1', anchorKey: 'a#1', heading: 'A', orderIndex: 0, content: 'alpha' },
        { id: 'sec-2', anchorKey: 'b#1', heading: 'B', orderIndex: 1, content: 'beta' },
        { id: 'sec-3', anchorKey: 'c#1', heading: 'C', orderIndex: 2, content: 'gamma' }
      ]
    });

    seeded.sqlite.exec(`
      INSERT INTO notes (id, document_id, section_id, content)
      VALUES ('note-1', 'doc-1', 'sec-2', 'Selected note content');
    `);

    const settings = new AiSettingsRepository(seeded.dbPath);
    settings.updateWorkspaceSettings({ defaultProvocationStyle: 'creative' });

    const transport = new StaticTransport();
    const client = new OpenAIClient(
      settings,
      { getApiKey: async () => 'key' },
      transport,
      { timeoutMs: 5000, retryDelaysMs: [5, 15] },
      async () => Promise.resolve(),
      () => 0
    );

    const service = new ProvocationService(seeded.dbPath, settings, client);

    const first = await service.generate({
      requestId: 'req-1',
      documentId: 'doc-1',
      sectionId: 'sec-2'
    });

    expect(first.style).toBe('creative');
    expect(first.isActive).toBe(true);
    expect(service.getActive('doc-1', 'sec-2')?.id).toBe(first.id);

    const second = await service.generate({
      requestId: 'req-2',
      documentId: 'doc-1',
      sectionId: 'sec-2',
      noteId: 'note-1',
      style: 'skeptical'
    });

    expect(second.style).toBe('skeptical');
    expect(second.id).not.toBe(first.id);

    const history = service.listHistory('doc-1', 'sec-2');
    expect(history.map((entry) => entry.id)).toEqual([second.id, first.id]);

    const active = service.getActive('doc-1', 'sec-2');
    expect(active?.id).toBe(second.id);

    expect(service.deleteById(second.id)).toBe(true);
    const remaining = service.listHistory('doc-1', 'sec-2');
    expect(remaining.map((entry) => entry.id)).toEqual([first.id]);

    expect(transport.prompts[0]).toContain('[Active] B');
    expect(transport.prompts[0]).toContain('[Previous] A');
    expect(transport.prompts[0]).toContain('[Next] C');
    expect(transport.prompts[1]).toContain('Target note:');
  });

  it('blocks generation when provocations are disabled for document', async () => {
    const seeded = createTempDb();
    seedDocumentRevision(seeded.sqlite, {
      documentId: 'doc-2',
      revisionId: 'rev-1',
      sections: [{ id: 'sec-a', anchorKey: 'a#1', heading: 'A', orderIndex: 0, content: 'alpha' }]
    });

    const settings = new AiSettingsRepository(seeded.dbPath);
    settings.updateDocumentSettings('doc-2', { provocationsEnabled: false });

    const client = new OpenAIClient(
      settings,
      { getApiKey: async () => 'key' },
      {
        async generate(_request: OpenAiGenerationRequest): Promise<OpenAiGenerationResponse> {
          return { text: 'should not run' };
        }
      },
      { timeoutMs: 5000, retryDelaysMs: [5, 15] },
      async () => Promise.resolve(),
      () => 0
    );

    const service = new ProvocationService(seeded.dbPath, settings, client);

    await expect(
      service.generate({
        requestId: 'req-disabled',
        documentId: 'doc-2',
        sectionId: 'sec-a'
      })
    ).rejects.toMatchObject({ code: 'E_CONFLICT' } satisfies Partial<AppError>);
  });

  it('maps legacy one-active unique collisions to replace flow instead of E_INTERNAL', async () => {
    const seeded = createTempDb();
    seedDocumentRevision(seeded.sqlite, {
      documentId: 'doc-legacy',
      revisionId: 'rev-1',
      sections: [{ id: 'sec-1', anchorKey: 'a#1', heading: 'A', orderIndex: 0, content: 'alpha' }]
    });

    seeded.sqlite.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_provocations_one_active_per_section_revision
      ON provocations(document_id, section_id, revision_id)
      WHERE is_active = 1;
    `);

    const settings = new AiSettingsRepository(seeded.dbPath);
    const client = new OpenAIClient(
      settings,
      { getApiKey: async () => 'key' },
      {
        async generate(_request: OpenAiGenerationRequest): Promise<OpenAiGenerationResponse> {
          return { text: 'legacy-index-provocation' };
        }
      },
      { timeoutMs: 5000, retryDelaysMs: [5, 15] },
      async () => Promise.resolve(),
      () => 0
    );
    const service = new ProvocationService(seeded.dbPath, settings, client);

    const first = await service.generate({
      requestId: 'req-legacy-1',
      documentId: 'doc-legacy',
      sectionId: 'sec-1'
    });

    await expect(
      service.generate({
        requestId: 'req-legacy-2',
        documentId: 'doc-legacy',
        sectionId: 'sec-1'
      })
    ).rejects.toMatchObject({ code: 'E_CONFLICT' } satisfies Partial<AppError>);

    const replaced = await service.generate({
      requestId: 'req-legacy-3',
      documentId: 'doc-legacy',
      sectionId: 'sec-1',
      confirmReplace: true
    });

    expect(replaced.id).not.toBe(first.id);
    expect(service.getActive('doc-legacy', 'sec-1')?.id).toBe(replaced.id);
    expect(service.listHistory('doc-legacy', 'sec-1').map((entry) => entry.id)).toEqual([replaced.id]);
  });
});
