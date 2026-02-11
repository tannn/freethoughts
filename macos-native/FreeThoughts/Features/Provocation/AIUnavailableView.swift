import SwiftUI

struct AIUnavailableView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 32))
                .foregroundStyle(.orange)

            Text("AI Unavailable")
                .font(.headline)

            VStack(spacing: 4) {
                Text("Apple Foundation Models requires")
                Text("macOS 15 or later on Apple Silicon.")
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)

            Divider()
                .padding(.vertical, 8)

            Text("Note-taking still works normally.")
                .font(.caption)
                .foregroundStyle(.tertiary)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
    }
}
