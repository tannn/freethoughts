import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  IMPORT_ERROR_MESSAGES,
  importDocumentFromPath,
  type RuntimeImportCommandRunner
} from '../src/ingestion/runtimeImport.js';
import { AppError } from '../src/shared/ipc/errors.js';
import { createTempDir } from './helpers/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const fixtureRoot = join(__dirname, '..', 'bench', 'fixtures');

const expectAppError = (
  fn: () => unknown,
  expected: { code: AppError['code']; message: string }
): void => {
  let thrown: unknown;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBeInstanceOf(AppError);
  const appError = thrown as AppError;
  expect(appError.code).toBe(expected.code);
  expect(appError.message).toBe(expected.message);
};

const createPdfCommandRunner = (responses: {
  pageCount: number;
  pdfText: string;
  destinations?: string;
}): RuntimeImportCommandRunner => {
  return (file, args) => {
    if (file === 'pdfinfo') {
      if (args[0] === '-dests') {
        return responses.destinations ?? 'Page  Destination                 Name\n';
      }

      return `Title: test\nPages: ${responses.pageCount}\n`;
    }

    if (file === 'pdftotext') {
      return responses.pdfText;
    }

    throw new Error(`Unexpected command: ${file} ${args.join(' ')}`);
  };
};

describe('runtime import adapter', () => {
  it('imports txt fixtures and returns a single anchored document section', () => {
    const sourcePath = join(fixtureRoot, 'txt', 'discussion-notes.txt');

    const first = importDocumentFromPath(sourcePath);
    const second = importDocumentFromPath(sourcePath);

    expect(first).toEqual(second);
    expect(first.fileType).toBe('txt');
    expect(first.wordCount).toBeGreaterThan(0);
    expect(first.pageCount).toBeNull();
    expect(first.sections).toHaveLength(1);
    expect(first.sections[0]?.anchorKey).toBe('document#1');
  });

  it('imports md fixtures and returns a single anchored document section', () => {
    const sourcePath = join(fixtureRoot, 'md', 'research-log.md');
    const imported = importDocumentFromPath(sourcePath);

    expect(imported.fileType).toBe('md');
    expect(imported.wordCount).toBeGreaterThan(0);
    expect(imported.sections).toHaveLength(1);
    expect(imported.sections[0]?.anchorKey).toBe('document#1');
  });

  it('imports pdfs into a single document section', () => {
    const dir = createTempDir();
    const sourcePath = join(dir, 'outline.pdf');
    writeFileSync(sourcePath, '%PDF-1.4\n%stub\n', 'utf8');

    const imported = importDocumentFromPath(sourcePath, {
      runCommand: createPdfCommandRunner({
        pageCount: 4,
        pdfText: ['1 Introduction\nalpha', 'KEY RESULTS\nbeta', 'gamma', 'delta', ''].join('\f'),
        destinations: [
          'Page  Destination                 Name',
          '   1 [ XYZ   73  697 null      ] "section.1"',
          '   3 [ XYZ  110  697 null      ] "section.2"'
        ].join('\n')
      })
    });

    expect(imported.fileType).toBe('pdf');
    expect(imported.pageCount).toBe(4);
    expect(imported.wordCount).toBeNull();
    expect(imported.sections).toEqual([
      expect.objectContaining({
        heading: 'Document',
        anchorKey: 'document#1',
        pageStart: 1,
        pageEnd: 4
      })
    ]);
  });

  it('rejects unsupported file extensions with required message', () => {
    const dir = createTempDir();
    const sourcePath = join(dir, 'unsupported.rtf');
    writeFileSync(sourcePath, 'content', 'utf8');

    expectAppError(() => importDocumentFromPath(sourcePath), {
      code: 'E_VALIDATION',
      message: IMPORT_ERROR_MESSAGES.unsupportedType
    });
  });

  it('rejects test-only .pdf.fixture.json extension from runtime import entrypoint', () => {
    const dir = createTempDir();
    const sourcePath = join(dir, 'outline-driven.pdf.fixture.json');
    writeFileSync(sourcePath, '{"pages":[]}', 'utf8');

    expectAppError(() => importDocumentFromPath(sourcePath), {
      code: 'E_VALIDATION',
      message: IMPORT_ERROR_MESSAGES.unsupportedType
    });
  });

  it('rejects over-limit txt imports with explicit 25,000-word error message', () => {
    const dir = createTempDir();
    const sourcePath = join(dir, 'over-limit.txt');
    const words = Array.from({ length: 25_001 }, (_, index) => `w${index + 1}`).join(' ');
    writeFileSync(sourcePath, words, 'utf8');

    expectAppError(() => importDocumentFromPath(sourcePath), {
      code: 'E_CONFLICT',
      message: IMPORT_ERROR_MESSAGES.textOverLimit
    });
  });

  it('rejects over-limit pdf imports with explicit 50-page error message', () => {
    const dir = createTempDir();
    const sourcePath = join(dir, 'over-limit.pdf');
    writeFileSync(sourcePath, '%PDF-1.4\n%stub\n', 'utf8');

    expectAppError(
      () =>
        importDocumentFromPath(sourcePath, {
          runCommand: createPdfCommandRunner({
            pageCount: 51,
            pdfText: ''
          })
        }),
      {
        code: 'E_CONFLICT',
        message: IMPORT_ERROR_MESSAGES.pdfOverLimit
      }
    );
  });

  it('rejects scanned/non-text pdf imports with OCR-not-supported message', () => {
    const dir = createTempDir();
    const sourcePath = join(dir, 'scanned.pdf');
    writeFileSync(sourcePath, '%PDF-1.4\n%stub\n', 'utf8');

    expectAppError(
      () =>
        importDocumentFromPath(sourcePath, {
          runCommand: createPdfCommandRunner({
            pageCount: 2,
            pdfText: ['   ', '', ''].join('\f')
          })
        }),
      {
        code: 'E_CONFLICT',
        message: IMPORT_ERROR_MESSAGES.pdfOcrNotSupported
      }
    );
  });
});
