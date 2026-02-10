import { describe, expect, it } from 'vitest';
import {
  AiSettingsRepository,
  OpenAIClient,
  ProvocationService,
  type OpenAiGenerationRequest,
  type OpenAiGenerationResponse,
  type OpenAiTransport
} from '../src/ai/index.js';
import { createTempDb, seedDocumentRevision } from './helpers/db.js';

class BarrierTransport implements OpenAiTransport {
  private started = 0;
  private readonly waiters: Array<() => void> = [];
  private sequence = 0;
  private resolveStarted!: () => void;
  readonly allStarted: Promise<void>;

  constructor(private readonly expectedStarts: number) {
    this.allStarted = new Promise((resolve) => {
      this.resolveStarted = resolve;
    });
  }

  async generate(_request: OpenAiGenerationRequest): Promise<OpenAiGenerationResponse> {
    this.started += 1;
    if (this.started === this.expectedStarts) {
      this.resolveStarted();
    }

    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });

    this.sequence += 1;
    return { text: `provocation-${this.sequence}` };
  }

  releaseAll(): void {
    for (const release of this.waiters.splice(0, this.waiters.length)) {
      release();
    }
  }
}

class StaticTransport implements OpenAiTransport {
  constructor(private readonly text: string) {}

  async generate(_request: OpenAiGenerationRequest): Promise<OpenAiGenerationResponse> {
    return { text: this.text };
  }
}

describe('provocation history concurrency', () => {
  it('allows concurrent generation to persist additive history entries', async () => {
    const seeded = createTempDb();
    seedDocumentRevision(seeded.sqlite, {
      documentId: 'doc-race',
      revisionId: 'rev-1',
      sections: [{ id: 'sec-1', anchorKey: 'intro#1', heading: 'Intro', orderIndex: 0, content: 'alpha beta' }]
    });

    const settings = new AiSettingsRepository(seeded.dbPath);
    const transport = new BarrierTransport(2);
    const client = new OpenAIClient(
      settings,
      { getApiKey: async () => 'key' },
      transport,
      { timeoutMs: 5000, retryDelaysMs: [5, 15] },
      async () => Promise.resolve(),
      () => 0
    );
    const service = new ProvocationService(seeded.dbPath, settings, client);

    const first = service.generate({
      requestId: 'req-1',
      documentId: 'doc-race',
      sectionId: 'sec-1'
    });
    const second = service.generate({
      requestId: 'req-2',
      documentId: 'doc-race',
      sectionId: 'sec-1'
    });

    await transport.allStarted;
    transport.releaseAll();

    const settled = await Promise.allSettled([first, second]);

    const fulfilled = settled.filter(
      (result): result is PromiseFulfilledResult<Awaited<typeof first>> => result.status === 'fulfilled'
    );
    const rejected = settled.filter(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );

    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(0);

    const rows = seeded.sqlite.queryJson<{ id: string; is_active: number }>(`
      SELECT id, is_active
      FROM provocations
      WHERE document_id = 'doc-race'
        AND section_id = 'sec-1'
        AND revision_id = 'rev-1';
    `);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.is_active)).toEqual([1, 1]);
    const active = service.getActive('doc-race', 'sec-1');
    expect(active).not.toBeNull();
    expect(fulfilled.map((result) => result.value.id)).toContain(active?.id);
  });

  it('deletes only the targeted provocation in history', async () => {
    const seeded = createTempDb();
    seedDocumentRevision(seeded.sqlite, {
      documentId: 'doc-replace',
      revisionId: 'rev-1',
      sections: [{ id: 'sec-1', anchorKey: 'intro#1', heading: 'Intro', orderIndex: 0, content: 'alpha beta' }]
    });
    const settings = new AiSettingsRepository(seeded.dbPath);
    const client = new OpenAIClient(
      settings,
      { getApiKey: async () => 'key' },
      new StaticTransport('replacement'),
      { timeoutMs: 5000, retryDelaysMs: [5, 15] },
      async () => Promise.resolve(),
      () => 0
    );
    const service = new ProvocationService(seeded.dbPath, settings, client);

    const first = await service.generate({
      requestId: 'req-1',
      documentId: 'doc-replace',
      sectionId: 'sec-1'
    });
    const second = await service.generate({
      requestId: 'req-2',
      documentId: 'doc-replace',
      sectionId: 'sec-1'
    });

    const deleted = service.deleteById(first.id);
    expect(deleted).toBe(true);

    const remaining = service.listHistory('doc-replace', 'sec-1');
    expect(remaining.map((row) => row.id)).toEqual([second.id]);
  });
});
