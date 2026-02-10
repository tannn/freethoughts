import ComposableArchitecture
import SwiftData
import Foundation

@DependencyClient
struct NotesClient {
    var loadNotes: @Sendable (_ documentPath: String) async throws -> [Note]
    var saveNote: @Sendable (_ note: Note) async throws -> Note
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
                let descriptor = FetchDescriptor(predicate: predicate, sortBy: [SortDescriptor(\.anchorStart)])
                return try context.fetch(descriptor)
            },
            saveNote: { note in
                let context = ModelContext(container)
                context.insert(note)
                try context.save()
                return note
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
        deleteNote: { _ in }
    )
}

extension DependencyValues {
    var notesClient: NotesClient {
        get { self[NotesClient.self] }
        set { self[NotesClient.self] = newValue }
    }
}
