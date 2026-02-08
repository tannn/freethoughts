import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const htmlPath = join(__dirname, '..', 'src', 'renderer', 'index.html');
const appTsPath = join(__dirname, '..', 'src', 'renderer', 'app.ts');

describe('renderer unified feed', () => {
  it('includes one unified feed surface with All/Notes/Provocation filters', () => {
    const html = readFileSync(htmlPath, 'utf8');

    expect(html).toContain('id="feed-filter-all-button"');
    expect(html).toContain('id="feed-filter-notes-button"');
    expect(html).toContain('id="feed-filter-provocation-button"');
    expect(html).toContain('id="unified-feed-list"');
  });

  it('persists filter state per document and renders from unified feed rows', () => {
    const appTs = readFileSync(appTsPath, 'utf8');

    expect(appTs).toContain('selectedFeedFilterByDocument');
    expect(appTs).toContain('setActiveFeedFilter');
    expect(appTs).toContain('renderFeedFilters');
    expect(appTs).toContain('state.activeSection.unifiedFeed.filter');
  });
});
