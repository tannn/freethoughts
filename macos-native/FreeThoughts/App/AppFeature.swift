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

        var activeDocumentPath: String? {
            document.document?.canonicalPath
        }
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
        case openSettings
        case closeSettings
        case closeFilePicker
    }

    @Dependency(\.foundationModelsClient) var foundationModelsClient
    @Dependency(\.notesClient) var notesClient

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

            // MARK: - Document actions

            case .document(.documentLoaded(let doc)):
                return .send(.notes(.loadNotes(documentPath: doc.canonicalPath)))

            case .document(.addNoteFromSelection):
                guard let selection = state.document.currentSelection else {
                    return .none
                }
                return .send(.notes(.startNoteCreation(selection)))

            case .document(.requestProvocationFromSelection):
                return .none

            case .document(.generateProvocationFromSelection(let promptId)):
                guard let selection = state.document.currentSelection else {
                    return .none
                }

                let context = getContext(
                    from: state.document.document,
                    around: selection
                )

                let noteItem = NoteItem(
                    documentPath: selection.documentPath,
                    anchorStart: selection.range.startOffset,
                    anchorEnd: selection.range.endOffset,
                    anchorPage: selection.range.page,
                    selectedText: selection.text,
                    content: ""
                )

                let request = ProvocationFeature.ProvocationRequest(
                    sourceType: .textSelection,
                    sourceText: selection.text,
                    context: context,
                    documentPath: selection.documentPath,
                    noteId: noteItem.id
                )
                return .merge(
                    .run { send in
                        let saved = try await notesClient.saveNote(noteItem)
                        await send(.notes(.noteSaved(saved)))
                    },
                    .send(.provocation(.selectPrompt(promptId))),
                    .send(.provocation(.requestProvocation(request))),
                    .send(.provocation(.startGeneration))
                )

            case .document:
                return .none

            // MARK: - File selection

            case .fileSelected(let url):
                return .send(.document(.openDocument(url)))

            // MARK: - Notes

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

                return .merge(
                    .send(.provocation(.selectPrompt(promptId))),
                    .send(.provocation(.requestProvocation(request))),
                    .send(.provocation(.startGeneration))
                )

            // MARK: - File picker

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

            // MARK: - UI

            case .toggleSidebar:
                state.isSidebarCollapsed.toggle()
                return .none

            case .openSettings:
                state.showSettings = true
                return .none

            case .closeSettings:
                state.showSettings = false
                return .none

            case .closeFilePicker:
                state.showFilePicker = false
                return .none

            // MARK: - AI

            case .checkAIAvailability:
                return .run { send in
                    let available = await foundationModelsClient.isAvailable()
                    await send(.aiAvailabilityResult(available))
                }

            case .aiAvailabilityResult(let available):
                state.isAIAvailable = available
                state.aiAvailabilityChecked = true
                return .send(.provocation(.setAIAvailability(available)))

            case .provocation(.provocationSaved):
                if let path = state.notes.currentDocumentPath, !path.isEmpty {
                    return .send(.notes(.loadNotes(documentPath: path)))
                }
                if let path = state.activeDocumentPath {
                    return .send(.notes(.loadNotes(documentPath: path)))
                }
                return .none

            case .notes, .provocation:
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
