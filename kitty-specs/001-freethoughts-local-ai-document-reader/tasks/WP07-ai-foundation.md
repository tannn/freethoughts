---
work_package_id: WP07
title: AI Foundation
lane: "doing"
dependencies: []
base_branch: 001-freethoughts-local-ai-document-reader-WP01
base_commit: abbaef5abf77d4d016429b797f2f6fe104ac4e9e
created_at: '2026-02-10T18:52:41.213719+00:00'
subtasks: [T036, T037, T038, T039, T040, T041]
shell_pid: "81359"
agent: "GitHub Copilot"
review_status: "has_feedback"
reviewed_by: "Tanner"
history:
- date: '2026-02-09'
  action: created
  by: spec-kitty
---

# WP07: AI Foundation

## Objective

Set up Apple Foundation Models integration, provocation prompts system, and availability checking. This work package can run in parallel with document features after WP01.

## Implementation Command

```bash
spec-kitty implement WP07 --base WP01
```

## Context

**Feature**: FreeThoughts - Local AI Document Reader
**Dependencies**: WP01 (Project Foundation)

Reference documents:
- [research.md](../research.md) - Foundation Models integration pattern
- [data-model.md](../data-model.md) - ProvocationPrompt entity
- [spec.md](../spec.md) - FR-013 to FR-018

---

## Subtask T036: Create FoundationModelsClient

**Purpose**: Create TCA dependency wrapping Apple Foundation Models for on-device AI.

**Steps**:

1. Create `Features/Provocation/FoundationModelsClient.swift`:

```swift
import ComposableArchitecture
import Foundation

// Note: FoundationModels framework API based on expected macOS 15 interface
// Adjust imports and types when actual SDK is available

@DependencyClient
struct FoundationModelsClient {
    var isAvailable: @Sendable () async -> Bool
    var generate: @Sendable (_ prompt: String, _ context: String) async throws -> AsyncThrowingStream<String, Error>
}

extension FoundationModelsClient: DependencyKey {
    static let liveValue = FoundationModelsClient(
        isAvailable: {
            // Check if Foundation Models is supported on this device
            #if canImport(FoundationModels)
            return await FoundationModels.isSupported
            #else
            return false
            #endif
        },
        generate: { prompt, context in
            #if canImport(FoundationModels)
            return AsyncThrowingStream { continuation in
                Task {
                    do {
                        let model = try await LanguageModel.default
                        let fullPrompt = "\(prompt)\n\nContext:\n\(context)"

                        for try await chunk in model.generate(prompt: fullPrompt) {
                            continuation.yield(chunk)
                        }
                        continuation.finish()
                    } catch {
                        continuation.finish(throwing: error)
                    }
                }
            }
            #else
            throw FoundationModelsError.notAvailable
            #endif
        }
    )

    static let testValue = FoundationModelsClient(
        isAvailable: { true },
        generate: { prompt, context in
            AsyncThrowingStream { continuation in
                Task {
                    // Simulate streaming response
                    let words = "This is a test provocation response that challenges your thinking.".split(separator: " ")
                    for word in words {
                        try? await Task.sleep(for: .milliseconds(100))
                        continuation.yield(String(word) + " ")
                    }
                    continuation.finish()
                }
            }
        }
    )

    // Stub for when Foundation Models not available
    static let unavailableValue = FoundationModelsClient(
        isAvailable: { false },
        generate: { _, _ in
            throw FoundationModelsError.notAvailable
        }
    )
}

enum FoundationModelsError: Error, LocalizedError {
    case notAvailable
    case generationFailed(String)

    var errorDescription: String? {
        switch self {
        case .notAvailable:
            return "Apple Foundation Models is not available on this device. macOS 15+ on Apple Silicon is required."
        case .generationFailed(let reason):
            return "AI generation failed: \(reason)"
        }
    }
}

extension DependencyValues {
    var foundationModelsClient: FoundationModelsClient {
        get { self[FoundationModelsClient.self] }
        set { self[FoundationModelsClient.self] = newValue }
    }
}
```

**Files**:
- `Features/Provocation/FoundationModelsClient.swift` (~90 lines)

**Validation**:
- [ ] Client compiles on macOS 15
- [ ] Gracefully handles unavailable case
- [ ] Streaming interface works correctly

---

## Subtask T037: Implement Availability Checking

**Purpose**: Check Foundation Models availability at app launch and expose to UI.

**Steps**:

1. Add availability state to AppFeature:

```swift
@ObservableState
struct State: Equatable {
    // ...
    var isAIAvailable: Bool = false
    var aiAvailabilityChecked: Bool = false
}

enum Action {
    // ...
    case checkAIAvailability
    case aiAvailabilityResult(Bool)
}
```

2. Check on app appear:

```swift
case .onAppear:
    return .send(.checkAIAvailability)

case .checkAIAvailability:
    return .run { send in
        @Dependency(\.foundationModelsClient) var ai
        let available = await ai.isAvailable()
        await send(.aiAvailabilityResult(available))
    }

case .aiAvailabilityResult(let available):
    state.isAIAvailable = available
    state.aiAvailabilityChecked = true
    return .none
```

3. Pass availability to child features:

```swift
// ProvocationFeature needs to know if AI is available
case .aiAvailabilityResult(let available):
    state.isAIAvailable = available
    state.aiAvailabilityChecked = true
    state.provocation.isAIAvailable = available
    return .none
```

**Files**:
- `App/AppFeature.swift` (add availability check)

**Validation**:
- [ ] Availability checked on app launch
- [ ] Result propagated to state
- [ ] UI can hide/show AI features based on availability

---

## Subtask T038: Create ProvocationPrompt Persistence

**Purpose**: Create client for managing provocation prompts in SwiftData.

**Steps**:

1. Create `Features/Provocation/PromptsClient.swift`:

```swift
import ComposableArchitecture
import SwiftData
import Foundation

@DependencyClient
struct PromptsClient {
    var loadPrompts: @Sendable () async throws -> [ProvocationPrompt]
    var savePrompt: @Sendable (_ prompt: ProvocationPrompt) async throws -> Void
    var hasSeededDefaults: @Sendable () async -> Bool
    var markSeeded: @Sendable () async throws -> Void
}

extension PromptsClient: DependencyKey {
    static let liveValue: PromptsClient = {
        @Dependency(\.modelContainer) var container

        return PromptsClient(
            loadPrompts: {
                let context = ModelContext(container)
                let descriptor = FetchDescriptor<ProvocationPrompt>(
                    sortBy: [SortDescriptor(\.sortOrder)]
                )
                return try context.fetch(descriptor)
            },
            savePrompt: { prompt in
                let context = ModelContext(container)
                context.insert(prompt)
                try context.save()
            },
            hasSeededDefaults: {
                // Check UserDefaults for seed flag
                UserDefaults.standard.bool(forKey: "defaultPromptsSeeded")
            },
            markSeeded: {
                UserDefaults.standard.set(true, forKey: "defaultPromptsSeeded")
            }
        )
    }()

    static let testValue = PromptsClient(
        loadPrompts: { [] },
        savePrompt: { _ in },
        hasSeededDefaults: { true },
        markSeeded: { }
    )
}

extension DependencyValues {
    var promptsClient: PromptsClient {
        get { self[PromptsClient.self] }
        set { self[PromptsClient.self] = newValue }
    }
}
```

**Files**:
- `Features/Provocation/PromptsClient.swift` (~60 lines)

**Validation**:
- [ ] Prompts load from SwiftData
- [ ] New prompts can be saved
- [ ] Seed flag persists correctly

---

## Subtask T039: Create DefaultPrompts.json

**Purpose**: Define the four default provocation styles as a bundled resource.

**Steps**:

1. Create `Resources/DefaultPrompts.json`:

```json
[
    {
        "name": "Challenge",
        "promptTemplate": "Consider this text:\n\n\"{selection}\"\n\nFrom the document context:\n\n{context}\n\nChallenge the main assumptions or claims made here. What might be wrong, incomplete, or deserving of skepticism? What counterarguments could be made?",
        "sortOrder": 1
    },
    {
        "name": "Expand",
        "promptTemplate": "Consider this text:\n\n\"{selection}\"\n\nFrom the document context:\n\n{context}\n\nWhat are the broader implications of this idea? What connections can you draw to other fields or concepts? How might this extend or apply in unexpected ways?",
        "sortOrder": 2
    },
    {
        "name": "Simplify",
        "promptTemplate": "Consider this text:\n\n\"{selection}\"\n\nFrom the document context:\n\n{context}\n\nExplain the core idea here in simpler terms. What is the essential point being made? Strip away jargon and complexity to reveal the fundamental insight.",
        "sortOrder": 3
    },
    {
        "name": "Question",
        "promptTemplate": "Consider this text:\n\n\"{selection}\"\n\nFrom the document context:\n\n{context}\n\nWhat questions does this raise? What would you want to investigate further? What remains unclear or unexplained?",
        "sortOrder": 4
    }
]
```

2. Add file to Xcode project resources

**Files**:
- `Resources/DefaultPrompts.json` (~40 lines)

**Validation**:
- [ ] JSON is valid
- [ ] All four prompts defined
- [ ] Templates include {selection} and {context} placeholders

---

## Subtask T040: Seed Default Prompts on First Launch

**Purpose**: Load default prompts into SwiftData on first app launch.

**Steps**:

1. Create prompt seeding logic:

```swift
// In Features/Provocation/PromptSeeder.swift
import Foundation

struct DefaultPrompt: Codable {
    let name: String
    let promptTemplate: String
    let sortOrder: Int
}

enum PromptSeeder {
    static func loadDefaultPrompts() throws -> [DefaultPrompt] {
        guard let url = Bundle.main.url(forResource: "DefaultPrompts", withExtension: "json") else {
            throw SeederError.fileNotFound
        }
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode([DefaultPrompt].self, from: data)
    }

    enum SeederError: Error {
        case fileNotFound
    }
}
```

2. Add seeding action to ProvocationFeature:

```swift
enum Action {
    // ...
    case seedDefaultPrompts
    case promptsSeeded
    case loadPrompts
    case promptsLoaded([ProvocationPrompt])
}

case .seedDefaultPrompts:
    return .run { send in
        @Dependency(\.promptsClient) var client

        // Check if already seeded
        if await client.hasSeededDefaults() {
            await send(.loadPrompts)
            return
        }

        // Load and save defaults
        do {
            let defaults = try PromptSeeder.loadDefaultPrompts()
            for prompt in defaults {
                let entity = ProvocationPrompt(
                    name: prompt.name,
                    promptTemplate: prompt.promptTemplate,
                    isBuiltIn: true,
                    sortOrder: prompt.sortOrder
                )
                try await client.savePrompt(entity)
            }
            try await client.markSeeded()
            await send(.promptsSeeded)
        } catch {
            // Log error but continue
            print("Failed to seed prompts: \(error)")
        }
    }

case .promptsSeeded:
    return .send(.loadPrompts)

case .loadPrompts:
    return .run { send in
        @Dependency(\.promptsClient) var client
        let prompts = try await client.loadPrompts()
        await send(.promptsLoaded(prompts))
    }

case .promptsLoaded(let prompts):
    state.availablePrompts = prompts
    return .none
```

3. Trigger seeding on app appear:

```swift
// In AppFeature
case .onAppear:
    return .merge(
        .send(.checkAIAvailability),
        .send(.provocation(.seedDefaultPrompts))
    )
```

**Files**:
- `Features/Provocation/PromptSeeder.swift` (~30 lines)
- `Features/Provocation/ProvocationFeature.swift` (add seeding)
- `App/AppFeature.swift` (trigger seeding)

**Validation**:
- [ ] Prompts seed on first launch
- [ ] Second launch skips seeding
- [ ] Prompts available in state after seeding

---

## Subtask T041: Create ProvocationFeature Reducer

**Purpose**: Implement full TCA reducer for AI provocations.

**Steps**:

1. Update `Features/Provocation/ProvocationFeature.swift`:

```swift
import ComposableArchitecture
import Foundation

@Reducer
struct ProvocationFeature {
    @ObservableState
    struct State: Equatable {
        var isAIAvailable: Bool = false
        var availablePrompts: [ProvocationPrompt] = []
        var selectedPromptId: UUID?
        var isGenerating: Bool = false
        var currentResponse: String = ""
        var pendingRequest: ProvocationRequest?
        var error: String?
    }

    struct ProvocationRequest: Equatable {
        let sourceType: Provocation.SourceType
        let sourceText: String
        let context: String
        let documentPath: String
        let noteId: UUID?
    }

    enum Action {
        case seedDefaultPrompts
        case promptsSeeded
        case loadPrompts
        case promptsLoaded([ProvocationPrompt])
        case selectPrompt(UUID)
        case requestProvocation(ProvocationRequest)
        case startGeneration
        case responseChunk(String)
        case generationComplete
        case generationFailed(String)
        case saveProvocation
        case provocationSaved(Provocation)
        case clearResponse
        case dismissError
    }

    @Dependency(\.foundationModelsClient) var ai
    @Dependency(\.promptsClient) var prompts

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .seedDefaultPrompts:
                // Implemented in T040
                return .none

            case .promptsSeeded:
                return .send(.loadPrompts)

            case .loadPrompts:
                return .run { send in
                    let loaded = try await prompts.loadPrompts()
                    await send(.promptsLoaded(loaded))
                }

            case .promptsLoaded(let loaded):
                state.availablePrompts = loaded
                // Select first prompt by default
                if state.selectedPromptId == nil, let first = loaded.first {
                    state.selectedPromptId = first.id
                }
                return .none

            case .selectPrompt(let id):
                state.selectedPromptId = id
                return .none

            case .requestProvocation(let request):
                state.pendingRequest = request
                state.currentResponse = ""
                state.error = nil
                return .none

            case .startGeneration:
                guard let request = state.pendingRequest,
                      let promptId = state.selectedPromptId,
                      let prompt = state.availablePrompts.first(where: { $0.id == promptId }) else {
                    return .none
                }

                state.isGenerating = true

                // Build full prompt
                let fullPrompt = prompt.promptTemplate
                    .replacingOccurrences(of: "{selection}", with: request.sourceText)
                    .replacingOccurrences(of: "{context}", with: request.context)

                return .run { send in
                    do {
                        for try await chunk in try await ai.generate(fullPrompt, request.context) {
                            await send(.responseChunk(chunk))
                        }
                        await send(.generationComplete)
                    } catch {
                        await send(.generationFailed(error.localizedDescription))
                    }
                }

            case .responseChunk(let chunk):
                state.currentResponse += chunk
                return .none

            case .generationComplete:
                state.isGenerating = false
                return .send(.saveProvocation)

            case .generationFailed(let error):
                state.isGenerating = false
                state.error = error
                return .none

            case .saveProvocation:
                guard let request = state.pendingRequest,
                      let promptId = state.selectedPromptId,
                      let prompt = state.availablePrompts.first(where: { $0.id == promptId }) else {
                    return .none
                }

                let provocation = Provocation(
                    documentPath: request.documentPath,
                    sourceType: request.sourceType,
                    sourceText: request.sourceText,
                    promptName: prompt.name,
                    response: state.currentResponse
                )

                return .run { send in
                    // Save to SwiftData
                    // Note: Need PromptsClient.saveProvocation
                    await send(.provocationSaved(provocation))
                }

            case .provocationSaved:
                state.pendingRequest = nil
                return .none

            case .clearResponse:
                state.currentResponse = ""
                state.pendingRequest = nil
                return .none

            case .dismissError:
                state.error = nil
                return .none
            }
        }
    }
}
```

**Files**:
- `Features/Provocation/ProvocationFeature.swift` (~150 lines)

**Validation**:
- [ ] All actions implemented
- [ ] Prompt selection works
- [ ] Generation state tracked correctly
- [ ] Streaming response accumulates

---

## Definition of Done

- [ ] FoundationModelsClient wraps AI framework
- [ ] Availability checking works correctly
- [ ] Prompt persistence operations work
- [ ] Default prompts seed on first launch
- [ ] ProvocationFeature manages full workflow
- [ ] Streaming response handling implemented

## Risks

| Risk | Mitigation |
|------|------------|
| Foundation Models API not finalized | Use conditional compilation, mock for testing |
| Model availability varies by device | Clear user messaging, graceful degradation |

## Reviewer Guidance

1. Test on macOS 15 with Foundation Models
2. Verify prompts persist correctly
3. Test first-launch seeding
4. Check streaming response accumulation
5. Verify unavailable state handling

## Activity Log

- 2026-02-10T18:52:41Z – claude-opus – shell_pid=52236 – lane=doing – Assigned agent via workflow command
- 2026-02-10T19:00:06Z – claude-opus – shell_pid=52236 – lane=for_review – Ready for review: FoundationModelsClient, PromptsClient, PromptSeeder, DefaultPrompts.json, full ProvocationFeature reducer, availability checking in AppFeature. Build verified.
- 2026-02-10T19:01:22Z – github-copilot – shell_pid=54864 – lane=doing – Started review via workflow command
- 2026-02-10T19:04:24Z – github-copilot – shell_pid=54864 – lane=planned – Moved to planned
- 2026-02-10T23:00:49Z – github-copilot – shell_pid=54864 – lane=doing – Automated: start implementation
- 2026-02-10T23:01:54Z – github-copilot – shell_pid=54864 – lane=for_review – Automated: complete implementation
- 2026-02-10T23:26:45Z – GitHub Copilot – shell_pid=71744 – lane=doing – Started review via workflow command
- 2026-02-10T23:30:06Z – GitHub Copilot – shell_pid=71744 – lane=planned – Moved to planned
- 2026-02-10T23:30:54Z – claude-opus – shell_pid=77100 – lane=doing – Started implementation via workflow command
- 2026-02-10T23:36:30Z – claude-opus – shell_pid=77100 – lane=for_review – Fixed review feedback: (1) Added ProvocationPromptItem and ProvocationItem value types for TCA state (follows NoteItem pattern from WP05), (2) Real FoundationModels integration with #if canImport, SystemLanguageModel, LanguageModelSession, @available(macOS 26.0) guard. Build succeeds.
- 2026-02-10T23:38:00Z – GitHub Copilot – shell_pid=81359 – lane=doing – Started review via workflow command
