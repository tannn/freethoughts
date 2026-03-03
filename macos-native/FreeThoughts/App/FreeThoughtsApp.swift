import SwiftUI
import ComposableArchitecture

/// Focused-value key that exposes the root `AppFeature` store to SwiftUI menu commands.
/// Commands cannot be scoped to a specific window, so the focused value lets menu items
/// reach the store of whichever window is currently key.
struct AppStoreFocusedValueKey: FocusedValueKey {
    typealias Value = StoreOf<AppFeature>
}

extension FocusedValues {
    /// The root `AppFeature` store of the currently focused window.
    var appStore: StoreOf<AppFeature>? {
        get { self[AppStoreFocusedValueKey.self] }
        set { self[AppStoreFocusedValueKey.self] = newValue }
    }
}

/// App entry point. Declares the main `WindowGroup` scene and registers menu-bar commands
/// for opening files (⌘O) and toggling the notes sidebar (⌘⇧N).
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
