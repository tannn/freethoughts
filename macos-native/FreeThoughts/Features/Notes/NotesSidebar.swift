import SwiftUI
import ComposableArchitecture

/// Sidebar view that lists all notes for the currently open document. Wraps each note in a
/// `NoteCard` and handles inline editing, swipe-to-delete, and the delete-confirmation dialog.
struct NotesSidebar: View {
    /// The notes feature store, providing the list and editing state.
    @Bindable var store: StoreOf<NotesFeature>
    /// Read-only view into the provocation store for the available prompt list.
    let provocationStore: StoreOf<ProvocationFeature>
    /// Whether an AI generation is currently streaming.
    let isGenerating: Bool
    /// The ID of the note for which generation is in progress, or `nil`.
    let generatingNoteId: UUID?
    /// The current partial AI response text being streamed.
    let currentResponse: String
    /// Display name of the prompt style currently generating.
    let selectedPromptName: String
    /// Whether Apple Foundation Models is available for AI actions.
    let isAIAvailable: Bool
    /// `true` once the AI availability check has completed.
    let aiAvailabilityChecked: Bool
    /// `false` when the document has no extractable text (scanned PDF).
    let hasSelectableText: Bool
    /// Called when the user requests AI provocation for a note, passing note ID and prompt ID.
    let onNoteProvocation: (UUID, UUID) -> Void
    /// Called when the user cancels an in-progress AI generation.
    let onCancelGeneration: () -> Void

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

            }
            .padding()

            Divider()

            if !isAIAvailable && aiAvailabilityChecked {
                AIUnavailableView()
                    .padding(.horizontal)
                    .padding(.top, 12)
            }

            if !hasSelectableText {
                noTextWarning
                    .padding(.horizontal)
                    .padding(.top, 12)
            }
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
                                availablePrompts: provocationStore.availablePrompts,
                                isGenerating: isGenerating && generatingNoteId == note.id,
                                currentResponse: currentResponse,
                                selectedPromptName: selectedPromptName,
                                isAIAvailable: isAIAvailable,
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
                                onSelectPrompt: { promptId in
                                    onNoteProvocation(note.id, promptId)
                                },
                                onCancelGeneration: onCancelGeneration
                            )
                            .transition(.opacity.combined(with: .move(edge: .trailing)))
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
                    .animation(.easeOut(duration: 0.15), value: store.notes.count)
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

    private var noTextWarning: some View {
        VStack(spacing: 8) {
            Image(systemName: "info.circle")
                .font(.title2)
                .foregroundStyle(.orange)

            Text("No selectable text detected")
                .font(.headline)

            Text("This document appears to be a scanned image. Notes cannot be anchored to text.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))
    }
}
