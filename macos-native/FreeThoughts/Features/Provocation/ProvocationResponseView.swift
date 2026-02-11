import SwiftUI

struct ProvocationResponseView: View {
    let promptName: String
    let response: String
    let isComplete: Bool

    private var icon: String {
        ProvocationPromptItem.icon(for: promptName)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Style indicator
            HStack(spacing: 4) {
                Image(systemName: icon)
                Text(promptName)
                    .fontWeight(.medium)
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            // Response text
            Text(response)
                .font(.body)
                .italic()
                .foregroundStyle(.primary)
                .textSelection(.enabled)
                .animation(.easeIn(duration: 0.05), value: response)

            // Streaming indicator
            if !isComplete {
                StreamingIndicator()
            }
        }
        .padding(12)
        .background(Color.accentColor.opacity(0.05), in: RoundedRectangle(cornerRadius: 8))
    }
}

private struct StreamingIndicator: View {
    @State private var animating = false

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(Color.accentColor)
                    .frame(width: 6, height: 6)
                    .opacity(animating ? 1.0 : 0.3)
                    .animation(
                        .easeInOut(duration: 0.6)
                            .repeatForever(autoreverses: true)
                            .delay(Double(index) * 0.2),
                        value: animating
                    )
            }
        }
        .onAppear {
            animating = true
        }
    }
}
