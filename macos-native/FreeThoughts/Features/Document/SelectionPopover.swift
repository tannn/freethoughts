import SwiftUI

/// Floating action popover that appears near a text selection.
///
/// In `.actions` mode it shows "Add Note" and (when AI is available) "AI" buttons.
/// In `.provocationStyles` mode it shows a grid of prompt-style buttons for the user to choose
/// which AI provocation style to apply to the selection.
struct SelectionPopover: View {
    /// The text selection this popover is anchored to.
    let selection: TextSelection
    /// Controls whether action buttons or the prompt-style grid is shown.
    let mode: DocumentFeature.PopoverMode
    /// Prompt styles available for the AI grid view.
    let availablePrompts: [ProvocationPromptItem]
    /// Called when the user taps "Add Note".
    let onAddNote: () -> Void
    /// Called when the user taps "AI" to enter provocation-style selection.
    let onProvocation: () -> Void
    /// Called when the user picks a prompt style from the grid, passing its ID.
    let onSelectStyle: (UUID) -> Void
    /// Called when the popover should be dismissed without taking an action.
    let onDismiss: () -> Void
    /// When `false` the AI button is hidden.
    let isAIAvailable: Bool

    private let gridColumns = [
        GridItem(.flexible(), spacing: 4),
        GridItem(.flexible(), spacing: 4)
    ]

    var body: some View {
        Group {
            switch mode {
            case .actions:
                actionsView
            case .provocationStyles:
                stylesGridView
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .fixedSize()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
        .shadow(color: .black.opacity(0.15), radius: 8, y: 4)
        .animation(.easeInOut(duration: 0.2), value: mode)
    }

    private var actionsView: some View {
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
    }

    private var stylesGridView: some View {
        LazyVGrid(columns: gridColumns, spacing: 4) {
            ForEach(availablePrompts) { prompt in
                Button {
                    onSelectStyle(prompt.id)
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: prompt.icon)
                            .font(.title3)
                        Text(prompt.name)
                            .font(.caption2)
                            .fontWeight(.medium)
                    }
                    .frame(width: 64, height: 48)
                }
                .buttonStyle(.plain)
                .contentShape(Rectangle())
            }
        }
    }
}
