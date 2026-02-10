import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');
const fixtureRoot = join(repoRoot, 'bench', 'fixtures');

const writeFile = (relativePath, content) => {
  const filePath = join(fixtureRoot, relativePath);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf8');
};

const writeJson = (relativePath, value) => {
  writeFile(relativePath, `${JSON.stringify(value, null, 2)}\n`);
};

const buildWordLine = (prefix, index) => `${prefix}${(index % 997) + 1}`;

const buildNearLimitTxt = (headingPrefix, sections, wordsPerSection) => {
  const blocks = [];
  let wordCursor = 0;

  for (let sectionIndex = 0; sectionIndex < sections; sectionIndex += 1) {
    blocks.push(`${headingPrefix} ${sectionIndex + 1}`);
    const words = [];
    for (let i = 0; i < wordsPerSection; i += 1) {
      words.push(buildWordLine('t', wordCursor));
      wordCursor += 1;
    }
    blocks.push(words.join(' '));
    blocks.push('');
  }

  return blocks.join('\n');
};

const buildNearLimitMarkdown = (headingPrefix, sections, wordsPerSection) => {
  const parts = ['# Synthetic Near-Limit Markdown'];
  let wordCursor = 0;

  for (let sectionIndex = 0; sectionIndex < sections; sectionIndex += 1) {
    parts.push(`## ${headingPrefix} ${sectionIndex + 1}`);
    const words = [];
    for (let i = 0; i < wordsPerSection; i += 1) {
      words.push(buildWordLine('m', wordCursor));
      wordCursor += 1;
    }
    parts.push(words.join(' '));
    parts.push(`- checkpoint ${sectionIndex + 1}`);
    parts.push('');
  }

  return parts.join('\n');
};

const buildPdfPages = (pageCount, prefix) => {
  const pages = [];
  for (let page = 1; page <= pageCount; page += 1) {
    const words = [];
    for (let i = 0; i < 180; i += 1) {
      words.push(`${prefix}${page}_${i}`);
    }
    pages.push({
      pageNumber: page,
      text: `PAGE ${page}\n${words.join(' ')}`
    });
  }
  return pages;
};

const fixtures = [
  {
    id: 'txt-discussion',
    type: 'txt',
    path: 'txt/discussion-notes.txt',
    nearLimit: false
  },
  {
    id: 'txt-protocol',
    type: 'txt',
    path: 'txt/protocol-outline.txt',
    nearLimit: false
  },
  {
    id: 'txt-heading-sparse',
    type: 'txt',
    path: 'txt/heading-sparse.txt',
    nearLimit: false
  },
  {
    id: 'txt-near-limit',
    type: 'txt',
    path: 'txt/near-limit-24960.txt',
    nearLimit: true
  },
  {
    id: 'md-research-log',
    type: 'md',
    path: 'md/research-log.md',
    nearLimit: false
  },
  {
    id: 'md-outline',
    type: 'md',
    path: 'md/structured-outline.md',
    nearLimit: false
  },
  {
    id: 'md-minimal',
    type: 'md',
    path: 'md/minimal-headings.md',
    nearLimit: false
  },
  {
    id: 'md-near-limit',
    type: 'md',
    path: 'md/near-limit-24920.md',
    nearLimit: true
  },
  {
    id: 'pdf-outline',
    type: 'pdf',
    path: 'pdf/outline-driven.pdf.fixture.json',
    nearLimit: false
  },
  {
    id: 'pdf-heading-detect',
    type: 'pdf',
    path: 'pdf/heading-detect.pdf.fixture.json',
    nearLimit: false
  },
  {
    id: 'pdf-bucket',
    type: 'pdf',
    path: 'pdf/two-page-bucket.pdf.fixture.json',
    nearLimit: false
  },
  {
    id: 'pdf-near-limit',
    type: 'pdf',
    path: 'pdf/near-limit-50-pages.pdf.fixture.json',
    nearLimit: true
  }
];

writeFile(
  'txt/discussion-notes.txt',
  `INTRODUCTION\n` +
    `These notes summarize a reading group conversation about tools for thought and critical practice.\n\n` +
    `METHOD OVERVIEW\n` +
    `Participants compared annotation habits, deliberate pause prompts, and ways to preserve unresolved questions.\n\n` +
    `NEXT STEPS\n` +
    `The group plans to test short weekly experiments and retain notes for longitudinal reflection.\n`
);

writeFile(
  'txt/protocol-outline.txt',
  `1. Baseline capture\nRecord current note quality and section navigation speed.\n\n` +
    `2. Prompt cadence\nAdd one provocation request every second section.\n\n` +
    `3. Review cycle\nCompare differences in note specificity and uncertainty handling.\n`
);

writeFile(
  'txt/heading-sparse.txt',
  `This fixture intentionally has no strong heading boundaries.\n\n` +
    `It exercises paragraph fallback chunking for deterministic section generation in plain text mode.\n\n` +
    `Each paragraph stays concise, but enough text exists to create multiple fallback groups when needed.\n`
);

writeFile('txt/near-limit-24960.txt', buildNearLimitTxt('RESEARCH BLOCK', 24, 1040));

writeFile(
  'md/research-log.md',
  `# Research Log\n\n` +
    `## Session Goal\nCapture where readers hesitate and which prompts increase synthesis.\n\n` +
    `## Observations\n- Readers prefer short contrastive questions.\n- Long prompts reduce follow-through.\n\n` +
    `## Follow-up\nRe-run with narrower context windows and compare outcomes.\n`
);

writeFile(
  'md/structured-outline.md',
  `# Structured Outline\n\n` +
    `## Framing\nA reading workflow needs context continuity, friction control, and recoverable note anchors.\n\n` +
    `## Evidence\n1. Deterministic anchors improve re-import reliability.\n2. Explicit uncertainty cues reduce overconfidence in summaries.\n\n` +
    `## Implications\nUse constrained generation and preserve unresolved notes during revision shifts.\n`
);

writeFile(
  'md/minimal-headings.md',
  `# Minimal\n\n` +
    `Small markdown fixture with intentionally brief sections.\n\n` +
    `## Detail\nText is short but representative for smoke-path benchmarks.\n`
);

writeFile('md/near-limit-24920.md', buildNearLimitMarkdown('Deep Section', 22, 1130));

writeJson('pdf/outline-driven.pdf.fixture.json', {
  title: 'Outline Driven PDF Fixture',
  pages: buildPdfPages(12, 'o'),
  outline: [
    { title: 'Preface', pageNumber: 1 },
    { title: 'Methods', pageNumber: 4 },
    { title: 'Findings', pageNumber: 8 },
    { title: 'Appendix', pageNumber: 11 }
  ]
});

writeJson('pdf/heading-detect.pdf.fixture.json', {
  title: 'Heading Detect PDF Fixture',
  pages: [
    { pageNumber: 1, text: 'DOCUMENT CONTEXT\nalpha alpha alpha alpha' },
    { pageNumber: 2, text: 'METHOD REVIEW\nbeta beta beta beta beta' },
    { pageNumber: 3, text: 'RESULT NOTES\ngamma gamma gamma gamma' },
    { pageNumber: 4, text: 'LIMITATIONS:\ndelta delta delta delta' },
    { pageNumber: 5, text: 'NEXT QUESTIONS\nepsilon epsilon epsilon' },
    { pageNumber: 6, text: 'CLOSING\nzeta zeta zeta zeta' },
    { pageNumber: 7, text: 'ADDITIONAL TABLES\neta eta eta eta eta' },
    { pageNumber: 8, text: 'FINAL SUMMARY\ntheta theta theta theta' }
  ]
});

writeJson('pdf/two-page-bucket.pdf.fixture.json', {
  title: 'Two Page Bucket PDF Fixture',
  pages: [
    { pageNumber: 1, text: 'no headings here one one one one' },
    { pageNumber: 2, text: 'still plain text two two two two' },
    { pageNumber: 3, text: 'unstructured content three three three' },
    { pageNumber: 4, text: 'unstructured content four four four' },
    { pageNumber: 5, text: 'unstructured content five five five' },
    { pageNumber: 6, text: 'unstructured content six six six' }
  ]
});

writeJson('pdf/near-limit-50-pages.pdf.fixture.json', {
  title: 'Near Limit 50 Pages PDF Fixture',
  pages: buildPdfPages(50, 'n')
});

writeJson('manifest.json', {
  generatedAt: 'deterministic',
  fixtureCount: fixtures.length,
  fixtures
});

console.log(`Generated ${fixtures.length} phase 5 fixtures in ${fixtureRoot}`);
