import SwiftUI

struct MarkdownRenderer: View {
    let content: String
    @Binding var selection: String?

    @State private var attributedContent: AttributedString?

    var body: some View {
        ScrollView {
            if let attributed = attributedContent {
                Text(attributed)
                    .textSelection(.enabled)
                    .font(.body)
                    .lineSpacing(4)
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                ProgressView()
                    .padding()
            }
        }
        .task(id: content) {
            await parseMarkdown()
        }
    }

    private func parseMarkdown() async {
        do {
            var attributed = try AttributedString(
                markdown: content,
                options: AttributedString.MarkdownParsingOptions(
                    interpretedSyntax: .inlineOnlyPreservingWhitespace
                )
            )
            attributed.font = .body
            attributed.foregroundColor = .primary

            await MainActor.run {
                self.attributedContent = attributed
            }
        } catch {
            await MainActor.run {
                self.attributedContent = AttributedString(content)
            }
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
