import SwiftUI

struct ProvocationLoadingView: View {
    let promptName: String
    let onCancel: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: "sparkles")
                Text("Generating...")
                    .fontWeight(.medium)
            }
            .foregroundStyle(.secondary)

            ProgressView()
                .progressViewStyle(.linear)
                .frame(width: 150)

            Button("Cancel") {
                onCancel()
            }
            .font(.caption)
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
    }
}
