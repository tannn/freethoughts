import SwiftUI
import ComposableArchitecture

struct ContentView: View {
    @Bindable var store: StoreOf<AppFeature>
    @State private var textSelection: String?

    var body: some View {
        NavigationSplitView {
            NotesSidebar(
                store: store.scope(state: \.notes, action: \.notes)
            )
        } detail: {
            DocumentView(
                store: store.scope(state: \.document, action: \.document),
                textSelection: $textSelection
            )
            .frame(minWidth: 500)
        }
        .frame(minWidth: 800, minHeight: 600)
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
}

#Preview {
    ContentView(
        store: Store(initialState: AppFeature.State()) {
            AppFeature()
        }
    )
}
