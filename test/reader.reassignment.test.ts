import { describe, expect, it } from 'vitest';
import { AppError } from '../src/shared/ipc/errors.js';
import { NotesRepository } from '../src/reader/notesRepository.js';
import { ReassignmentService } from '../src/reader/reassignment.js';
import {
  runReimportTransaction,
  type ReimportTransactionInput
} from '../src/persistence/reimportTransaction.js';
import { createTempDb, seedDocumentRevision } from './helpers/db.js';

describe('reassignment service', () => {
  it('lists unassigned notes, supports skip-for-now, and reassigns to current revision sections', () => {
    const seeded = createTempDb();
    seedDocumentRevision(seeded.sqlite, {
      documentId: 'doc-1',
      revisionId: 'rev-1',
      sections: [
        { id: 'sec-1a', anchorKey: 'intro#1', heading: 'Intro', orderIndex: 0, content: 'Intro text' },
        { id: 'sec-1b', anchorKey: 'method#1', heading: 'Method', orderIndex: 1, content: 'Method text' }
      ]
    });

    seeded.sqlite.exec(`
      INSERT INTO notes (id, document_id, section_id, content)
      VALUES
        ('note-1', 'doc-1', 'sec-1a', 'mapped note'),
        ('note-2', 'doc-1', 'sec-1b', 'unassigned note');
    `);

    const reimportInput: ReimportTransactionInput = {
      documentId: 'doc-1',
      revisionId: 'rev-2',
      revisionNumber: 2,
      sourcePath: '/docs/input.md',
      sourceSize: 120,
      sourceMtime: 2000,
      sourceSha256: 'sha-new',
      sections: [
        {
          id: 'sec-2a',
          anchorKey: 'intro#1',
          heading: 'Intro',
          ordinal: 1,
          orderIndex: 0,
          content: 'Intro v2'
        },
        {
          id: 'sec-2c',
          anchorKey: 'results#1',
          heading: 'Results',
          ordinal: 1,
          orderIndex: 1,
          content: 'Results'
        }
      ]
    };

    runReimportTransaction(seeded.dbPath, reimportInput);

    const notesRepo = new NotesRepository(seeded.dbPath);
    const reassignment = new ReassignmentService(seeded.dbPath);

    expect(notesRepo.listBySection('doc-1', 'sec-2a').map((note) => note.id)).toEqual(['note-1']);
    expect(reassignment.listUnassignedNotes('doc-1').map((item) => item.noteId)).toEqual(['note-2']);

    reassignment.skipForNow('doc-1', 'note-2');
    expect(reassignment.listUnassignedNotes('doc-1').map((item) => item.noteId)).toEqual(['note-2']);

    reassignment.reassign('doc-1', 'note-2', 'sec-2c');

    expect(notesRepo.listBySection('doc-1', 'sec-2c').map((note) => note.id)).toEqual(['note-2']);
    expect(reassignment.listUnassignedNotes('doc-1')).toEqual([]);
  });

  it('rejects reassignment to sections outside current revision', () => {
    const seeded = createTempDb();
    seedDocumentRevision(seeded.sqlite, {
      documentId: 'doc-2',
      revisionId: 'rev-1',
      sections: [{ id: 'sec-old', anchorKey: 'old#1', heading: 'Old', orderIndex: 0, content: 'old' }]
    });

    seeded.sqlite.exec(`
      INSERT INTO notes (id, document_id, section_id, content)
      VALUES ('note-u', 'doc-2', NULL, 'requires assignment');

      INSERT INTO note_reassignment_queue (
        id,
        note_id,
        document_id,
        previous_revision_id,
        previous_section_id,
        previous_anchor_key,
        previous_heading,
        status,
        resolved_at
      ) VALUES (
        'rq-1',
        'note-u',
        'doc-2',
        'rev-1',
        'sec-old',
        'old#1',
        'Old',
        'open',
        NULL
      );

      INSERT INTO document_revisions (
        id,
        document_id,
        revision_number,
        source_path,
        source_size,
        source_mtime,
        source_sha256
      ) VALUES (
        'rev-2',
        'doc-2',
        2,
        '/docs/input.md',
        100,
        1000,
        'sha-2'
      );

      INSERT INTO sections (
        id,
        document_id,
        revision_id,
        anchor_key,
        heading,
        ordinal,
        order_index,
        content
      ) VALUES (
        'sec-new',
        'doc-2',
        'rev-2',
        'new#1',
        'New',
        1,
        0,
        'new section'
      );
    `);

    seeded.sqlite.exec("UPDATE documents SET current_revision_id = 'rev-2' WHERE id = 'doc-2';");

    const reassignment = new ReassignmentService(seeded.dbPath);

    expect(() => reassignment.reassign('doc-2', 'note-u', 'sec-old')).toThrowError(AppError);
    expect(() => reassignment.reassign('doc-2', 'note-u', 'sec-old')).toThrowError(
      /current document revision/
    );
  });
});
