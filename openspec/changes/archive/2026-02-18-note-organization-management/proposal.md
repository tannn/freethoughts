## Why

Notes in the app lack basic organizational controls, making it difficult to manage large collections. Users need the ability to find, collapse, and remove notes without navigating each one individually.

## What Changes

- Add collapse/expand toggle on individual notes
- Add a "toggle collapse all" control to collapse or expand all notes at once
- Add a search bar to filter the notes list by content or title
- Add a "delete all notes" action with confirmation
- Add multi-select mode to select and delete specific notes

## Capabilities

### New Capabilities
- `note-collapse`: Per-note collapse/expand toggle and a global "toggle all" control to collapse or expand all notes simultaneously
- `note-deletion`: Bulk deletion actions — delete all notes at once (with confirmation) and multi-select mode for deleting a chosen subset of notes
- `note-search`: Search bar that filters the visible notes list in real time by matching note title or content

### Modified Capabilities
<!-- No existing specs require behavioral changes -->

## Impact

- Note list view: new toolbar controls displayed by icons to save space (search bar, toggle-all collapse, delete all, select mode)
- Individual note cells: collapse/expand affordance, selection checkbox in select mode
- TCA reducers/state for notes feature: collapse state per note, search query, selection set
- No external APIs or dependencies affected
