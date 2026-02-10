# Quickstart: FreeThoughts - Local AI Document Reader

## Prerequisites

- **macOS 15.0+** (Sequoia) - Required for Apple Foundation Models
- **Xcode 16.0+** - For Swift 5.9+ and latest SDKs
- **Apple Silicon Mac** - Recommended for Foundation Models performance

## Setup

### 1. Clone and Open Project

```bash
cd freethoughts/macos-native
open FreeThoughts.xcodeproj
```

### 2. Add TCA Dependency

In Xcode:
1. File → Add Package Dependencies
2. Enter: `https://github.com/pointfreeco/swift-composable-architecture`
3. Version: 1.15.0 or later
4. Add to FreeThoughts target

### 3. Configure Signing

1. Select FreeThoughts target
2. Signing & Capabilities tab
3. Set your Team
4. Bundle ID: `com.yourname.freethoughts` (or similar)

### 4. Build and Run

```bash
# Or use Xcode's Run button (⌘R)
xcodebuild -project FreeThoughts.xcodeproj -scheme FreeThoughts -configuration Debug build
```

## Project Structure

```
macos-native/FreeThoughts/
├── App/                    # App entry and root feature
├── Features/               # TCA features (Document, Notes, Provocation)
├── Models/                 # Data models
├── Renderers/              # Format-specific rendering
├── Persistence/            # SwiftData setup
└── Resources/              # Assets and default prompts
```

## Key Files

| File | Purpose |
|------|---------|
| `FreeThoughtsApp.swift` | App entry point, SwiftData container |
| `AppFeature.swift` | Root TCA reducer composing all features |
| `DocumentFeature.swift` | Document loading and rendering state |
| `NotesFeature.swift` | Note CRUD and sidebar state |
| `ProvocationFeature.swift` | AI provocation requests |

## Running Tests

```bash
# All tests
xcodebuild test -project FreeThoughts.xcodeproj -scheme FreeThoughts

# Specific test
xcodebuild test -project FreeThoughts.xcodeproj -scheme FreeThoughts \
  -only-testing:FreeThoughtsTests/DocumentFeatureTests
```

## Development Workflow

### Adding a New Feature

1. Create feature folder: `Features/NewFeature/`
2. Add reducer: `NewFeatureReducer.swift`
3. Add view: `NewFeatureView.swift`
4. Add any dependencies: `NewFeatureClient.swift`
5. Compose into `AppFeature`
6. Write tests in `FreeThoughtsTests/Unit/`

### Testing with Mock Data

TCA dependencies are mockable:

```swift
// In test
let store = TestStore(initialState: NotesFeature.State()) {
    NotesFeature()
} withDependencies: {
    $0.persistenceClient = .mock(notes: [testNote])
}
```

### Debugging Foundation Models

Check availability:
```swift
import FoundationModels

if FoundationModels.isSupported {
    // AI features available
} else {
    // Graceful degradation
}
```

## Common Tasks

### Open a Document Programmatically

```swift
store.send(.openDocument(url: fileURL))
```

### Create a Note

```swift
store.send(.notes(.createNote(
    selection: TextSelection(start: 0, end: 50, text: "Selected text"),
    content: "My thoughts..."
)))
```

### Request Provocation

```swift
store.send(.provocation(.request(
    context: selectedText,
    promptName: "Challenge"
)))
```

## Troubleshooting

### Foundation Models Not Available

- Verify macOS 15+ installed
- Check in System Settings → Privacy & Security → AI Features
- Try restarting after macOS update

### PDF Not Rendering

- Verify file is valid PDF (open in Preview first)
- Check file permissions
- Look for PDFKit errors in console

### SwiftData Issues

- Delete app data: `~/Library/Containers/com.yourname.freethoughts/`
- Check for model version mismatches
- Review migration logs in console

## Resources

- [TCA Documentation](https://pointfreeco.github.io/swift-composable-architecture/)
- [SwiftData Guide](https://developer.apple.com/documentation/swiftdata)
- [PDFKit Reference](https://developer.apple.com/documentation/pdfkit)
- [Foundation Models](https://developer.apple.com/documentation/foundationmodels) (when available)
