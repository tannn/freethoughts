import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { buildAnchors } from './anchors.js';
import { captureSourceFingerprint, type SourceFingerprint } from './fingerprint.js';
import { sectionMarkdown, sectionTxt } from './sectioning/mdTxt.js';
import { sectionPdf, type PdfOutlineItem, type PdfPage } from './sectioning/pdf.js';
import { DOCUMENT_WORD_LIMIT, countMarkdownWords, countTxtWords } from './wordCount.js';
import { AppError } from '../shared/ipc/errors.js';

export const PDF_PAGE_LIMIT = 50;

export const IMPORT_ERROR_MESSAGES = {
  unsupportedType: 'Unsupported file type. Supported types: .pdf, .txt, .md.',
  pdfOcrNotSupported: 'OCR is not supported for scanned or non-text PDFs.',
  pdfOverLimit: 'File exceeds limit: PDFs may contain at most 50 pages.',
  textOverLimit: 'File exceeds limit: .txt/.md may contain at most 25,000 words.'
} as const;

export type RuntimeImportFileType = 'pdf' | 'txt' | 'md';

export interface RuntimeImportSection {
  heading: string;
  content: string;
  orderIndex: number;
  anchorKey: string;
  pageStart?: number;
  pageEnd?: number;
}

export interface RuntimeImportResult {
  sourcePath: string;
  title: string;
  fileType: RuntimeImportFileType;
  wordCount: number | null;
  pageCount: number | null;
  fingerprint: SourceFingerprint;
  sections: RuntimeImportSection[];
}

interface ParsedInputKind {
  fileType: RuntimeImportFileType;
  sourcePath: string;
}

interface PreparedTextImport {
  title: string;
  wordCount: number;
  sections: Array<{ heading: string; content: string }>;
}

interface PreparedPdfImport {
  title: string;
  pageCount: number;
  sections: Array<{ heading: string; content: string; startPage: number; endPage: number }>;
}

export type RuntimeImportCommandRunner = (file: string, args: string[]) => string;

export interface RuntimeImportOptions {
  runCommand?: RuntimeImportCommandRunner;
}

const defaultRunCommand: RuntimeImportCommandRunner = (file, args) =>
  execFileSync(file, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

const parseInputKind = (sourcePath: string): ParsedInputKind => {
  const trimmed = sourcePath.trim();
  if (!trimmed) {
    throw new AppError('E_VALIDATION', 'Source path is required', { field: 'sourcePath' });
  }

  const absolutePath = resolve(trimmed);
  const extension = extname(absolutePath).toLowerCase();
  if (extension === '.pdf' || extension === '.txt' || extension === '.md') {
    return {
      fileType: extension.slice(1) as RuntimeImportFileType,
      sourcePath: absolutePath
    };
  }

  throw new AppError('E_VALIDATION', IMPORT_ERROR_MESSAGES.unsupportedType, {
    sourcePath: absolutePath,
    extension
  });
};

const ensureSourceExists = (sourcePath: string): void => {
  try {
    statSync(sourcePath);
  } catch (error) {
    const systemError = error as NodeJS.ErrnoException;
    if (systemError.code === 'ENOENT') {
      throw new AppError('E_NOT_FOUND', 'Source file not found', { sourcePath });
    }

    throw new AppError('E_INTERNAL', 'Failed to read source file metadata', {
      sourcePath,
      code: systemError.code
    });
  }
};

const ensureWithinWordLimit = (wordCount: number): void => {
  if (wordCount > DOCUMENT_WORD_LIMIT) {
    throw new AppError('E_CONFLICT', IMPORT_ERROR_MESSAGES.textOverLimit, {
      limitWords: DOCUMENT_WORD_LIMIT,
      actualWords: wordCount
    });
  }
};

const ensureWithinPageLimit = (pageCount: number): void => {
  if (pageCount > PDF_PAGE_LIMIT) {
    throw new AppError('E_CONFLICT', IMPORT_ERROR_MESSAGES.pdfOverLimit, {
      limitPages: PDF_PAGE_LIMIT,
      actualPages: pageCount
    });
  }
};

const parseTxtImport = (sourcePath: string): PreparedTextImport => {
  const text = readFileSync(sourcePath, 'utf8');
  const wordCount = countTxtWords(text);
  ensureWithinWordLimit(wordCount);

  return {
    title: basename(sourcePath),
    wordCount,
    sections: sectionTxt(text)
  };
};

const parseMarkdownImport = (sourcePath: string): PreparedTextImport => {
  const markdown = readFileSync(sourcePath, 'utf8');
  const wordCount = countMarkdownWords(markdown);
  ensureWithinWordLimit(wordCount);

  return {
    title: basename(sourcePath),
    wordCount,
    sections: sectionMarkdown(markdown)
  };
};

const parsePdfDestinationLine = (line: string): { pageNumber: number; destination: string } | null => {
  const match = line.match(/^\s*(\d+)\s+\[.*\]\s+"(.+)"\s*$/);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  const pageNumber = Number.parseInt(match[1], 10);
  if (!Number.isFinite(pageNumber) || pageNumber < 1) {
    return null;
  }

  return {
    pageNumber,
    destination: match[2].trim()
  };
};

const mapDestinationToHeading = (destination: string): { heading: string; rank: number } | null => {
  const normalized = destination.trim();
  if (!normalized) {
    return null;
  }

  const lower = normalized.toLowerCase();
  if (
    /^page\.\d+$/.test(lower) ||
    lower.startsWith('figure.caption.') ||
    lower.startsWith('table.caption.') ||
    lower.startsWith('cite.') ||
    lower.startsWith('item.') ||
    lower.startsWith('hfootnote.')
  ) {
    return null;
  }

  const chapterMatch = lower.match(/^chapter\.(\d+)$/);
  if (chapterMatch?.[1]) {
    return { heading: `Chapter ${chapterMatch[1]}`, rank: 1 };
  }

  const appendixMatch = lower.match(/^appendix\.([a-z0-9]+)$/);
  if (appendixMatch?.[1]) {
    return { heading: `Appendix ${appendixMatch[1].toUpperCase()}`, rank: 1 };
  }

  const sectionMatch = lower.match(/^section\*?\.(\d+(?:\.\d+)*)$/);
  if (sectionMatch?.[1]) {
    return { heading: `Section ${sectionMatch[1]}`, rank: 2 };
  }

  const subsectionMatch = lower.match(/^subsection\.(\d+(?:\.\d+)*)$/);
  if (subsectionMatch?.[1]) {
    return { heading: `Subsection ${subsectionMatch[1]}`, rank: 3 };
  }

  const subsubsectionMatch = lower.match(/^subsubsection\.(\d+(?:\.\d+)*)$/);
  if (subsubsectionMatch?.[1]) {
    return { heading: `Subsubsection ${subsubsectionMatch[1]}`, rank: 4 };
  }

  if (/^[a-z0-9 _-]{1,80}$/i.test(normalized)) {
    const heading = normalized.replaceAll(/[_-]+/g, ' ').trim();
    if (heading) {
      return { heading, rank: 5 };
    }
  }

  return null;
};

const extractPdfOutline = (sourcePath: string, runCommand: RuntimeImportCommandRunner): PdfOutlineItem[] => {
  try {
    const output = runCommand('pdfinfo', ['-dests', sourcePath]);
    const bestByPage = new Map<number, { heading: string; rank: number }>();

    for (const line of output.split(/\r?\n/)) {
      const parsed = parsePdfDestinationLine(line);
      if (!parsed) {
        continue;
      }

      const mapped = mapDestinationToHeading(parsed.destination);
      if (!mapped) {
        continue;
      }

      const existing = bestByPage.get(parsed.pageNumber);
      if (!existing || mapped.rank < existing.rank) {
        bestByPage.set(parsed.pageNumber, mapped);
      }
    }

    return [...bestByPage.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([pageNumber, mapped]) => ({
        title: mapped.heading,
        pageNumber
      }));
  } catch {
    return [];
  }
};

const parsePdfPageCount = (sourcePath: string, runCommand: RuntimeImportCommandRunner): number => {
  try {
    const output = runCommand('pdfinfo', [sourcePath]);
    const match = output.match(/^Pages:\s+(\d+)$/m);
    if (!match?.[1]) {
      throw new AppError('E_INTERNAL', 'Unable to determine PDF page count', { sourcePath });
    }

    return Number.parseInt(match[1], 10);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const systemError = error as NodeJS.ErrnoException;
    throw new AppError('E_INTERNAL', 'Failed to read PDF metadata', {
      sourcePath,
      code: systemError.code
    });
  }
};

const extractPdfPagesText = (
  sourcePath: string,
  pageCount: number,
  runCommand: RuntimeImportCommandRunner
): PdfPage[] => {
  try {
    const output = runCommand('pdftotext', ['-layout', '-enc', 'UTF-8', sourcePath, '-']);
    const rawPages = output.replace(/\r\n/g, '\n').split('\f');
    if (rawPages[rawPages.length - 1]?.trim() === '') {
      rawPages.pop();
    }

    return Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      text: (rawPages[index] ?? '').trim()
    }));
  } catch (error) {
    const systemError = error as NodeJS.ErrnoException;
    throw new AppError('E_INTERNAL', 'Failed to extract PDF text', {
      sourcePath,
      code: systemError.code
    });
  }
};

const parsePdfImport = (sourcePath: string, runCommand: RuntimeImportCommandRunner): PreparedPdfImport => {
  const pageCount = parsePdfPageCount(sourcePath, runCommand);
  ensureWithinPageLimit(pageCount);

  const pages = extractPdfPagesText(sourcePath, pageCount, runCommand);
  const hasTextLayer = pages.some((page) => page.text.trim().length > 0);
  if (!hasTextLayer) {
    throw new AppError('E_CONFLICT', IMPORT_ERROR_MESSAGES.pdfOcrNotSupported, {
      sourcePath
    });
  }

  const outline = extractPdfOutline(sourcePath, runCommand);

  return {
    title: basename(sourcePath),
    pageCount,
    sections: sectionPdf({ pages, outline: outline.length > 0 ? outline : undefined })
  };
};

export const importDocumentFromPath = (
  sourcePath: string,
  options: RuntimeImportOptions = {}
): RuntimeImportResult => {
  const parsedKind = parseInputKind(sourcePath);
  ensureSourceExists(parsedKind.sourcePath);
  const fingerprint = captureSourceFingerprint(parsedKind.sourcePath);
  const runCommand = options.runCommand ?? defaultRunCommand;

  if (parsedKind.fileType === 'txt') {
    const parsed = parseTxtImport(parsedKind.sourcePath);
    const anchors = buildAnchors(parsed.sections.map((section) => ({ heading: section.heading })));
    return {
      sourcePath: parsedKind.sourcePath,
      title: parsed.title,
      fileType: 'txt',
      wordCount: parsed.wordCount,
      pageCount: null,
      fingerprint,
      sections: parsed.sections.map((section, index) => ({
        heading: section.heading,
        content: section.content,
        orderIndex: index,
        anchorKey: anchors[index] ?? `section#${index + 1}`
      }))
    };
  }

  if (parsedKind.fileType === 'md') {
    const parsed = parseMarkdownImport(parsedKind.sourcePath);
    const anchors = buildAnchors(parsed.sections.map((section) => ({ heading: section.heading })));
    return {
      sourcePath: parsedKind.sourcePath,
      title: parsed.title,
      fileType: 'md',
      wordCount: parsed.wordCount,
      pageCount: null,
      fingerprint,
      sections: parsed.sections.map((section, index) => ({
        heading: section.heading,
        content: section.content,
        orderIndex: index,
        anchorKey: anchors[index] ?? `section#${index + 1}`
      }))
    };
  }

  const parsedPdf = parsePdfImport(parsedKind.sourcePath, runCommand);
  const anchors = buildAnchors(parsedPdf.sections.map((section) => ({ heading: section.heading })));
  return {
    sourcePath: parsedKind.sourcePath,
    title: parsedPdf.title,
    fileType: 'pdf',
    wordCount: null,
    pageCount: parsedPdf.pageCount,
    fingerprint,
    sections: parsedPdf.sections.map((section, index) => ({
      heading: section.heading,
      content: section.content,
      orderIndex: index,
      anchorKey: anchors[index] ?? `section#${index + 1}`,
      pageStart: section.startPage,
      pageEnd: section.endPage
    }))
  };
};
