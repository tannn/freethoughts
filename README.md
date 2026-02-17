# Free Your Thoughts
![macOS](https://img.shields.io/badge/macOS-blue) ![License](https://img.shields.io/badge/license-GPLv3-green)

A native macOS document reader for reading, annotating, and thinking with AI — entirely offline and private.

![FreeThoughts app showing a PDF document with notes sidebar and AI provocations](docs/images/full-app-view.png)

> **Beta** — under active development

## What it does

FreeThoughts is a local-first reading companion. Open a PDF, Markdown, or plain text file, select passages, take notes, and get AI-generated "provocations" that challenge and extend your thinking — all without sending a single byte off your machine.

### Features

- **Completely offline** — AI runs on-device via Apple Foundation Models. No API keys, no cloud, no internet required after install.
- **Private by design** — all documents, notes, and AI interactions stay on your Mac. Nothing is transmitted to external services.
- **Local storage** — notes and provocations persist in a local SwiftData database across app restarts.
- **Document reading** — clean two-pane reader for PDF, Markdown, and plain text files. Open via menu, keyboard shortcut, or drag-and-drop.
- **Anchored notes** — select text and attach notes to specific passages. Notes appear in a collapsible sidebar ordered by document position. Click a note to jump back to its anchor.
- **AI provocations** — select text or a note and choose a provocation style (Challenge, Expand, Simplify, Question) to get a short, thought-provoking AI response streamed in real time.
- **Free software** — GPLv3.

### Requirements

- macOS 26.0+ (Tahoe) with Apple Silicon for AI features
- Xcode 16.0+ to build from source

## Build and run

```bash
cd macos-native
open FreeThoughts.xcodeproj
# Or build from the command line:
xcodebuild -project FreeThoughts.xcodeproj -scheme FreeThoughts -configuration Debug build -skipMacroValidation
```

TCA (The Composable Architecture) is the only external dependency — add it via Xcode's Swift Package Manager if not already resolved.

## Project structure

```
macos-native/FreeThoughts/
├── App/            # App entry point, root feature, content view
├── Features/       # TCA features (Document, Notes, Provocation)
├── Models/         # Value-type data models
├── Renderers/      # PDF, Markdown, and plain text rendering
├── Persistence/    # SwiftData container and clients
└── Resources/      # Assets and default provocation prompts
```

## Tech stack

- Swift / SwiftUI
- The Composable Architecture (TCA)
- SwiftData for local persistence
- PDFKit for PDF rendering
- Apple Foundation Models for on-device AI

---

## Electron version (paused)

Early development originally used Electron. That work lives in the `electron/` directory but is **no longer under active development** — all effort has moved to the native macOS app above.

<details>
<summary>Electron details</summary>

### Tech stack

- Electron, TypeScript, Node.js
- pdf.js for PDF rendering
- SQLite for local storage
- Vitest for testing
- Zod for runtime schema validation

### Run

```bash
cd electron
npm install
npm start
```

### Test

```bash
npm test
```

### Bundle

```bash
npm run bundle:mac
```

Produces `Free Thoughts.app` in `release/Free Thoughts-darwin-arm64/`.

</details>
