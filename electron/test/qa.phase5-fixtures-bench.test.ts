import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import {
  AiSettingsRepository,
  OpenAIClient,
  ProvocationService,
  type OpenAiGenerationRequest,
  type OpenAiGenerationResponse,
  type OpenAiTransport
} from '../src/ai/index.js';
import { sectionMarkdown, sectionTxt } from '../src/ingestion/sectioning/mdTxt.js';
import { sectionPdf, type PdfOutlineItem, type PdfPage } from '../src/ingestion/sectioning/pdf.js';
import { countMarkdownWords, countTxtWords } from '../src/ingestion/wordCount.js';
import { SqliteCli } from '../src/persistence/migrations/sqliteCli.js';
import { createTempDb } from './helpers/db.js';

type FixtureType = 'txt' | 'md' | 'pdf';

interface FixtureManifestEntry {
  id: string;
  type: FixtureType;
  path: string;
  nearLimit: boolean;
}

interface FixtureManifest {
  generatedAt: string;
  fixtureCount: number;
  fixtures: FixtureManifestEntry[];
}

interface PdfFixturePayload {
  title: string;
  pages: PdfPage[];
  outline?: PdfOutlineItem[];
}

interface PreparedSection {
  id: string;
  documentId: string;
  heading: string;
  content: string;
  orderIndex: number;
  anchorKey: string;
}

interface PreparedFixture {
  id: string;
  type: FixtureType;
  nearLimit: boolean;
  sectionCount: number;
  wordCount: number;
  pageCount: number;
  sections: PreparedSection[];
}

interface SummaryStats {
  count: number;
  p50Ms: number;
  p90Ms: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');
const fixtureRoot = join(repoRoot, 'bench', 'fixtures');
const reportPath = join(repoRoot, 'reports', 'phase5-benchmark-report.md');
const runBenchmarkInThisProcess = process.env.TFT_RUN_PHASE5_BENCH === '1';

const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length) - 1;
  const index = Math.max(0, Math.min(rank, sorted.length - 1));
  return sorted[index] ?? 0;
};

const summarize = (durationsMs: number[]): SummaryStats => {
  const count = durationsMs.length;
  const total = durationsMs.reduce((sum, value) => sum + value, 0);
  return {
    count,
    p50Ms: percentile(durationsMs, 0.5),
    p90Ms: percentile(durationsMs, 0.9),
    minMs: Math.min(...durationsMs),
    maxMs: Math.max(...durationsMs),
    meanMs: count === 0 ? 0 : total / count
  };
};

const loadManifest = (): FixtureManifest => {
  const raw = readFileSync(join(fixtureRoot, 'manifest.json'), 'utf8');
  return JSON.parse(raw) as FixtureManifest;
};

const toSectionAnchor = (heading: string, index: number): string => {
  const normalized = heading
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${normalized || 'section'}#${index + 1}`;
};

const loadFixture = (entry: FixtureManifestEntry): PreparedFixture => {
  const filePath = join(fixtureRoot, entry.path);

  if (entry.type === 'txt') {
    const text = readFileSync(filePath, 'utf8');
    const parsed = sectionTxt(text);
    const sections = parsed.map((section, index) => ({
      id: `${entry.id}-sec-${index + 1}`,
      documentId: entry.id,
      heading: section.heading,
      content: section.content,
      orderIndex: index,
      anchorKey: toSectionAnchor(section.heading, index)
    }));
    return {
      id: entry.id,
      type: entry.type,
      nearLimit: entry.nearLimit,
      sectionCount: sections.length,
      wordCount: countTxtWords(text),
      pageCount: 0,
      sections
    };
  }

  if (entry.type === 'md') {
    const markdown = readFileSync(filePath, 'utf8');
    const parsed = sectionMarkdown(markdown);
    const sections = parsed.map((section, index) => ({
      id: `${entry.id}-sec-${index + 1}`,
      documentId: entry.id,
      heading: section.heading,
      content: section.content,
      orderIndex: index,
      anchorKey: toSectionAnchor(section.heading, index)
    }));
    return {
      id: entry.id,
      type: entry.type,
      nearLimit: entry.nearLimit,
      sectionCount: sections.length,
      wordCount: countMarkdownWords(markdown),
      pageCount: 0,
      sections
    };
  }

  const payload = JSON.parse(readFileSync(filePath, 'utf8')) as PdfFixturePayload;
  const parsed = sectionPdf({ pages: payload.pages, outline: payload.outline });
  const sections = parsed.map((section, index) => ({
    id: `${entry.id}-sec-${index + 1}`,
    documentId: entry.id,
    heading: section.heading,
    content: section.content,
    orderIndex: index,
    anchorKey: toSectionAnchor(section.heading, index)
  }));
  return {
    id: entry.id,
    type: entry.type,
    nearLimit: entry.nearLimit,
    sectionCount: sections.length,
    wordCount: 0,
    pageCount: payload.pages.length,
    sections
  };
};

const seedFixturesIntoDb = (sqlite: SqliteCli, fixtures: PreparedFixture[]): void => {
  for (const fixture of fixtures) {
    const revisionId = `${fixture.id}-rev-1`;
    sqlite.exec(`
      INSERT INTO documents (
        id,
        workspace_id,
        source_path,
        source_size,
        source_mtime,
        source_sha256,
        current_revision_id
      ) VALUES (
        ${sqlString(fixture.id)},
        'ws-bench',
        ${sqlString(`bench/${fixture.id}`)},
        ${fixture.wordCount + fixture.pageCount},
        1,
        ${sqlString(`sha-${fixture.id}`)},
        ${sqlString(revisionId)}
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
        ${sqlString(revisionId)},
        ${sqlString(fixture.id)},
        1,
        ${sqlString(`bench/${fixture.id}`)},
        ${fixture.wordCount + fixture.pageCount},
        1,
        ${sqlString(`sha-${fixture.id}`)}
      );
    `);

    for (const section of fixture.sections) {
      sqlite.exec(`
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
          ${sqlString(section.id)},
          ${sqlString(section.documentId)},
          ${sqlString(revisionId)},
          ${sqlString(section.anchorKey)},
          ${sqlString(section.heading)},
          1,
          ${section.orderIndex},
          ${sqlString(section.content)}
        );
      `);
    }
  }
};

const runNavigationBenchmark = (sqlite: SqliteCli, sectionIds: string[], iterations: number): number[] => {
  const durations: number[] = [];

  for (let i = 0; i < iterations; i += 1) {
    const sectionId = sectionIds[i % sectionIds.length] ?? '';
    const start = performance.now();
    const rows = sqlite.queryJson<{ id: string; heading: string; content: string }>(`
      SELECT id, heading, content
      FROM sections
      WHERE id = ${sqlString(sectionId)}
      LIMIT 1;
    `);
    const row = rows[0];
    if (!row) {
      throw new Error(`Missing section ${sectionId}`);
    }
    const renderProxy = row.heading.length + row.content.length;
    if (renderProxy < 0) {
      throw new Error('invalid render proxy');
    }
    durations.push(performance.now() - start);
  }

  return durations;
};

class SimulatedTransport implements OpenAiTransport {
  private sequence = 0;

  async generate(_request: OpenAiGenerationRequest): Promise<OpenAiGenerationResponse> {
    this.sequence += 1;
    const delayMs = 25 + (this.sequence % 7) * 3;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return { text: `simulated-provocation-${this.sequence}` };
  }
}

const runAiBenchmark = async (
  service: ProvocationService,
  targets: Array<{ documentId: string; sectionId: string }>,
  iterations: number,
  requestPrefix: string
): Promise<number[]> => {
  const durations: number[] = [];

  for (let i = 0; i < iterations; i += 1) {
    const target = targets[i % targets.length];
    if (!target) {
      throw new Error('No benchmark target sections available');
    }
    const start = performance.now();
    await service.generate({
      requestId: `${requestPrefix}-${i + 1}`,
      documentId: target.documentId,
      sectionId: target.sectionId,
      confirmReplace: true
    });
    durations.push(performance.now() - start);
  }

  return durations;
};

const formatSummary = (title: string, summary: SummaryStats): string => {
  return [
    `### ${title}`,
    '',
    '| metric | value |',
    '|---|---:|',
    `| count | ${summary.count} |`,
    `| p50 (ms) | ${summary.p50Ms.toFixed(2)} |`,
    `| p90 (ms) | ${summary.p90Ms.toFixed(2)} |`,
    `| mean (ms) | ${summary.meanMs.toFixed(2)} |`,
    `| min (ms) | ${summary.minMs.toFixed(2)} |`,
    `| max (ms) | ${summary.maxMs.toFixed(2)} |`,
    ''
  ].join('\n');
};

const writeBenchmarkReport = (input: {
  fixtures: PreparedFixture[];
  smokeNavigation: SummaryStats;
  smokeAi: SummaryStats;
  fullNavigation: SummaryStats;
  fullAi: SummaryStats;
  smokePass: boolean;
}): void => {
  mkdirSync(dirname(reportPath), { recursive: true });

  const byType = input.fixtures.reduce<Record<FixtureType, number>>(
    (acc, fixture) => {
      acc[fixture.type] += 1;
      return acc;
    },
    { txt: 0, md: 0, pdf: 0 }
  );

  const nearLimit = input.fixtures.filter((fixture) => fixture.nearLimit);
  const report = [
    '# Phase 5 Benchmark Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Environment',
    '',
    `- Platform: ${process.platform}`,
    `- OS Release: ${os.release()}`,
    `- Architecture: ${process.arch}`,
    `- CPU: ${os.cpus()[0]?.model ?? 'unknown'}`,
    `- RAM (GB): ${(os.totalmem() / (1024 ** 3)).toFixed(2)}`,
    '',
    '## Fixture Corpus',
    '',
    `- Total fixtures: ${input.fixtures.length}`,
    `- .txt fixtures: ${byType.txt}`,
    `- .md fixtures: ${byType.md}`,
    `- .pdf fixtures: ${byType.pdf}`,
    `- Near-limit fixtures: ${nearLimit.map((fixture) => fixture.id).join(', ')}`,
    '',
    '## Smoke Gate (NFR-010)',
    '',
    formatSummary('Section Navigation (20 warm)', input.smokeNavigation),
    formatSummary('Provocation Latency (10 calls)', input.smokeAi),
    `Smoke gate status: ${input.smokePass ? 'PASS' : 'FAIL'}`,
    '',
    '## Full Hardening Benchmarks (NFR-009)',
    '',
    formatSummary('Section Navigation (200 warm)', input.fullNavigation),
    formatSummary('Provocation Latency (100 calls)', input.fullAi),
    '## Notes',
    '',
    '- AI benchmark uses deterministic simulated OpenAI transport latency for local reproducibility.',
    '- Live network benchmark against OpenAI should be run in a network-enabled environment for NFR-002A validation.',
    ''
  ].join('\n');

  writeFileSync(reportPath, report, 'utf8');
};

const benchmarkDescribe = runBenchmarkInThisProcess ? describe : describe.skip;

benchmarkDescribe('phase 5 fixtures and benchmark harness', () => {
  it('builds the 12-document fixture corpus and reports smoke/full p50/p90 metrics', async () => {
    const manifest = loadManifest();
    expect(manifest.fixtureCount).toBe(12);
    expect(manifest.fixtures).toHaveLength(12);

    const fixtures = manifest.fixtures.map(loadFixture);
    expect(fixtures.every((fixture) => fixture.sectionCount > 0)).toBe(true);

    const byType = fixtures.reduce<Record<FixtureType, number>>(
      (acc, fixture) => {
        acc[fixture.type] += 1;
        return acc;
      },
      { txt: 0, md: 0, pdf: 0 }
    );
    expect(byType).toEqual({ txt: 4, md: 4, pdf: 4 });

    const nearLimitTxt = fixtures.find((fixture) => fixture.id === 'txt-near-limit');
    const nearLimitMd = fixtures.find((fixture) => fixture.id === 'md-near-limit');
    const nearLimitPdf = fixtures.find((fixture) => fixture.id === 'pdf-near-limit');

    expect(nearLimitTxt?.wordCount ?? 0).toBeGreaterThanOrEqual(24_500);
    expect(nearLimitMd?.wordCount ?? 0).toBeGreaterThanOrEqual(24_500);
    expect(nearLimitPdf?.pageCount ?? 0).toBe(50);

    const seeded = createTempDb();
    seedFixturesIntoDb(seeded.sqlite, fixtures);

    const allSections = fixtures.flatMap((fixture) =>
      fixture.sections.map((section) => ({
        documentId: fixture.id,
        sectionId: section.id
      }))
    );
    const sectionIds = allSections.map((section) => section.sectionId);

    runNavigationBenchmark(seeded.sqlite, sectionIds, 20);

    const settings = new AiSettingsRepository(seeded.dbPath);
    const client = new OpenAIClient(
      settings,
      { getApiKey: async () => 'bench-key' },
      new SimulatedTransport(),
      { timeoutMs: 25_000, retryDelaysMs: [500, 1500] },
      async (delayMs) => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      },
      () => 0
    );
    const service = new ProvocationService(seeded.dbPath, settings, client);

    const smokeNavigationDurations = runNavigationBenchmark(seeded.sqlite, sectionIds, 20);
    const smokeAiDurations = await runAiBenchmark(service, allSections, 10, 'smoke-ai');

    const fullNavigationDurations = runNavigationBenchmark(seeded.sqlite, sectionIds, 200);
    const fullAiDurations = await runAiBenchmark(service, allSections, 100, 'full-ai');

    const smokeNavigation = summarize(smokeNavigationDurations);
    const smokeAi = summarize(smokeAiDurations);
    const fullNavigation = summarize(fullNavigationDurations);
    const fullAi = summarize(fullAiDurations);

    const smokePass = smokeNavigation.p50Ms < 200 && smokeAi.p50Ms < 8000;
    expect(smokeNavigation.p50Ms).toBeLessThan(200);
    expect(smokeAi.p50Ms).toBeLessThan(8000);

    writeBenchmarkReport({
      fixtures,
      smokeNavigation,
      smokeAi,
      fullNavigation,
      fullAi,
      smokePass
    });
  }, 120_000);
});
