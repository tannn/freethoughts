import ComposableArchitecture
import Foundation
import AppKit
import UniformTypeIdentifiers
import PDFKit

@Reducer
struct AppFeature {
    @ObservableState
    struct State: Equatable {
        var document: DocumentFeature.State = .init()
        var notes: NotesFeature.State = .init()
        var provocation: ProvocationFeature.State = .init()
        var isSidebarCollapsed: Bool = false
        var isAIAvailable: Bool = false
        var aiAvailabilityChecked: Bool = false
        var showSettings: Bool = false
        var showFilePicker: Bool = false

        // Provocation UI state
        var showProvocationPicker: Bool = false
        var provocationSourceText: String = ""
        var provocationContext: String = ""
    }

    enum Action {
        case document(DocumentFeature.Action)
        case notes(NotesFeature.Action)
        case provocation(ProvocationFeature.Action)
        case onAppear
        case openFilePicker
        case fileSelected(URL)
        case toggleSidebar
        case checkAIAvailability
        case aiAvailabilityResult(Bool)
        case requestNoteProvocation(noteId: UUID, promptId: UUID)
        case dismissProvocationPicker
        case generateFromPicker
        case openSettings
        case closeSettings
        case closeFilePicker
    }

    @Dependency(\.foundationModelsClient) var foundationModelsClient

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
                return .merge(
                    .send(.checkAIAvailability),
                    .send(.provocation(.seedDefaultPrompts))
                )

            case .document(.documentLoaded(let document)):
                return .send(.notes(.loadNotes(documentPath: document.canonicalPath)))

            case .document(.closeDocument):
                return .send(.notes(.loadNotes(documentPath: "")))

            case .document(.addNoteFromSelection):
                if let selection = state.document.currentSelection {
                    return .send(.notes(.startNoteCreation(selection)))
                }
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

            case .document(.requestProvocationFromSelection):
                guard let selection = state.document.currentSelection else {
                    return .none
                }

                state.provocationSourceText = selection.text
                state.provocationContext = getContext(
                    from: state.document.document,
                    around: selection
                )
                state.showProvocationPicker = true

                let request = ProvocationFeature.ProvocationRequest(
                    sourceType: .textSelection,
                    sourceText: selection.text,
                    context: state.provocationContext,
                    documentPath: selection.documentPath,
                    noteId: nil
                )
                return .send(.provocation(.requestProvocation(request)))

            case .notes(.navigateToNote(let noteId)):
                guard let note = state.notes.notes.first(where: { $0.id == noteId }) else {
                    return .none
                }
                return .send(.document(.scrollToAnchor(
                    page: note.anchorPage,
                    start: note.anchorStart,
                    end: note.anchorEnd,
                    selectedText: note.selectedText
                )))

            case .requestNoteProvocation(let noteId, let promptId):
                guard let note = state.notes.notes.first(where: { $0.id == noteId }) else {
                    return .none
                }

                let context = note.selectedText + "\n\n" + note.content
                let request = ProvocationFeature.ProvocationRequest(
                    sourceType: .note,
                    sourceText: note.content.isEmpty ? note.selectedText : note.content,
                    context: context,
                    documentPath: note.documentPath,
                    noteId: noteId
                )

                state.provocation.selectedPromptId = promptId
                return .merge(
                    .send(.provocation(.requestProvocation(request))),
                    .send(.provocation(.startGeneration))
                )

            case .dismissProvocationPicker:
                state.showProvocationPicker = false
                return .send(.provocation(.clearResponse))

            case .generateFromPicker:
                state.showProvocationPicker = false
                return .send(.provocation(.startGeneration))

            case .toggleSidebar:
                state.isSidebarCollapsed.toggle()
                return .none

            case .openSettings:
                state.showSettings = true
                return .none

            case .closeSettings:
                state.showSettings = false
                return .none

            case .openFilePicker:
                state.showFilePicker = true
                return .none

            case .closeFilePicker:
                state.showFilePicker = false
                return .none

            case .checkAIAvailability:
                return .run { send in
                    let available = await foundationModelsClient.isAvailable()
                    await send(.aiAvailabilityResult(available))
                }

            case .aiAvailabilityResult(let available):
                state.isAIAvailable = available
                state.aiAvailabilityChecked = true
                state.provocation.isAIAvailable = available
                return .none

            case .provocation(.provocationSaved):
                if let path = state.notes.currentDocumentPath, !path.isEmpty {
                    return .send(.notes(.loadNotes(documentPath: path)))
                }
                if let document = state.document.document {
                    return .send(.notes(.loadNotes(documentPath: document.canonicalPath)))
                }
                return .none

            case .document, .notes, .provocation:
                return .none
            }
        }
    }

    // MARK: - Helpers

    private func getContext(from document: Document?, around selection: TextSelection) -> String {
        guard let document else { return selection.text }

        switch document.content {
        case .text(let fullText):
            let start = max(0, selection.range.startOffset - 250)
            let end = min(fullText.count, selection.range.endOffset + 250)
            guard start < end, start < fullText.count else { return selection.text }
            let startIndex = fullText.index(fullText.startIndex, offsetBy: start)
            let endIndex = fullText.index(fullText.startIndex, offsetBy: min(end, fullText.count))
            return String(fullText[startIndex..<endIndex])

        case .pdf(let pdfDoc):
            if let page = selection.range.page,
               let pdfPage = pdfDoc.page(at: page) {
                return pdfPage.string ?? selection.text
            }
            return selection.text
        }
    }
}
