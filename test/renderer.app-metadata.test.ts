import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const htmlPath = join(__dirname, '..', 'src', 'renderer', 'index.html');
const mainPath = join(__dirname, '..', 'src', 'main', 'electronMain.ts');

describe('app branding', () => {
  it('uses Free Thoughts in the renderer shell', () => {
    const html = readFileSync(htmlPath, 'utf8');

    expect(html).toContain('<title>Free Thoughts</title>');
    expect(html).toContain('<h1>Free Thoughts</h1>');
  });

  it('uses Free Thoughts as the main window title', () => {
    const main = readFileSync(mainPath, 'utf8');

    expect(main).toContain("app.setName('Free Thoughts')");
    expect(main).toContain("title: 'Free Thoughts'");
  });
});
