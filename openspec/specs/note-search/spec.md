## ADDED Requirements

### Requirement: Search bar toggle in sidebar header
The notes sidebar header SHALL include a search icon button that shows or hides an inline search field below the header divider.

#### Scenario: Open search bar
- **WHEN** the user activates the search icon button
- **THEN** a text field SHALL appear below the header divider and SHALL receive keyboard focus

#### Scenario: Close search bar
- **WHEN** the user activates the search icon button while the search bar is open
- **THEN** the search field SHALL be hidden, the query SHALL be cleared, and all notes SHALL be shown

### Requirement: Real-time note filtering by search query
While the search bar is open and contains text, the notes list SHALL display only notes whose selected text excerpt or note content contains the query string (case-insensitive).

#### Scenario: Query matches note content
- **WHEN** the user types a string that appears in a note's content field (case-insensitive)
- **THEN** that note SHALL remain visible in the list

#### Scenario: Query matches note excerpt
- **WHEN** the user types a string that appears in a note's selected text excerpt (case-insensitive)
- **THEN** that note SHALL remain visible in the list

#### Scenario: Query matches no notes
- **WHEN** the search query does not match any note's content or excerpt
- **THEN** the notes list SHALL be empty and a "No results" message SHALL be shown

#### Scenario: Empty query shows all notes
- **WHEN** the search field is empty
- **THEN** all notes SHALL be shown regardless of content

### Requirement: Currently-edited note always visible during search
A note that is actively being edited SHALL remain visible in the filtered list regardless of whether it matches the current search query.

#### Scenario: Edited note preserved during search
- **WHEN** a note is in edit mode and the user types a query that would otherwise filter it out
- **THEN** the editing note SHALL remain visible in the list

### Requirement: Search state is cleared when notes reload
The search query SHALL reset to empty when notes are reloaded for a document.

#### Scenario: Notes reload clears search
- **WHEN** notes are reloaded (e.g., document change)
- **THEN** the search bar SHALL close and the query SHALL be empty
