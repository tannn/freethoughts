import SwiftUI
import AppKit

/// A SwiftUI `ViewModifier` that intercepts a specific key-down event (identified by raw
/// `keyCode` and optional modifier flags) using an `NSEvent` local monitor. The `action`
/// closure returns `true` if the event was handled — causing it to be consumed — or `false`
/// to let it propagate normally.
struct KeyPressModifier: ViewModifier {
    /// The hardware key code to intercept (e.g. `31` for "O").
    let keyCode: UInt16
    /// The modifier flags that must be held for the press to match (e.g. `.command`).
    let modifiers: NSEvent.ModifierFlags
    /// Called when the matching key combination is pressed. Return `true` to consume the event.
    let action: () -> Bool

    func body(content: Content) -> some View {
        content.background(KeyPressMonitor(keyCode: keyCode, modifiers: modifiers, action: action))
    }
}

private struct KeyPressMonitor: NSViewRepresentable {
    let keyCode: UInt16
    let modifiers: NSEvent.ModifierFlags
    let action: () -> Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(keyCode: keyCode, modifiers: modifiers, action: action)
    }

    func makeNSView(context: Context) -> NSView {
        context.coordinator.startMonitoring()
        return NSView()
    }

    func updateNSView(_ nsView: NSView, context: Context) {}

    final class Coordinator {
        private let keyCode: UInt16
        private let modifiers: NSEvent.ModifierFlags
        private let action: () -> Bool
        private var monitor: Any?

        init(keyCode: UInt16, modifiers: NSEvent.ModifierFlags, action: @escaping () -> Bool) {
            self.keyCode = keyCode
            self.modifiers = modifiers
            self.action = action
        }

        func startMonitoring() {
            guard monitor == nil else { return }
            monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
                guard let self else { return event }
                let eventModifiers = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
                if event.keyCode == self.keyCode, eventModifiers == self.modifiers {
                    let handled = self.action()
                    return handled ? nil : event
                }
                return event
            }
        }

        deinit {
            if let monitor {
                NSEvent.removeMonitor(monitor)
            }
        }
    }
}

extension View {
    /// Attaches a raw key-press handler to a view.
    ///
    /// - Parameters:
    ///   - keyCode: The hardware key code to listen for.
    ///   - modifiers: Required modifier flags (defaults to none).
    ///   - action: Called on a matching key-down event. Return `true` to consume it.
    func onKeyPress(keyCode: UInt16, modifiers: NSEvent.ModifierFlags = [], perform action: @escaping () -> Bool) -> some View {
        modifier(KeyPressModifier(keyCode: keyCode, modifiers: modifiers, action: action))
    }
}
