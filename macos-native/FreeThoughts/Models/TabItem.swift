import ComposableArchitecture
import Foundation

@ObservableState
struct TabItem: Equatable, Identifiable {
    let id: UUID
    var document: DocumentFeature.State
    var title: String

    init(id: UUID = UUID(), document: DocumentFeature.State = .init(), title: String = "New Tab") {
        self.id = id
        self.document = document
        self.title = title
    }
}
