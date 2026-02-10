# Feature Specification: FreeThoughts - Local AI Document Reader

**Feature Branch**: `001-freethoughts-local-ai-document-reader`
**Created**: 2026-02-09
**Status**: Draft
**Input**: Native Mac app for reading, annotating, and augmenting documents with AI, local-first using Apple Foundation Models

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Open and Read a Document (Priority: P1)

A user wants to open a PDF, markdown, or plain text file and read it in a clean, distraction-free native Mac interface.

**Why this priority**: Reading documents is the foundational capability - without it, no other features work. This is the entry point for all user workflows.

**Independent Test**: Can be fully tested by opening any supported file format and scrolling through content. Delivers immediate value as a document reader.

**Acceptance Scenarios**:

1. **Given** the app is running, **When** the user opens a PDF file via File > Open or drag-and-drop, **Then** the document renders correctly with readable text and proper formatting
2. **Given** a markdown file is opened, **When** the user views the document, **Then** markdown is rendered with proper headings, lists, and formatting
3. **Given** a plain text file is opened, **When** the user views the document, **Then** text displays with appropriate font and line spacing
4. **Given** a document is open, **When** the user scrolls or navigates pages, **Then** navigation is smooth and responsive

---

### User Story 2 - Select Text and Create Notes (Priority: P1)

A user wants to select text within a document and write their own notes anchored to that selection. Notes appear in a collapsible sidebar ordered by their position in the document.

**Why this priority**: Annotation is core to the reading experience for research and personal knowledge work. This enables active reading and thought capture.

**Independent Test**: Can be tested by selecting text, creating a note, and verifying it appears in the sidebar at the correct position. Delivers value as a basic annotation tool.

**Acceptance Scenarios**:

1. **Given** a document is open, **When** the user selects text, **Then** an option to create a note appears
2. **Given** text is selected, **When** the user creates a note, **Then** a text input area appears for writing the note
3. **Given** a note is written, **When** the user saves the note, **Then** it appears in the sidebar anchored to the selected text
4. **Given** multiple notes exist, **When** viewing the sidebar, **Then** notes are ordered by their position in the document (top to bottom)
5. **Given** the sidebar contains notes, **When** the user clicks a note, **Then** the document scrolls to show the anchored text
6. **Given** the sidebar is open, **When** the user clicks the collapse control, **Then** the sidebar collapses to maximize reading space

---

### User Story 3 - Get AI Provocations on Selected Text (Priority: P2)

A user wants to select text in a document and receive thought-provoking AI-generated responses using a pre-configured provocation prompt. The AI uses Apple Foundation Models running entirely on-device.

**Why this priority**: This is the first AI-augmented feature, transforming passive reading into active intellectual engagement. Depends on document reading being functional.

**Independent Test**: Can be tested by selecting text, triggering a provocation, and receiving an AI response. Delivers value as an AI reading companion.

**Acceptance Scenarios**:

1. **Given** text is selected in a document, **When** the user requests a provocation, **Then** the system sends the selection plus document context to the on-device AI
2. **Given** an AI provocation is requested, **When** the model processes the request, **Then** a thought-provoking response appears within a reasonable time
3. **Given** multiple provocation prompts are configured, **When** the user requests a provocation, **Then** they can choose which prompt style to use
4. **Given** no internet connection, **When** the user requests a provocation, **Then** the feature works fully offline using Apple Foundation Models

---

### User Story 4 - Get AI Provocations on Notes (Priority: P2)

A user wants to receive AI provocations on their own written notes, using the note content plus surrounding document context to generate thought-provoking responses.

**Why this priority**: Extends AI capabilities to user-generated content, creating a dialogue between the user's thoughts and AI insights. Builds on both note-taking and AI provocation capabilities.

**Independent Test**: Can be tested by creating a note, requesting a provocation on it, and receiving an AI response. Delivers value as an AI thinking partner.

**Acceptance Scenarios**:

1. **Given** a note exists in the sidebar, **When** the user requests a provocation on that note, **Then** the system sends the note content plus anchored text context to the AI
2. **Given** a provocation is requested on a note, **When** the model responds, **Then** the response appears associated with that note
3. **Given** a pre-configured provocation prompt, **When** the user selects it for a note, **Then** the prompt style influences the AI response

---

### Edge Cases

- What happens when the user opens a corrupted or unreadable file? → Display clear error message, do not crash
- What happens when a PDF has no selectable text (scanned image)? → Inform user that text selection is not available for this document
- What happens when the user deletes text that has an anchored note? → Note remains visible in sidebar with indication that anchor is no longer valid
- What happens when Apple Foundation Models are unavailable on the device? → Gracefully disable AI features with clear messaging about system requirements
- What happens when the user opens a very large document (100+ MB)? → Handle gracefully with progressive loading or clear size limitation message
- What happens when provocation generation is interrupted (app closed mid-generation)? → Partial response is discarded, no corrupt state

## Requirements *(mandatory)*

### Functional Requirements

**Document Reading**
- **FR-001**: System MUST open and render PDF files with accurate text and layout
- **FR-002**: System MUST open and render markdown files with proper formatting (headings, lists, emphasis, code blocks)
- **FR-003**: System MUST open and display plain text files with readable formatting
- **FR-004**: System MUST support file opening via File menu, keyboard shortcut, and drag-and-drop
- **FR-005**: System MUST provide smooth scrolling and page navigation within documents

**Text Selection & Notes**
- **FR-006**: Users MUST be able to select text within any supported document type
- **FR-007**: Users MUST be able to create a note anchored to selected text
- **FR-008**: Users MUST be able to edit and delete their notes
- **FR-009**: System MUST display notes in a collapsible sidebar
- **FR-010**: System MUST order notes in the sidebar by their anchor position in the document
- **FR-011**: System MUST persist notes locally so they survive app restarts
- **FR-012**: Users MUST be able to navigate from a note in the sidebar to its anchored text in the document

**AI Provocations**
- **FR-013**: System MUST use Apple Foundation Models for all AI processing (no cloud services)
- **FR-014**: Users MUST be able to request an AI provocation on selected text
- **FR-015**: Users MUST be able to request an AI provocation on any existing note
- **FR-016**: System MUST include relevant document context when generating provocations
- **FR-017**: System MUST support pre-configured provocation prompts that users can select
- **FR-018**: System MUST work fully offline with no internet dependency

**Privacy & Data**
- **FR-019**: System MUST store all user data locally on the device
- **FR-020**: System MUST NOT transmit any document content or user notes to external services

### Key Entities

- **Document**: A readable file (PDF, markdown, or plain text) with content that can be displayed and selected. Has a file path, content, and format type.
- **TextSelection**: A range of text within a document that a user has highlighted. Has start position, end position, and the selected text content.
- **Note**: A user-written annotation anchored to a text selection. Has content, creation timestamp, and reference to its anchor position.
- **Provocation**: An AI-generated response to selected text or a note. Has content, the source prompt used, and reference to what triggered it.
- **ProvocationPrompt**: A pre-configured prompt template that shapes the style/focus of AI responses. Has a name and prompt text.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can open and begin reading a supported document within 3 seconds of file selection
- **SC-002**: Users can create a note on selected text within 2 interactions (select text → create note)
- **SC-003**: AI provocations return a response within 10 seconds on supported hardware
- **SC-004**: The app functions fully offline after initial installation
- **SC-005**: Notes persist correctly across app restarts with 100% reliability
- **SC-006**: Users can navigate from any sidebar note to its anchored text in under 1 second
- **SC-007**: App launches and is ready to open documents within 2 seconds
