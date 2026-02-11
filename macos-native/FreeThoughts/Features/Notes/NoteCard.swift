import SwiftUI

struct NoteCard: View {
    let note: NoteItem
    let isEditing: Bool
    @Binding var draftText: String
    let onTap: () -> Void
    let onEdit: () -> Void
    let onSave: (String) -> Void
    let onCancel: () -> Void
    let onDelete: () -> Void
    let onProvocation: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header: excerpt + page indicator
            HStack(spacing: 6) {
                Button(action: onTap) {
                    Text(truncatedExcerpt)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)

                if let page = note.anchorPage {
                    Text("p.\(page + 1)")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(.quaternary, in: Capsule())
                }
            }
            .padding(8)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 4))

            if isEditing {
                editingView
            } else {
                contentView
            }
        }
        .padding(12)
        .background(.background, in: RoundedRectangle(cornerRadius: 8))
        .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
    }

    private var truncatedExcerpt: String {
        let excerpt = note.selectedText.prefix(100)
        return excerpt.count < note.selectedText.count
            ? "\"\(excerpt)...\""
            : "\"\(excerpt)\""
    }

    private var contentView: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(note.content.isEmpty ? "No content" : note.content)
                .foregroundStyle(note.content.isEmpty ? .tertiary : .primary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .onTapGesture {
                    onEdit()
                }

            HStack {
                Spacer()

                Button {
                    onProvocation()
                } label: {
                    Label("AI", systemImage: "sparkles")
                        .font(.caption)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
            }
        }
    }

    private var editingView: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextEditor(text: $draftText)
                .font(.body)
                .frame(minHeight: 60, maxHeight: 200)
                .scrollContentBackground(.hidden)
                .padding(8)
                .background(Color.accentColor.opacity(0.1), in: RoundedRectangle(cornerRadius: 6))
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color.accentColor, lineWidth: 1)
                )

            HStack {
                Button("Delete", role: .destructive) {
                    onDelete()
                }
                .font(.caption)

                Spacer()

                Button("Cancel") {
                    onCancel()
                }
                .font(.caption)

                Button("Done") {
                    onSave(draftText)
                }
                .font(.caption)
                .buttonStyle(.borderedProminent)
            }
        }
        .onExitCommand {
            onCancel()
        }
        .onKeyPress(.delete, phases: .down) { keyPress in
            if keyPress.modifiers.contains(.command) {
                onDelete()
                return .handled
            }
            return .ignored
        }
    }
}
