import ComposableArchitecture
import Foundation
import AppKit
import UniformTypeIdentifiers
import PDFKit

@Reducer
struct TabFeature {
    typealias State = TabItem

    enum Action {
        case document(DocumentFeature.Action)
    }

    var body: some ReducerOf<Self> {
        Scope(state: \.document, action: \.document) {
            DocumentFeature()
        }
    }
}

@Reducer
struct AppFeature {
    @ObservableState
    struct State: Equatable {
        var tabs: IdentifiedArrayOf<TabItem> = []
        var selectedTabID: UUID?
        var notes: NotesFeature.State = .init()
        var provocation: ProvocationFeature.State = .init()
        var isSidebarCollapsed: Bool = false
        var isAIAvailable: Bool = false
        var aiAvailabilityChecked: Bool = false
        var showSettings: Bool = false
        var showFilePicker: Bool = false

        var activeTab: TabItem? {
            guard let id = selectedTabID else { return nil }
            return tabs[id: id]
        }

        var activeDocumentPath: String? {
            activeTab?.document.document?.canonicalPath
        }
    }

    enum Action {
        case tab(IdentifiedActionOf<TabFeature>)
        case selectTab(UUID)
        case closeTab(UUID)
        case closeCurrentTab
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

            // MARK: - Tab document actions

            case .tab(.element(id: let id, action: .document(.documentLoaded(let doc)))):
                state.tabs[id: id]?.title = doc.fileName
                if id == state.selectedTabID {
                    return .send(.notes(.loadNotes(documentPath: doc.canonicalPath)))
                }
                return .none

            case .tab(.element(id: let id, action: .document(.closeDocument))):
                return .send(.closeTab(id))

            case .tab(.element(id: let id, action: .document(.addNoteFromSelection))):
                guard id == state.selectedTabID,
                      let selection = state.tabs[id: id]?.document.currentSelection else {
                    return .none
                }
                return .send(.notes(.startNoteCreation(selection)))

            case .tab(.element(id: _, action: .document(.requestProvocationFromSelection))):
                return .none

            case .tab(.element(id: let id, action: .document(.generateProvocationFromSelection(let promptId)))):
                guard id == state.selectedTabID,
                      let tab = state.tabs[id: id],
                      let selection = tab.document.currentSelection else {
                    return .none
                }

                let context = getContext(
                    from: tab.document.document,
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

            case .tab:
                return .none

            // MARK: - Tab management

            case .fileSelected(let url):
                let canonicalPath = url.standardizedFileURL.path
                if let existingTab = state.tabs.first(where: { $0.document.document?.canonicalPath == canonicalPath }) {
                    return .send(.selectTab(existingTab.id))
                }
                let tab = TabItem()
                state.tabs.append(tab)
                state.selectedTabID = tab.id
                return .send(.tab(.element(id: tab.id, action: .document(.openDocument(url)))))

            case .selectTab(let id):
                guard state.tabs[id: id] != nil else { return .none }
                state.selectedTabID = id
                if let path = state.tabs[id: id]?.document.document?.canonicalPath {
                    return .send(.notes(.loadNotes(documentPath: path)))
                }
                return .send(.notes(.loadNotes(documentPath: "")))

            case .closeTab(let id):
                guard state.tabs[id: id] != nil else { return .none }
                let wasSelected = state.selectedTabID == id
                let removedIndex = state.tabs.index(id: id)!
                state.tabs.remove(id: id)

                if wasSelected {
                    if state.tabs.isEmpty {
                        state.selectedTabID = nil
                    } else {
                        let newIndex = min(removedIndex, state.tabs.count - 1)
                        state.selectedTabID = state.tabs[newIndex].id
                    }
                }

                if let selectedID = state.selectedTabID,
                   let path = state.tabs[id: selectedID]?.document.document?.canonicalPath {
                    return .send(.notes(.loadNotes(documentPath: path)))
                }
                return .send(.notes(.loadNotes(documentPath: "")))

            case .closeCurrentTab:
                guard let id = state.selectedTabID else { return .none }
                return .send(.closeTab(id))

            // MARK: - Notes

            case .notes(.navigateToNote(let noteId)):
                guard let note = state.notes.notes.first(where: { $0.id == noteId }),
                      let tabID = state.selectedTabID else {
                    return .none
                }
                return .send(.tab(.element(id: tabID, action: .document(.scrollToAnchor(
                    page: note.anchorPage,
                    start: note.anchorStart,
                    end: note.anchorEnd,
                    selectedText: note.selectedText
                )))))

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
        .forEach(\.tabs, action: \.tab) {
            TabFeature()
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
