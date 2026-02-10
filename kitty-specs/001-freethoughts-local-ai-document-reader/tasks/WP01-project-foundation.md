---
work_package_id: WP01
title: Project Foundation
lane: "doing"
dependencies: []
base_branch: main
base_commit: c922e2af2ae7a6f0a6a6747de6368a5f483ef78a
created_at: '2026-02-10T06:21:29.983925+00:00'
subtasks: [T001, T002, T003, T004, T005, T006, T007]
shell_pid: "10981"
agent: "claude-opus"
history:
- date: '2026-02-09'
  action: created
  by: spec-kitty
---

# WP01: Project Foundation

## Objective

Create the Xcode project with TCA architecture, SwiftData persistence layer, and basic app shell. This work package establishes the foundation for all subsequent development.

## Implementation Command

```bash
spec-kitty implement WP01
```

## Context

**Feature**: FreeThoughts - Local AI Document Reader
**Tech Stack**: Swift 5.9+, SwiftUI, TCA 1.15+, SwiftData, macOS 15+
**Source Location**: `macos-native/FreeThoughts/`

Reference documents:
- [plan.md](../plan.md) - Project structure and architecture
- [data-model.md](../data-model.md) - SwiftData schema
- [quickstart.md](../quickstart.md) - Setup instructions

---

## Subtask T001: Create Xcode Project

**Purpose**: Set up the Xcode project with the correct folder structure per plan.md.

**Steps**:

1. Create new Xcode project in `macos-native/`:
   - Template: macOS > App
   - Product Name: FreeThoughts
   - Interface: SwiftUI
   - Language: Swift
   - Storage: None (we'll add SwiftData manually)
   - Include Tests: Yes

2. Create folder structure inside `FreeThoughts/`:
   ```
   FreeThoughts/
   ├── App/
   ├── Features/
   │   ├── Document/
   │   ├── Notes/
   │   └── Provocation/
   ├── Models/
   ├── Renderers/
   ├── Persistence/
   └── Resources/
   ```

3. Create corresponding group structure in Xcode (matching folders)

4. Set deployment target to macOS 15.0

5. Configure bundle identifier: `com.freethoughts.app` (or similar)

**Files**:
- `macos-native/FreeThoughts.xcodeproj/` (Xcode project)
- `macos-native/FreeThoughts/` (source folder with structure)

**Validation**:
- [ ] Project opens in Xcode without errors
- [ ] Folder structure matches plan.md
- [ ] Deployment target is macOS 15.0

---

## Subtask T002: Add TCA Dependency

**Purpose**: Add The Composable Architecture via Swift Package Manager.

**Steps**:

1. In Xcode: File → Add Package Dependencies

2. Enter package URL:
   ```
   https://github.com/pointfreeco/swift-composable-architecture
   ```

3. Version requirement: 1.15.0 or later (Up to Next Major)

4. Add `ComposableArchitecture` library to FreeThoughts target

5. Verify import works by adding to a Swift file:
   ```swift
   import ComposableArchitecture
   ```

**Files**:
- `FreeThoughts.xcodeproj/project.pbxproj` (updated with package)

**Validation**:
- [ ] Package resolves and downloads
- [ ] `import ComposableArchitecture` compiles
- [ ] No version conflicts

---

## Subtask T003: Create App Entry Point

**Purpose**: Create FreeThoughtsApp.swift with SwiftData container initialization.

**Steps**:

1. Create/update `App/FreeThoughtsApp.swift`:

```swift
import SwiftUI
import SwiftData
import ComposableArchitecture

@main
struct FreeThoughtsApp: App {
    // SwiftData container for persistence
    let modelContainer: ModelContainer

    // TCA store for app state
    let store: StoreOf<AppFeature>

    init() {
        // Initialize SwiftData
        do {
            let schema = Schema([
                Note.self,
                Provocation.self,
                ProvocationPrompt.self
            ])
            let config = ModelConfiguration(isStoredInMemoryOnly: false)
            self.modelContainer = try ModelContainer(for: schema, configurations: config)
        } catch {
            fatalError("Failed to initialize SwiftData: \(error)")
        }

        // Initialize TCA store
        self.store = Store(initialState: AppFeature.State()) {
            AppFeature()
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView(store: store)
        }
        .modelContainer(modelContainer)
        .commands {
            // File menu commands will be added in WP03
        }
    }
}
```

2. Create placeholder `App/ContentView.swift`:

```swift
import SwiftUI
import ComposableArchitecture

struct ContentView: View {
    let store: StoreOf<AppFeature>

    var body: some View {
        Text("FreeThoughts")
            .frame(minWidth: 800, minHeight: 600)
    }
}
```

**Files**:
- `App/FreeThoughtsApp.swift` (~40 lines)
- `App/ContentView.swift` (~15 lines)

**Validation**:
- [ ] App launches without crash
- [ ] SwiftData container initializes
- [ ] Window displays placeholder text

---

## Subtask T004: Create Root AppFeature Reducer

**Purpose**: Create the root TCA reducer that composes all child features.

**Steps**:

1. Create `App/AppFeature.swift`:

```swift
import ComposableArchitecture
import Foundation

@Reducer
struct AppFeature {
    @ObservableState
    struct State: Equatable {
        var document: DocumentFeature.State = .init()
        var notes: NotesFeature.State = .init()
        var provocation: ProvocationFeature.State = .init()
    }

    enum Action {
        case document(DocumentFeature.Action)
        case notes(NotesFeature.Action)
        case provocation(ProvocationFeature.Action)
        case onAppear
    }

    var body: some ReducerOf<Self> {
        Scope(state: \.document, action: \.document) {
            DocumentFeature()
        }
        Scope(state: \.notes, action: \.notes) {
            NotesFeature()
        }
        Scope(state: \.provocation, action: \.provocation) {
            ProvocationFeature()
        }

        Reduce { state, action in
            switch action {
            case .onAppear:
                // Initial setup actions will be added later
                return .none

            case .document, .notes, .provocation:
                return .none
            }
        }
    }
}
```

2. Create placeholder child features (minimal stubs):

**`Features/Document/DocumentFeature.swift`**:
```swift
import ComposableArchitecture

@Reducer
struct DocumentFeature {
    @ObservableState
    struct State: Equatable {}

    enum Action {}

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            return .none
        }
    }
}
```

**`Features/Notes/NotesFeature.swift`**:
```swift
import ComposableArchitecture

@Reducer
struct NotesFeature {
    @ObservableState
    struct State: Equatable {}

    enum Action {}

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            return .none
        }
    }
}
```

**`Features/Provocation/ProvocationFeature.swift`**:
```swift
import ComposableArchitecture

@Reducer
struct ProvocationFeature {
    @ObservableState
    struct State: Equatable {}

    enum Action {}

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            return .none
        }
    }
}
```

**Files**:
- `App/AppFeature.swift` (~50 lines)
- `Features/Document/DocumentFeature.swift` (~20 lines)
- `Features/Notes/NotesFeature.swift` (~20 lines)
- `Features/Provocation/ProvocationFeature.swift` (~20 lines)

**Validation**:
- [ ] All reducers compile
- [ ] AppFeature composes child features
- [ ] Store initializes in app entry point

---

## Subtask T005: Set Up SwiftData Container

**Purpose**: Configure SwiftData ModelContainer with proper schema and storage location.

**Steps**:

1. The container is already initialized in T003, but verify configuration:

```swift
// In FreeThoughtsApp.init()
let schema = Schema([
    Note.self,
    Provocation.self,
    ProvocationPrompt.self
])

// Store in default application support directory
let config = ModelConfiguration(
    schema: schema,
    isStoredInMemoryOnly: false,
    allowsSave: true
)

self.modelContainer = try ModelContainer(
    for: schema,
    configurations: config
)
```

2. Create `Persistence/DataContainer.swift` for shared access patterns:

```swift
import SwiftData
import Foundation

enum DataContainer {
    /// Shared schema for all models
    static var schema: Schema {
        Schema([
            Note.self,
            Provocation.self,
            ProvocationPrompt.self
        ])
    }

    /// Create container for production use
    static func create() throws -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: false)
        return try ModelContainer(for: schema, configurations: config)
    }

    /// Create container for testing (in-memory)
    static func createForTesting() throws -> ModelContainer {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        return try ModelContainer(for: schema, configurations: config)
    }
}
```

**Files**:
- `Persistence/DataContainer.swift` (~30 lines)

**Validation**:
- [ ] Container creates without errors
- [ ] Data persists between app launches (check ~/Library/Application Support/)

---

## Subtask T006: Create SwiftData Models

**Purpose**: Implement Note, Provocation, and ProvocationPrompt models per data-model.md.

**Steps**:

1. Create `Models/Note.swift`:

```swift
import SwiftData
import Foundation

@Model
final class Note {
    @Attribute(.unique) var id: UUID
    var documentPath: String
    var anchorStart: Int
    var anchorEnd: Int
    var anchorPage: Int?
    var selectedText: String
    var content: String
    var createdAt: Date
    var updatedAt: Date

    @Relationship(deleteRule: .cascade, inverse: \Provocation.note)
    var provocations: [Provocation] = []

    init(
        id: UUID = UUID(),
        documentPath: String,
        anchorStart: Int,
        anchorEnd: Int,
        anchorPage: Int? = nil,
        selectedText: String,
        content: String = "",
        createdAt: Date = Date(),
        updatedAt: Date = Date()
    ) {
        self.id = id
        self.documentPath = documentPath
        self.anchorStart = anchorStart
        self.anchorEnd = anchorEnd
        self.anchorPage = anchorPage
        self.selectedText = selectedText
        self.content = content
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }
}
```

2. Create `Models/Provocation.swift`:

```swift
import SwiftData
import Foundation

@Model
final class Provocation {
    @Attribute(.unique) var id: UUID
    var documentPath: String
    var sourceType: SourceType
    var sourceText: String
    var promptName: String
    var response: String
    var createdAt: Date

    var note: Note?

    enum SourceType: String, Codable {
        case textSelection
        case note
    }

    init(
        id: UUID = UUID(),
        documentPath: String,
        sourceType: SourceType,
        sourceText: String,
        promptName: String,
        response: String,
        createdAt: Date = Date(),
        note: Note? = nil
    ) {
        self.id = id
        self.documentPath = documentPath
        self.sourceType = sourceType
        self.sourceText = sourceText
        self.promptName = promptName
        self.response = response
        self.createdAt = createdAt
        self.note = note
    }
}
```

3. Create `Models/ProvocationPrompt.swift`:

```swift
import SwiftData
import Foundation

@Model
final class ProvocationPrompt {
    @Attribute(.unique) var id: UUID
    var name: String
    var promptTemplate: String
    var isBuiltIn: Bool
    var sortOrder: Int
    var createdAt: Date

    init(
        id: UUID = UUID(),
        name: String,
        promptTemplate: String,
        isBuiltIn: Bool = false,
        sortOrder: Int,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.name = name
        self.promptTemplate = promptTemplate
        self.isBuiltIn = isBuiltIn
        self.sortOrder = sortOrder
        self.createdAt = createdAt
    }
}
```

**Files**:
- `Models/Note.swift` (~50 lines)
- `Models/Provocation.swift` (~45 lines)
- `Models/ProvocationPrompt.swift` (~35 lines)

**Validation**:
- [ ] All models compile
- [ ] Relationships defined correctly
- [ ] Can insert and query models in SwiftData

---

## Subtask T007: Create Basic Main Window

**Purpose**: Create the main window layout with NavigationSplitView for document + sidebar.

**Steps**:

1. Update `App/ContentView.swift`:

```swift
import SwiftUI
import ComposableArchitecture

struct ContentView: View {
    @Bindable var store: StoreOf<AppFeature>

    var body: some View {
        NavigationSplitView {
            // Sidebar (notes) - placeholder for WP05
            VStack {
                HStack {
                    Text("NOTES")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                    Spacer()
                }
                .padding()

                Spacer()

                Text("No notes yet")
                    .foregroundStyle(.tertiary)

                Spacer()
            }
            .frame(minWidth: 250, idealWidth: 280, maxWidth: 350)
        } detail: {
            // Document viewer - placeholder for WP02
            VStack {
                Spacer()
                Text("Open a Document")
                    .font(.title2)
                    .foregroundStyle(.secondary)
                Text("Drop a file here or use File → Open")
                    .foregroundStyle(.tertiary)
                Spacer()
            }
            .frame(minWidth: 500)
        }
        .frame(minWidth: 800, minHeight: 600)
        .onAppear {
            store.send(.onAppear)
        }
    }
}

#Preview {
    ContentView(
        store: Store(initialState: AppFeature.State()) {
            AppFeature()
        }
    )
}
```

2. Window should have:
   - Minimum size: 800x600
   - Split view with sidebar (notes) and detail (document)
   - Proper macOS window chrome

**Files**:
- `App/ContentView.swift` (~50 lines)

**Validation**:
- [ ] Window displays with correct layout
- [ ] Sidebar is resizable
- [ ] Split view collapses correctly
- [ ] Window respects minimum size

---

## Definition of Done

- [ ] Xcode project builds without errors
- [ ] App launches and displays main window
- [ ] TCA store initializes with composed features
- [ ] SwiftData container creates and persists data
- [ ] All three model types can be created and saved
- [ ] Folder structure matches plan.md specification

## Risks

| Risk | Mitigation |
|------|------------|
| TCA version compatibility | Pin to 1.15+ which is stable |
| SwiftData macOS 15 issues | Test on actual macOS 15 device |
| Project structure wrong | Reference plan.md carefully |

## Reviewer Guidance

1. Verify Xcode project structure matches plan.md exactly
2. Test that app launches without crashes
3. Confirm SwiftData persists data between launches
4. Check TCA store composition is correct
5. Ensure minimum window size is enforced

## Activity Log

- 2026-02-10T06:21:30Z – claude-opus – shell_pid=92754 – lane=doing – Assigned agent via workflow command
- 2026-02-10T09:25:29Z – claude-opus – shell_pid=92754 – lane=for_review – Ready for review: <summary>
- 2026-02-10T09:26:59Z – claude-opus – shell_pid=10981 – lane=doing – Started review via workflow command
