import ComposableArchitecture
import Foundation

struct AnchorRequest: Equatable, Identifiable {
    let id = UUID()
    let page: Int?
    let start: Int
    let end: Int
    let selectedText: String
}

@Reducer
struct DocumentFeature {
    @ObservableState
    struct State: Equatable {
        var document: Document?
        var isLoading: Bool = false
        var error: String?
        var currentPage: Int = 1
        var totalPages: Int = 1
        var zoomLevel: Double = 1.0
        var currentSelection: TextSelection?
        var showSelectionPopover: Bool = false
        var scrollToAnchorRequest: AnchorRequest?
    }

    enum Action {
        case openDocument(URL)
        case documentLoaded(Document)
        case documentLoadFailed(String)
        case closeDocument
        case setPage(Int)
        case setZoom(Double)
        case clearError
        case selectionChanged(TextSelection?)
        case dismissPopover
        case addNoteFromSelection
        case requestProvocationFromSelection
        case scrollToAnchor(page: Int?, start: Int, end: Int, selectedText: String)
        case clearHighlight
    }

    @Dependency(\.documentClient) var documentClient

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .openDocument(let url):
                state.isLoading = true
                state.error = nil
                state.currentSelection = nil
                state.showSelectionPopover = false
                return .run { send in
                    do {
                        let document = try await documentClient.loadDocument(url)
                        await send(.documentLoaded(document))
                    } catch {
                        await send(.documentLoadFailed(error.localizedDescription))
                    }
                }

            case .documentLoaded(let document):
                state.document = document
                state.isLoading = false
                state.currentPage = 1
                if case .pdf(let pdfDoc) = document.content {
                    state.totalPages = pdfDoc.pageCount
                } else {
                    state.totalPages = 1
                }
                return .none

            case .documentLoadFailed(let error):
                state.isLoading = false
                state.error = error
                return .none

            case .closeDocument:
                state.document = nil
                state.currentPage = 1
                state.totalPages = 1
                state.currentSelection = nil
                state.showSelectionPopover = false
                return .none

            case .setPage(let page):
                state.currentPage = max(1, min(page, state.totalPages))
                return .none

            case .setZoom(let zoom):
                state.zoomLevel = max(0.25, min(4.0, zoom))
                return .none

            case .clearError:
                state.error = nil
                return .none

            case .selectionChanged(let selection):
                state.currentSelection = selection
                state.showSelectionPopover = selection != nil
                return .none

            case .dismissPopover:
                state.showSelectionPopover = false
                return .none

            case .addNoteFromSelection:
                state.showSelectionPopover = false
                // Note creation will be handled by WP05
                return .none

            case .requestProvocationFromSelection:
                state.showSelectionPopover = false
                // Provocation request will be handled by WP07/WP08
                return .none

            case .scrollToAnchor(let page, let start, let end, let selectedText):
                let request = AnchorRequest(page: page, start: start, end: end, selectedText: selectedText)
                state.scrollToAnchorRequest = request
                if let page {
                    state.currentPage = page + 1
                }
                return .run { send in
                    try await Task.sleep(for: .seconds(2))
                    await send(.clearHighlight)
                }

            case .clearHighlight:
                state.scrollToAnchorRequest = nil
                return .none
            }
        }
    }
}
