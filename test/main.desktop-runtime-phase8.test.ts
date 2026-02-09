import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type OpenAiGenerationRequest, type OpenAiGenerationResponse, type OpenAiTransport } from '../src/ai/index.js';
import { DesktopRuntime, type RuntimeApiKeyProvider } from '../src/main/runtime/index.js';
import { AppError } from '../src/shared/ipc/errors.js';
import { createTempDb, createTempDir } from './helpers/db.js';

class FakeApiKeyProvider implements RuntimeApiKeyProvider {
  private apiKey = 'test-key';

  async getApiKey(): Promise<string> {
    return this.apiKey;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  hasApiKey(): boolean {
    return this.apiKey.trim().length > 0;
  }

  deleteApiKey(): boolean {
    const had = this.hasApiKey();
    this.apiKey = '';
    return had;
  }
}

class CountingTransport implements OpenAiTransport {
  private count = 0;

  async generate(_request: OpenAiGenerationRequest): Promise<OpenAiGenerationResponse> {
    this.count += 1;
    return { text: `provocation-${this.count}` };
  }
}

describe('phase 8 desktop runtime integration', () => {
  it('supports workspace -> import -> read -> note -> reimport flow', () => {
    const seeded = createTempDb();
    const workspaceDir = createTempDir();
    const sourcePath = join(workspaceDir, 'reader.md');

    writeFileSync(
      sourcePath,
      ['# Intro', 'Initial intro paragraph.', '', '# Findings', 'Initial findings paragraph.'].join('\n'),
      'utf8'
    );

    const runtime = new DesktopRuntime({
      dbPath: seeded.dbPath,
      apiKeyProvider: new FakeApiKeyProvider(),
      onlineProvider: { isOnline: () => true },
      openAiTransport: new CountingTransport()
    });

    runtime.openWorkspace(workspaceDir);

    const imported = runtime.importDocument(sourcePath);
    expect(imported.sections.length).toBeGreaterThan(0);

    const firstSectionId = imported.firstSectionId;
    expect(firstSectionId).not.toBeNull();
    if (!firstSectionId) {
      throw new Error('expected first section id');
    }

    const firstSection = runtime.getSection(firstSectionId);
    const createdNote = runtime.createNote({
      documentId: imported.document.id,
      sectionId: firstSection.section.id,
      text: 'Keep this note linked to intro.'
    });

    writeFileSync(
      sourcePath,
      ['# Revised Intro Heading', 'New intro paragraph.', '', '# Findings', 'Updated findings paragraph.'].join('\n'),
      'utf8'
    );

    const reimported = runtime.reimportDocument(imported.document.id);
    expect(reimported.unassignedNotes).toEqual([]);

    expect(() => runtime.getSection(firstSection.section.id)).toThrowError(
      'Section not found in current document revision'
    );

    const firstReimportedSectionId = reimported.sections[0]?.id;
    expect(firstReimportedSectionId).toBeDefined();
    if (!firstReimportedSectionId) {
      throw new Error('expected section after reimport');
    }

    const notesAfterReimport = runtime.getSection(firstReimportedSectionId).notes.map((note) => note.id);
    expect(notesAfterReimport).toContain(createdNote.id);
  });

  it('enforces cloud-warning ack, delete, offline gating, and document provocation toggle', async () => {
    const seeded = createTempDb();
    const workspaceDir = createTempDir();
    const sourcePath = join(workspaceDir, 'provocation.md');

    writeFileSync(sourcePath, ['# Section A', 'Some section content.'].join('\n'), 'utf8');

    const onlineState = { value: false };

    const runtime = new DesktopRuntime({
      dbPath: seeded.dbPath,
      apiKeyProvider: new FakeApiKeyProvider(),
      onlineProvider: { isOnline: () => onlineState.value },
      openAiTransport: new CountingTransport()
    });

    runtime.openWorkspace(workspaceDir);
    const imported = runtime.importDocument(sourcePath);

    const sectionId = imported.firstSectionId;
    expect(sectionId).not.toBeNull();
    if (!sectionId) {
      throw new Error('expected section id');
    }

    runtime.updateSettings({ defaultProvocationStyle: 'creative' });

    await expect(
      runtime.generateProvocation({
        requestId: 'req-0',
        documentId: imported.document.id,
        sectionId
      })
    ).rejects.toMatchObject({ code: 'E_OFFLINE' } satisfies Partial<AppError>);

    onlineState.value = true;

    await expect(
      runtime.generateProvocation({
        requestId: 'req-1',
        documentId: imported.document.id,
        sectionId
      })
    ).rejects.toMatchObject({ code: 'E_CONFLICT' } satisfies Partial<AppError>);

    const first = await runtime.generateProvocation({
      requestId: 'req-2',
      documentId: imported.document.id,
      sectionId,
      acknowledgeCloudWarning: true
    });
    expect(first.style).toBe('creative');

    const second = await runtime.generateProvocation({
      requestId: 'req-3',
      documentId: imported.document.id,
      sectionId,
      style: 'skeptical'
    });
    expect(second.style).toBe('skeptical');

    runtime.deleteProvocation({ provocationId: second.id });
    expect(runtime.getSection(sectionId).activeProvocation?.id).toBe(first.id);

    runtime.updateSettings({ documentId: imported.document.id, provocationsEnabled: false });

    await expect(
      runtime.generateProvocation({
        requestId: 'req-5',
        documentId: imported.document.id,
        sectionId
      })
    ).rejects.toMatchObject({ code: 'E_CONFLICT' } satisfies Partial<AppError>);

    runtime.updateSettings({ documentId: imported.document.id, provocationsEnabled: true });
    onlineState.value = false;

    await expect(
      runtime.generateProvocation({
        requestId: 'req-6',
        documentId: imported.document.id,
        sectionId
      })
    ).rejects.toMatchObject({ code: 'E_OFFLINE' } satisfies Partial<AppError>);
  });
});
