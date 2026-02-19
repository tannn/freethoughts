import SwiftUI

struct NoteCard: View {
    let note: NoteItem
    let isEditing: Bool
    let isCollapsed: Bool
    let isSelected: Bool
    let onToggleSelection: (() -> Void)?
    @Binding var draftText: String
    let availablePrompts: [ProvocationPromptItem]
    let isGenerating: Bool
    let currentResponse: String
    let selectedPromptName: String
    let isAIAvailable: Bool
    let onTap: () -> Void
    let onEdit: () -> Void
    let onSave: (String) -> Void
    let onCancel: () -> Void
    let onDelete: () -> Void
    let onSelectPrompt: (UUID) -> Void
    let onCancelGeneration: () -> Void
    let onToggleCollapse: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header: excerpt + page indicator + collapse chevron
            HStack(spacing: 6) {
                if let onToggleSelection {
                    Button(action: onToggleSelection) {
                        Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(isSelected ? Color.accentColor : .secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(isSelected ? "Deselect note" : "Select note")
                }

                Button(action: onTap) {
                    Text(truncatedExcerpt)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .disabled(onToggleSelection != nil)

                if let page = note.anchorPage {
                    Text("p.\(page + 1)")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(.quaternary, in: Capsule())
                }

                Button(action: onToggleCollapse) {
                    Image(systemName: isCollapsed ? "chevron.right" : "chevron.down")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(isCollapsed ? "Expand note" : "Collapse note")
            }
            .padding(8)
            .background(.quaternary, in: RoundedRectangle(cornerRadius: 4))

            if !isCollapsed && onToggleSelection == nil {
                if isEditing {
                    editingView
                } else {
                    contentView
                }
            } else if !isCollapsed && onToggleSelection != nil {
                // In select mode: show content read-only
                contentViewReadOnly
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

                if isAIAvailable {
                    Menu {
                        ForEach(availablePrompts, id: \.id) { prompt in
                            Button {
                                onSelectPrompt(prompt.id)
                            } label: {
                                Label(prompt.name, systemImage: prompt.icon)
                            }
                        }
                    } label: {
                        Label("AI", systemImage: "sparkles")
                            .font(.caption)
                    }
                    .menuStyle(.borderlessButton)
                    .foregroundStyle(.secondary)
                }
            }

            if isGenerating || latestProvocation != nil {
                Divider()
                    .padding(.vertical, 4)

                if isGenerating {
                    if currentResponse.isEmpty {
                        ProvocationLoadingView(
                            promptName: selectedPromptName,
                            onCancel: onCancelGeneration
                        )
                    } else {
                        ProvocationResponseView(
                            promptName: selectedPromptName,
                            response: currentResponse,
                            isComplete: false
                        )
                    }
                } else if let latestProvocation {
                    ProvocationResponseView(
                        promptName: latestProvocation.promptName,
                        response: latestProvocation.response,
                        isComplete: true
                    )
                }
            }
        }
    }

    private var contentViewReadOnly: some View {
        Text(note.content.isEmpty ? "No content" : note.content)
            .foregroundStyle(note.content.isEmpty ? .tertiary : .primary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var latestProvocation: ProvocationItem? {
        note.provocations.max(by: { $0.createdAt < $1.createdAt })
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
    }
}
