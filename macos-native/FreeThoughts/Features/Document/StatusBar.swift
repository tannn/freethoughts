import SwiftUI
import ComposableArchitecture

struct StatusBar: View {
    let store: StoreOf<DocumentFeature>

    var body: some View {
        HStack {
            if let document = store.document,
               case .pdf = document.content {
                Text("Page \(store.currentPage) of \(store.totalPages)")
                    .monospacedDigit()

                Divider()
                    .frame(height: 12)
            }

            Spacer()

            HStack(spacing: 8) {
                Button {
                    store.send(.setZoom(store.zoomLevel - 0.25))
                } label: {
                    Image(systemName: "minus.magnifyingglass")
                }
                .buttonStyle(.plain)
                .disabled(store.zoomLevel <= 0.25)

                Text("\(Int(store.zoomLevel * 100))%")
                    .monospacedDigit()
                    .frame(width: 45)

                Button {
                    store.send(.setZoom(store.zoomLevel + 0.25))
                } label: {
                    Image(systemName: "plus.magnifyingglass")
                }
                .buttonStyle(.plain)
                .disabled(store.zoomLevel >= 4.0)
            }

            Divider()
                .frame(height: 12)

            if let document = store.document {
                HStack(spacing: 4) {
                    Image(systemName: documentIcon(for: document.type))
                    Text(document.type.displayName)
                }
                .foregroundStyle(.secondary)
            } else {
                Text("Ready")
                    .foregroundStyle(.tertiary)
            }
        }
        .font(.caption)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.bar)
    }

    private func documentIcon(for type: Document.DocumentType) -> String {
        switch type {
        case .pdf: return "doc.fill"
        case .markdown: return "text.alignleft"
        case .plainText: return "doc.plaintext"
        }
    }
}
