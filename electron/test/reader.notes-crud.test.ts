import { describe, expect, it } from 'vitest';
import { NotesRepository } from '../src/reader/notesRepository.js';
import { createTempDb, seedDocumentRevision } from './helpers/db.js';

describe('notes repository', () => {
  it('supports create/update/delete for section-bound notes', () => {
    const seeded = createTempDb();
    seedDocumentRevision(seeded.sqlite, {
      documentId: 'doc-1',
      revisionId: 'rev-1',
      sections: [
        { id: 'sec-1', anchorKey: 'intro#1', heading: 'Intro', orderIndex: 0, content: 'alpha' },
        { id: 'sec-2', anchorKey: 'method#1', heading: 'Method', orderIndex: 1, content: 'beta' }
      ]
    });

    const repo = new NotesRepository(seeded.dbPath);
    const created = repo.create({
      noteId: 'note-1',
      documentId: 'doc-1',
      sectionId: 'sec-1',
      content: 'first draft',
      paragraphOrdinal: 2,
      startOffset: 14,
      endOffset: 28,
      selectedTextExcerpt: 'highlighted text'
    });

    expect(created.id).toBe('note-1');
    expect(created.sectionId).toBe('sec-1');
    expect(created.paragraphOrdinal).toBe(2);
    expect(created.startOffset).toBe(14);
    expect(created.endOffset).toBe(28);
    expect(created.selectedTextExcerpt).toBe('highlighted text');

    const updated = repo.update('note-1', 'updated draft');
    expect(updated.content).toBe('updated draft');

    const sectionNotes = repo.listBySection('doc-1', 'sec-1');
    expect(sectionNotes.map((note) => note.id)).toEqual(['note-1']);

    repo.delete('note-1');
    expect(repo.getById('note-1')).toBeNull();
  });

  it('persists notes across repository restarts and excludes unassigned notes from section lists', () => {
    const seeded = createTempDb();
    seedDocumentRevision(seeded.sqlite, {
      documentId: 'doc-2',
      revisionId: 'rev-1',
      sections: [
        { id: 'sec-a', anchorKey: 'a#1', heading: 'A', orderIndex: 0, content: 'alpha' },
        { id: 'sec-b', anchorKey: 'b#1', heading: 'B', orderIndex: 1, content: 'beta' }
      ]
    });

    const firstRepo = new NotesRepository(seeded.dbPath);
    firstRepo.create({
      noteId: 'note-a',
      documentId: 'doc-2',
      sectionId: 'sec-a',
      content: 'persist me'
    });

    seeded.sqlite.exec(`
      INSERT INTO notes (id, document_id, section_id, content)
      VALUES ('note-unassigned', 'doc-2', NULL, 'needs reassignment');
    `);

    const secondRepo = new NotesRepository(seeded.dbPath);
    const restored = secondRepo.getById('note-a');
    expect(restored?.content).toBe('persist me');

    const sectionNotes = secondRepo.listBySection('doc-2', 'sec-a');
    expect(sectionNotes.map((note) => note.id)).toEqual(['note-a']);
  });
});
