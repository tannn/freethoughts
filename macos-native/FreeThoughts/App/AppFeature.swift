import ComposableArchitecture
import Foundation
import AppKit
import UniformTypeIdentifiers
import PDFKit

/// Root TCA reducer that owns the three top-level features — Document, Notes, and Provocation —
/// and coordinates cross-feature effects such as navigating to a note's source anchor or
/// triggering AI provocation from a text selection.
@Reducer
struct AppFeature {
    /// Top-level application state.
    @ObservableState
    struct State: Equatable {
        /// State for the currently open document (loading, content, selection, zoom, etc.).
        var document: DocumentFeature.State = .init()
        /// State for the notes sidebar (list, editing, search, bulk-delete, etc.).
        var notes: NotesFeature.State = .init()
        /// State for AI provocation generation (prompts, streaming response, errors).
        var provocation: ProvocationFeature.State = .init()
        /// When `true` the notes sidebar is hidden and only the document pane is shown.
        var isSidebarCollapsed: Bool = false
        /// Whether Apple Foundation Models is available on the current device.
        var isAIAvailable: Bool = false
        /// Set to `true` once the AI availability check has completed (to avoid a flash of the
        /// unavailability warning before the check finishes).
        var aiAvailabilityChecked: Bool = false
        /// Controls presentation of the Settings sheet.
        var showSettings: Bool = false
        /// Signals the view to open the native file-picker panel.
        var showFilePicker: Bool = false

        /// Canonical file-system path of the document currently open, or `nil` when no document is loaded.
        var activeDocumentPath: String? {
            document.document?.canonicalPath
        }
    }

    /// Actions handled by the root reducer.
    enum Action {
        /// Forwarded to `DocumentFeature`.
        case document(DocumentFeature.Action)
        /// Forwarded to `NotesFeature`.
        case notes(NotesFeature.Action)
        /// Forwarded to `ProvocationFeature`.
        case provocation(ProvocationFeature.Action)
        /// Sent when the main window first appears; kicks off AI availability check and prompt seeding.
        case onAppear
        /// Opens the native NSOpenPanel to pick a document file.
        case openFilePicker
        /// Sent after the user selects a file URL from the picker.
        case fileSelected(URL)
        /// Toggles the notes sidebar collapsed/expanded state.
        case toggleSidebar
        /// Initiates the asynchronous Foundation Models availability check.
        case checkAIAvailability
        /// Delivers the result of the AI availability check.
        case aiAvailabilityResult(Bool)
        /// Requests AI provocation for an existing note using the specified prompt.
        case requestNoteProvocation(noteId: UUID, promptId: UUID)
        /// Opens the Settings sheet.
        case openSettings
        /// Closes the Settings sheet.
        case closeSettings
        /// Clears the file-picker signal after the view has consumed it.
        case closeFilePicker
    }

    @Dependency(\.foundationModelsClient) var foundationModelsClient
    @Dependency(\.notesClient) var notesClient

    // MARK: - Reducer

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
                return .run { send in
                    do {
                        let saved = try await notesClient.saveNote(noteItem)
                        await send(.notes(.noteSaved(saved)))
                    } catch {
                        return
                    }
                    await send(.provocation(.selectPrompt(promptId)))
                    await send(.provocation(.requestProvocation(request)))
                    await send(.provocation(.startGeneration))
                }

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

    /// Extracts up to 250 characters of surrounding context from the document around a text
    /// selection. Used to give the AI model richer context when generating a provocation.
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
