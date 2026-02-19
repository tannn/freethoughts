## 1. TCA State & Actions

- [x] 1.1 Add `collapsedNoteIds: Set<UUID>` to `NotesFeature.State`
- [x] 1.2 Add `searchQuery: String` to `NotesFeature.State`
- [x] 1.3 Add `isSearchBarVisible: Bool` to `NotesFeature.State`
- [x] 1.4 Add `isSelectingForDeletion: Bool` to `NotesFeature.State`
- [x] 1.5 Add `selectedNoteIds: Set<UUID>` to `NotesFeature.State`
- [x] 1.6 Add collapse actions: `toggleCollapseNote(UUID)`, `collapseAll`, `expandAll`
- [x] 1.7 Add search actions: `toggleSearchBar`, `updateSearchQuery(String)`
- [x] 1.8 Add select-mode actions: `enterSelectMode`, `exitSelectMode`, `toggleNoteSelection(UUID)`
- [x] 1.9 Add deletion actions: `requestDeleteAll`, `confirmDeleteAll`, `requestDeleteSelected`, `confirmDeleteSelected`
- [x] 1.10 Clear `collapsedNoteIds` and `searchQuery` in `notesLoaded` reducer case

## 2. Reducer Implementation

- [x] 2.1 Implement `toggleCollapseNote`: insert/remove from `collapsedNoteIds`
- [x] 2.2 Implement `collapseAll`: set `collapsedNoteIds` to all current note IDs
- [x] 2.3 Implement `expandAll`: clear `collapsedNoteIds`
- [x] 2.4 Implement `toggleSearchBar`: flip `isSearchBarVisible`, clear `searchQuery` on close
- [x] 2.5 Implement `updateSearchQuery`: update `searchQuery` in state
- [x] 2.6 Implement `enterSelectMode`: set flag, dispatch `stopEditing` if editing is active
- [x] 2.7 Implement `exitSelectMode`: clear flag and `selectedNoteIds`
- [x] 2.8 Implement `toggleNoteSelection`: insert/remove UUID from `selectedNoteIds`
- [x] 2.9 Implement `confirmDeleteAll`: use `withTaskGroup` to call `notesClient.deleteNote` for all note IDs; send `noteDeleted` per success, aggregate errors
- [x] 2.10 Implement `confirmDeleteSelected`: same pattern as delete-all but limited to `selectedNoteIds`; call `exitSelectMode` on completion

## 3. NoteCard View Updates

- [x] 3.1 Add `isCollapsed: Bool` parameter to `NoteCard`
- [x] 3.2 Add `onToggleCollapse: () -> Void` callback to `NoteCard`
- [x] 3.3 Add collapse chevron button to the note card header `HStack` (right side)
- [x] 3.4 Conditionalize the note body (`contentView`/`editingView`) on `isCollapsed` — hide when collapsed
- [x] 3.5 Add `isSelected: Bool` parameter to `NoteCard`
- [x] 3.6 Add `onToggleSelection: (() -> Void)?` parameter to `NoteCard`; when non-nil, render a checkmark overlay and disable edit interactions

## 4. NotesSidebar Header Controls

- [x] 4.1 Add search icon button (`.labelStyle(.iconOnly)`) to the sidebar header `HStack`; dispatches `toggleSearchBar`
- [x] 4.2 Add toggle-all collapse icon button to header; dispatches `collapseAll` or `expandAll` based on whether any note is expanded; icon reflects current state
- [x] 4.3 Add select-mode icon button to header; dispatches `enterSelectMode` / `exitSelectMode`
- [x] 4.4 Add delete-all icon button to header; dispatches `requestDeleteAll`
- [x] 4.5 Wire confirmation dialog for `requestDeleteAll` → `confirmDeleteAll` / `cancelDeleteNote` (reuse existing dialog pattern)

## 5. Search Bar UI

- [x] 5.1 Add a collapsible search field row below the header `Divider` in `NotesSidebar`, visible when `store.isSearchBarVisible`
- [x] 5.2 Bind search field to `store.searchQuery` via `store.send(.updateSearchQuery(_:))`
- [x] 5.3 Compute `filteredNotes` in `NotesSidebar`: filter `store.notes` by `searchQuery` (case-insensitive match on `selectedText` or `content`); always include `store.editingNoteId` if set
- [x] 5.4 Replace `store.notes` with `filteredNotes` in the `ForEach` in the scroll view
- [x] 5.5 Show a "No results" placeholder when `filteredNotes` is empty and `searchQuery` is non-empty

## 6. Select Mode UI

- [x] 6.1 Pass `isSelected` and `onToggleSelection` to each `NoteCard` when `store.isSelectingForDeletion` is true
- [x] 6.2 Show a "Delete Selected" button in the header when in select mode; disabled when `selectedNoteIds` is empty
- [x] 6.3 Wire "Delete Selected" to `requestDeleteSelected`; add confirmation dialog → `confirmDeleteSelected` / `exitSelectMode`
- [x] 6.4 Show a "Cancel" / done button in the header to exit select mode without deleting

## 7. Verification

- [x] 7.1 Build the project with `xcodebuild` and resolve any compile errors
- [x] 7.2 Manually verify: collapse/expand individual notes and toggle-all
- [x] 7.3 Manually verify: search filters notes in real time; editing note stays visible
- [x] 7.4 Manually verify: delete-all confirmation deletes all notes
- [x] 7.5 Manually verify: select mode — select subset, confirm delete, notes removed, mode exits
