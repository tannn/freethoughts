import SwiftUI

struct PlainTextRenderer: View {
    let content: String
    @Binding var selection: String?

    var body: some View {
        ScrollView {
            Text(content)
                .textSelection(.enabled)
                .font(.system(.body, design: .monospaced))
                .lineSpacing(4)
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
        }
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
