## ADDED Requirements

### Requirement: Delete all notes with confirmation
The notes sidebar header SHALL include a delete-all control (icon button) that, after user confirmation, deletes every note associated with the current document.

#### Scenario: Delete all prompts for confirmation
- **WHEN** the user activates the delete-all control
- **THEN** the system SHALL present a confirmation dialog before any deletion occurs

#### Scenario: User confirms delete all
- **WHEN** the user confirms the delete-all dialog
- **THEN** all notes SHALL be deleted and the notes list SHALL become empty

#### Scenario: User cancels delete all
- **WHEN** the user dismisses the delete-all confirmation dialog without confirming
- **THEN** no notes SHALL be deleted

#### Scenario: Partial failure during delete all
- **WHEN** one or more individual deletions fail during a delete-all operation
- **THEN** successfully deleted notes SHALL be removed from the list and the system SHALL surface an error message indicating failure

### Requirement: Multi-select mode for deletion
The notes sidebar SHALL support a select mode in which the user can mark individual notes for deletion.

#### Scenario: Enter select mode
- **WHEN** the user activates the select-mode control in the sidebar header
- **THEN** each note card SHALL display a selection indicator (checkbox/checkmark) and editing SHALL be disabled for all notes

#### Scenario: Select a note
- **WHEN** the user taps a note card while in select mode
- **THEN** that note SHALL become selected, indicated visually on the card

#### Scenario: Deselect a note
- **WHEN** the user taps a selected note card while in select mode
- **THEN** that note SHALL become deselected

#### Scenario: Delete selected notes
- **WHEN** at least one note is selected and the user activates "Delete Selected"
- **THEN** a confirmation dialog SHALL appear before deletion

#### Scenario: User confirms delete selected
- **WHEN** the user confirms deletion of selected notes
- **THEN** all selected notes SHALL be deleted, select mode SHALL exit, and the selection SHALL be cleared

#### Scenario: Delete Selected is disabled with no selection
- **WHEN** the user is in select mode and no notes are selected
- **THEN** the "Delete Selected" control SHALL be disabled

#### Scenario: Exit select mode without deleting
- **WHEN** the user activates a cancel/done control while in select mode
- **THEN** select mode SHALL exit, all selections SHALL be cleared, and no notes SHALL be deleted

### Requirement: Select mode and editing are mutually exclusive
Entering select mode SHALL stop any active note editing.

#### Scenario: Edit state cleared on entering select mode
- **WHEN** a note is being edited and the user enters select mode
- **THEN** editing SHALL stop (discarding or saving per existing stopEditing behavior) before select mode activates
