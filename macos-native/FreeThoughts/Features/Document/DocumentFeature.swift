import ComposableArchitecture
import Foundation

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
    }

    enum Action {
        case openDocument(URL)
        case documentLoaded(Document)
        case documentLoadFailed(String)
        case closeDocument
        case setPage(Int)
        case setZoom(Double)
        case clearError
    }

    @Dependency(\.documentClient) var documentClient

    var body: some ReducerOf<Self> {
        Reduce { state, action in
            switch action {
            case .openDocument(let url):
                state.isLoading = true
                state.error = nil
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
            }
        }
    }
}
