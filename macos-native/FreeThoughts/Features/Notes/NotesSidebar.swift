import SwiftUI
import ComposableArchitecture

struct NotesSidebar: View {
    @Bindable var store: StoreOf<NotesFeature>
    let provocationStore: StoreOf<ProvocationFeature>
    let isGenerating: Bool
    let generatingNoteId: UUID?
    let currentResponse: String
    let selectedPromptName: String
    let isAIAvailable: Bool
    let aiAvailabilityChecked: Bool
    let hasSelectableText: Bool
    let onNoteProvocation: (UUID, UUID) -> Void
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

                if store.isSelectingForDeletion {
                    // Select mode controls
                    Button {
                        store.send(.requestDeleteSelected)
                    } label: {
                        Label("Delete Selected", systemImage: "trash")
                            .labelStyle(.iconOnly)
                    }
                    .disabled(store.selectedNoteIds.isEmpty)
                    .foregroundStyle(.red)

                    let filteredIds = Set(filteredNotes.map(\.id))
                    let allSelected = !filteredIds.isEmpty
                        && filteredIds.allSatisfy { store.selectedNoteIds.contains($0) }
                    Button {
                        store.send(.selectAll)
                    } label: {
                        Label(
                            allSelected ? "Deselect All" : "Select All",
                            systemImage: allSelected ? "checkmark.circle.fill" : "checkmark.circle"
                        )
                        .labelStyle(.iconOnly)
                    }
                    .foregroundStyle(allSelected ? Color.accentColor : .secondary)
                    .disabled(filteredIds.isEmpty)

                    Button {
                        store.send(.exitSelectMode)
                    } label: {
                        Label("Cancel", systemImage: "xmark.circle")
                            .labelStyle(.iconOnly)
                    }
                    .foregroundStyle(.secondary)
                } else {
                    // Normal mode controls
                    Button {
                        store.send(.toggleSearchBar)
                    } label: {
                        Label("Search", systemImage: "magnifyingglass")
                            .labelStyle(.iconOnly)
                    }
                    .foregroundStyle(store.isSearchBarVisible ? Color.accentColor : .secondary)

                    let allCollapsed = store.notes.allSatisfy { store.collapsedNoteIds.contains($0.id) }
                    Button {
                        store.send(allCollapsed ? .expandAll : .collapseAll)
                    } label: {
                        Label(
                            allCollapsed ? "Expand All" : "Collapse All",
                            systemImage: allCollapsed ? "chevron.down.2" : "chevron.up.2"
                        )
                        .labelStyle(.iconOnly)
                    }
                    .foregroundStyle(.secondary)
                    .disabled(store.notes.isEmpty)

                    Button {
                        store.send(.enterSelectMode)
                    } label: {
                        Label("Select", systemImage: "circle.dotted")
                            .labelStyle(.iconOnly)
                    }
                    .foregroundStyle(.secondary)
                    .disabled(store.notes.isEmpty)
                }
            }
            .padding()

            Divider()

            // Search bar
            if store.isSearchBarVisible {
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.tertiary)
                        .font(.caption)
                    TextField("Search notes…", text: Binding(
                        get: { store.searchQuery },
                        set: { store.send(.updateSearchQuery($0)) }
                    ))
                    .textFieldStyle(.plain)
                    .font(.callout)

                    if !store.searchQuery.isEmpty {
                        Button {
                            store.send(.updateSearchQuery(""))
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.tertiary)
                                .font(.caption)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(.quaternary.opacity(0.5))

                Divider()
            }

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
                let notes = filteredNotes
                if notes.isEmpty && !store.searchQuery.isEmpty {
                    noSearchResults
                } else {
                    ScrollView {
                        LazyVStack(spacing: 12) {
                            ForEach(notes, id: \.id) { note in
                                NoteCard(
                                    note: note,
                                    isEditing: store.editingNoteId == note.id,
                                    isCollapsed: store.collapsedNoteIds.contains(note.id),
                                    isSelected: store.selectedNoteIds.contains(note.id),
                                    onToggleSelection: store.isSelectingForDeletion
                                        ? { store.send(.toggleNoteSelection(note.id)) }
                                        : nil,
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
                                    onCancelGeneration: onCancelGeneration,
                                    onToggleCollapse: {
                                        store.send(.toggleCollapseNote(note.id))
                                    }
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
        }
        .frame(minWidth: 250, idealWidth: 280, maxWidth: 350)
        // Delete all confirmation
        .confirmationDialog(
            "Delete All Notes",
            isPresented: Binding(
                get: { store.confirmingDeleteAll },
                set: { if !$0 { store.send(.cancelDeleteAll) } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete All", role: .destructive) {
                store.send(.confirmDeleteAll)
            }
        } message: {
            Text("This will delete all \(store.notes.count) notes. This action cannot be undone.")
        }
        // Delete selected confirmation
        .confirmationDialog(
            "Delete Selected Notes",
            isPresented: Binding(
                get: { store.confirmingDeleteSelected },
                set: { if !$0 { store.send(.cancelDeleteSelected) } }
            ),
            titleVisibility: .visible
        ) {
            let selectedCount = store.selectedNoteIds
                .intersection(Set(store.notes.map(\.id)))
                .count
            Button("Delete \(selectedCount) Notes", role: .destructive) {
                store.send(.confirmDeleteSelected)
            }
        } message: {
            Text("This action cannot be undone.")
        }
    }

    private var filteredNotes: [NoteItem] {
        let query = store.searchQuery.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return store.notes }
        return store.notes.filter { note in
            if note.id == store.editingNoteId { return true }
            let q = query.lowercased()
            return note.selectedText.lowercased().contains(q)
                || note.content.lowercased().contains(q)
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

    private var noSearchResults: some View {
        VStack(spacing: 12) {
            Spacer()

            Image(systemName: "magnifyingglass")
                .font(.system(size: 32))
                .foregroundStyle(.quaternary)

            Text("No results")
                .foregroundStyle(.tertiary)

            Text("No notes match \"\(store.searchQuery)\"")
                .font(.caption)
                .foregroundStyle(.quaternary)
                .multilineTextAlignment(.center)

            Spacer()
        }
        .padding()
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
