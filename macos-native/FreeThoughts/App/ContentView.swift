import SwiftUI
import ComposableArchitecture

struct ContentView: View {
    @Bindable var store: StoreOf<AppFeature>

    var body: some View {
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
            Text("Open a document to begin")
                .foregroundStyle(.secondary)
                .frame(minWidth: 500)
        }
        .frame(minWidth: 800, minHeight: 600)
        .onAppear {
            store.send(.onAppear)
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
