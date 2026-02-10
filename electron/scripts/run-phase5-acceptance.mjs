import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');
const reportPath = join(repoRoot, 'reports', 'phase5-acceptance-report.md');
const benchmarkReportPath = join(repoRoot, 'reports', 'phase5-benchmark-report.md');

const run = (command, args) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env
  });
  return (result.status ?? 1) === 0;
};

const ciPassed = run('npm', ['run', 'ci']);
const benchPassed = run('npm', ['run', 'bench:phase5']);
const benchmarkReportExists = existsSync(benchmarkReportPath);

const blockers = [];
if (!ciPassed) {
  blockers.push('Full CI suite failed. Check npm run ci output.');
}
if (!benchPassed) {
  blockers.push('Phase 5 benchmark harness failed. Check npm run bench:phase5 output.');
}
if (!benchmarkReportExists) {
  blockers.push('Benchmark report file missing at reports/phase5-benchmark-report.md.');
}

blockers.push(
  'Live OpenAI network-profile benchmark (NFR-002A) is pending because this run uses deterministic simulated transport.'
);

const criteria = [
  ['1', 'Import limits/type handling', 'test/ingestion.md-txt-sectioning.test.ts, test/ingestion.pdf-sectioning.test.ts, test/ingestion.anchor-wordcount.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['2', 'Reader section navigation latency target', 'reports/phase5-benchmark-report.md (navigation p50)', benchPassed ? 'PASS' : 'BLOCKED'],
  ['3', 'Notes CRUD + persistence', 'test/reader.notes-crud.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['4', 'Re-import reassignment flow', 'test/reader.reassignment.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['5', 'Persistent unassigned notes behavior', 'test/reader.reassignment.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['6', 'Notes/Provocation tab persistence', 'test/reader.shell.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['7', 'Notes autosave', 'test/reader.autosave.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['8', 'On-demand provocation targets', 'test/ai.provocation-flow.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['9', 'One active provocation + confirmation', 'test/ai.provocation-flow.test.ts, test/ai.provocation-concurrency.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['10', 'Per-document provocation disable', 'test/ai.provocation-flow.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['11', 'Provocation style selection', 'test/ai.settings-openai.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['12', 'Style precedence', 'test/ai.provocation-flow.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['13', 'API key via Keychain only', 'test/main.keychain-provider.test.ts, test/ai.settings-service.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['14', 'Offline AI disable behavior', 'test/reader.status.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['15', 'Revision-scoped invalidation', 'test/ai.revision-invalidation.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['16', 'AI latency <8s target', 'reports/phase5-benchmark-report.md', benchPassed ? 'PASS (simulated transport)' : 'BLOCKED'],
  ['17', 'Exact anchor remap only', 'test/persistence.reimport.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['18', 'Missing/moved source recovery actions', 'test/reader.status.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['19', 'Electron security baseline FR-060..069', 'test/security.checklist.test.ts, SECURITY_CHECKLIST.md', ciPassed ? 'PASS' : 'BLOCKED'],
  ['20', 'Deterministic sectioning and anchors', 'test/ingestion.* and test/ingestion.anchor-wordcount.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['21', 'Atomic revisioned re-import', 'test/persistence.reimport.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['22', 'IPC contracts + validation', 'test/ipc.contracts.test.ts, test/preload.api.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['23', 'AI runtime defaults', 'test/ai.runtime-policy.test.ts', ciPassed ? 'PASS' : 'BLOCKED'],
  ['24', 'Blocking smoke benchmark gate', 'reports/phase5-benchmark-report.md', benchPassed ? 'PASS' : 'BLOCKED'],
  ['25', 'Full p50/p90 hardening benchmark tracked', 'reports/phase5-benchmark-report.md', benchPassed ? 'PASS' : 'BLOCKED']
];

const lines = [
  '# Phase 5 Acceptance Report',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  '## Command Results',
  '',
  `- npm run ci: ${ciPassed ? 'PASS' : 'FAIL'}`,
  `- npm run bench:phase5: ${benchPassed ? 'PASS' : 'FAIL'}`,
  `- benchmark report present: ${benchmarkReportExists ? 'YES' : 'NO'}`,
  '',
  '## Acceptance Criteria Status',
  '',
  '| # | criterion | evidence | status |',
  '|---|---|---|---|',
  ...criteria.map((row) => `| ${row[0]} | ${row[1]} | \`${row[2]}\` | ${row[3]} |`),
  '',
  '## Blockers',
  '',
  ...(blockers.length === 0 ? ['- None'] : blockers.map((blocker) => `- ${blocker}`)),
  '',
  '## Artifacts',
  '',
  '- reports/phase5-benchmark-report.md',
  '- reports/phase5-acceptance-report.md',
  ''
];

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');

console.log(`Wrote ${reportPath}`);

if (!ciPassed || !benchPassed || !benchmarkReportExists) {
  process.exit(1);
}
