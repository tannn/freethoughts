import SwiftUI
import AppKit

struct KeyPressModifier: ViewModifier {
    let keyCode: UInt16
    let modifiers: NSEvent.ModifierFlags
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
    func onKeyPress(keyCode: UInt16, modifiers: NSEvent.ModifierFlags = [], perform action: @escaping () -> Bool) -> some View {
        modifier(KeyPressModifier(keyCode: keyCode, modifiers: modifiers, action: action))
    }
}
