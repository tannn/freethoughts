import SwiftUI
import ComposableArchitecture

struct ContentView: View {
    @Bindable var store: StoreOf<AppFeature>
    @State private var textSelection: String?
    @State private var isDropTargeted = false

    var body: some View {
        VStack(spacing: 0) {
            NavigationSplitView {
                VStack {
                    HStack {
                        Text("NOTES")
                            .font(.headline)
                            .foregroundStyle(.secondary)
                        Spacer()
                    }
                    .padding()

                    Spacer()

                    Text("No notes yet")
                        .foregroundStyle(.tertiary)

                    Spacer()
                }
                .frame(minWidth: 250, idealWidth: 280, maxWidth: 350)
            } detail: {
                DocumentView(
                    store: store.scope(state: \.document, action: \.document),
                    textSelection: $textSelection
                )
                .frame(minWidth: 500)
            }

            Divider()

            StatusBar(store: store.scope(state: \.document, action: \.document))
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
        .onAppear {
            store.send(.onAppear)
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
}

#Preview {
    ContentView(
        store: Store(initialState: AppFeature.State()) {
            AppFeature()
        }
    )
}
