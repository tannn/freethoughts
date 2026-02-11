import SwiftUI

struct ProvocationLoadingView: View {
    let promptName: String
    let onCancel: () -> Void

    @State private var progress: Double = 0

    var body: some View {
        VStack(spacing: 12) {
            HStack {
                Image(systemName: "sparkles")
                Text("Generating...")
                    .fontWeight(.medium)
            }
            .foregroundStyle(.secondary)

            ProgressView(value: progress)
                .progressViewStyle(.linear)
                .frame(width: 150)

            Text("\(promptName) style")
                .font(.caption)
                .foregroundStyle(.tertiary)

            Button("Cancel") {
                onCancel()
            }
            .font(.caption)
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        .onAppear {
            withAnimation(.linear(duration: 10)) {
                progress = 0.9
            }
        }
    }
}
