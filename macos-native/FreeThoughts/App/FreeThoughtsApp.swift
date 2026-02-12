import SwiftUI
import ComposableArchitecture

@main
struct FreeThoughtsApp: App {
    let store: StoreOf<AppFeature>

    init() {
        self.store = Store(initialState: AppFeature.State()) {
            AppFeature()
        }
    }

    var body: some Scene {
        WindowGroup {
            ContentView(store: store)
        }
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Open...") {
                    store.send(.openFilePicker)
                }
                .keyboardShortcut("o", modifiers: .command)

                Divider()

                Button("Close Tab") {
                    store.send(.closeCurrentTab)
                }
                .keyboardShortcut("w", modifiers: .command)
                .disabled(store.selectedTabID == nil)
            }
            CommandGroup(after: .sidebar) {
                Button("Toggle Notes Sidebar") {
                    store.send(.toggleSidebar)
                }
                .keyboardShortcut("n", modifiers: [.command, .shift])
            }
        }
    }
}
