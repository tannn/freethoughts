# Free Your Thoughts

![My Image](docs/images/notes-provocation.png)

NOTICE: This app is in alpha — under active development and macOS-only for now.

Free Thoughts is a macOS-first Electron desktop app for reading, annotating, and augmenting documents with AI. Data is stored locally (SQLite + files), and supported filetypes include PDF, Markdown, and TXT.

Main features:

- Notes-first two-pane reader for focused review and annotation.
- Deterministic PDF selection anchors and re-import behavior.
- Local storage using SQLite plus file-backed assets with path + fingerprint metadata.
- On-demand AI provocations and annotation generation.
- Dual auth routing for OpenAI API or Codex.
- Multiple AI provocation styles to choose from (creative, skeptical, methodological)
- Fully customizable generation models (OpenAI only)
- Offline support
- Free software

## Tech stack

- Electron
- TypeScript
- Node.js & npm
- pdf.js (pdfjs-dist) for PDF rendering
- SQLite for local data storage (app uses SQLite + file-backed assets)
- Vitest for testing
- Zod for runtime schema validation
- Electron Packager (for creating macOS bundles)

## Run the desktop app

```bash
npm install
npm start
```

`npm start` builds the TypeScript app into `dist/` and launches Electron.

## Useful scripts

```bash
npm test
npm run acceptance:phase5
npm run bench:phase5
```

## Bundle the macOS app

```bash
npm run bundle:mac
```

This produces a `Free Thoughts.app` bundle in `release/Free Thoughts-darwin-arm64/`.
