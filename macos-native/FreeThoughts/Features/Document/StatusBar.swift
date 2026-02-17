import SwiftUI
import ComposableArchitecture

struct StatusBar: View {
    let activeDocument: DocumentFeature.State
    let onZoom: (Double) -> Void

    var body: some View {
        HStack(spacing: 0) {
            Spacer(minLength: 0)
            documentInfo(activeDocument)
        }
        .font(.caption)
        .frame(height: 28)
        .background(.bar)
        .overlay(alignment: .top) {
            Divider()
        }
    }

    // MARK: - Document info

    @ViewBuilder
    private func documentInfo(_ doc: DocumentFeature.State) -> some View {
        HStack(spacing: 6) {
            if let document = doc.document,
               case .pdf = document.content {
                Text("Page \(doc.currentPage)/\(doc.totalPages)")
                    .monospacedDigit()
                    .foregroundStyle(.secondary)

                Divider()
                    .frame(height: 12)
            }

            HStack(spacing: 4) {
                Button {
                    onZoom(doc.zoomLevel - 0.25)
                } label: {
                    Image(systemName: "minus.magnifyingglass")
                }
                .buttonStyle(.plain)
                .disabled(doc.zoomLevel <= 0.25)

                Text("\(Int(doc.zoomLevel * 100))%")
                    .monospacedDigit()
                    .frame(width: 36)

                Button {
                    onZoom(doc.zoomLevel + 0.25)
                } label: {
                    Image(systemName: "plus.magnifyingglass")
                }
                .buttonStyle(.plain)
                .disabled(doc.zoomLevel >= 4.0)
            }
            .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 10)
    }
}
