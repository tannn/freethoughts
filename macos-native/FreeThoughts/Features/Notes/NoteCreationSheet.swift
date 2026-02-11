import SwiftUI
import ComposableArchitecture

struct NoteCreationSheet: View {
    @Bindable var store: StoreOf<NotesFeature>
    @FocusState private var isFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("New Note")
                    .font(.headline)

                Spacer()

                Button {
                    store.send(.cancelNoteCreation)
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }

            Divider()

            if let selection = store.noteCreationSelection {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Selected text:")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    Text("\"\(selection.text)\"")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.quaternary, in: RoundedRectangle(cornerRadius: 6))
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Your note:")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                TextEditor(text: Binding(
                    get: { store.noteCreationContent },
                    set: { store.send(.updateNoteContent($0)) }
                ))
                .font(.body)
                .frame(minHeight: 100)
                .scrollContentBackground(.hidden)
                .padding(8)
                .background(.quaternary, in: RoundedRectangle(cornerRadius: 6))
                .focused($isFocused)
            }

            Divider()

            HStack {
                Spacer()

                Button("Cancel") {
                    store.send(.cancelNoteCreation)
                }
                .keyboardShortcut(.escape)

                Button("Save Note") {
                    store.send(.saveNote)
                }
                .keyboardShortcut(.return, modifiers: .command)
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(20)
        .frame(width: 500)
        .onAppear {
            isFocused = true
        }
    }
}
