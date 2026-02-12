import SwiftUI
import ComposableArchitecture

struct StatusBar: View {
    let tabs: [TabItem]
    let selectedTabID: UUID?
    let activeDocument: DocumentFeature.State?
    let onSelectTab: (UUID) -> Void
    let onCloseTab: (UUID) -> Void
    let onZoom: (Double) -> Void

    @State private var hoveredTabID: UUID?

    var body: some View {
        HStack(spacing: 0) {
            tabStrip
            Spacer(minLength: 0)
            if let doc = activeDocument {
                documentInfo(doc)
            }
        }
        .font(.caption)
        .frame(height: 28)
        .background(.bar)
        .overlay(alignment: .top) {
            Divider()
        }
    }

    // MARK: - Tabs

    private var tabStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(tabs) { tab in
                    tabButton(for: tab)
                }
            }
        }
    }

    private func tabButton(for tab: TabItem) -> some View {
        let isSelected = tab.id == selectedTabID
        let isHovered = tab.id == hoveredTabID
        let showClose = (isSelected || isHovered) && tabs.count > 1

        return Button {
            onSelectTab(tab.id)
        } label: {
            HStack(spacing: 4) {
                if let doc = tab.document.document {
                    Image(systemName: documentIcon(for: doc.type))
                        .foregroundStyle(.secondary)
                        .font(.system(size: 9))
                }

                Text(tab.title)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .frame(maxWidth: 140)

                if showClose {
                    Button {
                        onCloseTab(tab.id)
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(.tertiary)
                            .frame(width: 14, height: 14)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                } else {
                    Spacer()
                        .frame(width: 14)
                }
            }
            .padding(.horizontal, 8)
            .frame(height: 28)
            .background(isSelected ? Color.accentColor.opacity(0.1) : Color.clear)
            .overlay(alignment: .trailing) {
                Divider()
                    .frame(height: 14)
            }
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            hoveredTabID = hovering ? tab.id : nil
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

    private func documentIcon(for type: Document.DocumentType) -> String {
        switch type {
        case .pdf: return "doc.fill"
        case .markdown: return "text.alignleft"
        case .plainText: return "doc.plaintext"
        }
    }
}
