# Data Model: FreeThoughts - Local AI Document Reader

**Date**: 2026-02-09
**Storage**: SwiftData (local, on-device)

## Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐
│    Document     │       │ ProvocationPrompt│
│   (transient)   │       │   (persisted)   │
└────────┬────────┘       └────────┬────────┘
         │                         │
         │ 1                       │ 1
         │                         │
         ▼ *                       ▼ *
┌─────────────────┐       ┌─────────────────┐
│      Note       │◄──────│   Provocation   │
│   (persisted)   │ 1   * │   (persisted)   │
└─────────────────┘       └─────────────────┘
```

## Entities

### Document (Transient - Not Persisted)

Represents an open document in the app. Not stored in SwiftData since documents live on the filesystem.

```swift
struct Document: Identifiable, Equatable {
    let id: UUID
    let url: URL
    let type: DocumentType
    let content: DocumentContent

    enum DocumentType: String, Codable {
        case pdf
        case markdown
        case plainText
    }

    enum DocumentContent: Equatable {
        case pdf(PDFDocument)
        case text(String)
    }
}
```

**Fields**:
| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Unique identifier for session |
| url | URL | File path on disk |
| type | DocumentType | PDF, markdown, or plain text |
| content | DocumentContent | Loaded content (PDF or text) |

---

### Note (Persisted)

User-created annotation anchored to a text selection within a document.

```swift
@Model
final class Note {
    @Attribute(.unique) var id: UUID
    var documentPath: String  // Canonical path to document
    var anchorStart: Int      // Character offset start
    var anchorEnd: Int        // Character offset end
    var anchorPage: Int?      // Page number (PDF only)
    var selectedText: String  // The text that was selected
    var content: String       // User's note content
    var createdAt: Date
    var updatedAt: Date

    @Relationship(deleteRule: .cascade, inverse: \Provocation.note)
    var provocations: [Provocation] = []
}
```

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Unique identifier |
| documentPath | String | Yes | Canonical file path (for querying) |
| anchorStart | Int | Yes | Start character offset in document |
| anchorEnd | Int | Yes | End character offset in document |
| anchorPage | Int? | No | Page number (PDF only, nil for text) |
| selectedText | String | Yes | Original selected text |
| content | String | Yes | User's note content |
| createdAt | Date | Yes | Creation timestamp |
| updatedAt | Date | Yes | Last modification timestamp |
| provocations | [Provocation] | No | AI provocations on this note |

**Indexes**:
- `documentPath` - For querying notes by document
- `anchorStart` - For ordering notes by position

**Validation**:
- `anchorEnd >= anchorStart`
- `content` may be empty (user can create placeholder notes)
- `selectedText` must not be empty

---

### Provocation (Persisted)

AI-generated response to selected text or a note.

```swift
@Model
final class Provocation {
    @Attribute(.unique) var id: UUID
    var documentPath: String      // Document context
    var sourceType: SourceType    // What triggered this
    var sourceText: String        // Text that was analyzed
    var promptName: String        // Which prompt was used
    var response: String          // AI response content
    var createdAt: Date

    var note: Note?               // Associated note (if any)

    enum SourceType: String, Codable {
        case textSelection  // From selected text
        case note           // From a user note
    }
}
```

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Unique identifier |
| documentPath | String | Yes | Document context path |
| sourceType | SourceType | Yes | Selection or note |
| sourceText | String | Yes | Input text analyzed |
| promptName | String | Yes | Prompt template used |
| response | String | Yes | AI-generated response |
| createdAt | Date | Yes | Generation timestamp |
| note | Note? | No | Parent note (if source is note) |

---

### ProvocationPrompt (Persisted)

Pre-configured prompt template for AI provocations.

```swift
@Model
final class ProvocationPrompt {
    @Attribute(.unique) var id: UUID
    var name: String              // Display name
    var promptTemplate: String    // Template with {context} placeholder
    var isBuiltIn: Bool          // System-provided vs user-created
    var sortOrder: Int           // Display order
    var createdAt: Date
}
```

**Fields**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | UUID | Yes | Unique identifier |
| name | String | Yes | Human-readable name |
| promptTemplate | String | Yes | Template text with `{context}` and `{selection}` placeholders |
| isBuiltIn | Bool | Yes | true for default prompts |
| sortOrder | Int | Yes | Display ordering |
| createdAt | Date | Yes | Creation timestamp |

**Default Prompts**:
```json
[
  {
    "name": "Challenge",
    "promptTemplate": "Consider this text: {selection}\n\nContext: {context}\n\nChallenge the main assumptions or claims. What might be wrong or incomplete?",
    "isBuiltIn": true,
    "sortOrder": 1
  },
  {
    "name": "Expand",
    "promptTemplate": "Consider this text: {selection}\n\nContext: {context}\n\nWhat are the broader implications? What connections or extensions come to mind?",
    "isBuiltIn": true,
    "sortOrder": 2
  },
  {
    "name": "Simplify",
    "promptTemplate": "Consider this text: {selection}\n\nContext: {context}\n\nExplain this in simpler terms. What's the core idea?",
    "isBuiltIn": true,
    "sortOrder": 3
  },
  {
    "name": "Question",
    "promptTemplate": "Consider this text: {selection}\n\nContext: {context}\n\nWhat questions does this raise? What would you want to investigate further?",
    "isBuiltIn": true,
    "sortOrder": 4
  }
]
```

## Queries

### Notes for Current Document

```swift
@Query(filter: #Predicate<Note> { note in
    note.documentPath == currentDocumentPath
}, sort: \.anchorStart)
var notes: [Note]
```

### Provocations for Note

```swift
@Query(filter: #Predicate<Provocation> { provocation in
    provocation.note?.id == noteId
}, sort: \.createdAt)
var provocations: [Provocation]
```

### All Prompts (Ordered)

```swift
@Query(sort: \.sortOrder)
var prompts: [ProvocationPrompt]
```

## Migration Strategy

**Version 1** (Initial):
- Simple schema as documented
- No migrations needed

**Future Considerations**:
- Add `documentHash` field for detecting moved/renamed files
- Add `tags` relationship for note organization (stretch goal)
- Add `syncStatus` for CloudKit sync (stretch goal)
