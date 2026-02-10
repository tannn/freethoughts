import ComposableArchitecture
import Foundation
import AppKit
import UniformTypeIdentifiers

@Reducer
struct AppFeature {
    @ObservableState
    struct State: Equatable {
        var document: DocumentFeature.State = .init()
        var notes: NotesFeature.State = .init()
        var provocation: ProvocationFeature.State = .init()
    }

    enum Action {
        case document(DocumentFeature.Action)
        case notes(NotesFeature.Action)
        case provocation(ProvocationFeature.Action)
        case onAppear
        case openFilePicker
        case fileSelected(URL)
    }

    var body: some ReducerOf<Self> {
        Scope(state: \.document, action: \.document) {
            DocumentFeature()
        }
        Scope(state: \.notes, action: \.notes) {
            NotesFeature()
        }
        Scope(state: \.provocation, action: \.provocation) {
            ProvocationFeature()
        }

        Reduce { state, action in
            switch action {
            case .onAppear:
                return .none

            case .openFilePicker:
                return .run { send in
                    let url = await MainActor.run { () -> URL? in
                        let panel = NSOpenPanel()
                        panel.allowsMultipleSelection = false
                        panel.canChooseDirectories = false
                        var types: [UTType] = [.pdf, .plainText]
                        if let mdType = UTType(filenameExtension: "md") {
                            types.append(mdType)
                        }
                        panel.allowedContentTypes = types

                        let response = panel.runModal()
                        if response == .OK {
                            return panel.url
                        }
                        return nil
                    }
                    if let url {
                        await send(.fileSelected(url))
                    }
                }

            case .fileSelected(let url):
                return .send(.document(.openDocument(url)))

            case .document, .notes, .provocation:
                return .none
            }
        }
    }
}
