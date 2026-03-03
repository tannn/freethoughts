import ComposableArchitecture
import Foundation

/// TCA reducer responsible for loading, displaying, and interacting with a single document.
/// Manages document content, pagination, zoom level, text selection, and the selection popover.
@Reducer
struct DocumentFeature {
    /// Controls which content the selection popover displays.
    enum PopoverMode: Equatable {
        /// Default mode — shows "Add Note" and "AI" action buttons.
        case actions
        /// Shows the grid of available provocation prompt styles for selection.
        case provocationStyles
    }

    /// Document feature state.
    @ObservableState
    struct State: Equatable {
        /// The currently loaded document, or `nil` when no document is open.
        var document: Document?
        /// `true` while the document is being loaded from disk.
        var isLoading: Bool = false
        /// Human-readable error message shown in an alert, or `nil` when there is no error.
        var error: String?
        /// File size (in bytes) reported before the document finishes loading, used to show
        /// a progress hint for large files. `nil` once loading completes.
        var loadingFileSize: Int?
        /// 1-based index of the currently visible page (PDF only).
        var currentPage: Int = 1
        /// Total number of pages in the document (1 for text documents).
        var totalPages: Int = 1
        /// Current zoom/scale factor (1.0 = 100 %). Clamped to [0.25, 4.0].
        var zoomLevel: Double = 1.0
        /// The text range the user has currently selected, or `nil` when there is no selection.
        var currentSelection: TextSelection?
        /// Whether the selection-action popover is visible.
        var showSelectionPopover: Bool = false
        /// Which content the popover is currently showing.
        var popoverMode: PopoverMode = .actions
        /// Pending scroll-to-anchor request; set when navigating to a note's source location.
        var scrollToAnchorRequest: AnchorRequest?
        /// `true` while an anchor scroll animation is in progress, used to suppress the
        /// popover during programmatic selection highlights.
        var isNavigatingToAnchor: Bool = false
        /// `false` when the loaded PDF contains no extractable text (scanned image).
        var hasSelectableText: Bool = true

        /// Tracks the selection that was active when the popover was explicitly dismissed,
        /// so re-renders that re-fire the same selection don't flash the popover back.
        var dismissedSelectionText: String?
        /// Range companion to `dismissedSelectionText`.
        var dismissedSelectionRange: TextSelection.SelectionRange?
    }

    /// Actions handled by `DocumentFeature`.
    enum Action {
        /// Begin loading the document at the given URL.
        case openDocument(URL)
        /// Delivers the file size (in bytes) discovered before load completes.
        case loadingFileSizeResult(Int?)
        /// Delivers a successfully loaded `Document` value.
        case documentLoaded(Document)
        /// Delivers a localised error string when document loading fails.
        case documentLoadFailed(String)
        /// Clears the current document from state.
        case closeDocument
        /// Navigates to the given 1-based page number (PDF only).
        case setPage(Int)
        /// Updates the zoom level, clamped to [0.25, 4.0].
        case setZoom(Double)
        /// Dismisses the current error alert.
        case clearError
        /// Fired by a renderer when the text selection changes (or becomes `nil`).
        case selectionChanged(TextSelection?)
        /// Dismisses the selection popover and records the dismissed selection to prevent
        /// re-showing it on the next re-render.
        case dismissPopover
        /// Routes to `AppFeature` to save the current selection as a new note.
        case addNoteFromSelection
        /// Switches the popover to the provocation-style picker.
        case requestProvocationFromSelection
        /// Routes to `AppFeature` to start AI generation with the given prompt ID.
        case generateProvocationFromSelection(promptId: UUID)
        /// Triggers a scroll to the anchor position of a note in the document renderer.
        case scrollToAnchor(page: Int?, start: Int, end: Int, selectedText: String)
        /// Clears the active scroll highlight after a brief delay.
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
                state.popoverMode = .actions
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
                        state.popoverMode = .actions
                        state.showSelectionPopover = !state.isNavigatingToAnchor
                    }
                } else {
                    state.showSelectionPopover = false
                    state.popoverMode = .actions
                }
                return .none

            case .dismissPopover:
                state.showSelectionPopover = false
                state.popoverMode = .actions
                state.dismissedSelectionText = state.currentSelection?.text
                state.dismissedSelectionRange = state.currentSelection?.range
                return .none

            case .addNoteFromSelection:
                state.showSelectionPopover = false
                state.popoverMode = .actions
                state.dismissedSelectionText = state.currentSelection?.text
                state.dismissedSelectionRange = state.currentSelection?.range
                return .none

            case .requestProvocationFromSelection:
                state.popoverMode = .provocationStyles
                state.showSelectionPopover = true
                state.dismissedSelectionText = nil
                state.dismissedSelectionRange = nil
                return .none

            case .generateProvocationFromSelection:
                state.showSelectionPopover = false
                state.popoverMode = .actions
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
