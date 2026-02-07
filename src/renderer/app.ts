import { NoteAutosaveController } from '../reader/autosave.js';
import { getDesktopApi } from './desktopApi.js';

type ProvocationStyle = 'skeptical' | 'creative' | 'methodological';
type RightPaneTab = 'notes' | 'provocation';
type CenterView = 'section' | 'unassigned';
type AuthMode = 'api_key' | 'codex_subscription';
type AuthSessionStatus = 'signed_out' | 'pending' | 'authenticated' | 'expired' | 'invalid' | 'cancelled';

type SourceFileStatus =
  | {
      status: 'available';
      message: 'Source file available';
      actions: [];
    }
  | {
      status: 'missing';
      message: 'Source file not found at original path.';
      actions: ['Locate file', 'Re-import'];
    };

interface WorkspaceRecord {
  id: string;
  rootPath: string;
  cloudWarningAcknowledgedAt: string | null;
}

interface DocumentSummary {
  id: string;
  workspaceId: string;
  title: string;
  sourcePath: string;
  fileType: 'pdf' | 'txt' | 'md' | 'unknown';
  currentRevisionId: string | null;
  sectionCount: number;
  unassignedCount: number;
  provocationsEnabled: boolean;
  sourceFileStatus: SourceFileStatus;
  createdAt: string;
  updatedAt: string;
}

interface SectionListItem {
  id: string;
  heading: string;
  orderIndex: number;
  anchorKey: string;
}

interface UnassignedNoteItem {
  noteId: string;
  content: string;
  previousSectionId: string | null;
  previousAnchorKey: string | null;
  previousHeading: string | null;
  queuedAt: string;
}

interface NoteRecord {
  id: string;
  documentId: string;
  sectionId: string | null;
  content: string;
  paragraphOrdinal: number | null;
  startOffset: number | null;
  endOffset: number | null;
  selectedTextExcerpt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface NoteSelectionAnchor {
  paragraphOrdinal: number;
  startOffset: number;
  endOffset: number;
  selectedTextExcerpt: string;
}

interface ProvocationRecord {
  id: string;
  documentId: string;
  sectionId: string;
  revisionId: string;
  requestId: string;
  style: ProvocationStyle;
  outputText: string;
  isActive: boolean;
  createdAt: string;
}

interface AiAvailability {
  enabled: boolean;
  reason: 'ok' | 'offline' | 'provocations-disabled' | 'auth-unavailable';
  message: string;
}

interface AuthStatusSnapshot {
  mode: AuthMode;
  codex: {
    provider: 'codex_chatgpt';
    available: boolean;
    status: AuthSessionStatus;
    accountLabel: string | null;
    lastValidatedAt: string | null;
  };
}

interface WorkspaceSnapshot {
  workspace: WorkspaceRecord;
  documents: DocumentSummary[];
}

interface SectionListSnapshot {
  document: DocumentSummary;
  sections: SectionListItem[];
  unassignedNotes: UnassignedNoteItem[];
}

interface SectionSnapshot {
  document: DocumentSummary;
  section: {
    id: string;
    documentId: string;
    heading: string;
    content: string;
    orderIndex: number;
    anchorKey: string;
  };
  notes: NoteRecord[];
  activeProvocation: ProvocationRecord | null;
  provocations: ProvocationRecord[];
  aiAvailability: AiAvailability;
  sourceFileStatus: SourceFileStatus;
}

interface DocumentSnapshot {
  document: DocumentSummary;
  sections: SectionListItem[];
  unassignedNotes: UnassignedNoteItem[];
  firstSectionId: string | null;
  sourceFileStatus: SourceFileStatus;
}

interface SettingsSnapshot {
  generationModel: string;
  defaultProvocationStyle: ProvocationStyle;
  apiKeyConfigured: boolean;
  auth: AuthStatusSnapshot;
  documentSettings?: {
    documentId: string;
    provocationsEnabled: boolean;
  };
}

interface NetworkStatus {
  online: boolean;
  checkedAt: string;
}

type ErrorEnvelope = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type SuccessEnvelope<T> = {
  ok: true;
  data: T;
};

type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

class EnvelopeError extends Error {
  readonly code: string;

  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(`${code}: ${message}`);
    this.code = code;
    this.details = details;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object';

const fail = (message: string): never => {
  throw new Error(message);
};

const required = <T>(value: T | null, name: string): T => value ?? fail(`Missing DOM node: ${name}`);

const unwrapEnvelope = <T>(envelope: Envelope<T>): T => {
  if (envelope.ok) {
    return envelope.data;
  }

  throw new EnvelopeError(envelope.error.code, envelope.error.message, envelope.error.details);
};

const requestId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `req-${crypto.randomUUID()}`;
  }

  return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const toFileUrl = (sourcePath: string): string => {
  if (sourcePath.startsWith('file://')) {
    return sourcePath;
  }

  const url = new URL('file:///');
  url.pathname = sourcePath;
  return url.toString();
};

const normalizeSectionText = (text: string): string => text.replace(/\r\n/g, '\n');

const countParagraphOrdinal = (text: string, startOffset: number): number => {
  if (startOffset <= 0) {
    return 0;
  }
  const matches = text.slice(0, startOffset).match(/\n{2,}/g);
  return matches ? matches.length : 0;
};

const computeSelectionAnchor = (container: HTMLElement): NoteSelectionAnchor | null => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) {
    return null;
  }

  const normalizedText = normalizeSectionText(container.textContent ?? '');
  const containerRange = document.createRange();
  containerRange.selectNodeContents(container);

  const startRange = containerRange.cloneRange();
  startRange.setEnd(range.startContainer, range.startOffset);
  const endRange = containerRange.cloneRange();
  endRange.setEnd(range.endContainer, range.endOffset);

  const startOffset = startRange.toString().length;
  const endOffset = endRange.toString().length;
  const selectedTextExcerpt = selection.toString().trim();

  if (!selectedTextExcerpt) {
    return null;
  }

  return {
    paragraphOrdinal: countParagraphOrdinal(normalizedText, startOffset),
    startOffset: Math.min(startOffset, endOffset),
    endOffset: Math.max(startOffset, endOffset),
    selectedTextExcerpt
  };
};

const desktopApi = getDesktopApi(window as unknown as Record<string, unknown>);

const elements = {
  workspaceScreen: required(document.querySelector<HTMLElement>('#workspace-screen'), 'workspace-screen'),
  appScreen: required(document.querySelector<HTMLElement>('#app-screen'), 'app-screen'),
  openWorkspaceButton: required(
    document.querySelector<HTMLButtonElement>('#open-workspace-button'),
    'open-workspace-button'
  ),
  createWorkspaceButton: required(
    document.querySelector<HTMLButtonElement>('#create-workspace-button'),
    'create-workspace-button'
  ),
  workspaceMessage: required(document.querySelector<HTMLParagraphElement>('#workspace-message'), 'workspace-message'),
  topWorkspacePath: required(document.querySelector<HTMLElement>('#top-workspace-path'), 'top-workspace-path'),
  topDocumentTitle: required(document.querySelector<HTMLElement>('#top-document-title'), 'top-document-title'),
  topUnassignedCount: required(
    document.querySelector<HTMLElement>('#top-unassigned-count'),
    'top-unassigned-count'
  ),
  refreshNetworkButton: required(
    document.querySelector<HTMLButtonElement>('#refresh-network-button'),
    'refresh-network-button'
  ),
  importForm: required(document.querySelector<HTMLFormElement>('#import-form'), 'import-form'),
  importMessage: required(document.querySelector<HTMLParagraphElement>('#import-message'), 'import-message'),
  documentList: required(document.querySelector<HTMLUListElement>('#document-list'), 'document-list'),
  sectionList: required(document.querySelector<HTMLUListElement>('#section-list'), 'section-list'),
  unassignedNavButton: required(
    document.querySelector<HTMLButtonElement>('#unassigned-nav-button'),
    'unassigned-nav-button'
  ),
  sectionView: required(document.querySelector<HTMLElement>('#section-view'), 'section-view'),
  unassignedView: required(document.querySelector<HTMLElement>('#unassigned-view'), 'unassigned-view'),
  sectionHeading: required(document.querySelector<HTMLElement>('#section-heading'), 'section-heading'),
  pdfSurface: required(document.querySelector<HTMLDivElement>('#pdf-surface'), 'pdf-surface'),
  pdfFrame: required(document.querySelector<HTMLIFrameElement>('#pdf-frame'), 'pdf-frame'),
  pdfFallback: required(document.querySelector<HTMLDivElement>('#pdf-fallback'), 'pdf-fallback'),
  sectionContent: required(document.querySelector<HTMLPreElement>('#section-content'), 'section-content'),
  reimportButton: required(document.querySelector<HTMLButtonElement>('#reimport-button'), 'reimport-button'),
  unassignedSummary: required(
    document.querySelector<HTMLParagraphElement>('#unassigned-summary'),
    'unassigned-summary'
  ),
  unassignedList: required(document.querySelector<HTMLDivElement>('#unassigned-list'), 'unassigned-list'),
  notesTabButton: required(document.querySelector<HTMLButtonElement>('#notes-tab-button'), 'notes-tab-button'),
  provocationTabButton: required(
    document.querySelector<HTMLButtonElement>('#provocation-tab-button'),
    'provocation-tab-button'
  ),
  notesTab: required(document.querySelector<HTMLDivElement>('#notes-tab'), 'notes-tab'),
  provocationTab: required(document.querySelector<HTMLDivElement>('#provocation-tab'), 'provocation-tab'),
  newNoteButton: required(document.querySelector<HTMLButtonElement>('#new-note-button'), 'new-note-button'),
  notesList: required(document.querySelector<HTMLDivElement>('#notes-list'), 'notes-list'),
  provocationsEnabledInput: required(
    document.querySelector<HTMLInputElement>('#provocations-enabled-input'),
    'provocations-enabled-input'
  ),
  provocationStyleOverrideInput: required(
    document.querySelector<HTMLSelectElement>('#provocation-style-override-input'),
    'provocation-style-override-input'
  ),
  provocationTarget: required(document.querySelector<HTMLParagraphElement>('#provocation-target'), 'provocation-target'),
  generateProvocationButton: required(
    document.querySelector<HTMLButtonElement>('#generate-provocation-button'),
    'generate-provocation-button'
  ),
  regenerateProvocationButton: required(
    document.querySelector<HTMLButtonElement>('#regenerate-provocation-button'),
    'regenerate-provocation-button'
  ),
  dismissProvocationButton: required(
    document.querySelector<HTMLButtonElement>('#dismiss-provocation-button'),
    'dismiss-provocation-button'
  ),
  cancelAiButton: required(document.querySelector<HTMLButtonElement>('#cancel-ai-button'), 'cancel-ai-button'),
  provocationMessage: required(
    document.querySelector<HTMLParagraphElement>('#provocation-message'),
    'provocation-message'
  ),
  provocationOutput: required(document.querySelector<HTMLPreElement>('#provocation-output'), 'provocation-output'),
  settingsForm: required(document.querySelector<HTMLFormElement>('#settings-form'), 'settings-form'),
  authModeInput: required(document.querySelector<HTMLSelectElement>('#auth-mode-input'), 'auth-mode-input'),
  authStatusMessage: required(
    document.querySelector<HTMLParagraphElement>('#auth-status-message'),
    'auth-status-message'
  ),
  authGuidance: required(document.querySelector<HTMLParagraphElement>('#auth-guidance'), 'auth-guidance'),
  authCorrelationStateInput: required(
    document.querySelector<HTMLInputElement>('#auth-correlation-state-input'),
    'auth-correlation-state-input'
  ),
  authLoginStartButton: required(
    document.querySelector<HTMLButtonElement>('#auth-login-start-button'),
    'auth-login-start-button'
  ),
  authLoginCompleteButton: required(
    document.querySelector<HTMLButtonElement>('#auth-login-complete-button'),
    'auth-login-complete-button'
  ),
  authLogoutButton: required(
    document.querySelector<HTMLButtonElement>('#auth-logout-button'),
    'auth-logout-button'
  ),
  generationModelInput: required(
    document.querySelector<HTMLInputElement>('#generation-model-input'),
    'generation-model-input'
  ),
  defaultStyleInput: required(document.querySelector<HTMLSelectElement>('#default-style-input'), 'default-style-input'),
  apiKeyInput: required(document.querySelector<HTMLInputElement>('#api-key-input'), 'api-key-input'),
  clearApiKeyInput: required(
    document.querySelector<HTMLInputElement>('#clear-api-key-input'),
    'clear-api-key-input'
  ),
  settingsMessage: required(document.querySelector<HTMLParagraphElement>('#settings-message'), 'settings-message'),
  networkStatus: required(document.querySelector<HTMLElement>('#network-status'), 'network-status'),
  sourceStatus: required(document.querySelector<HTMLElement>('#source-status'), 'source-status'),
  aiStatus: required(document.querySelector<HTMLElement>('#ai-status'), 'ai-status'),
  sourceActions: required(document.querySelector<HTMLElement>('#source-actions'), 'source-actions'),
  reassignmentModal: required(document.querySelector<HTMLElement>('#reassignment-modal'), 'reassignment-modal'),
  reassignmentCount: required(
    document.querySelector<HTMLParagraphElement>('#reassignment-count'),
    'reassignment-count'
  ),
  reassignmentNote: required(document.querySelector<HTMLParagraphElement>('#reassignment-note'), 'reassignment-note'),
  reassignmentOldSection: required(
    document.querySelector<HTMLParagraphElement>('#reassignment-old-section'),
    'reassignment-old-section'
  ),
  reassignmentSectionSelect: required(
    document.querySelector<HTMLSelectElement>('#reassignment-section-select'),
    'reassignment-section-select'
  ),
  reassignmentAssignButton: required(
    document.querySelector<HTMLButtonElement>('#reassignment-assign-button'),
    'reassignment-assign-button'
  ),
  reassignmentSkipButton: required(
    document.querySelector<HTMLButtonElement>('#reassignment-skip-button'),
    'reassignment-skip-button'
  ),
  messageLog: required(document.querySelector<HTMLPreElement>('#message-log'), 'message-log')
};

const state = {
  workspace: null as WorkspaceRecord | null,
  documents: [] as DocumentSummary[],
  activeDocumentId: null as string | null,
  sections: [] as SectionListItem[],
  unassignedNotes: [] as UnassignedNoteItem[],
  activeSection: null as SectionSnapshot | null,
  selectedTabByDocument: new Map<string, RightPaneTab>(),
  centerViewByDocument: new Map<string, CenterView>(),
  activeSectionByDocument: new Map<string, string | null>(),
  selectedNoteId: null as string | null,
  settings: null as SettingsSnapshot | null,
  authCorrelationState: '' as string,
  authGuidanceOverride: null as string | null,
  networkStatus: null as NetworkStatus | null,
  activeProvocationRequestId: null as string | null,
  reassignmentQueue: [] as UnassignedNoteItem[],
  selectionAnchor: null as NoteSelectionAnchor | null
};

const autosave = new NoteAutosaveController(async (noteId, content) => {
  const envelope = (await desktopApi.note.update({ noteId, text: content })) as Envelope<NoteRecord>;
  unwrapEnvelope(envelope);
  appendLog(`Autosaved note ${noteId}.`);
});

const appendLog = (line: string): void => {
  const timestamp = new Date().toISOString();
  elements.messageLog.textContent = `${timestamp} ${line}\n${elements.messageLog.textContent ?? ''}`.trimEnd();
};

const getActiveDocument = (): DocumentSummary | null =>
  state.activeDocumentId ? state.documents.find((document) => document.id === state.activeDocumentId) ?? null : null;

const getActiveTab = (): RightPaneTab => {
  if (!state.activeDocumentId) {
    return 'notes';
  }

  return state.selectedTabByDocument.get(state.activeDocumentId) ?? 'notes';
};

const setActiveTab = (tab: RightPaneTab): void => {
  if (!state.activeDocumentId) {
    return;
  }

  state.selectedTabByDocument.set(state.activeDocumentId, tab);
  renderTabs();
};

const getCenterView = (): CenterView => {
  if (!state.activeDocumentId) {
    return 'section';
  }

  return state.centerViewByDocument.get(state.activeDocumentId) ?? 'section';
};

const setCenterView = (view: CenterView): void => {
  if (!state.activeDocumentId) {
    return;
  }

  state.centerViewByDocument.set(state.activeDocumentId, view);
  renderCenterView();
};

const upsertDocument = (document: DocumentSummary): void => {
  const existingIndex = state.documents.findIndex((candidate) => candidate.id === document.id);
  if (existingIndex === -1) {
    state.documents.push(document);
  } else {
    state.documents.splice(existingIndex, 1, document);
  }

  state.documents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

const updateTopBar = (): void => {
  elements.topWorkspacePath.textContent = state.workspace?.rootPath ?? '-';
  const activeDocument = getActiveDocument();
  elements.topDocumentTitle.textContent = activeDocument?.title ?? '-';
  elements.topUnassignedCount.textContent = `Unassigned Notes (${state.unassignedNotes.length})`;
  elements.unassignedNavButton.textContent = `Unassigned Notes (${state.unassignedNotes.length})`;
};

const renderWorkspaceMode = (workspaceOpen: boolean): void => {
  elements.workspaceScreen.classList.toggle('hidden', workspaceOpen);
  elements.appScreen.classList.toggle('hidden', !workspaceOpen);
};

const renderDocuments = (): void => {
  elements.documentList.replaceChildren();

  for (const doc of state.documents) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-item-button';
    if (doc.id === state.activeDocumentId) {
      button.classList.add('active');
    }

    button.textContent =
      doc.unassignedCount > 0 ? `${doc.title} (${doc.unassignedCount} unassigned)` : doc.title;

    button.addEventListener('click', () => {
      void openDocument(doc.id);
    });

    item.append(button);
    elements.documentList.append(item);
  }
};

const renderSections = (): void => {
  elements.sectionList.replaceChildren();

  for (const section of state.sections) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'nav-item-button';
    if (section.id === state.activeSection?.section.id) {
      button.classList.add('active');
    }

    button.textContent = `${section.orderIndex + 1}. ${section.heading}`;
    button.addEventListener('click', () => {
      void openSection(section.id);
    });

    item.append(button);
    elements.sectionList.append(item);
  }
};

const renderSectionView = (): void => {
  if (!state.activeSection) {
    elements.sectionHeading.textContent = 'No section selected';
    elements.sectionContent.textContent = 'Import a document to begin.';
    elements.sectionContent.classList.remove('hidden');
    elements.pdfSurface.classList.add('hidden');
    elements.pdfFallback.classList.add('hidden');
    elements.pdfFrame.removeAttribute('src');
    state.selectionAnchor = null;
    return;
  }

  elements.sectionHeading.textContent = state.activeSection.section.heading;
  elements.sectionContent.textContent = state.activeSection.section.content;

  const isPdf = state.activeSection.document.fileType === 'pdf';
  const pdfAvailable = isPdf && state.activeSection.sourceFileStatus.status === 'available';
  elements.pdfSurface.classList.toggle('hidden', !pdfAvailable);
  elements.pdfFallback.classList.toggle('hidden', !isPdf || pdfAvailable);
  elements.sectionContent.classList.toggle('hidden', pdfAvailable);

  if (pdfAvailable) {
    const nextSrc = toFileUrl(state.activeSection.document.sourcePath);
    if (elements.pdfFrame.src !== nextSrc) {
      elements.pdfFrame.src = nextSrc;
    }
    state.selectionAnchor = null;
  } else {
    elements.pdfFrame.removeAttribute('src');
  }
};

const updateSelectionAnchor = (): void => {
  if (!state.activeSection) {
    state.selectionAnchor = null;
    return;
  }

  state.selectionAnchor = computeSelectionAnchor(elements.sectionContent);
};

const assignUnassigned = async (noteId: string, targetSectionId: string): Promise<void> => {
  const envelope = (await desktopApi.note.reassign({ noteId, targetSectionId })) as Envelope<{
    noteId: string;
    targetSectionId: string;
    unassignedNotes: UnassignedNoteItem[];
  }>;
  unwrapEnvelope(envelope);

  await refreshActiveDocumentLists();
  if (state.activeSection) {
    await openSection(state.activeSection.section.id, { preserveView: true });
  }
};

const renderUnassignedView = (): void => {
  elements.unassignedList.replaceChildren();

  if (state.unassignedNotes.length === 0) {
    elements.unassignedSummary.textContent = 'No unassigned notes.';
    return;
  }

  elements.unassignedSummary.textContent = `${state.unassignedNotes.length} notes require reassignment.`;

  for (const item of state.unassignedNotes) {
    const card = document.createElement('article');
    card.className = 'unassigned-card';

    const noteContent = document.createElement('p');
    noteContent.textContent = item.content;
    card.append(noteContent);

    const oldSection = document.createElement('p');
    oldSection.className = 'hint';
    oldSection.textContent = `Old section: ${item.previousHeading ?? 'Unknown section'}`;
    card.append(oldSection);

    const select = document.createElement('select');
    for (const section of state.sections) {
      const option = document.createElement('option');
      option.value = section.id;
      option.textContent = section.heading;
      select.append(option);
    }
    card.append(select);

    const actions = document.createElement('div');
    actions.className = 'unassigned-actions';

    const assignButton = document.createElement('button');
    assignButton.type = 'button';
    assignButton.textContent = 'Assign';
    assignButton.addEventListener('click', () => {
      if (!select.value) {
        return;
      }

      void withUiErrorHandling(async () => {
        await assignUnassigned(item.noteId, select.value);
      });
    });
    actions.append(assignButton);

    card.append(actions);
    elements.unassignedList.append(card);
  }
};

const renderCenterView = (): void => {
  const view = getCenterView();
  elements.sectionView.classList.toggle('hidden', view !== 'section');
  elements.unassignedView.classList.toggle('hidden', view !== 'unassigned');
};

const renderTabs = (): void => {
  const activeTab = getActiveTab();
  elements.notesTabButton.classList.toggle('active', activeTab === 'notes');
  elements.provocationTabButton.classList.toggle('active', activeTab === 'provocation');
  elements.notesTab.classList.toggle('hidden', activeTab !== 'notes');
  elements.provocationTab.classList.toggle('hidden', activeTab !== 'provocation');
};

const syncSelectedNoteCard = (): void => {
  const currentSelected = elements.notesList.querySelector<HTMLElement>('.note-card.selected');
  if (currentSelected && currentSelected.dataset.noteId !== state.selectedNoteId) {
    currentSelected.classList.remove('selected');
  }

  if (!state.selectedNoteId) {
    return;
  }

  const nextSelected = elements.notesList.querySelector<HTMLElement>(
    `article.note-card[data-note-id="${state.selectedNoteId}"]`
  );
  if (nextSelected) {
    nextSelected.classList.add('selected');
  }
};

const renderNotes = (): void => {
  elements.notesList.replaceChildren();

  if (!state.activeSection) {
    return;
  }

  for (const note of state.activeSection.notes) {
    const card = document.createElement('article');
    card.className = 'note-card';
    card.dataset.noteId = note.id;
    if (note.id === state.selectedNoteId) {
      card.classList.add('selected');
    }

    const textarea = document.createElement('textarea');
    textarea.className = 'note-text';
    textarea.value = note.content;
    textarea.placeholder = 'Write note...';

    textarea.addEventListener('focus', () => {
      if (state.selectedNoteId === note.id) {
        return;
      }
      state.selectedNoteId = note.id;
      syncSelectedNoteCard();
      renderProvocation();
    });

    textarea.addEventListener('input', () => {
      autosave.queue(note.id, textarea.value);
    });

    textarea.addEventListener('blur', () => {
      void autosave.onBlur(note.id);
    });

    card.append(textarea);

    const actions = document.createElement('div');
    actions.className = 'note-actions';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'secondary';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => {
      void withUiErrorHandling(async () => {
        const envelope = (await desktopApi.note.delete({ noteId: note.id })) as Envelope<{ noteId: string }>;
        unwrapEnvelope(envelope);
        if (state.activeSection) {
          await openSection(state.activeSection.section.id, { preserveView: true });
        }
      });
    });

    actions.append(deleteButton);
    card.append(actions);
    elements.notesList.append(card);
  }
};

const getAuthGuidance = (auth: AuthStatusSnapshot | null): string => {
  if (!auth) {
    return '';
  }

  if (auth.mode === 'api_key') {
    return 'Using OpenAI API key mode.';
  }

  if (!auth.codex.available) {
    return 'Codex App Server runtime unavailable or inaccessible. Switch to API key mode.';
  }

  if (auth.codex.status === 'cancelled') {
    return 'Codex login cancelled. Retry login or switch to API key mode.';
  }

  if (auth.codex.status === 'expired') {
    return 'Codex session expired. Sign in again or switch to API key mode.';
  }

  if (auth.codex.status === 'invalid') {
    return 'Codex session invalid. Sign in again or switch to API key mode.';
  }

  if (auth.codex.status === 'pending') {
    return 'Complete sign-in in browser, then click "Complete Sign-In".';
  }

  if (auth.codex.status === 'signed_out') {
    return 'Sign in to Codex or switch to API key mode.';
  }

  return '';
};

const authGuidanceFromError = (error: EnvelopeError): string => {
  if (!isRecord(error.details)) {
    return '';
  }

  const authStatus = typeof error.details.authStatus === 'string' ? error.details.authStatus : null;
  if (authStatus === 'cancelled') {
    return 'Codex login cancelled. Retry login or switch to API key mode.';
  }
  if (authStatus === 'expired' || authStatus === 'invalid') {
    return 'Codex session expired or invalid. Sign in again or switch to API key mode.';
  }

  if (typeof error.details.action === 'string' && error.details.action === 'switch_to_api_key') {
    const reason = typeof error.details.reason === 'string' ? error.details.reason : '';
    if (reason === 'permission_denied') {
      return 'Codex login lacks required generation permission. Switch to API key mode.';
    }
    return 'Codex App Server runtime unavailable or inaccessible. Switch to API key mode.';
  }

  return '';
};

const renderAuthSettings = (): void => {
  const auth = state.settings?.auth ?? null;
  if (!auth) {
    elements.authStatusMessage.textContent = 'Auth status: unknown';
    elements.authGuidance.textContent = state.authGuidanceOverride ?? '';
    elements.authLoginStartButton.disabled = true;
    elements.authLoginCompleteButton.disabled = true;
    elements.authLogoutButton.disabled = true;
    return;
  }

  elements.authModeInput.value = auth.mode;
  elements.authCorrelationStateInput.value = state.authCorrelationState;

  if (auth.mode === 'api_key') {
    elements.authCorrelationStateInput.disabled = true;
    elements.apiKeyInput.disabled = false;
    elements.clearApiKeyInput.disabled = false;
    elements.authStatusMessage.textContent = `Auth status: API key mode (${state.settings?.apiKeyConfigured ? 'configured' : 'missing key'})`;
    elements.authLoginStartButton.disabled = true;
    elements.authLoginCompleteButton.disabled = true;
    elements.authLogoutButton.disabled = true;
  } else {
    elements.authCorrelationStateInput.disabled = false;
    elements.apiKeyInput.disabled = true;
    elements.clearApiKeyInput.disabled = true;
    const accountLabel = auth.codex.accountLabel ? ` (${auth.codex.accountLabel})` : '';
    elements.authStatusMessage.textContent = `Auth status: Codex ${auth.codex.status}${accountLabel}`;
    elements.authLoginStartButton.disabled = !auth.codex.available;
    elements.authLoginCompleteButton.disabled =
      !auth.codex.available || elements.authCorrelationStateInput.value.trim().length === 0;
    elements.authLogoutButton.disabled = !auth.codex.available || auth.codex.status === 'signed_out';
  }

  elements.authGuidance.textContent = state.authGuidanceOverride ?? getAuthGuidance(auth);
};

const deriveAiAvailability = (): AiAvailability => {
  const activeDocument = getActiveDocument();
  const online =
    state.networkStatus?.online ??
    (state.activeSection ? state.activeSection.aiAvailability.reason !== 'offline' : true);
  const provocationsEnabled = activeDocument?.provocationsEnabled ?? true;
  const auth = state.settings?.auth ?? null;

  if (!online) {
    return {
      enabled: false,
      reason: 'offline',
      message: 'AI actions disabled while offline.'
    };
  }

  if (!provocationsEnabled) {
    return {
      enabled: false,
      reason: 'provocations-disabled',
      message: 'Provocations are disabled for this document.'
    };
  }

  if (!auth) {
    return {
      enabled: false,
      reason: 'auth-unavailable',
      message: 'Auth status unavailable.'
    };
  }

  if (auth.mode === 'api_key' && !state.settings?.apiKeyConfigured) {
    return {
      enabled: false,
      reason: 'auth-unavailable',
      message: 'OpenAI API key required in API key mode.'
    };
  }

  if (auth.mode === 'codex_subscription') {
    if (!auth.codex.available) {
      return {
        enabled: false,
        reason: 'auth-unavailable',
        message: 'Codex App Server runtime unavailable or inaccessible. Switch to API key mode.'
      };
    }

    if (auth.codex.status !== 'authenticated') {
      return {
        enabled: false,
        reason: 'auth-unavailable',
        message: getAuthGuidance(auth)
      };
    }
  }

  return {
    enabled: true,
    reason: 'ok',
    message: 'AI actions available'
  };
};

const renderProvocation = (): void => {
  const section = state.activeSection;
  const activeProvocation = section?.activeProvocation ?? null;
  const selectedNote = state.selectedNoteId
    ? section?.notes.find((note) => note.id === state.selectedNoteId) ?? null
    : null;

  elements.provocationTarget.textContent = selectedNote
    ? 'Target: selected note'
    : 'Target: current section';

  const loading = state.activeProvocationRequestId !== null;
  const aiAvailability = deriveAiAvailability();
  const canGenerate = Boolean(section && aiAvailability?.enabled && !loading);

  elements.generateProvocationButton.disabled = !canGenerate;
  elements.regenerateProvocationButton.disabled = !canGenerate || !activeProvocation;
  elements.dismissProvocationButton.disabled = !section || !activeProvocation;
  elements.cancelAiButton.disabled = !loading;

  elements.provocationOutput.textContent = activeProvocation
    ? activeProvocation.outputText
    : loading
      ? 'Generating provocation...'
      : 'No active provocation.';

  const statusMessage = aiAvailability.enabled ? '' : aiAvailability.message;
  elements.provocationMessage.textContent = statusMessage;

  const activeDocument = getActiveDocument();
  elements.provocationsEnabledInput.checked = activeDocument?.provocationsEnabled ?? true;
};

const renderStatusBar = (): void => {
  if (state.networkStatus) {
    elements.networkStatus.textContent = state.networkStatus.online
      ? `Network: online (${state.networkStatus.checkedAt})`
      : 'Network: offline';
  } else {
    elements.networkStatus.textContent = 'Network: unknown';
  }

  const sourceStatus = state.activeSection?.sourceFileStatus ?? getActiveDocument()?.sourceFileStatus ?? null;
  if (!sourceStatus) {
    elements.sourceStatus.textContent = 'Source: -';
    elements.sourceActions.replaceChildren();
  } else {
    elements.sourceStatus.textContent = `Source: ${sourceStatus.message}`;
    elements.sourceActions.replaceChildren();

    if (sourceStatus.status === 'missing') {
      const locateButton = document.createElement('button');
      locateButton.type = 'button';
      locateButton.className = 'secondary';
      locateButton.textContent = 'Locate File';
      locateButton.addEventListener('click', () => {
        void withUiErrorHandling(handleLocateFile);
      });

      const reimportButton = document.createElement('button');
      reimportButton.type = 'button';
      reimportButton.className = 'secondary';
      reimportButton.textContent = 'Re-import';
      reimportButton.addEventListener('click', () => {
        void withUiErrorHandling(handleReimport);
      });

      elements.sourceActions.append(locateButton, reimportButton);
    }
  }

  elements.aiStatus.textContent = `AI: ${deriveAiAvailability().message}`;
};

const renderReassignmentModal = (): void => {
  const current = state.reassignmentQueue[0] ?? null;
  elements.reassignmentModal.classList.toggle('hidden', current === null);

  if (!current) {
    return;
  }

  elements.reassignmentCount.textContent = `${state.reassignmentQueue.length} notes need reassignment`;
  elements.reassignmentNote.textContent = `Note: ${current.content}`;
  elements.reassignmentOldSection.textContent = `Old section: ${current.previousHeading ?? 'Unknown section'}`;

  elements.reassignmentSectionSelect.replaceChildren();
  for (const section of state.sections) {
    const option = document.createElement('option');
    option.value = section.id;
    option.textContent = section.heading;
    elements.reassignmentSectionSelect.append(option);
  }
};

const refreshSettings = async (): Promise<void> => {
  const envelope = (await desktopApi.settings.get({})) as Envelope<SettingsSnapshot>;
  const settings = unwrapEnvelope(envelope);
  state.settings = settings;

  elements.generationModelInput.value = settings.generationModel;
  elements.defaultStyleInput.value = settings.defaultProvocationStyle;
  if (settings.auth.mode === 'api_key') {
    state.authCorrelationState = '';
  }
  renderAuthSettings();
};

const refreshNetworkStatus = async (): Promise<void> => {
  const envelope = (await desktopApi.network.status({})) as Envelope<NetworkStatus>;
  state.networkStatus = unwrapEnvelope(envelope);
};

const openWorkspace = async (mode: 'open' | 'create'): Promise<void> => {
  const selectionEnvelope = (await desktopApi.workspace.selectPath({
    mode
  })) as Envelope<{ workspacePath: string | null }>;
  const selection = unwrapEnvelope(selectionEnvelope);
  if (!selection.workspacePath) {
    return;
  }

  const envelope =
    mode === 'open'
      ? ((await desktopApi.workspace.open({ workspacePath: selection.workspacePath })) as Envelope<WorkspaceSnapshot>)
      : ((await desktopApi.workspace.create({
          workspacePath: selection.workspacePath
        })) as Envelope<WorkspaceSnapshot>);

  const snapshot = unwrapEnvelope(envelope);
  state.workspace = snapshot.workspace;
  state.documents = [...snapshot.documents];
  state.activeDocumentId = null;
  state.sections = [];
  state.unassignedNotes = [];
  state.activeSection = null;
  state.selectedNoteId = null;
  state.reassignmentQueue = [];

  renderWorkspaceMode(true);
  updateTopBar();
  renderDocuments();
  renderSections();
  renderSectionView();
  renderUnassignedView();
  renderTabs();
  renderCenterView();
  renderReassignmentModal();

  await refreshSettings();
  await refreshNetworkStatus();
  renderStatusBar();

  if (snapshot.documents[0]) {
    await openDocument(snapshot.documents[0].id);
  }
};

const refreshActiveDocumentLists = async (): Promise<void> => {
  if (!state.activeDocumentId) {
    return;
  }

  const envelope = (await desktopApi.section.list({ documentId: state.activeDocumentId })) as Envelope<SectionListSnapshot>;
  const listing = unwrapEnvelope(envelope);

  upsertDocument(listing.document);
  state.sections = listing.sections;
  state.unassignedNotes = listing.unassignedNotes;
  updateTopBar();
  renderDocuments();
  renderSections();
  renderUnassignedView();
  renderStatusBar();
};

const openDocument = async (documentId: string): Promise<void> => {
  const listingEnvelope = (await desktopApi.section.list({ documentId })) as Envelope<SectionListSnapshot>;
  const listing = unwrapEnvelope(listingEnvelope);

  state.activeDocumentId = documentId;
  state.sections = listing.sections;
  state.unassignedNotes = listing.unassignedNotes;
  upsertDocument(listing.document);

  if (!state.selectedTabByDocument.has(documentId)) {
    state.selectedTabByDocument.set(documentId, 'notes');
  }

  if (!state.centerViewByDocument.has(documentId)) {
    state.centerViewByDocument.set(documentId, 'section');
  }

  const preferredSectionId = state.activeSectionByDocument.get(documentId) ?? listing.sections[0]?.id ?? null;

  updateTopBar();
  renderDocuments();
  renderSections();
  renderUnassignedView();
  renderTabs();
  renderCenterView();

  if (preferredSectionId) {
    await openSection(preferredSectionId, { preserveView: true });
  } else {
    state.activeSection = null;
    state.selectedNoteId = null;
    renderSectionView();
    renderNotes();
    renderProvocation();
    renderStatusBar();
  }
};

const openSection = async (
  sectionId: string,
  options: {
    preserveView: boolean;
  } = { preserveView: false }
): Promise<void> => {
  const envelope = (await desktopApi.section.get({ sectionId })) as Envelope<SectionSnapshot>;
  const snapshot = unwrapEnvelope(envelope);

  state.activeSection = snapshot;
  state.activeDocumentId = snapshot.document.id;
  state.activeSectionByDocument.set(snapshot.document.id, sectionId);
  upsertDocument(snapshot.document);

  if (!snapshot.notes.some((note) => note.id === state.selectedNoteId)) {
    state.selectedNoteId = snapshot.notes[0]?.id ?? null;
  }

  if (!options.preserveView) {
    setCenterView('section');
  }

  updateTopBar();
  renderDocuments();
  renderSections();
  renderSectionView();
  renderNotes();
  renderProvocation();
  renderStatusBar();
};

const handleImport = async (): Promise<void> => {
  const selectionEnvelope = (await desktopApi.document.selectSource()) as Envelope<{ sourcePath: string | null }>;
  const selection = unwrapEnvelope(selectionEnvelope);
  if (!selection.sourcePath) {
    return;
  }

  const envelope = (await desktopApi.document.import({ sourcePath: selection.sourcePath })) as Envelope<DocumentSnapshot>;
  const snapshot = unwrapEnvelope(envelope);

  upsertDocument(snapshot.document);
  state.activeDocumentId = snapshot.document.id;
  state.sections = snapshot.sections;
  state.unassignedNotes = snapshot.unassignedNotes;
  state.activeSectionByDocument.set(snapshot.document.id, snapshot.firstSectionId);

  elements.importMessage.textContent = '';

  await openDocument(snapshot.document.id);
};

const handleReimport = async (): Promise<void> => {
  if (!state.activeDocumentId) {
    return;
  }

  const envelope = (await desktopApi.document.reimport({ documentId: state.activeDocumentId })) as Envelope<DocumentSnapshot>;
  const snapshot = unwrapEnvelope(envelope);

  upsertDocument(snapshot.document);
  state.sections = snapshot.sections;
  state.unassignedNotes = snapshot.unassignedNotes;
  state.activeSectionByDocument.set(snapshot.document.id, snapshot.firstSectionId);

  updateTopBar();
  renderDocuments();
  renderSections();
  renderUnassignedView();

  if (snapshot.firstSectionId) {
    await openSection(snapshot.firstSectionId);
  }

  if (snapshot.unassignedNotes.length > 0) {
    state.reassignmentQueue = [...snapshot.unassignedNotes];
    renderReassignmentModal();
  }
};

const handleLocateFile = async (): Promise<void> => {
  if (!state.activeDocumentId) {
    return;
  }

  const nextPath = window.prompt('Enter the new absolute source path:');
  if (!nextPath || !nextPath.trim()) {
    return;
  }

  const envelope = (await desktopApi.document.locate({
    documentId: state.activeDocumentId,
    sourcePath: nextPath.trim()
  })) as Envelope<DocumentSnapshot>;
  const snapshot = unwrapEnvelope(envelope);

  upsertDocument(snapshot.document);
  await refreshActiveDocumentLists();
  if (state.activeSection) {
    await openSection(state.activeSection.section.id, { preserveView: true });
  }
};

const handleNewNote = async (): Promise<void> => {
  if (!state.activeSection) {
    return;
  }

  const selection = state.selectionAnchor ?? computeSelectionAnchor(elements.sectionContent);

  const envelope = (await desktopApi.note.create({
    documentId: state.activeSection.document.id,
    sectionId: state.activeSection.section.id,
    text: '',
    ...(selection
      ? {
          paragraphOrdinal: selection.paragraphOrdinal,
          startOffset: selection.startOffset,
          endOffset: selection.endOffset,
          selectedTextExcerpt: selection.selectedTextExcerpt
        }
      : {})
  })) as Envelope<NoteRecord>;

  const created = unwrapEnvelope(envelope);
  state.selectionAnchor = null;
  state.selectedNoteId = created.id;
  await openSection(state.activeSection.section.id, { preserveView: true });
};

const handleProvocationToggle = async (): Promise<void> => {
  if (!state.activeDocumentId) {
    return;
  }

  const envelope = (await desktopApi.settings.update({
    documentId: state.activeDocumentId,
    provocationsEnabled: elements.provocationsEnabledInput.checked
  })) as Envelope<unknown>;

  unwrapEnvelope(envelope);
  await refreshActiveDocumentLists();
  if (state.activeSection) {
    await openSection(state.activeSection.section.id, { preserveView: true });
  }
};

const readProvocationStyle = (): ProvocationStyle | undefined => {
  const value = elements.provocationStyleOverrideInput.value;
  if (!value) {
    return undefined;
  }

  return value as ProvocationStyle;
};

const generateProvocation = async (initial: { acknowledgeCloudWarning?: boolean } = {}): Promise<void> => {
  const section = state.activeSection;
  if (!section) {
    return;
  }

  let acknowledgeCloudWarning = initial.acknowledgeCloudWarning ?? false;

  while (true) {
    const currentRequestId = requestId();
    state.activeProvocationRequestId = currentRequestId;
    renderProvocation();

    try {
      const envelope = (await desktopApi.ai.generateProvocation({
        requestId: currentRequestId,
        documentId: section.document.id,
        sectionId: section.section.id,
        noteId: state.selectedNoteId ?? undefined,
        style: readProvocationStyle(),
        acknowledgeCloudWarning
      })) as Envelope<ProvocationRecord>;

      unwrapEnvelope(envelope);
      await openSection(section.section.id, { preserveView: true });
      appendLog('Provocation generated.');
      return;
    } catch (error) {
      if (error instanceof EnvelopeError) {
        if (
          error.code === 'E_CONFLICT' &&
          isRecord(error.details) &&
          error.details.requiresCloudWarningAcknowledgment === true &&
          !acknowledgeCloudWarning
        ) {
          const accepted = window.confirm(
            'Cloud AI warning: document text and notes may be sent to OpenAI APIs. Continue?'
          );
          if (accepted) {
            acknowledgeCloudWarning = true;
            continue;
          }
          return;
        }
      }

      throw error;
    } finally {
      if (state.activeProvocationRequestId === currentRequestId) {
        state.activeProvocationRequestId = null;
      }
      renderProvocation();
    }
  }
};

const handleDismissProvocation = async (): Promise<void> => {
  if (!state.activeSection) {
    return;
  }

  const activeProvocation = state.activeSection.activeProvocation;
  if (!activeProvocation) {
    return;
  }

  const envelope = (await desktopApi.ai.deleteProvocation({
    provocationId: activeProvocation.id
  })) as Envelope<{ provocationId: string; deleted: boolean }>;

  unwrapEnvelope(envelope);
  await openSection(state.activeSection.section.id, { preserveView: true });
};

const handleCancelAi = async (): Promise<void> => {
  if (!state.activeProvocationRequestId) {
    return;
  }

  const request = state.activeProvocationRequestId;
  const envelope = (await desktopApi.ai.cancel({ requestId: request })) as Envelope<{
    requestId: string;
    cancelled: boolean;
  }>;

  unwrapEnvelope(envelope);
  appendLog(`Cancellation requested for ${request}.`);
};

const handleSettingsSave = async (): Promise<void> => {
  const model = elements.generationModelInput.value.trim();
  const defaultStyle = elements.defaultStyleInput.value as ProvocationStyle;
  const authMode = state.settings?.auth.mode ?? 'api_key';
  const apiKey = authMode === 'api_key' ? elements.apiKeyInput.value.trim() : '';
  const clearOpenAiApiKey = authMode === 'api_key' ? elements.clearApiKeyInput.checked : false;

  if (clearOpenAiApiKey && apiKey) {
    throw new Error('Choose either a new API key or "Clear saved API key", not both.');
  }

  const envelope = (await desktopApi.settings.update({
    generationModel: model,
    defaultProvocationStyle: defaultStyle,
    ...(apiKey ? { openAiApiKey: apiKey } : {}),
    ...(clearOpenAiApiKey ? { clearOpenAiApiKey: true } : {})
  })) as Envelope<unknown>;

  unwrapEnvelope(envelope);
  elements.apiKeyInput.value = '';
  elements.clearApiKeyInput.checked = false;
  state.authGuidanceOverride = null;
  await refreshSettings();
};

const handleAuthModeSwitch = async (): Promise<void> => {
  const mode = elements.authModeInput.value as AuthMode;
  const envelope = (await desktopApi.auth.switchMode({ mode })) as Envelope<AuthStatusSnapshot>;
  const auth = unwrapEnvelope(envelope);

  state.settings = state.settings
    ? {
        ...state.settings,
        auth
      }
    : null;

  if (mode === 'api_key') {
    state.authCorrelationState = '';
  }
  state.authGuidanceOverride = null;
  renderAuthSettings();
  renderProvocation();
  renderStatusBar();
};

const handleAuthLoginStart = async (): Promise<void> => {
  const envelope = (await desktopApi.auth.loginStart({})) as Envelope<{
    authUrl: string;
    correlationState: string;
  }>;
  const started = unwrapEnvelope(envelope);
  state.authCorrelationState = started.correlationState;
  state.authGuidanceOverride = 'Browser sign-in started. Complete sign-in, then click "Complete Sign-In".';
  await refreshSettings();
  appendLog(`Codex sign-in URL: ${started.authUrl}`);
};

const handleAuthLoginComplete = async (): Promise<void> => {
  const correlationState = elements.authCorrelationStateInput.value.trim();
  if (!correlationState) {
    throw new Error('Correlation state is required to complete Codex sign-in.');
  }

  try {
    const envelope = (await desktopApi.auth.loginComplete({
      correlationState
    })) as Envelope<AuthStatusSnapshot>;
    const auth = unwrapEnvelope(envelope);
    state.authCorrelationState = '';
    state.authGuidanceOverride = null;
    state.settings = state.settings
      ? {
          ...state.settings,
          auth
        }
      : null;
    renderAuthSettings();
    renderProvocation();
    renderStatusBar();
  } catch (error) {
    await refreshSettings();
    throw error;
  }
};

const handleAuthLogout = async (): Promise<void> => {
  const envelope = (await desktopApi.auth.logout({})) as Envelope<AuthStatusSnapshot>;
  const auth = unwrapEnvelope(envelope);
  state.authCorrelationState = '';
  state.authGuidanceOverride = null;
  state.settings = state.settings
    ? {
        ...state.settings,
        auth
      }
    : null;
  renderAuthSettings();
  renderProvocation();
  renderStatusBar();
};

const withUiErrorHandling = async (work: () => Promise<void>): Promise<void> => {
  try {
    await work();
    elements.workspaceMessage.textContent = '';
    elements.importMessage.textContent = '';
    elements.settingsMessage.textContent = '';
    renderStatusBar();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendLog(message);
    if (error instanceof EnvelopeError) {
      const authGuidance = authGuidanceFromError(error);
      if (authGuidance) {
        state.authGuidanceOverride = authGuidance;
        renderAuthSettings();
      }
    }

    if (getActiveDocument()) {
      elements.importMessage.textContent = message;
      elements.settingsMessage.textContent = message;
    } else {
      elements.workspaceMessage.textContent = message;
    }
  }
};

const wireEvents = (): void => {
  elements.sectionContent.addEventListener('mouseup', () => {
    updateSelectionAnchor();
  });
  elements.sectionContent.addEventListener('keyup', () => {
    updateSelectionAnchor();
  });

  elements.openWorkspaceButton.addEventListener('click', () => {
    void withUiErrorHandling(async () => {
      await openWorkspace('open');
      appendLog('Workspace opened.');
    });
  });

  elements.createWorkspaceButton.addEventListener('click', () => {
    void withUiErrorHandling(async () => {
      await openWorkspace('create');
      appendLog('Workspace created.');
    });
  });

  elements.refreshNetworkButton.addEventListener('click', () => {
    void withUiErrorHandling(async () => {
      await refreshNetworkStatus();
      renderProvocation();
      renderStatusBar();
      appendLog('Network status refreshed.');
    });
  });

  elements.importForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void withUiErrorHandling(async () => {
      await handleImport();
      appendLog('Document imported.');
    });
  });

  elements.unassignedNavButton.addEventListener('click', () => {
    setCenterView('unassigned');
  });

  elements.reimportButton.addEventListener('click', () => {
    void withUiErrorHandling(async () => {
      await handleReimport();
      appendLog('Document re-imported.');
    });
  });

  elements.notesTabButton.addEventListener('click', () => {
    setActiveTab('notes');
  });

  elements.provocationTabButton.addEventListener('click', () => {
    setActiveTab('provocation');
  });

  elements.newNoteButton.addEventListener('click', () => {
    void withUiErrorHandling(async () => {
      await handleNewNote();
    });
  });

  elements.provocationsEnabledInput.addEventListener('change', () => {
    void withUiErrorHandling(handleProvocationToggle);
  });

  elements.generateProvocationButton.addEventListener('click', () => {
    void withUiErrorHandling(async () => {
      await generateProvocation();
    });
  });

  elements.regenerateProvocationButton.addEventListener('click', () => {
    void withUiErrorHandling(async () => {
      await generateProvocation();
    });
  });

  elements.dismissProvocationButton.addEventListener('click', () => {
    void withUiErrorHandling(handleDismissProvocation);
  });

  elements.cancelAiButton.addEventListener('click', () => {
    void withUiErrorHandling(handleCancelAi);
  });

  elements.authModeInput.addEventListener('change', () => {
    void withUiErrorHandling(async () => {
      await handleAuthModeSwitch();
      appendLog(`Auth mode switched to ${elements.authModeInput.value}.`);
    });
  });

  elements.authLoginStartButton.addEventListener('click', () => {
    void withUiErrorHandling(async () => {
      await handleAuthLoginStart();
      appendLog('Codex sign-in started.');
    });
  });

  elements.authLoginCompleteButton.addEventListener('click', () => {
    void withUiErrorHandling(async () => {
      await handleAuthLoginComplete();
      appendLog('Codex sign-in completed.');
    });
  });

  elements.authLogoutButton.addEventListener('click', () => {
    void withUiErrorHandling(async () => {
      await handleAuthLogout();
      appendLog('Codex sign-out complete.');
    });
  });

  elements.authCorrelationStateInput.addEventListener('input', () => {
    state.authCorrelationState = elements.authCorrelationStateInput.value;
    renderAuthSettings();
  });

  elements.settingsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void withUiErrorHandling(async () => {
      await handleSettingsSave();
      appendLog('Settings saved.');
    });
  });

  elements.reassignmentAssignButton.addEventListener('click', () => {
    void withUiErrorHandling(async () => {
      const item = state.reassignmentQueue[0];
      if (!item || !elements.reassignmentSectionSelect.value) {
        return;
      }

      await assignUnassigned(item.noteId, elements.reassignmentSectionSelect.value);
      state.reassignmentQueue.shift();
      renderReassignmentModal();
    });
  });

  elements.reassignmentSkipButton.addEventListener('click', () => {
    state.reassignmentQueue = [];
    renderReassignmentModal();
  });
};

const bootstrap = async (): Promise<void> => {
  wireEvents();
  renderWorkspaceMode(false);
  renderCenterView();
  renderTabs();
  renderSectionView();
  renderUnassignedView();
  renderNotes();
  renderAuthSettings();
  renderProvocation();
  renderStatusBar();
  renderReassignmentModal();
  appendLog('Desktop shell loaded.');
};

void bootstrap();
