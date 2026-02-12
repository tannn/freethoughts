import SwiftUI

struct TabBar: View {
    let tabs: [TabItem]
    let selectedTabID: UUID?
    let onSelect: (UUID) -> Void
    let onClose: (UUID) -> Void

    @State private var hoveredTabID: UUID?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(tabs) { tab in
                    tabButton(for: tab)
                }
            }
        }
        .frame(height: 32)
        .background(.bar)
        .overlay(alignment: .bottom) {
            Divider()
        }
    }

    private func tabButton(for tab: TabItem) -> some View {
        let isSelected = tab.id == selectedTabID
        let isHovered = tab.id == hoveredTabID
        let showClose = isSelected || isHovered

        return Button {
            onSelect(tab.id)
        } label: {
            HStack(spacing: 4) {
                Text(tab.title)
                    .font(.caption)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .frame(maxWidth: 150)

                if showClose {
                    Button {
                        onClose(tab.id)
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(.secondary)
                            .frame(width: 14, height: 14)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                } else {
                    Spacer()
                        .frame(width: 14)
                }
            }
            .padding(.horizontal, 10)
            .frame(height: 32)
            .background(isSelected ? Color.accentColor.opacity(0.12) : Color.clear)
            .overlay(alignment: .trailing) {
                Divider()
                    .frame(height: 16)
            }
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            hoveredTabID = hovering ? tab.id : nil
        }
    }
}
