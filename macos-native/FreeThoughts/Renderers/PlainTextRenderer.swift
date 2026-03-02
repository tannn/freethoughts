import SwiftUI

/// Renders a plain-text string using a monospaced system font with selectable text.
/// Delegates rendering and selection tracking to `SelectableTextView`.
struct PlainTextRenderer: View {
    /// The raw text content to display.
    let content: String
    @Binding var selection: String?
    @Binding var selectionRange: NSRange?
    @Binding var selectionRect: CGRect?
    /// When non-`nil`, the view scrolls to and highlights this character range.
    var scrollToRange: NSRange?

    var body: some View {
        SelectableTextView(
            attributedString: NSAttributedString(
                string: content,
                attributes: [
                    .font: NSFont.monospacedSystemFont(ofSize: NSFont.systemFontSize, weight: .regular),
                    .foregroundColor: NSColor.textColor,
                    .paragraphStyle: {
                        let style = NSMutableParagraphStyle()
                        style.lineSpacing = 4
                        return style
                    }()
                ]
            ),
            selection: $selection,
            selectionRange: $selectionRange,
            selectionRect: $selectionRect,
            scrollToRange: scrollToRange
        )
    }
}

#Preview {
    PlainTextRenderer(
        content: """
        This is plain text content.

        It should render with monospaced font
        and proper line spacing.

        Lorem ipsum dolor sit amet, consectetur adipiscing elit.
        """,
        selection: .constant(nil),
        selectionRange: .constant(nil),
        selectionRect: .constant(nil)
    )
}
