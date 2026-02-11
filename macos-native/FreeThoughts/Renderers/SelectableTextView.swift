import SwiftUI
import AppKit

struct SelectableTextView: NSViewRepresentable {
    let attributedString: NSAttributedString
    @Binding var selection: String?
    @Binding var selectionRange: NSRange?
    @Binding var selectionRect: CGRect?
    var scrollToRange: NSRange?

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSTextView.scrollableTextView()
        guard let textView = scrollView.documentView as? NSTextView else {
            return scrollView
        }

        textView.isEditable = false
        textView.isSelectable = true
        textView.isRichText = true
        textView.drawsBackground = true
        textView.backgroundColor = .textBackgroundColor
        textView.textContainerInset = NSSize(width: 16, height: 16)
        textView.delegate = context.coordinator

        textView.textStorage?.setAttributedString(attributedString)

        return scrollView
    }

    func updateNSView(_ scrollView: NSScrollView, context: Context) {
        guard let textView = scrollView.documentView as? NSTextView else { return }

        if textView.textStorage?.string != attributedString.string {
            textView.textStorage?.setAttributedString(attributedString)
        }

        // Handle scroll-to-range for note navigation
        if let range = scrollToRange,
           range != context.coordinator.lastScrolledRange,
           let textStorage = textView.textStorage,
           range.location + range.length <= textStorage.length {
            context.coordinator.lastScrolledRange = range

            withAnimation(.easeInOut(duration: 0.3)) {
                textView.scrollRangeToVisible(range)
            }

            let highlightColor = NSColor.controlAccentColor.withAlphaComponent(0.3)
            textStorage.addAttribute(.backgroundColor, value: highlightColor, range: range)
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                guard let storage = textView.textStorage,
                      range.location + range.length <= storage.length else { return }
                storage.removeAttribute(.backgroundColor, range: range)
            }
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, NSTextViewDelegate {
        var parent: SelectableTextView
        var lastScrolledRange: NSRange?

        init(_ parent: SelectableTextView) {
            self.parent = parent
        }

        func textViewDidChangeSelection(_ notification: Notification) {
            guard let textView = notification.object as? NSTextView else { return }

            // Dismiss popover on right-click; don't show popover for right-click word selection
            if let event = NSApp.currentEvent,
               event.type == .rightMouseDown || event.type == .rightMouseUp {
                parent.selection = nil
                parent.selectionRange = nil
                parent.selectionRect = nil
                return
            }

            let selectedRange = textView.selectedRange()
            if selectedRange.length > 0,
               let text = textView.textStorage?.attributedSubstring(from: selectedRange).string,
               !text.isEmpty {
                parent.selection = text
                parent.selectionRange = selectedRange

                if let layoutManager = textView.layoutManager,
                   let textContainer = textView.textContainer {
                    let glyphRange = layoutManager.glyphRange(forCharacterRange: selectedRange, actualCharacterRange: nil)
                    // Get the bounding rect in text container coordinates
                    let containerRect = layoutManager.boundingRect(forGlyphRange: glyphRange, in: textContainer)

                    // Convert to text view coordinates (accounting for text container insets)
                    let textViewRect = CGRect(
                        x: containerRect.origin.x + textView.textContainerInset.width,
                        y: containerRect.origin.y + textView.textContainerInset.height,
                        width: containerRect.width,
                        height: containerRect.height
                    )

                    // Store in text view's coordinate space
                    // We'll convert to SwiftUI coordinates in DocumentView using the view itself
                    parent.selectionRect = textViewRect
                }
            } else {
                parent.selection = nil
                parent.selectionRange = nil
                parent.selectionRect = nil
            }
        }
    }
}
