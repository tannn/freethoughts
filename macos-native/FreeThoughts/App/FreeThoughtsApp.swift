import SwiftUI
import ComposableArchitecture

struct AppStoreFocusedValueKey: FocusedValueKey {
    typealias Value = StoreOf<AppFeature>
}

extension FocusedValues {
    var appStore: StoreOf<AppFeature>? {
        get { self[AppStoreFocusedValueKey.self] }
        set { self[AppStoreFocusedValueKey.self] = newValue }
    }
}

@main
struct FreeThoughtsApp: App {
    @FocusedValue(\.appStore) var focusedStore

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("Open...") {
                    focusedStore?.send(.openFilePicker)
                }
                .keyboardShortcut("o", modifiers: .command)
                .disabled(focusedStore == nil)
            }
            CommandGroup(after: .sidebar) {
                Button("Toggle Notes Sidebar") {
                    focusedStore?.send(.toggleSidebar)
                }
                .keyboardShortcut("n", modifiers: [.command, .shift])
                .disabled(focusedStore == nil)
            }
        }
    }
}
