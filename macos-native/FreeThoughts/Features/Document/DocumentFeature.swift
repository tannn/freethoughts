import ComposableArchitecture
import Foundation

@Reducer
struct DocumentFeature {
    @ObservableState
    struct State: Equatable {
        var document: Document?
        var isLoading: Bool = false
        var error: String?
        var loadingFileSize: Int?
        var currentPage: Int = 1
        var totalPages: Int = 1
        var zoomLevel: Double = 1.0
        var currentSelection: TextSelection?
        var showSelectionPopover: Bool = false
        var scrollToAnchorRequest: AnchorRequest?
        var isNavigatingToAnchor: Bool = false
        var hasSelectableText: Bool = true

        // Tracks the selection that was active when the popover was explicitly dismissed,
        // so re-renders that re-fire the same selection don't flash the popover back.
        var dismissedSelectionText: String?
        var dismissedSelectionRange: TextSelection.SelectionRange?
    }

    enum Action {
        case openDocument(URL)
        case loadingFileSizeResult(Int?)
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

    private enum CancelID { case highlightTimer }

    @Dependency(\.documentClient) var documentClient

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .openDocument(let url):
                state.isLoading = true
                state.error = nil
                state.currentSelection = nil
                state.showSelectionPopover = false
                let path = url.path
                return .run { send in
                    let fileSize = (try? FileManager.default.attributesOfItem(atPath: path)[.size] as? NSNumber)?.intValue
                    await send(.loadingFileSizeResult(fileSize))
                    do {
                        let document = try await documentClient.loadDocument(url)
                        await send(.documentLoaded(document))
                    } catch {
                        await send(.documentLoadFailed(error.localizedDescription))
                    }
                }

            case .loadingFileSizeResult(let size):
                state.loadingFileSize = size
                return .none

            case .documentLoaded(let document):
                state.document = document
                state.isLoading = false
                state.loadingFileSize = nil
                state.currentPage = 1
                if case .pdf(let pdfDoc) = document.content {
                    state.totalPages = pdfDoc.pageCount
                    state.hasSelectableText = (0..<pdfDoc.pageCount).contains { pageIndex in
                        guard let page = pdfDoc.page(at: pageIndex) else { return false }
                        return page.string?.isEmpty == false
                    }
                } else {
                    state.totalPages = 1
                    state.hasSelectableText = true
                }
                return .none

            case .documentLoadFailed(let error):
                state.isLoading = false
                state.error = error
                state.loadingFileSize = nil
                return .none

            case .closeDocument:
                state.document = nil
                state.loadingFileSize = nil
                state.currentPage = 1
                state.totalPages = 1
                state.currentSelection = nil
                state.showSelectionPopover = false
                state.hasSelectableText = true
                return .cancel(id: CancelID.highlightTimer)

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
                if let selection {
                    let isDismissed = selection.text == state.dismissedSelectionText &&
                                      selection.range == state.dismissedSelectionRange
                    if isDismissed {
                        // Same selection that was dismissed — don't re-show popover
                    } else {
                        // Genuinely new selection — clear dismissed state and show popover
                        state.dismissedSelectionText = nil
                        state.dismissedSelectionRange = nil
                        state.showSelectionPopover = !state.isNavigatingToAnchor
                    }
                } else {
                    state.showSelectionPopover = false
                }
                return .none

            case .dismissPopover:
                state.showSelectionPopover = false
                state.dismissedSelectionText = state.currentSelection?.text
                state.dismissedSelectionRange = state.currentSelection?.range
                return .none

            case .addNoteFromSelection:
                state.showSelectionPopover = false
                state.dismissedSelectionText = state.currentSelection?.text
                state.dismissedSelectionRange = state.currentSelection?.range
                return .none

            case .requestProvocationFromSelection:
                state.showSelectionPopover = false
                state.dismissedSelectionText = state.currentSelection?.text
                state.dismissedSelectionRange = state.currentSelection?.range
                return .none

            case .scrollToAnchor(let page, let start, let end, let selectedText):
                let request = AnchorRequest(page: page, start: start, end: end, selectedText: selectedText)
                state.scrollToAnchorRequest = request
                state.isNavigatingToAnchor = true
                if let page {
                    state.currentPage = page + 1
                }
                return .run { send in
                    try await Task.sleep(for: .seconds(2))
                    await send(.clearHighlight)
                }
                .cancellable(id: CancelID.highlightTimer, cancelInFlight: true)

            case .clearHighlight:
                state.scrollToAnchorRequest = nil
                state.isNavigatingToAnchor = false
                return .none
            }
        }
    }
}
