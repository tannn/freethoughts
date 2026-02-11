import SwiftUI

struct SelectionPopover: View {
    let selection: TextSelection
    let onAddNote: () -> Void
    let onProvocation: () -> Void
    let onDismiss: () -> Void
    let isAIAvailable: Bool

    var body: some View {
        HStack(spacing: 0) {
            Button {
                onAddNote()
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: "note.text.badge.plus")
                        .font(.title2)
                    Text("Note")
                        .font(.caption)
                }
                .frame(width: 60, height: 50)
            }
            .buttonStyle(.plain)
            .contentShape(Rectangle())

            if isAIAvailable {
                Divider()
                    .frame(height: 40)

                Button {
                    onProvocation()
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: "sparkles")
                            .font(.title2)
                        Text("AI")
                            .font(.caption)
                    }
                    .frame(width: 60, height: 50)
                }
                .buttonStyle(.plain)
                .contentShape(Rectangle())
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
        .shadow(color: .black.opacity(0.15), radius: 8, y: 4)
    }
}
