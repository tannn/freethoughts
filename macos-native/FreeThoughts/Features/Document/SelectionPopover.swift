import SwiftUI

struct SelectionPopover: View {
    let selection: TextSelection
    let mode: DocumentFeature.PopoverMode
    let availablePrompts: [ProvocationPromptItem]
    let onAddNote: () -> Void
    let onProvocation: () -> Void
    let onSelectStyle: (UUID) -> Void
    let onDismiss: () -> Void
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
