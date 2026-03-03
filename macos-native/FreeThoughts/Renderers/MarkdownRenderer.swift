import SwiftUI

/// Renders a Markdown string as a selectable attributed text view.
///
/// Parses the Markdown synchronously in `init` using `AttributedString` with
/// `.full` syntax interpretation, then delegates rendering and selection tracking
/// to `SelectableTextView`.
struct MarkdownRenderer: View {
    /// The raw Markdown content string to display.
    let content: String
    @Binding var selection: String?
    @Binding var selectionRange: NSRange?
    @Binding var selectionRect: CGRect?
    /// When non-`nil`, the view scrolls to and highlights this character range.
    var scrollToRange: NSRange?

    @State private var attributedContent: NSAttributedString?

    var body: some View {
        if let attributed = attributedContent {
            SelectableTextView(
                attributedString: attributed,
                selection: $selection,
                selectionRange: $selectionRange,
                selectionRect: $selectionRect,
                scrollToRange: scrollToRange
            )
        } else {
            ProgressView()
                .padding()
        }
    }

    init(content: String, selection: Binding<String?>, selectionRange: Binding<NSRange?>, selectionRect: Binding<CGRect?>, scrollToRange: NSRange? = nil) {
        self.content = content
        self._selection = selection
        self._selectionRange = selectionRange
        self._selectionRect = selectionRect
        self.scrollToRange = scrollToRange
        self._attributedContent = State(initialValue: Self.parseMarkdownSync(content))
    }

    private static func parseMarkdownSync(_ content: String) -> NSAttributedString {
        do {
            let attributed = try AttributedString(
                markdown: content,
                options: AttributedString.MarkdownParsingOptions(
                    interpretedSyntax: .full
                )
            )
            let mutable = NSMutableAttributedString(attributed)
            let fullRange = NSRange(location: 0, length: mutable.length)
            mutable.addAttribute(.foregroundColor, value: NSColor.textColor, range: fullRange)
            return mutable
        } catch {
            return NSAttributedString(string: content)
        }
    }
}

#Preview {
    MarkdownRenderer(
        content: """
        # Heading 1

        This is **bold** and *italic* text.

        - List item 1
        - List item 2

        > A blockquote

        `inline code`
        """,
        selection: .constant(nil),
        selectionRange: .constant(nil),
        selectionRect: .constant(nil)
    )
}
