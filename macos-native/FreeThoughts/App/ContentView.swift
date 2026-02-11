import SwiftUI
import ComposableArchitecture

struct ContentView: View {
    @Bindable var store: StoreOf<AppFeature>
    @State private var textSelection: String?
    @State private var isDropTargeted = false
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    var body: some View {
        HStack(spacing: 0) {
            if store.isSidebarCollapsed {
                collapsedIndicator
            }

            NavigationSplitView(columnVisibility: $columnVisibility) {
                NotesSidebar(
                    store: store.scope(state: \.notes, action: \.notes),
                    onToggleCollapse: {
                        store.send(.toggleSidebar)
                    }
                )
            } detail: {
                DocumentView(
                    store: store.scope(state: \.document, action: \.document),
                    textSelection: $textSelection
                )
                .frame(minWidth: 500)
                .overlay {
                    if store.notes.editingNoteId != nil {
                        Color.clear
                            .contentShape(Rectangle())
                            .onTapGesture {
                                if let editingId = store.notes.editingNoteId {
                                    store.send(.notes(.updateNoteText(editingId, store.notes.editingDraftText)))
                                    store.send(.notes(.stopEditing))
                                }
                            }
                    }
                }
            }
            .navigationSplitViewStyle(.balanced)
            .opacity(store.isSidebarCollapsed ? 1 : 1)
        }
        .frame(minWidth: 800, minHeight: 600)
        .onDrop(of: [.fileURL], isTargeted: $isDropTargeted) { providers in
            handleDrop(providers)
        }
        .overlay {
            if isDropTargeted {
                dropOverlay
            }
        }
        .onChange(of: store.isSidebarCollapsed) { _, collapsed in
            columnVisibility = collapsed ? .detailOnly : .all
        }
        .onAppear {
            store.send(.onAppear)
        }
        .sheet(isPresented: Binding(
            get: { store.notes.isCreatingNote },
            set: { if !$0 { store.send(.notes(.cancelNoteCreation)) } }
        )) {
            NoteCreationSheet(
                store: store.scope(state: \.notes, action: \.notes)
            )
        }
    }

    private func handleDrop(_ providers: [NSItemProvider]) -> Bool {
        guard let provider = providers.first else { return false }

        _ = provider.loadObject(ofClass: URL.self) { url, error in
            guard let url = url, error == nil else { return }
            if Document.DocumentType.from(url: url) != nil {
                DispatchQueue.main.async {
                    store.send(.fileSelected(url))
                }
            }
        }
        return true
    }

    private var dropOverlay: some View {
        ZStack {
            Color.accentColor.opacity(0.1)
            VStack {
                Image(systemName: "arrow.down.doc")
                    .font(.system(size: 48))
                Text("Drop to Open")
                    .font(.title2)
            }
            .foregroundStyle(.tint)
        }
        .ignoresSafeArea()
    }

    private var collapsedIndicator: some View {
        VStack {
            Button {
                store.send(.toggleSidebar)
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: "chevron.right")
                    Text("\(store.notes.notes.count)")
                        .font(.caption)
                }
                .padding(.vertical, 8)
                .padding(.horizontal, 4)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            Spacer()
        }
        .frame(width: 30)
        .background(.bar)
    }
}

#Preview {
    ContentView(
        store: Store(initialState: AppFeature.State()) {
            AppFeature()
        }
    )
}
