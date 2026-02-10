import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  type OpenAiGenerationRequest,
  type OpenAiGenerationResponse,
  type OpenAiTransport
} from '../src/ai/index.js';
import { DesktopRuntime, type RuntimeApiKeyProvider } from '../src/main/runtime/index.js';
import { createTempDb, createTempDir } from './helpers/db.js';

class RecordingApiKeyProvider implements RuntimeApiKeyProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

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

class RecordingTransport implements OpenAiTransport {
  readonly prompts: string[] = [];

  readonly seenApiKeys: string[] = [];

  private count = 0;

  async generate(request: OpenAiGenerationRequest): Promise<OpenAiGenerationResponse> {
    this.count += 1;
    this.prompts.push(request.prompt);
    this.seenApiKeys.push(request.apiKey);
    return { text: `provocation-${this.count}` };
  }
}

describe('phase 11 end-to-end acceptance harness', () => {
  it('covers workspace -> import -> read -> note -> provocation -> re-import -> reassign -> continue', async () => {
    const seeded = createTempDb();
    const workspaceDir = createTempDir();
    const sourcePath = join(workspaceDir, 'phase11-flow.md');
    const apiKey = 'api-key-acceptance';

    writeFileSync(
      sourcePath,
      ['# Intro', 'Initial intro paragraph.', '', '# Findings', 'Initial findings paragraph.'].join(
        '\n'
      ),
      'utf8'
    );

    const transport = new RecordingTransport();
    const runtime = new DesktopRuntime({
      dbPath: seeded.dbPath,
      apiKeyProvider: new RecordingApiKeyProvider(apiKey),
      onlineProvider: { isOnline: () => true },
      openAiTransport: transport
    });

    runtime.openWorkspace(workspaceDir);

    const imported = runtime.importDocument(sourcePath);
    const firstSectionId = imported.firstSectionId;
    expect(firstSectionId).not.toBeNull();
    if (!firstSectionId) {
      throw new Error('expected first section id');
    }

    const firstSection = runtime.getSection(firstSectionId);
    expect(firstSection.section.content).toContain('Initial intro paragraph.');

    const note = runtime.createNote({
      documentId: imported.document.id,
      sectionId: firstSection.section.id,
      text: 'Note tied to intro.'
    });

    const provocation = await runtime.generateProvocation({
      requestId: 'req-phase11-1',
      documentId: imported.document.id,
      sectionId: firstSection.section.id,
      noteId: note.id,
      acknowledgeCloudWarning: true
    });

    expect(provocation.outputText).toBe('provocation-1');
    expect(transport.prompts[0]).toContain('Target note');
    expect(transport.prompts[0]).toContain(note.content);

    writeFileSync(
      sourcePath,
      ['# Revised Intro', 'Revised intro paragraph.', '', '# Findings', 'Updated findings paragraph.'].join(
        '\n'
      ),
      'utf8'
    );

    const reimported = runtime.reimportDocument(imported.document.id);
    expect(reimported.unassignedNotes.map((item) => item.noteId)).toContain(note.id);

    expect(() => runtime.getSection(firstSection.section.id)).toThrowError(
      'Section not found in current document revision'
    );

    const reassignedSectionId = reimported.sections[0]?.id;
    expect(reassignedSectionId).toBeDefined();
    if (!reassignedSectionId) {
      throw new Error('expected section after reimport');
    }

    runtime.reassignNote({ noteId: note.id, targetSectionId: reassignedSectionId });

    const reassignedSection = runtime.getSection(reassignedSectionId);
    expect(reassignedSection.notes.map((item) => item.id)).toContain(note.id);

    const continued = await runtime.generateProvocation({
      requestId: 'req-phase11-2',
      documentId: imported.document.id,
      sectionId: reassignedSectionId
    });

    expect(continued.outputText).toBe('provocation-2');
    expect(transport.seenApiKeys).toEqual([apiKey, apiKey]);

    const dbBytes = readFileSync(seeded.dbPath);
    expect(dbBytes.includes(Buffer.from(apiKey, 'utf8'))).toBe(false);
  });
});
