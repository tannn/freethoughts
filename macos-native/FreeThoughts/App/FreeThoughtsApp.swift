import SwiftUI
import SwiftData
import ComposableArchitecture

@main
struct FreeThoughtsApp: App {
    let modelContainer: ModelContainer
    let store: StoreOf<AppFeature>

    init() {
        do {
            self.modelContainer = try DataContainer.create()
        } catch {
            fatalError("Failed to initialize SwiftData: \(error)")
        }

        self.store = Store(initialState: AppFeature.State()) {
            AppFeature()
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView(store: store)
        }
        .modelContainer(modelContainer)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Open...") {
                    store.send(.openFilePicker)
                }
                .keyboardShortcut("o", modifiers: .command)
            }
        }
    }
}
