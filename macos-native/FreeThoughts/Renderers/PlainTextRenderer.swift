import SwiftUI

struct PlainTextRenderer: View {
    let content: String
    @Binding var selection: String?

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
            selection: $selection
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
        selection: .constant(nil)
    )
}
