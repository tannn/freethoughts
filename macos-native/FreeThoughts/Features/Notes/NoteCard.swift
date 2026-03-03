import SwiftUI

/// A card view representing a single note. Shows a truncated excerpt header, optional page
/// badge, and the note body. Switches between read-only, content, and inline-edit layouts,
/// and embeds `ProvocationLoadingView` / `ProvocationResponseView` when AI generation is active.
struct NoteCard: View {
    /// The note to display.
    let note: NoteItem
    /// Whether the note is currently being edited inline.
    let isEditing: Bool

    let isCollapsed: Bool
    let isSelected: Bool
    let onToggleSelection: (() -> Void)?
    /// Bound to the draft text being typed during inline editing.
    @Binding var draftText: String
    /// Prompt styles available for the AI generation menu.
    let availablePrompts: [ProvocationPromptItem]
    /// Whether AI generation is currently streaming for this card.
    let isGenerating: Bool
    /// The partial AI response text currently being streamed.
    let currentResponse: String
    /// Display name of the prompt being used for generation.
    let selectedPromptName: String
    /// Whether the AI feature is available on the current device.
    let isAIAvailable: Bool
    /// Called when the user taps the excerpt header to navigate to the anchor.
    let onTap: () -> Void
    /// Called when the user taps the note body to enter edit mode.
    let onEdit: () -> Void
    /// Called with the final text when the user confirms their edits.
    let onSave: (String) -> Void
    /// Called when the user cancels an in-progress edit.
    let onCancel: () -> Void
    /// Called when the user confirms note deletion.
    let onDelete: () -> Void
    /// Called with the selected prompt ID when the user requests AI provocation.
    let onSelectPrompt: (UUID) -> Void
    /// Called when the user cancels an in-progress AI generation.
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

                Button(action: {
                    if let onToggleSelection {
                        onToggleSelection()
                    } else {
                        onTap()
                    }
                }) {
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
                    .contentShape(Rectangle())
                    .onTapGesture {
                        onToggleSelection?()
                    }
            }
        }
        .padding(12)
        .background(.background, in: RoundedRectangle(cornerRadius: 8))
        .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
        .contentShape(Rectangle())
        .onTapGesture {
            if let onToggleSelection {
                onToggleSelection()
            }
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
