import SwiftUI

struct MarkdownRenderer: View {
    let content: String
    @Binding var selection: String?

    @State private var attributedContent: NSAttributedString?

    var body: some View {
        if let attributed = attributedContent {
            SelectableTextView(
                attributedString: attributed,
                selection: $selection
            )
        } else {
            ProgressView()
                .padding()
        }
    }

    init(content: String, selection: Binding<String?>) {
        self.content = content
        self._selection = selection
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
        selection: .constant(nil)
    )
}
