import ComposableArchitecture
import SwiftData
import Foundation

/// TCA dependency client that bridges the Notes domain to the SwiftData persistence layer.
/// Each method creates its own `ModelContext` to satisfy Swift Concurrency's `Sendable` rules.
@DependencyClient
struct NotesClient {
    /// Loads all notes anchored to the given document path, sorted by `anchorStart`.
    var loadNotes: @Sendable (_ documentPath: String) async throws -> [NoteItem]
    /// Persists a new `NoteItem` and returns the saved copy.
    var saveNote: @Sendable (_ note: NoteItem) async throws -> NoteItem
    /// Updates the body content of an existing note by its ID.
    var updateNote: @Sendable (_ id: UUID, _ content: String) async throws -> Void
    /// Permanently deletes a note by its ID.
    var deleteNote: @Sendable (_ id: UUID) async throws -> Void
}

extension NotesClient: DependencyKey {
    static let liveValue: NotesClient = {
        @Dependency(\.modelContainer) var container

        return NotesClient(
            loadNotes: { documentPath in
                let context = ModelContext(container)
                let predicate = #Predicate<Note> { note in
                    note.documentPath == documentPath
                }
                let descriptor = FetchDescriptor(predicate: predicate, sortBy: [
                    SortDescriptor(\.anchorStart)
                ])
                return try context.fetch(descriptor).map { NoteItem(from: $0) }
            },
            saveNote: { noteItem in
                let context = ModelContext(container)
                let note = Note(
                    id: noteItem.id,
                    documentPath: noteItem.documentPath,
                    anchorStart: noteItem.anchorStart,
                    anchorEnd: noteItem.anchorEnd,
                    anchorPage: noteItem.anchorPage,
                    selectedText: noteItem.selectedText,
                    content: noteItem.content,
                    createdAt: noteItem.createdAt,
                    updatedAt: noteItem.updatedAt
                )
                context.insert(note)
                try context.save()
                return noteItem
            },
            updateNote: { id, content in
                let context = ModelContext(container)
                let predicate = #Predicate<Note> { note in
                    note.id == id
                }
                let descriptor = FetchDescriptor(predicate: predicate)
                if let note = try context.fetch(descriptor).first {
                    note.content = content
                    note.updatedAt = Date()
                    try context.save()
                }
            },
            deleteNote: { id in
                let context = ModelContext(container)
                let predicate = #Predicate<Note> { note in
                    note.id == id
                }
                let descriptor = FetchDescriptor(predicate: predicate)
                if let note = try context.fetch(descriptor).first {
                    context.delete(note)
                    try context.save()
                }
            }
        )
    }()

    static let testValue = NotesClient(
        loadNotes: { _ in [] },
        saveNote: { $0 },
        updateNote: { _, _ in },
        deleteNote: { _ in }
    )
}

extension DependencyValues {
    var notesClient: NotesClient {
        get { self[NotesClient.self] }
        set { self[NotesClient.self] = newValue }
    }
}
