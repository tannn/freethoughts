import SwiftUI
import ComposableArchitecture

struct NotesSidebar: View {
    @Bindable var store: StoreOf<NotesFeature>
    var onToggleCollapse: (() -> Void)?

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("NOTES")
                    .font(.headline)
                    .foregroundStyle(.secondary)

                Spacer()

                Text("\(store.notes.count)")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(.quaternary, in: Capsule())

                if let onToggleCollapse {
                    Button(action: onToggleCollapse) {
                        Image(systemName: "sidebar.left")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                }
            }
            .padding()

            Divider()

            // Notes list
            if store.notes.isEmpty {
                emptyState
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(store.notes, id: \.id) { note in
                            NoteCard(
                                note: note,
                                isEditing: store.editingNoteId == note.id,
                                draftText: Binding(
                                    get: { store.editingDraftText },
                                    set: { store.send(.updateDraftText($0)) }
                                ),
                                onTap: {
                                    store.send(.navigateToNote(note.id))
                                },
                                onEdit: {
                                    store.send(.startEditing(note.id))
                                },
                                onSave: { text in
                                    store.send(.updateNoteText(note.id, text))
                                    store.send(.stopEditing)
                                },
                                onCancel: {
                                    store.send(.stopEditing)
                                },
                                onDelete: {
                                    store.send(.requestDeleteNote(note.id))
                                },
                                onProvocation: {
                                    // Handled in WP08
                                }
                            )
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    store.send(.requestDeleteNote(note.id))
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }
                    }
                    .padding()
                }
                .onTapGesture {
                    if let editingId = store.editingNoteId {
                        store.send(.updateNoteText(editingId, store.editingDraftText))
                        store.send(.stopEditing)
                    }
                }
            }
        }
        .frame(minWidth: 250, idealWidth: 280, maxWidth: 350)
        .confirmationDialog(
            "Delete Note",
            isPresented: Binding(
                get: { store.confirmingDeleteNoteId != nil },
                set: { if !$0 { store.send(.cancelDeleteNote) } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                store.send(.confirmDeleteNote)
            }
        } message: {
            Text("This action cannot be undone.")
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Spacer()

            Image(systemName: "note.text")
                .font(.system(size: 32))
                .foregroundStyle(.quaternary)

            Text("No notes yet")
                .foregroundStyle(.tertiary)

            Text("Select text to create a note")
                .font(.caption)
                .foregroundStyle(.quaternary)

            Spacer()
        }
    }
}
