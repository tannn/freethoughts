import { isTxtHeadingLikeLine } from './mdTxt.js';

export interface PdfPage {
  pageNumber: number;
  text: string;
}

export interface PdfOutlineItem {
  title: string;
  pageNumber: number;
}

export interface PdfSection {
  heading: string;
  content: string;
  startPage: number;
  endPage: number;
}

export interface PdfSectioningInput {
  pages: PdfPage[];
  outline?: PdfOutlineItem[];
}

const normalizeHeading = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'Section';
};

const sortPages = (pages: PdfPage[]): PdfPage[] => {
  return [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
};

const sectionByOutline = (pages: PdfPage[], outline: PdfOutlineItem[]): PdfSection[] => {
  const firstPage = pages[0]?.pageNumber ?? 1;
  const lastPage = pages[pages.length - 1]?.pageNumber ?? firstPage;
  const sortedOutline = [...outline]
    .filter(
      (item) =>
        Number.isFinite(item.pageNumber) && item.pageNumber >= firstPage && item.pageNumber <= lastPage
    )
    .sort((a, b) => a.pageNumber - b.pageNumber);

  if (sortedOutline.length === 0) {
    return [];
  }

  const sections: PdfSection[] = [];
  const firstOutlinePage = sortedOutline[0]?.pageNumber ?? firstPage;

  if (firstOutlinePage > firstPage) {
    const prefaceContent = pages
      .filter((page) => page.pageNumber >= firstPage && page.pageNumber < firstOutlinePage)
      .map((page) => page.text)
      .join('\n\n')
      .trim();

    sections.push({
      heading: 'Document',
      content: prefaceContent,
      startPage: firstPage,
      endPage: firstOutlinePage - 1
    });
  }

  for (let i = 0; i < sortedOutline.length; i += 1) {
    const current = sortedOutline[i];
    const next = sortedOutline[i + 1];
    const startPage = current.pageNumber;
    const endPage = next ? next.pageNumber - 1 : pages[pages.length - 1]?.pageNumber ?? startPage;

    if (endPage < startPage) {
      continue;
    }

    const content = pages
      .filter((page) => page.pageNumber >= startPage && page.pageNumber <= endPage)
      .map((page) => page.text)
      .join('\n\n')
      .trim();

    sections.push({
      heading: normalizeHeading(current.title),
      content,
      startPage,
      endPage
    });
  }

  return sections;
};

const sectionByHeadingDetection = (pages: PdfPage[]): PdfSection[] => {
  const linesWithPage = pages.flatMap((page) =>
    page.text.split(/\r?\n/).map((line) => ({
      line,
      pageNumber: page.pageNumber
    }))
  );

  const headingIndexes = linesWithPage
    .map((row, index) => ({ index, row }))
    .filter((entry) => isTxtHeadingLikeLine(entry.row.line.trim()));

  if (headingIndexes.length === 0) {
    return [];
  }

  const sections: PdfSection[] = [];
  const firstHeading = headingIndexes[0];

  if (firstHeading && firstHeading.index > 0) {
    sections.push({
      heading: 'Document',
      content: linesWithPage
        .slice(0, firstHeading.index)
        .map((entry) => entry.line)
        .join('\n')
        .trim(),
      startPage: pages[0]?.pageNumber ?? firstHeading.row.pageNumber,
      endPage: firstHeading.row.pageNumber
    });
  }

  for (let i = 0; i < headingIndexes.length; i += 1) {
    const current = headingIndexes[i];
    const next = headingIndexes[i + 1];
    const sliceStart = current.index + 1;
    const sliceEnd = next ? next.index : linesWithPage.length;
    const contentLines = linesWithPage.slice(sliceStart, sliceEnd).map((entry) => entry.line);

    sections.push({
      heading: normalizeHeading(current.row.line),
      content: contentLines.join('\n').trim(),
      startPage: current.row.pageNumber,
      endPage: next ? next.row.pageNumber : pages[pages.length - 1]?.pageNumber ?? current.row.pageNumber
    });
  }

  return sections;
};

const sectionByTwoPageBuckets = (pages: PdfPage[]): PdfSection[] => {
  const sections: PdfSection[] = [];

  for (let i = 0; i < pages.length; i += 2) {
    const bucket = pages.slice(i, i + 2);
    const startPage = bucket[0]?.pageNumber ?? 0;
    const endPage = bucket[bucket.length - 1]?.pageNumber ?? startPage;

    sections.push({
      heading: `Pages ${startPage}-${endPage}`,
      content: bucket.map((page) => page.text).join('\n\n').trim(),
      startPage,
      endPage
    });
  }

  return sections;
};

export const sectionPdf = (input: PdfSectioningInput): PdfSection[] => {
  const pages = sortPages(input.pages);
  if (pages.length === 0) {
    return [];
  }

  if (input.outline && input.outline.length > 0) {
    const outlineSections = sectionByOutline(pages, input.outline);
    if (outlineSections.length > 0) {
      return outlineSections;
    }
  }

  const headingSections = sectionByHeadingDetection(pages);
  if (headingSections.length > 0) {
    return headingSections;
  }

  return sectionByTwoPageBuckets(pages);
};
