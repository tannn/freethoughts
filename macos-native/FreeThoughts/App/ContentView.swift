import SwiftUI
import ComposableArchitecture

struct ContentView: View {
    @Bindable var store: StoreOf<AppFeature>
    @State private var textSelection: String?
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
            }
            .navigationSplitViewStyle(.balanced)
            .opacity(store.isSidebarCollapsed ? 1 : 1) // keep detail visible
        }
        .frame(minWidth: 800, minHeight: 600)
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
