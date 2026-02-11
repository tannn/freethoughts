import SwiftUI
import ComposableArchitecture

struct ProvocationStylePicker: View {
    @Bindable var store: StoreOf<ProvocationFeature>
    let sourceText: String
    let onCancel: () -> Void
    let onGenerate: () -> Void

    private let columns = [
        GridItem(.flexible()),
        GridItem(.flexible())
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                Text("Generate AI provocation")
                    .font(.headline)

                Spacer()

                Button {
                    onCancel()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }

            Divider()

            // Selected text context
            VStack(alignment: .leading, spacing: 4) {
                Text("Analyzing:")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Text("\"\(sourceText.prefix(200))\(sourceText.count > 200 ? "..." : "")\"")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.quaternary, in: RoundedRectangle(cornerRadius: 6))
            }

            // Style selection
            VStack(alignment: .leading, spacing: 8) {
                Text("Choose a provocation style:")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(store.availablePrompts, id: \.id) { prompt in
                        PromptStyleButton(
                            prompt: prompt,
                            isSelected: store.selectedPromptId == prompt.id,
                            action: {
                                store.send(.selectPrompt(prompt.id))
                            }
                        )
                    }
                }
            }

            Divider()

            // Actions
            HStack {
                Spacer()

                Button("Cancel") {
                    onCancel()
                }
                .keyboardShortcut(.escape)

                Button("Generate") {
                    onGenerate()
                }
                .keyboardShortcut(.return, modifiers: .command)
                .buttonStyle(.borderedProminent)
                .disabled(store.selectedPromptId == nil)
            }
        }
        .padding(20)
        .frame(width: 450)
    }
}

struct PromptStyleButton: View {
    let prompt: ProvocationPromptItem
    let isSelected: Bool
    let action: () -> Void

    private var icon: String {
        switch prompt.name.lowercased() {
        case "challenge": return "magnifyingglass"
        case "expand": return "globe"
        case "simplify": return "lightbulb"
        case "question": return "questionmark"
        default: return "sparkles"
        }
    }

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.title2)

                Text(prompt.name)
                    .font(.caption)
                    .fontWeight(.medium)

            }
            .frame(maxWidth: .infinity)
            .frame(height: 80)
            .background(
                isSelected
                    ? Color.accentColor.opacity(0.15)
                    : Color.secondary.opacity(0.05),
                in: RoundedRectangle(cornerRadius: 8)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(
                        isSelected ? Color.accentColor : Color.clear,
                        lineWidth: 2
                    )
            )
        }
        .buttonStyle(.plain)
    }
}
