import SwiftUI
import UniformTypeIdentifiers
import ComposableArchitecture

struct ContentView: View {
    @Bindable var store: StoreOf<AppFeature>
    @State private var textSelection: String?
    @State private var isDropTargeted = false
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    @State private var isFileImporterPresented = false

    var body: some View {
        finalView
    }

    private var finalView: some View {
        keyboardShortcutsView
    }

    // macOS virtual key codes
    private enum KeyCode {
        static let o: UInt16 = 31
        static let n: UInt16 = 45
        static let p: UInt16 = 35
        static let w: UInt16 = 13
        static let comma: UInt16 = 43
        static let escape: UInt16 = 53
    }

    private var keyboardShortcutsView: some View {
        filePickerWatcherView
            .onKeyPress(keyCode: KeyCode.o, modifiers: .command) { // Cmd+O: Open file
                store.send(.openFilePicker)
                return true
            }
            .onKeyPress(keyCode: KeyCode.w, modifiers: .command) { // Cmd+W: Close tab
                if store.selectedTabID != nil {
                    store.send(.closeCurrentTab)
                    return true
                }
                return false
            }
            .onKeyPress(keyCode: KeyCode.n, modifiers: [.command, .shift]) { // Cmd+Shift+N: Toggle sidebar
                store.send(.toggleSidebar)
                return true
            }
            .onKeyPress(keyCode: KeyCode.n, modifiers: .command) { // Cmd+N: Add note from selection
                guard let id = store.selectedTabID,
                      store.tabs[id: id]?.document.currentSelection != nil else {
                    return false
                }
                store.send(.tab(.element(id: id, action: .document(.addNoteFromSelection))))
                return true
            }
            .onKeyPress(keyCode: KeyCode.p, modifiers: [.command, .shift]) { // Cmd+Shift+P: Provocation from selection
                guard let id = store.selectedTabID,
                      store.tabs[id: id]?.document.currentSelection != nil else {
                    return false
                }
                store.send(.tab(.element(id: id, action: .document(.requestProvocationFromSelection))))
                return true
            }
            .onKeyPress(keyCode: KeyCode.comma, modifiers: .command) { // Cmd+,: Settings
                store.send(.openSettings)
                return true
            }
            .onKeyPress(keyCode: KeyCode.escape) { // Escape: Dismiss modals
                if store.notes.isCreatingNote {
                    store.send(.notes(.cancelNoteCreation))
                    return true
                } else if store.showSettings {
                    store.send(.closeSettings)
                    return true
                }
                return false
            }
    }

    private var filePickerWatcherView: some View {
        alertView
            .onChange(of: store.showFilePicker) { _, shouldShow in
                if shouldShow {
                    isFileImporterPresented = true
                    store.send(.closeFilePicker)
                }
            }
    }

    private var alertView: some View {
        fileImporterView
            .alert(
                "Unable to Open Document",
                isPresented: Binding(
                    get: {
                        guard let id = store.selectedTabID else { return false }
                        return store.tabs[id: id]?.document.error != nil
                    },
                    set: {
                        if !$0, let id = store.selectedTabID {
                            store.send(.tab(.element(id: id, action: .document(.clearError))))
                        }
                    }
                ),
                presenting: store.selectedTabID.flatMap { id in store.tabs[id: id]?.document.error }
            ) { _ in
                Button("OK") {
                    if let id = store.selectedTabID {
                        store.send(.tab(.element(id: id, action: .document(.clearError))))
                    }
                }
            } message: { error in
                Text(error)
            }
            .alert(
                "AI Error",
                isPresented: Binding(
                    get: { store.provocation.error != nil },
                    set: { if !$0 { store.send(.provocation(.dismissError)) } }
                )
            ) {
                Button("OK") {
                    store.send(.provocation(.dismissError))
                }
            } message: {
                Text(store.provocation.error ?? "")
            }
            .alert(
                "Notes Error",
                isPresented: Binding(
                    get: { store.notes.error != nil },
                    set: { if !$0 { store.send(.notes(.dismissError)) } }
                ),
                presenting: store.notes.error
            ) { _ in
                Button("OK") {
                    store.send(.notes(.dismissError))
                }
            } message: { error in
                Text(error)
            }
    }

    private var fileImporterView: some View {
        sheetView
            .fileImporter(
                isPresented: $isFileImporterPresented,
                allowedContentTypes: [.pdf, .plainText, .text]
            ) { result in
                switch result {
                case .success(let url):
                    store.send(.fileSelected(url))
                case .failure:
                    break
                }
            }
    }

    private var sheetView: some View {
        baseView
            .sheet(isPresented: Binding(
                get: { store.notes.isCreatingNote },
                set: { if !$0 { store.send(.notes(.cancelNoteCreation)) } }
            )) {
                NoteCreationSheet(
                    store: store.scope(state: \.notes, action: \.notes)
                )
            }
            .sheet(isPresented: Binding(
                get: { store.showSettings },
                set: { if !$0 { store.send(.closeSettings) } }
            )) {
                SettingsView(
                    onClose: {
                        store.send(.closeSettings)
                    }
                )
            }
    }

    private var documentTitle: String {
        guard let id = store.selectedTabID else { return "FreeThoughts" }
        return store.tabs[id: id]?.title ?? "FreeThoughts"
    }

    private var baseView: some View {
        mainLayout
            .navigationTitle(documentTitle)
            .frame(minWidth: 800, minHeight: 600)
            .animation(.easeOut(duration: 0.2), value: store.isSidebarCollapsed)
            .onChange(of: store.isSidebarCollapsed) { _, collapsed in
                columnVisibility = collapsed ? .detailOnly : .all
            }
            .onChange(of: store.selectedTabID) { _, _ in
                textSelection = nil
            }
            .onAppear {
                store.send(.onAppear)
            }
            .onDrop(of: [.fileURL], isTargeted: $isDropTargeted) { providers in
                handleDrop(providers)
            }
            .overlay {
                if isDropTargeted {
                    dropOverlay
                }
            }
    }

    private var mainLayout: some View {
        HStack(spacing: 0) {
            if store.isSidebarCollapsed {
                collapsedIndicator
            }

            NavigationSplitView(columnVisibility: $columnVisibility) {
                sidebarView
            } detail: {
                detailView
            }
            .navigationSplitViewStyle(.balanced)
        }
    }

    private var sidebarView: some View {
        NotesSidebar(
            store: store.scope(state: \.notes, action: \.notes),
            provocationStore: store.scope(state: \.provocation, action: \.provocation),
            isGenerating: store.provocation.isGenerating,
            generatingNoteId: store.provocation.pendingRequest?.noteId,
            currentResponse: store.provocation.currentResponse,
            selectedPromptName: selectedPromptName,
            isAIAvailable: store.isAIAvailable,
            aiAvailabilityChecked: store.aiAvailabilityChecked,
            hasSelectableText: store.activeTab?.document.hasSelectableText ?? true,
            onNoteProvocation: { noteId, promptId in
                store.send(.requestNoteProvocation(noteId: noteId, promptId: promptId))
            },
            onCancelGeneration: {
                store.send(.provocation(.clearResponse))
            }
        )
    }

    private var detailView: some View {
        VStack(spacing: 0) {
            if store.selectedTabID != nil {
                activeDocumentView
            } else {
                emptyView
            }

            if !store.tabs.isEmpty {
                StatusBar(
                    tabs: Array(store.tabs),
                    selectedTabID: store.selectedTabID,
                    activeDocument: store.activeTab?.document,
                    onSelectTab: { id in store.send(.selectTab(id)) },
                    onCloseTab: { id in store.send(.closeTab(id)) },
                    onZoom: { zoom in
                        if let id = store.selectedTabID {
                            store.send(.tab(.element(id: id, action: .document(.setZoom(zoom)))))
                        }
                    }
                )
            }
        }
        .frame(minWidth: 500)
        .overlay {
            if store.notes.editingNoteId != nil {
                Color.clear
                    .contentShape(Rectangle())
                    .onTapGesture {
                        if let editingId = store.notes.editingNoteId {
                            store.send(.notes(.updateNoteText(editingId, store.notes.editingDraftText)))
                            store.send(.notes(.stopEditing))
                        }
                    }
            }
        }
        .overlay(alignment: .bottom) {
            if store.provocation.isGenerating,
               store.provocation.pendingRequest?.sourceType == .textSelection {
                ProvocationLoadingView(
                    promptName: selectedPromptName,
                    onCancel: {
                        store.send(.provocation(.clearResponse))
                    }
                )
                .padding(.bottom, 48)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
    }

    private var activeDocumentView: some View {
        ZStack {
            ForEach(store.scope(state: \.tabs, action: \.tab)) { tabStore in
                if tabStore.id == store.selectedTabID {
                    DocumentView(
                        store: tabStore.scope(state: \.document, action: \.document),
                        textSelection: $textSelection,
                        isAIAvailable: store.isAIAvailable,
                        availablePrompts: store.provocation.availablePrompts
                    )
                }
            }
        }
    }

    private var selectedPromptName: String {
        store.provocation.availablePrompts
            .first(where: { $0.id == store.provocation.selectedPromptId })?.name ?? ""
    }

    private func handleDrop(_ providers: [NSItemProvider]) -> Bool {
        guard let provider = providers.first else { return false }

        _ = provider.loadObject(ofClass: URL.self) { url, error in
            guard let url = url, error == nil else { return }
            if Document.DocumentType.from(url: url) != nil {
                DispatchQueue.main.async {
                    store.send(.fileSelected(url))
                }
            }
        }
        return true
    }

    private var dropOverlay: some View {
        ZStack {
            Color.accentColor.opacity(0.1)
            VStack {
                Image(systemName: "arrow.down.doc")
                    .font(.system(size: 48))
                Text("Drop to Open")
                    .font(.title2)
            }
            .foregroundStyle(.tint)
        }
        .ignoresSafeArea()
    }

    private var emptyView: some View {
        VStack(spacing: 20) {
            HStack(spacing: 16) {
                Image(systemName: "doc.fill")
                Image(systemName: "text.alignleft")
                Image(systemName: "doc.plaintext")
            }
            .font(.system(size: 32))
            .foregroundStyle(.tertiary)

            VStack(spacing: 8) {
                Text("Open a Document")
                    .font(.title2)
                    .fontWeight(.medium)

                Text("Drop a file here or use File -> Open")
                    .foregroundStyle(.secondary)
            }

            Text("Supports: PDF, Markdown, Plain Text")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .padding(.top, 8)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var collapsedIndicator: some View {
        VStack {
            Button {
                store.send(.toggleSidebar)
            } label: {
                VStack(spacing: 4) {
                    Image(systemName: "chevron.right")
                    Text("\(store.notes.notes.count)")
                        .font(.caption)
                }
                .padding(.vertical, 8)
                .padding(.horizontal, 4)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            Spacer()
        }
        .frame(width: 30)
        .background(.bar)
    }
}

private struct SettingsView: View {
    let onClose: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Text("Settings")
                .font(.headline)
            Text("Coming soon...")
                .foregroundStyle(.secondary)
            Button("Close") {
                onClose()
            }
        }
        .padding(20)
        .frame(width: 300, height: 200)
    }
}

#Preview {
    ContentView(
        store: Store(initialState: AppFeature.State()) {
            AppFeature()
        }
    )
}
