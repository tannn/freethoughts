import { NoteAutosaveController } from '../reader/autosave.js';
import { getDesktopApi } from './desktopApi.js';

type ProvocationStyle = 'skeptical' | 'creative' | 'methodological';
type RightPaneTab = 'notes' | 'provocation';
type CenterView = 'section' | 'unassigned';

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
  createdAt: string;
  updatedAt: string;
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
  reason: 'ok' | 'offline' | 'provocations-disabled';
  message: string;
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

const desktopApi = getDesktopApi(window as unknown as Record<string, unknown>);

const elements = {
  workspaceScreen: required(document.querySelector<HTMLElement>('#workspace-screen'), 'workspace-screen'),
  appScreen: required(document.querySelector<HTMLElement>('#app-screen'), 'app-screen'),
  workspacePathInput: required(
    document.querySelector<HTMLInputElement>('#workspace-path-input'),
    'workspace-path-input'
  ),
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
  importPathInput: required(document.querySelector<HTMLInputElement>('#import-path-input'), 'import-path-input'),
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
  networkStatus: null as NetworkStatus | null,
  activeProvocationRequestId: null as string | null,
  reassignmentQueue: [] as UnassignedNoteItem[]
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
    return;
  }

  elements.sectionHeading.textContent = state.activeSection.section.heading;
  elements.sectionContent.textContent = state.activeSection.section.content;
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

const renderNotes = (): void => {
  elements.notesList.replaceChildren();

  if (!state.activeSection) {
    return;
  }

  for (const note of state.activeSection.notes) {
    const card = document.createElement('article');
    card.className = 'note-card';
    if (note.id === state.selectedNoteId) {
      card.classList.add('selected');
    }

    const textarea = document.createElement('textarea');
    textarea.className = 'note-text';
    textarea.value = note.content;
    textarea.placeholder = 'Write note...';

    textarea.addEventListener('focus', () => {
      state.selectedNoteId = note.id;
      renderNotes();
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

const deriveAiAvailability = (): AiAvailability => {
  const activeDocument = getActiveDocument();
  const online =
    state.networkStatus?.online ??
    (state.activeSection ? state.activeSection.aiAvailability.reason !== 'offline' : true);
  const provocationsEnabled = activeDocument?.provocationsEnabled ?? true;

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
};

const refreshNetworkStatus = async (): Promise<void> => {
  const envelope = (await desktopApi.network.status({})) as Envelope<NetworkStatus>;
  state.networkStatus = unwrapEnvelope(envelope);
};

const openWorkspace = async (mode: 'open' | 'create'): Promise<void> => {
  const workspacePath = elements.workspacePathInput.value.trim();
  if (!workspacePath) {
    throw new Error('Workspace path is required.');
  }

  const envelope =
    mode === 'open'
      ? ((await desktopApi.workspace.open({ workspacePath })) as Envelope<WorkspaceSnapshot>)
      : ((await desktopApi.workspace.create({ workspacePath })) as Envelope<WorkspaceSnapshot>);

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
  const sourcePath = elements.importPathInput.value.trim();
  if (!sourcePath) {
    throw new Error('Source file path is required.');
  }

  const envelope = (await desktopApi.document.import({ sourcePath })) as Envelope<DocumentSnapshot>;
  const snapshot = unwrapEnvelope(envelope);

  upsertDocument(snapshot.document);
  state.activeDocumentId = snapshot.document.id;
  state.sections = snapshot.sections;
  state.unassignedNotes = snapshot.unassignedNotes;
  state.activeSectionByDocument.set(snapshot.document.id, snapshot.firstSectionId);

  elements.importPathInput.value = '';
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

  const envelope = (await desktopApi.note.create({
    documentId: state.activeSection.document.id,
    sectionId: state.activeSection.section.id,
    text: ''
  })) as Envelope<NoteRecord>;

  const created = unwrapEnvelope(envelope);
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
  })) as Envelope<SettingsSnapshot>;

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

const generateProvocation = async (initial: {
  confirmReplace?: boolean;
  acknowledgeCloudWarning?: boolean;
} = {}): Promise<void> => {
  const section = state.activeSection;
  if (!section) {
    return;
  }

  let confirmReplace = initial.confirmReplace ?? false;
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
        confirmReplace,
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
          error.details.requiresConfirmation === true &&
          !confirmReplace
        ) {
          const accepted = window.confirm('Replace current provocation for this section?');
          if (accepted) {
            confirmReplace = true;
            continue;
          }
          return;
        }

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

  const envelope = (await desktopApi.ai.cancel({
    documentId: state.activeSection.document.id,
    sectionId: state.activeSection.section.id,
    dismissActive: true
  })) as Envelope<{ dismissed: boolean }>;

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
  const apiKey = elements.apiKeyInput.value.trim();
  const clearOpenAiApiKey = elements.clearApiKeyInput.checked;

  if (clearOpenAiApiKey && apiKey) {
    throw new Error('Choose either a new API key or "Clear saved API key", not both.');
  }

  const envelope = (await desktopApi.settings.update({
    generationModel: model,
    defaultProvocationStyle: defaultStyle,
    ...(apiKey ? { openAiApiKey: apiKey } : {}),
    ...(clearOpenAiApiKey ? { clearOpenAiApiKey: true } : {})
  })) as Envelope<SettingsSnapshot>;

  unwrapEnvelope(envelope);
  elements.apiKeyInput.value = '';
  elements.clearApiKeyInput.checked = false;
  await refreshSettings();
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

    if (getActiveDocument()) {
      elements.importMessage.textContent = message;
      elements.settingsMessage.textContent = message;
    } else {
      elements.workspaceMessage.textContent = message;
    }
  }
};

const wireEvents = (): void => {
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
      await generateProvocation({ confirmReplace: true });
    });
  });

  elements.dismissProvocationButton.addEventListener('click', () => {
    void withUiErrorHandling(handleDismissProvocation);
  });

  elements.cancelAiButton.addEventListener('click', () => {
    void withUiErrorHandling(handleCancelAi);
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
  renderProvocation();
  renderStatusBar();
  renderReassignmentModal();
  appendLog('Desktop shell loaded.');
};

void bootstrap();
