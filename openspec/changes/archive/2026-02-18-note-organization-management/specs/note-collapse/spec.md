## ADDED Requirements

### Requirement: Per-note collapse toggle
Each note card SHALL display a collapse/expand control that hides or shows the note body (content, AI provocation area) while keeping the excerpt header visible.

#### Scenario: Collapse a note
- **WHEN** the user taps the collapse control on an expanded note
- **THEN** the note body SHALL be hidden, leaving only the excerpt header row visible

#### Scenario: Expand a collapsed note
- **WHEN** the user taps the collapse control on a collapsed note
- **THEN** the note body SHALL be revealed in full

#### Scenario: Collapse state is independent per note
- **WHEN** the user collapses one note
- **THEN** all other notes SHALL remain in their current expanded or collapsed state

### Requirement: Collapsed state resets on notes reload
Collapse state SHALL not persist across document reloads or app restarts.

#### Scenario: Notes reload clears collapse state
- **WHEN** notes are reloaded for a document
- **THEN** all notes SHALL appear expanded regardless of their previous collapse state

### Requirement: Global toggle-all collapse control
The notes sidebar header SHALL include a toggle-all control (icon button) that collapses or expands all notes at once.

#### Scenario: Toggle-all collapses all expanded notes
- **WHEN** at least one note is expanded and the user activates the toggle-all control
- **THEN** all notes SHALL become collapsed

#### Scenario: Toggle-all expands all collapsed notes
- **WHEN** all notes are collapsed and the user activates the toggle-all control
- **THEN** all notes SHALL become expanded

#### Scenario: Toggle-all icon reflects current state
- **WHEN** all notes are collapsed
- **THEN** the toggle-all icon SHALL indicate "expand all" (e.g., chevron.down.2)
- **WHEN** any note is expanded
- **THEN** the toggle-all icon SHALL indicate "collapse all" (e.g., chevron.up.2)

### Requirement: Collapsed note is read-only
A collapsed note SHALL NOT be editable while collapsed.

#### Scenario: Editing cannot be started on a collapsed note
- **WHEN** a note is collapsed
- **THEN** tapping the note body area SHALL have no effect; the edit mode SHALL NOT be entered
