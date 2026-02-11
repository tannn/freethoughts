import SwiftUI

struct NoteCard: View {
    let note: NoteItem
    let isEditing: Bool
    let onTap: () -> Void
    let onEdit: () -> Void
    let onSave: (String) -> Void
    let onDelete: () -> Void
    let onProvocation: () -> Void

    @State private var editText: String = ""
    @State private var showDeleteConfirmation = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: onTap) {
                Text(truncatedExcerpt)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(8)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 4))
            }
            .buttonStyle(.plain)

            if isEditing {
                editingView
            } else {
                contentView
            }
        }
        .padding(12)
        .background(.background, in: RoundedRectangle(cornerRadius: 8))
        .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
        .confirmationDialog(
            "Delete Note",
            isPresented: $showDeleteConfirmation,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                onDelete()
            }
        } message: {
            Text("This action cannot be undone.")
        }
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
                    editText = note.content
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
            TextEditor(text: $editText)
                .font(.body)
                .frame(minHeight: 60)
                .scrollContentBackground(.hidden)
                .padding(4)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 4))

            HStack {
                Button("Delete", role: .destructive) {
                    showDeleteConfirmation = true
                }
                .font(.caption)

                Spacer()

                Button("Done") {
                    onSave(editText)
                }
                .font(.caption)
                .buttonStyle(.borderedProminent)
            }
        }
        .onAppear {
            editText = note.content
        }
    }
}
