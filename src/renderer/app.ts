import { NoteAutosaveController } from '../reader/autosave.js';
import { getDesktopApi } from './desktopApi.js';
import { formatNoteAnchorExcerpt } from './noteAnchors.js';
import { trimExcerpt } from './text.js';

type ProvocationStyle = 'skeptical' | 'creative' | 'methodological';
type UnifiedFeedFilter = 'all' | 'notes' | 'provocation';
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
  rawSelectedText?: string;
  contextBefore?: string;
  contextAfter?: string;
}

interface SelectionTriggeredProvocationTarget {
  noteId?: string;
  label: 'selected note' | 'selected text';
  preview: string;
}

type SelectionPopoverMode = 'chooser' | 'note' | 'provocation';

interface ViewportRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
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

interface UnifiedFeedItem {
  id: string;
  itemType: 'note' | 'provocation';
  sectionId: string;
  sectionHeading: string;
  sectionOrderIndex: number;
  paragraphOrdinal: number | null;
  startOffset: number | null;
  createdAt: string;
  textContent: string;
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
  unifiedFeed: UnifiedFeedItem[];
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

const PROVOCATION_STYLES: readonly ProvocationStyle[] = ['skeptical', 'creative', 'methodological'];
const PROVOCATION_STYLE_POPOVER_OFFSET = 10;
const PROVOCATION_STYLE_POPOVER_MARGIN = 12;

const PDF_ZOOM_DEFAULT = 1;
const PDF_ZOOM_MIN = 0.75;
const PDF_ZOOM_MAX = 2;
const PDF_ZOOM_STEP = 0.1;

const toFileUrl = (sourcePath: string): string => {
  if (sourcePath.startsWith('file://')) {
    return sourcePath;
  }

  const url = new URL('file:///');
  url.pathname = sourcePath;
  return url.toString();
};

const normalizeSectionText = (text: string): string => text.replace(/\r\n/g, '\n');
const normalizeMatchText = (text: string): string =>
  text
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

interface SectionOffsetMap {
  text: string;
  offsets: number[];
}

const buildSectionOffsetMap = (source: string): SectionOffsetMap => {
  let normalized = '';
  const offsets: number[] = [];

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '\r' && source[index + 1] === '\n') {
      continue;
    }
    normalized += char;
    offsets.push(index);
  }

  offsets.push(source.length);
  return {
    text: normalized,
    offsets
  };
};

const normalizedOffsetToOriginalOffset = (offsets: number[], normalizedOffset: number): number => {
  if (offsets.length === 0) {
    return 0;
  }

  const boundedOffset = Math.max(0, Math.min(normalizedOffset, offsets.length - 1));
  return offsets[boundedOffset] ?? offsets[offsets.length - 1];
};

const suffixOverlapLength = (left: string, right: string): number => {
  const max = Math.min(left.length, right.length);
  for (let length = max; length > 0; length -= 1) {
    if (left.endsWith(right.slice(-length))) {
      return length;
    }
  }
  return 0;
};

const prefixOverlapLength = (left: string, right: string): number => {
  const max = Math.min(left.length, right.length);
  for (let length = max; length > 0; length -= 1) {
    if (left.slice(0, length) === right.slice(0, length)) {
      return length;
    }
  }
  return 0;
};

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
  const rawSelectedText = selection.toString();
  const selectedTextExcerpt = rawSelectedText.trim();

  if (!selectedTextExcerpt) {
    return null;
  }

  const contextWindow = 36;
  const contextBefore = normalizedText.slice(Math.max(0, startOffset - contextWindow), startOffset);
  const contextAfter = normalizedText.slice(endOffset, Math.min(normalizedText.length, endOffset + contextWindow));

  return {
    paragraphOrdinal: countParagraphOrdinal(normalizedText, startOffset),
    startOffset: Math.min(startOffset, endOffset),
    endOffset: Math.max(startOffset, endOffset),
    selectedTextExcerpt,
    rawSelectedText,
    contextBefore,
    contextAfter
  };
};

const mapPdfSelectionAnchorToOffsets = (
  anchor: NoteSelectionAnchor,
  sectionContent: string
): NoteSelectionAnchor | null => {
  const sectionOffsetMap = buildSectionOffsetMap(sectionContent);
  const normalizedSection = sectionOffsetMap.text;
  const rawSelectedText = normalizeSectionText(anchor.rawSelectedText ?? anchor.selectedTextExcerpt);
  const selectedTextExcerpt = rawSelectedText.trim();
  if (!selectedTextExcerpt || !normalizedSection) {
    return null;
  }

  const candidateNeedles = new Set<string>();
  if (rawSelectedText) {
    candidateNeedles.add(rawSelectedText);
  }
  candidateNeedles.add(selectedTextExcerpt);

  const contextBeforeNorm = normalizeMatchText(normalizeSectionText(anchor.contextBefore ?? ''));
  const contextAfterNorm = normalizeMatchText(normalizeSectionText(anchor.contextAfter ?? ''));
  const boundedHintStart = Math.max(0, Math.min(anchor.startOffset, normalizedSection.length));
  const beforeWindow = Math.max(24, (anchor.contextBefore?.length ?? 0) + 24);
  const afterWindow = Math.max(24, (anchor.contextAfter?.length ?? 0) + 24);

  let bestMatch:
    | {
        start: number;
        needle: string;
        score: number;
      }
    | null = null;

  for (const needle of candidateNeedles) {
    if (!needle) {
      continue;
    }

    let searchStart = 0;
    while (searchStart <= normalizedSection.length) {
      const foundAt = normalizedSection.indexOf(needle, searchStart);
      if (foundAt === -1) {
        break;
      }

      let score = 0;
      const distance = Math.abs(foundAt - boundedHintStart);
      score -= Math.min(distance, 400) * 0.2;

      if (contextBeforeNorm) {
        const beforeSlice = normalizeMatchText(
          normalizedSection.slice(Math.max(0, foundAt - beforeWindow), foundAt)
        );
        score += suffixOverlapLength(beforeSlice, contextBeforeNorm) * 3;
      }

      if (contextAfterNorm) {
        const afterSlice = normalizeMatchText(
          normalizedSection.slice(foundAt + needle.length, Math.min(normalizedSection.length, foundAt + needle.length + afterWindow))
        );
        score += prefixOverlapLength(afterSlice, contextAfterNorm) * 3;
      }

      if (needle === rawSelectedText && rawSelectedText !== selectedTextExcerpt) {
        score += 2;
      }

      if (
        !bestMatch ||
        score > bestMatch.score ||
        (score === bestMatch.score && Math.abs(foundAt - boundedHintStart) < Math.abs(bestMatch.start - boundedHintStart))
      ) {
        bestMatch = {
          start: foundAt,
          needle,
          score
        };
      }

      searchStart = foundAt + 1;
    }
  }

  if (!bestMatch) {
    return null;
  }

  const leadingTrim =
    bestMatch.needle.length > selectedTextExcerpt.length ? bestMatch.needle.length - bestMatch.needle.trimStart().length : 0;
  const trailingTrim =
    bestMatch.needle.length > selectedTextExcerpt.length ? bestMatch.needle.length - bestMatch.needle.trimEnd().length : 0;
  const mappedStartNorm = bestMatch.start + leadingTrim;
  const mappedEndNorm = bestMatch.start + bestMatch.needle.length - trailingTrim;
  const mappedStart = normalizedOffsetToOriginalOffset(sectionOffsetMap.offsets, mappedStartNorm);
  const mappedEnd = normalizedOffsetToOriginalOffset(sectionOffsetMap.offsets, mappedEndNorm);

  return {
    paragraphOrdinal: countParagraphOrdinal(normalizedSection, mappedStartNorm),
    startOffset: mappedStart,
    endOffset: mappedEnd,
    selectedTextExcerpt,
    rawSelectedText,
    contextBefore: anchor.contextBefore,
    contextAfter: anchor.contextAfter
  };
};

const getSelectionRangeInContainer = (container: HTMLElement): Range | null => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) {
    return null;
  }

  return range;
};

const toViewportRect = (rect: DOMRect | DOMRectReadOnly): ViewportRect => ({
  left: rect.left,
  top: rect.top,
  right: rect.right,
  bottom: rect.bottom,
  width: rect.width,
  height: rect.height
});

const readSelectionViewportRect = (container: HTMLElement): ViewportRect | null => {
  const range = getSelectionRangeInContainer(container);
  if (!range) {
    return null;
  }

  const rect = range.getBoundingClientRect();
  if (rect.width > 0 || rect.height > 0) {
    return toViewportRect(rect);
  }

  const clientRect = range.getClientRects()[0];
  return clientRect ? toViewportRect(clientRect) : null;
};

interface PdfJsRenderTask {
  promise: Promise<unknown>;
  cancel?: () => void;
}

interface PdfJsPage {
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: unknown;
    transform?: [number, number, number, number, number, number];
  }) => PdfJsRenderTask;
  getTextContent: () => Promise<unknown>;
}

interface PdfJsDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPage>;
  destroy?: () => Promise<void> | void;
}

interface PdfJsLoadingTask {
  promise: Promise<PdfJsDocumentProxy>;
  destroy?: () => void;
}

interface PdfJsModule {
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  getDocument: (params: { url: string }) => PdfJsLoadingTask;
  TextLayer: new (params: {
    textContentSource: unknown;
    container: HTMLElement;
    viewport: unknown;
  }) => {
    render: () => Promise<unknown>;
    cancel?: () => void;
  };
}

let pdfJsModulePromise: Promise<PdfJsModule> | null = null;

const loadPdfJsModule = async (): Promise<PdfJsModule> => {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import('./vendor/pdfjs/pdf.mjs') as Promise<PdfJsModule>;
  }

  const pdfjs = await pdfJsModulePromise;
  const workerSrc = new URL('./vendor/pdfjs/pdf.worker.mjs', window.location.href).toString();
  if (pdfjs.GlobalWorkerOptions.workerSrc !== workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  }
  return pdfjs;
};

const isPdfDocumentWithNativeSurface = (): boolean =>
  Boolean(
    state.activeSection &&
      state.activeSection.document.fileType === 'pdf' &&
      state.activeSection.sourceFileStatus.status === 'available' &&
      !state.pdfRenderFailed
  );

const clampPdfZoom = (zoom: number): number => Math.max(PDF_ZOOM_MIN, Math.min(PDF_ZOOM_MAX, zoom));

const getPdfZoom = (documentId: string): number => state.pdfZoomByDocument.get(documentId) ?? PDF_ZOOM_DEFAULT;

const applyPdfZoom = (): void => {
  const documentId = state.activeSection?.document.id ?? null;
  const zoom = documentId ? getPdfZoom(documentId) : PDF_ZOOM_DEFAULT;
  elements.pdfZoomLabel.textContent = `Zoom: ${Math.round(zoom * 100)}%`;
  elements.pdfZoomOutButton.disabled = zoom <= PDF_ZOOM_MIN;
  elements.pdfZoomInButton.disabled = zoom >= PDF_ZOOM_MAX;
  elements.pdfZoomResetButton.disabled = Math.abs(zoom - PDF_ZOOM_DEFAULT) < 0.001;
};

const setPdfZoom = (nextZoom: number): void => {
  if (!state.activeSection || state.activeSection.document.fileType !== 'pdf') {
    return;
  }

  state.pdfZoomByDocument.set(state.activeSection.document.id, clampPdfZoom(nextZoom));
  state.pdfRenderFailed = false;
  applyPdfZoom();
  if (isPdfDocumentWithNativeSurface()) {
    void renderPdfDocument().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      appendLog(message);
      elements.importMessage.textContent = message;
    });
  }
};

const clearPdfDocument = (): void => {
  elements.pdfDocument.replaceChildren();
  state.pdfRenderSourcePath = null;
  state.pdfRenderZoom = PDF_ZOOM_DEFAULT;
};

const renderPdfDocument = async (): Promise<void> => {
  const section = state.activeSection;
  if (!section || section.document.fileType !== 'pdf' || section.sourceFileStatus.status !== 'available') {
    clearPdfDocument();
    return;
  }

  const sourcePath = section.document.sourcePath;
  const zoom = getPdfZoom(section.document.id);
  if (state.pdfRenderSourcePath === sourcePath && state.pdfRenderZoom === zoom && !state.pdfRenderFailed) {
    return;
  }

  const renderToken = ++state.pdfRenderToken;
  state.pdfRenderSourcePath = sourcePath;
  state.pdfRenderZoom = zoom;
  elements.pdfDocument.replaceChildren();

  const pdfjs = await loadPdfJsModule();
  const loadingTask = pdfjs.getDocument({ url: toFileUrl(sourcePath) });
  let documentProxy: PdfJsDocumentProxy | null = null;

  try {
    documentProxy = await loadingTask.promise;
    if (renderToken !== state.pdfRenderToken) {
      return;
    }

    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
      if (renderToken !== state.pdfRenderToken) {
        return;
      }

      const page = await documentProxy.getPage(pageNumber);
      const viewport = page.getViewport({ scale: zoom });

      const pageElement = document.createElement('article');
      pageElement.className = 'pdf-page';
      pageElement.dataset.pageNumber = String(pageNumber);
      pageElement.style.setProperty('--scale-factor', `${zoom}`);

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-canvas';
      const outputScale = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
      canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const textLayer = document.createElement('div');
      textLayer.className = 'pdf-text-layer';
      textLayer.style.setProperty('--scale-factor', `${zoom}`);
      textLayer.style.width = `${viewport.width}px`;
      textLayer.style.height = `${viewport.height}px`;

      pageElement.append(canvas, textLayer);
      elements.pdfDocument.append(pageElement);

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Unable to initialize PDF render context.');
      }

      const renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: outputScale > 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined
      });
      await renderTask.promise;
      const textContent = await page.getTextContent();
      const textLayerTask = new pdfjs.TextLayer({
        textContentSource: textContent,
        container: textLayer,
        viewport
      });
      await textLayerTask.render();
    }

    state.pdfRenderFailed = false;
  } catch (error) {
    state.pdfRenderFailed = true;
    clearPdfDocument();
    throw new Error(
      error instanceof Error ? `Unable to render PDF document: ${error.message}` : 'Unable to render PDF document.'
    );
  } finally {
    if (documentProxy && renderToken !== state.pdfRenderToken) {
      await Promise.resolve(documentProxy.destroy?.());
    }
    if (renderToken !== state.pdfRenderToken) {
      loadingTask.destroy?.();
    }
  }
};

const renderSelectionAnchorAffordance = (): void => {
  // Sidebar note/provocation action affordances were removed; selection actions now live in the anchored popover.
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
  outlineToggleButton: required(
    document.querySelector<HTMLButtonElement>('#outline-toggle-button'),
    'outline-toggle-button'
  ),
  outlineBackdrop: required(document.querySelector<HTMLElement>('#outline-backdrop'), 'outline-backdrop'),
  outlineDrawer: required(document.querySelector<HTMLElement>('#outline-drawer'), 'outline-drawer'),
  outlineCloseButton: required(
    document.querySelector<HTMLButtonElement>('#outline-close-button'),
    'outline-close-button'
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
  pdfViewport: required(document.querySelector<HTMLDivElement>('#pdf-viewport'), 'pdf-viewport'),
  pdfDocument: required(document.querySelector<HTMLDivElement>('#pdf-document'), 'pdf-document'),
  pdfZoomOutButton: required(document.querySelector<HTMLButtonElement>('#pdf-zoom-out-button'), 'pdf-zoom-out-button'),
  pdfZoomInButton: required(document.querySelector<HTMLButtonElement>('#pdf-zoom-in-button'), 'pdf-zoom-in-button'),
  pdfZoomResetButton: required(
    document.querySelector<HTMLButtonElement>('#pdf-zoom-reset-button'),
    'pdf-zoom-reset-button'
  ),
  pdfZoomLabel: required(document.querySelector<HTMLElement>('#pdf-zoom-label'), 'pdf-zoom-label'),
  pdfFallback: required(document.querySelector<HTMLDivElement>('#pdf-fallback'), 'pdf-fallback'),
  sectionContent: required(document.querySelector<HTMLPreElement>('#section-content'), 'section-content'),
  unassignedSummary: required(
    document.querySelector<HTMLParagraphElement>('#unassigned-summary'),
    'unassigned-summary'
  ),
  unassignedList: required(document.querySelector<HTMLDivElement>('#unassigned-list'), 'unassigned-list'),
  feedFilterAllButton: required(
    document.querySelector<HTMLButtonElement>('#feed-filter-all-button'),
    'feed-filter-all-button'
  ),
  feedFilterNotesButton: required(
    document.querySelector<HTMLButtonElement>('#feed-filter-notes-button'),
    'feed-filter-notes-button'
  ),
  feedFilterProvocationButton: required(
    document.querySelector<HTMLButtonElement>('#feed-filter-provocation-button'),
    'feed-filter-provocation-button'
  ),
  unifiedFeedList: required(document.querySelector<HTMLDivElement>('#unified-feed-list'), 'unified-feed-list'),
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
  settingsReimportButton: required(
    document.querySelector<HTMLButtonElement>('#settings-reimport-button'),
    'settings-reimport-button'
  ),
  apiKeyInput: required(document.querySelector<HTMLInputElement>('#api-key-input'), 'api-key-input'),
  clearApiKeyInput: required(
    document.querySelector<HTMLInputElement>('#clear-api-key-input'),
    'clear-api-key-input'
  ),
  settingsModal: required(document.querySelector<HTMLElement>('#settings-modal'), 'settings-modal'),
  settingsCloseButton: required(
    document.querySelector<HTMLButtonElement>('#settings-close-button'),
    'settings-close-button'
  ),
  settingsCancelButton: required(
    document.querySelector<HTMLButtonElement>('#settings-cancel-button'),
    'settings-cancel-button'
  ),
  settingsMessage: required(document.querySelector<HTMLParagraphElement>('#settings-message'), 'settings-message'),
  provocationStyleOverlay: required(
    document.querySelector<HTMLElement>('#provocation-style-overlay'),
    'provocation-style-overlay'
  ),
  selectionActionChooser: required(
    document.querySelector<HTMLElement>('#selection-action-chooser'),
    'selection-action-chooser'
  ),
  selectionActionPreview: required(
    document.querySelector<HTMLParagraphElement>('#selection-action-preview'),
    'selection-action-preview'
  ),
  selectionActionNoteButton: required(
    document.querySelector<HTMLButtonElement>('#selection-action-note-button'),
    'selection-action-note-button'
  ),
  selectionActionProvocationButton: required(
    document.querySelector<HTMLButtonElement>('#selection-action-provocation-button'),
    'selection-action-provocation-button'
  ),
  selectionActionMessage: required(
    document.querySelector<HTMLParagraphElement>('#selection-action-message'),
    'selection-action-message'
  ),
  selectionNotePanel: required(document.querySelector<HTMLElement>('#selection-note-panel'), 'selection-note-panel'),
  selectionNotePreview: required(
    document.querySelector<HTMLParagraphElement>('#selection-note-preview'),
    'selection-note-preview'
  ),
  selectionNoteInput: required(
    document.querySelector<HTMLInputElement>('#selection-note-input'),
    'selection-note-input'
  ),
  selectionNoteBackButton: required(
    document.querySelector<HTMLButtonElement>('#selection-note-back-button'),
    'selection-note-back-button'
  ),
  selectionNoteCreateButton: required(
    document.querySelector<HTMLButtonElement>('#selection-note-create-button'),
    'selection-note-create-button'
  ),
  selectionNoteMessage: required(
    document.querySelector<HTMLParagraphElement>('#selection-note-message'),
    'selection-note-message'
  ),
  selectionProvocationPanel: required(
    document.querySelector<HTMLElement>('#selection-provocation-panel'),
    'selection-provocation-panel'
  ),
  provocationStyleSelectionPreview: required(
    document.querySelector<HTMLParagraphElement>('#provocation-style-selection-preview'),
    'provocation-style-selection-preview'
  ),
  provocationStyleMenuButton: required(
    document.querySelector<HTMLButtonElement>('#provocation-style-menu-button'),
    'provocation-style-menu-button'
  ),
  provocationStyleMenu: required(document.querySelector<HTMLElement>('#provocation-style-menu'), 'provocation-style-menu'),
  provocationStyleOptionSkeptical: required(
    document.querySelector<HTMLButtonElement>('#provocation-style-option-skeptical'),
    'provocation-style-option-skeptical'
  ),
  provocationStyleOptionCreative: required(
    document.querySelector<HTMLButtonElement>('#provocation-style-option-creative'),
    'provocation-style-option-creative'
  ),
  provocationStyleOptionMethodological: required(
    document.querySelector<HTMLButtonElement>('#provocation-style-option-methodological'),
    'provocation-style-option-methodological'
  ),
  provocationStyleCancelButton: required(
    document.querySelector<HTMLButtonElement>('#provocation-style-cancel-button'),
    'provocation-style-cancel-button'
  ),
  provocationStyleGenerateButton: required(
    document.querySelector<HTMLButtonElement>('#provocation-style-generate-button'),
    'provocation-style-generate-button'
  ),
  provocationStyleMessage: required(
    document.querySelector<HTMLParagraphElement>('#provocation-style-message'),
    'provocation-style-message'
  ),
  networkStatus: required(document.querySelector<HTMLElement>('#network-status'), 'network-status'),
  sourceStatus: required(document.querySelector<HTMLElement>('#source-status'), 'source-status'),
  aiStatus: required(document.querySelector<HTMLElement>('#ai-status'), 'ai-status'),
  generationStatus: required(document.querySelector<HTMLElement>('#generation-status'), 'generation-status'),
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

const provocationStyleOptions = [
  elements.provocationStyleOptionSkeptical,
  elements.provocationStyleOptionCreative,
  elements.provocationStyleOptionMethodological
] as const;

const state = {
  workspace: null as WorkspaceRecord | null,
  documents: [] as DocumentSummary[],
  activeDocumentId: null as string | null,
  sections: [] as SectionListItem[],
  unassignedNotes: [] as UnassignedNoteItem[],
  activeSection: null as SectionSnapshot | null,
  selectedFeedFilterByDocument: new Map<string, UnifiedFeedFilter>(),
  centerViewByDocument: new Map<string, CenterView>(),
  activeSectionByDocument: new Map<string, string | null>(),
  pdfZoomByDocument: new Map<string, number>(),
  selectedNoteId: null as string | null,
  settings: null as SettingsSnapshot | null,
  authCorrelationState: '' as string,
  authGuidanceOverride: null as string | null,
  networkStatus: null as NetworkStatus | null,
  activeProvocationRequestId: null as string | null,
  reassignmentQueue: [] as UnassignedNoteItem[],
  selectionAnchor: null as NoteSelectionAnchor | null,
  pdfSelectionMappingFailed: false,
  pdfRenderToken: 0,
  pdfRenderSourcePath: null as string | null,
  pdfRenderZoom: PDF_ZOOM_DEFAULT,
  pdfRenderFailed: false,
  outlineDrawerOpen: false,
  settingsModalOpen: false,
  provocationStyleOverlayOpen: false,
  provocationStyleOverlayOpenedAtMs: 0,
  provocationStyleMenuOpen: false,
  selectionPopoverMode: 'chooser' as SelectionPopoverMode,
  selectionPopoverAnchorRect: null as ViewportRect | null,
  pendingSelectionProvocationTarget: null as SelectionTriggeredProvocationTarget | null,
  pendingSelectionProvocationStyle: 'skeptical' as ProvocationStyle
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

const getActiveFeedFilter = (): UnifiedFeedFilter => {
  if (!state.activeDocumentId) {
    return 'all';
  }

  return state.selectedFeedFilterByDocument.get(state.activeDocumentId) ?? 'all';
};

const setActiveFeedFilter = (filter: UnifiedFeedFilter): void => {
  if (!state.activeDocumentId) {
    return;
  }

  state.selectedFeedFilterByDocument.set(state.activeDocumentId, filter);
  renderFeedFilters();
  renderUnifiedFeed();
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
  elements.unassignedNavButton.textContent = `Unassigned Notes (${state.unassignedNotes.length})`;
  elements.settingsReimportButton.disabled = !state.activeDocumentId;
};

const renderWorkspaceMode = (workspaceOpen: boolean): void => {
  elements.workspaceScreen.classList.toggle('hidden', workspaceOpen);
  elements.appScreen.classList.toggle('hidden', !workspaceOpen);
  if (!workspaceOpen) {
    state.outlineDrawerOpen = false;
    elements.outlineDrawer.classList.add('hidden');
    elements.outlineBackdrop.classList.add('hidden');
    elements.outlineDrawer.setAttribute('aria-hidden', 'true');
    elements.outlineBackdrop.setAttribute('aria-hidden', 'true');
    elements.outlineToggleButton.setAttribute('aria-expanded', 'false');
    state.settingsModalOpen = false;
    elements.settingsModal.classList.add('hidden');
    elements.settingsModal.setAttribute('aria-hidden', 'true');
    state.provocationStyleOverlayOpen = false;
    state.provocationStyleOverlayOpenedAtMs = 0;
    state.provocationStyleMenuOpen = false;
    state.selectionPopoverMode = 'chooser';
    state.selectionPopoverAnchorRect = null;
    state.pendingSelectionProvocationTarget = null;
    elements.provocationStyleOverlay.classList.add('hidden');
    elements.provocationStyleOverlay.setAttribute('aria-hidden', 'true');
    elements.provocationStyleOverlay.style.left = '';
    elements.provocationStyleOverlay.style.top = '';
    elements.selectionActionChooser.classList.remove('hidden');
    elements.selectionNotePanel.classList.add('hidden');
    elements.selectionProvocationPanel.classList.add('hidden');
    elements.selectionActionMessage.textContent = '';
    elements.selectionNoteMessage.textContent = '';
    elements.provocationStyleMessage.textContent = '';
    elements.provocationStyleMenu.classList.add('hidden');
    elements.provocationStyleMenuButton.setAttribute('aria-expanded', 'false');
  }
};

const setOutlineDrawerOpen = (open: boolean): void => {
  state.outlineDrawerOpen = open;
  elements.outlineDrawer.classList.toggle('hidden', !open);
  elements.outlineBackdrop.classList.toggle('hidden', !open);
  elements.outlineDrawer.setAttribute('aria-hidden', open ? 'false' : 'true');
  elements.outlineBackdrop.setAttribute('aria-hidden', open ? 'false' : 'true');
  elements.outlineToggleButton.setAttribute('aria-expanded', open ? 'true' : 'false');
};

const closeOutlineDrawer = (): void => {
  setOutlineDrawerOpen(false);
};

const toggleOutlineDrawer = (): void => {
  if (elements.appScreen.classList.contains('hidden')) {
    return;
  }

  setOutlineDrawerOpen(!state.outlineDrawerOpen);
};

const setSettingsModalOpen = (open: boolean): void => {
  state.settingsModalOpen = open;
  elements.settingsModal.classList.toggle('hidden', !open);
  elements.settingsModal.setAttribute('aria-hidden', open ? 'false' : 'true');
};

const setProvocationStyleMenuOpen = (open: boolean): void => {
  state.provocationStyleMenuOpen = open;
  elements.provocationStyleMenu.classList.toggle('hidden', !open);
  elements.provocationStyleMenuButton.setAttribute('aria-expanded', open ? 'true' : 'false');
};

const getElementViewportRect = (element: HTMLElement): ViewportRect => toViewportRect(element.getBoundingClientRect());

const positionProvocationStyleOverlay = (): void => {
  if (!state.provocationStyleOverlayOpen || !state.selectionPopoverAnchorRect) {
    return;
  }

  const popover = elements.provocationStyleOverlay.firstElementChild;
  if (!(popover instanceof HTMLElement)) {
    return;
  }

  const anchor = state.selectionPopoverAnchorRect;
  const popoverRect = popover.getBoundingClientRect();
  const width = popoverRect.width;
  const height = popoverRect.height;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let left = anchor.left + anchor.width / 2 - width / 2;
  left = Math.max(
    PROVOCATION_STYLE_POPOVER_MARGIN,
    Math.min(viewportWidth - width - PROVOCATION_STYLE_POPOVER_MARGIN, left)
  );

  let top = anchor.bottom + PROVOCATION_STYLE_POPOVER_OFFSET;
  if (top + height > viewportHeight - PROVOCATION_STYLE_POPOVER_MARGIN) {
    top = anchor.top - height - PROVOCATION_STYLE_POPOVER_OFFSET;
  }
  top = Math.max(PROVOCATION_STYLE_POPOVER_MARGIN, top);

  elements.provocationStyleOverlay.style.left = `${Math.round(left)}px`;
  elements.provocationStyleOverlay.style.top = `${Math.round(top)}px`;
};

const setSelectionPopoverMode = (mode: SelectionPopoverMode): void => {
  state.selectionPopoverMode = mode;
  elements.selectionActionChooser.classList.toggle('hidden', mode !== 'chooser');
  elements.selectionNotePanel.classList.toggle('hidden', mode !== 'note');
  elements.selectionProvocationPanel.classList.toggle('hidden', mode !== 'provocation');
  if (mode !== 'provocation') {
    setProvocationStyleMenuOpen(false);
  }
};

const setProvocationStyleOverlayOpen = (open: boolean): void => {
  state.provocationStyleOverlayOpen = open;
  state.provocationStyleOverlayOpenedAtMs = open ? Date.now() : 0;
  elements.provocationStyleOverlay.classList.toggle('hidden', !open);
  elements.provocationStyleOverlay.setAttribute('aria-hidden', open ? 'false' : 'true');
  if (!open) {
    setProvocationStyleMenuOpen(false);
    setSelectionPopoverMode('chooser');
    state.pendingSelectionProvocationTarget = null;
    state.selectionPopoverAnchorRect = null;
    elements.selectionActionMessage.textContent = '';
    elements.selectionNoteMessage.textContent = '';
    elements.provocationStyleMessage.textContent = '';
    elements.provocationStyleOverlay.style.left = '';
    elements.provocationStyleOverlay.style.top = '';
    return;
  }

  queueMicrotask(() => {
    positionProvocationStyleOverlay();
  });
};

const closeSettingsModal = (): void => {
  setSettingsModalOpen(false);
};

const openSettingsModal = async (): Promise<void> => {
  closeOutlineDrawer();
  closeProvocationStyleOverlay();
  await refreshSettings();
  elements.settingsMessage.textContent = '';
  setSettingsModalOpen(true);
};

const closeProvocationStyleOverlay = (): void => {
  setProvocationStyleOverlayOpen(false);
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
      closeOutlineDrawer();
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
      closeOutlineDrawer();
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
    clearPdfDocument();
    applyPdfZoom();
    state.selectionAnchor = null;
    state.pdfSelectionMappingFailed = false;
    state.selectionPopoverAnchorRect = null;
    state.pdfRenderFailed = false;
    renderSelectionAnchorAffordance();
    return;
  }

  elements.sectionHeading.textContent = state.activeSection.section.heading;
  elements.sectionContent.textContent = state.activeSection.section.content;

  const isPdf = state.activeSection.document.fileType === 'pdf';
  const pdfAvailable = isPdf && state.activeSection.sourceFileStatus.status === 'available';
  const showPdfSurface = pdfAvailable && !state.pdfRenderFailed;
  elements.pdfSurface.classList.toggle('hidden', !showPdfSurface);
  elements.pdfFallback.classList.toggle('hidden', !isPdf || showPdfSurface);
  elements.sectionContent.classList.toggle('hidden', showPdfSurface);
  applyPdfZoom();
  if (showPdfSurface) {
    void renderPdfDocument().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      appendLog(message);
      elements.importMessage.textContent = message;
      elements.pdfSurface.classList.add('hidden');
      elements.pdfFallback.classList.remove('hidden');
      elements.sectionContent.classList.remove('hidden');
      renderSelectionAnchorAffordance();
    });
  } else {
    clearPdfDocument();
  }

  renderSelectionAnchorAffordance();
};

const updateSelectionAnchor = (options: { openPopoverOnSelection?: boolean } = {}): void => {
  const openPopoverOnSelection = options.openPopoverOnSelection ?? false;

  if (!state.activeSection) {
    state.selectionAnchor = null;
    state.pdfSelectionMappingFailed = false;
    state.selectionPopoverAnchorRect = null;
    renderSelectionAnchorAffordance();
    renderProvocation();
    return;
  }

  if (isPdfDocumentWithNativeSurface()) {
    const rawAnchor = computeSelectionAnchor(elements.pdfDocument);
    const selectionRect = readSelectionViewportRect(elements.pdfDocument);
    if (!rawAnchor) {
      state.selectionAnchor = null;
      state.pdfSelectionMappingFailed = false;
      state.selectionPopoverAnchorRect = null;
      renderSelectionAnchorAffordance();
      renderProvocation();
      return;
    }

    const mappedAnchor = mapPdfSelectionAnchorToOffsets(rawAnchor, state.activeSection.section.content);
    state.selectionAnchor = mappedAnchor;
    state.pdfSelectionMappingFailed = mappedAnchor === null;
    state.selectionPopoverAnchorRect = selectionRect;

    if (mappedAnchor && selectionRect && openPopoverOnSelection && !state.settingsModalOpen && state.activeProvocationRequestId === null) {
      openSelectionActionOverlay(
        {
          label: 'selected text',
          preview: `Selected text: "${trimExcerpt(mappedAnchor.selectedTextExcerpt, 100)}"`
        },
        selectionRect
      );
    }
    renderSelectionAnchorAffordance();
    renderProvocation();
    return;
  }

  state.selectionAnchor = computeSelectionAnchor(elements.sectionContent);
  state.selectionPopoverAnchorRect = readSelectionViewportRect(elements.sectionContent);
  state.pdfSelectionMappingFailed = false;
  if (
    state.selectionAnchor &&
    state.selectionPopoverAnchorRect &&
    openPopoverOnSelection &&
    !state.settingsModalOpen &&
    state.activeProvocationRequestId === null
  ) {
    openSelectionActionOverlay(
      {
        label: 'selected text',
        preview: `Selected text: "${trimExcerpt(state.selectionAnchor.selectedTextExcerpt, 100)}"`
      },
      state.selectionPopoverAnchorRect
    );
  }
  renderSelectionAnchorAffordance();
  renderProvocation();
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

const renderFeedFilters = (): void => {
  const filter = getActiveFeedFilter();
  elements.feedFilterAllButton.classList.toggle('active', filter === 'all');
  elements.feedFilterNotesButton.classList.toggle('active', filter === 'notes');
  elements.feedFilterProvocationButton.classList.toggle('active', filter === 'provocation');
};

const syncSelectedNoteCard = (): void => {
  const currentSelected = elements.unifiedFeedList.querySelector<HTMLElement>('.note-card.selected');
  if (currentSelected && currentSelected.dataset.noteId !== state.selectedNoteId) {
    currentSelected.classList.remove('selected');
  }

  if (!state.selectedNoteId) {
    return;
  }

  const nextSelected = elements.unifiedFeedList.querySelector<HTMLElement>(
    `article.note-card[data-note-id="${state.selectedNoteId}"]`
  );
  if (nextSelected) {
    nextSelected.classList.add('selected');
  }
};

const appendNoteAnchorMeta = (card: HTMLElement, note: NoteRecord): void => {
  const excerpt = formatNoteAnchorExcerpt(note.selectedTextExcerpt);
  if (!excerpt) {
    return;
  }

  const anchorMeta = document.createElement('p');
  anchorMeta.className = 'note-anchor hint';
  anchorMeta.textContent = excerpt;
  card.append(anchorMeta);
};

const renderUnifiedFeed = (): void => {
  elements.unifiedFeedList.replaceChildren();

  if (!state.activeSection) {
    renderSelectionAnchorAffordance();
    return;
  }

  renderSelectionAnchorAffordance();

  const activeSectionId = state.activeSection.section.id;
  const filter = getActiveFeedFilter();
  const rows = state.activeSection.unifiedFeed.filter((row) => {
    if (filter === 'all') {
      return true;
    }
    if (filter === 'notes') {
      return row.itemType === 'note';
    }
    return row.itemType === 'provocation';
  });

  if (state.activeProvocationRequestId !== null && filter !== 'notes') {
    const placeholder = document.createElement('article');
    placeholder.className = 'note-card provocation-card provocation-placeholder';

    const placeholderBody = document.createElement('div');
    placeholderBody.className = 'provocation-placeholder-body';

    const dot = document.createElement('span');
    dot.className = 'status-dot';
    dot.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.textContent = 'Generating provocation from selected text...';

    placeholderBody.append(dot, text);
    placeholder.append(placeholderBody);
    elements.unifiedFeedList.append(placeholder);
  }

  for (const row of rows) {
    if (row.itemType === 'note') {
      const note = state.activeSection.notes.find((candidate) => candidate.id === row.id);
      const inActiveSection = row.sectionId === activeSectionId;
      const card = document.createElement('article');
      card.className = 'note-card';
      card.dataset.noteId = row.id;
      if (row.id === state.selectedNoteId && inActiveSection) {
        card.classList.add('selected');
      }

      const cardHeader = document.createElement('div');
      cardHeader.className = 'note-card-header';

      const sectionHint = document.createElement('p');
      sectionHint.className = 'hint';
      sectionHint.textContent = `Section ${row.sectionOrderIndex + 1}: ${row.sectionHeading}`;
      cardHeader.append(sectionHint);

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'note-delete-button';
      deleteButton.textContent = 'x';
      deleteButton.setAttribute('aria-label', 'Delete note');
      deleteButton.title = 'Delete note';
      deleteButton.addEventListener('click', () => {
        void withUiErrorHandling(async () => {
          const envelope = (await desktopApi.note.delete({ noteId: row.id })) as Envelope<{ noteId: string }>;
          unwrapEnvelope(envelope);
          if (state.activeSection) {
            await openSection(state.activeSection.section.id, { preserveView: true });
          }
        });
      });
      cardHeader.append(deleteButton);
      card.append(cardHeader);

      if (note && inActiveSection) {
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
        appendNoteAnchorMeta(card, note);
      } else {
        const preview = document.createElement('p');
        preview.className = 'feed-text';
        preview.textContent = row.textContent;
        card.append(preview);

        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.className = 'secondary';
        openButton.textContent = 'Open Section';
        openButton.addEventListener('click', () => {
          void withUiErrorHandling(async () => {
            await openSection(row.sectionId);
            state.selectedNoteId = row.id;
            syncSelectedNoteCard();
          });
        });
        card.append(openButton);
      }

      elements.unifiedFeedList.append(card);
      continue;
    }

    const card = document.createElement('article');
    card.className = 'note-card provocation-card';

    const cardHeader = document.createElement('div');
    cardHeader.className = 'note-card-header';

    const sectionHint = document.createElement('p');
    sectionHint.className = 'hint';
    sectionHint.textContent = `Section ${row.sectionOrderIndex + 1}: ${row.sectionHeading}`;
    cardHeader.append(sectionHint);

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'note-delete-button';
    deleteButton.textContent = 'x';
    deleteButton.setAttribute('aria-label', 'Delete provocation');
    deleteButton.title = 'Delete provocation';
    deleteButton.addEventListener('click', () => {
      void withUiErrorHandling(async () => {
        const envelope = (await desktopApi.ai.deleteProvocation({
          provocationId: row.id
        })) as Envelope<{ provocationId: string; deleted: boolean }>;
        unwrapEnvelope(envelope);
        if (state.activeSection) {
          await openSection(state.activeSection.section.id, { preserveView: true });
        }
      });
    });
    cardHeader.append(deleteButton);
    card.append(cardHeader);

    const provocationText = document.createElement('pre');
    provocationText.className = 'provocation-output';
    provocationText.textContent = row.textContent;
    card.append(provocationText);

    if (row.sectionId !== activeSectionId) {
      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'secondary';
      openButton.textContent = 'Open Section';
      openButton.addEventListener('click', () => {
        void withUiErrorHandling(async () => {
          await openSection(row.sectionId);
        });
      });
      card.append(openButton);
    }

    elements.unifiedFeedList.append(card);
  }

  syncSelectedNoteCard();
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

const getWorkspaceDefaultProvocationStyle = (): ProvocationStyle =>
  state.settings?.defaultProvocationStyle ?? 'skeptical';

const getSelectionTriggeredProvocationTarget = (): SelectionTriggeredProvocationTarget | null => {
  const section = state.activeSection;
  if (!section) {
    return null;
  }

  if (state.selectionAnchor) {
    return {
      label: 'selected text',
      preview: `Selected text: "${trimExcerpt(state.selectionAnchor.selectedTextExcerpt, 100)}"`
    };
  }

  const selectedNote = state.selectedNoteId
    ? section.notes.find((note) => note.id === state.selectedNoteId) ?? null
    : null;
  if (selectedNote) {
    const trimmed = selectedNote.content.trim();
    const preview = trimmed ? trimExcerpt(trimmed, 100) : '(empty note)';
    return {
      noteId: selectedNote.id,
      label: 'selected note',
      preview: `Selected note: "${preview}"`
    };
  }

  return null;
};

const renderSelectionActionOverlay = (): void => {
  const target = state.pendingSelectionProvocationTarget;
  const preview = target?.preview ?? 'Selected target: -';
  elements.selectionActionPreview.textContent = preview;
  elements.selectionNotePreview.textContent = preview;

  const canContinue = Boolean(state.activeSection && target);
  const canCreateSelectionNote = Boolean(canContinue && target?.label === 'selected text');
  const aiAvailability = deriveAiAvailability();
  const canUseAi = Boolean(canContinue && aiAvailability.enabled);
  elements.selectionActionNoteButton.disabled = !canCreateSelectionNote;
  elements.selectionActionProvocationButton.disabled = !canUseAi;
  elements.selectionNoteCreateButton.disabled = !canCreateSelectionNote || state.activeProvocationRequestId !== null;
};

const renderProvocationStyleOverlay = (): void => {
  const activeStyle = state.pendingSelectionProvocationStyle;
  elements.provocationStyleMenuButton.textContent = `Style: ${activeStyle}`;
  elements.provocationStyleSelectionPreview.textContent =
    state.pendingSelectionProvocationTarget?.preview ?? 'Selected target: -';

  for (const option of provocationStyleOptions) {
    const style = option.dataset.style as ProvocationStyle | undefined;
    const selected = style === activeStyle;
    option.classList.toggle('active', selected);
    option.setAttribute('aria-selected', selected ? 'true' : 'false');
  }

  const canGenerate = Boolean(
    state.activeSection &&
      state.pendingSelectionProvocationTarget &&
      state.activeProvocationRequestId === null &&
      deriveAiAvailability().enabled
  );
  elements.provocationStyleGenerateButton.disabled = !canGenerate;

  if (state.provocationStyleOverlayOpen) {
    queueMicrotask(() => {
      positionProvocationStyleOverlay();
    });
  }
};

const openSelectionActionOverlay = (
  target: SelectionTriggeredProvocationTarget,
  anchorRect: ViewportRect
): void => {
  closeOutlineDrawer();
  state.pendingSelectionProvocationTarget = target;
  state.selectionPopoverAnchorRect = anchorRect;
  state.pendingSelectionProvocationStyle = getWorkspaceDefaultProvocationStyle();
  setSelectionPopoverMode('chooser');
  renderSelectionActionOverlay();
  renderProvocationStyleOverlay();
  const aiAvailability = deriveAiAvailability();
  elements.selectionActionMessage.textContent = aiAvailability.enabled ? '' : aiAvailability.message;
  elements.selectionNoteMessage.textContent = '';
  elements.provocationStyleMessage.textContent = '';
  setProvocationStyleOverlayOpen(true);
};

const setPendingSelectionProvocationStyle = (style: ProvocationStyle): void => {
  state.pendingSelectionProvocationStyle = style;
  setProvocationStyleMenuOpen(false);
  renderProvocationStyleOverlay();
};

const openProvocationStyleOverlay = (): void => {
  setSelectionPopoverMode('provocation');
  elements.provocationStyleMessage.textContent = '';
  renderProvocationStyleOverlay();
};

const openSelectionNoteOverlay = (): void => {
  setSelectionPopoverMode('note');
  elements.selectionNoteMessage.textContent = '';
  elements.selectionNoteInput.value = '';
  renderSelectionActionOverlay();
  queueMicrotask(() => {
    elements.selectionNoteInput.focus();
  });
};

const repositionSelectionTriggeredOverlay = (): void => {
  if (!state.provocationStyleOverlayOpen || state.pendingSelectionProvocationTarget?.label !== 'selected text') {
    return;
  }

  const rect = isPdfDocumentWithNativeSurface()
    ? readSelectionViewportRect(elements.pdfDocument)
    : readSelectionViewportRect(elements.sectionContent);
  if (!rect) {
    return;
  }

  state.selectionPopoverAnchorRect = rect;
  positionProvocationStyleOverlay();
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
  // Sidebar provocation controls were removed; only selection popover states need re-rendering here.
  renderSelectionActionOverlay();
  renderProvocationStyleOverlay();
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
  elements.generationStatus.classList.toggle('hidden', state.activeProvocationRequestId === null);
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
  state.selectedFeedFilterByDocument.clear();
  state.reassignmentQueue = [];
  state.selectionAnchor = null;
  state.pdfSelectionMappingFailed = false;
  state.selectionPopoverAnchorRect = null;
  state.pdfZoomByDocument.clear();
  state.pdfRenderToken += 1;
  state.pdfRenderFailed = false;
  clearPdfDocument();

  renderWorkspaceMode(true);
  updateTopBar();
  renderDocuments();
  renderSections();
  renderSectionView();
  renderUnassignedView();
  renderFeedFilters();
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
  if (state.provocationStyleOverlayOpen) {
    closeProvocationStyleOverlay();
  }

  if (state.activeDocumentId !== documentId) {
    state.pdfRenderToken += 1;
    state.pdfRenderFailed = false;
    state.selectionAnchor = null;
    state.pdfSelectionMappingFailed = false;
    state.selectionPopoverAnchorRect = null;
    clearPdfDocument();
  }

  const listingEnvelope = (await desktopApi.section.list({ documentId })) as Envelope<SectionListSnapshot>;
  const listing = unwrapEnvelope(listingEnvelope);

  state.activeDocumentId = documentId;
  state.sections = listing.sections;
  state.unassignedNotes = listing.unassignedNotes;
  upsertDocument(listing.document);

  if (!state.selectedFeedFilterByDocument.has(documentId)) {
    state.selectedFeedFilterByDocument.set(documentId, 'all');
  }

  if (!state.centerViewByDocument.has(documentId)) {
    state.centerViewByDocument.set(documentId, 'section');
  }

  const preferredSectionId = state.activeSectionByDocument.get(documentId) ?? listing.sections[0]?.id ?? null;

  updateTopBar();
  renderDocuments();
  renderSections();
  renderUnassignedView();
  renderFeedFilters();
  renderCenterView();

  if (preferredSectionId) {
    await openSection(preferredSectionId, { preserveView: true });
  } else {
    state.activeSection = null;
    state.selectedNoteId = null;
    state.selectionAnchor = null;
    state.pdfSelectionMappingFailed = false;
    state.selectionPopoverAnchorRect = null;
    renderSectionView();
    renderUnifiedFeed();
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
  if (state.provocationStyleOverlayOpen) {
    closeProvocationStyleOverlay();
  }

  const previousSourcePath = state.activeSection?.document.sourcePath ?? null;
  const envelope = (await desktopApi.section.get({ sectionId })) as Envelope<SectionSnapshot>;
  const snapshot = unwrapEnvelope(envelope);

  if (snapshot.document.sourcePath !== previousSourcePath) {
    state.pdfRenderToken += 1;
    state.pdfRenderFailed = false;
    clearPdfDocument();
  }

  state.activeSection = snapshot;
  state.activeDocumentId = snapshot.document.id;
  state.activeSectionByDocument.set(snapshot.document.id, sectionId);
  state.selectionAnchor = null;
  state.pdfSelectionMappingFailed = false;
  state.selectionPopoverAnchorRect = null;
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
  renderUnifiedFeed();
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

const handleNewNoteFromSelection = async (noteText: string): Promise<void> => {
  if (!state.activeSection) {
    return;
  }

  let selection = state.selectionAnchor;
  if (!selection && isPdfDocumentWithNativeSurface()) {
    const rawAnchor = computeSelectionAnchor(elements.pdfDocument);
    if (rawAnchor) {
      selection = mapPdfSelectionAnchorToOffsets(rawAnchor, state.activeSection.section.content);
      state.pdfSelectionMappingFailed = selection === null;
    }
  } else if (!selection) {
    selection = computeSelectionAnchor(elements.sectionContent);
  }

  if (state.pdfSelectionMappingFailed) {
    renderSelectionAnchorAffordance();
    throw new Error('Unable to map PDF selection to a deterministic anchor. Adjust the selection and try again.');
  }

  if (!selection) {
    throw new Error(
      isPdfDocumentWithNativeSurface()
        ? 'Select text in the PDF reader before creating a note from selection.'
        : 'Select text in the section reader before creating a note from selection.'
    );
  }

  const envelope = (await desktopApi.note.create({
    documentId: state.activeSection.document.id,
    sectionId: state.activeSection.section.id,
    text: noteText,
    paragraphOrdinal: selection.paragraphOrdinal,
    startOffset: selection.startOffset,
    endOffset: selection.endOffset,
    selectedTextExcerpt: selection.selectedTextExcerpt
  })) as Envelope<NoteRecord>;

  const created = unwrapEnvelope(envelope);
  state.selectionAnchor = null;
  state.pdfSelectionMappingFailed = false;
  state.selectionPopoverAnchorRect = null;
  state.selectedNoteId = created.id;
  await openSection(state.activeSection.section.id, { preserveView: true });
};

const generateProvocation = async (initial: {
  acknowledgeCloudWarning?: boolean;
  noteId?: string;
  style?: ProvocationStyle;
} = {}): Promise<void> => {
  const section = state.activeSection;
  if (!section) {
    return;
  }

  let acknowledgeCloudWarning = initial.acknowledgeCloudWarning ?? false;

  while (true) {
    const currentRequestId = requestId();
    state.activeProvocationRequestId = currentRequestId;
    renderProvocation();
    renderUnifiedFeed();
    renderStatusBar();

    try {
      const envelope = (await desktopApi.ai.generateProvocation({
        requestId: currentRequestId,
        documentId: section.document.id,
        sectionId: section.section.id,
        noteId: initial.noteId,
        style: initial.style,
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
      renderUnifiedFeed();
      renderStatusBar();
    }
  }
};


const handleSelectionActionChooseNote = (): void => {
  if (!state.pendingSelectionProvocationTarget) {
    return;
  }
  if (state.pendingSelectionProvocationTarget.label !== 'selected text') {
    elements.selectionActionMessage.textContent = 'Select text before creating a note from selection.';
    return;
  }
  openSelectionNoteOverlay();
};

const handleSelectionActionChooseProvocation = (): void => {
  if (!state.pendingSelectionProvocationTarget) {
    return;
  }
  const aiAvailability = deriveAiAvailability();
  if (!aiAvailability.enabled) {
    elements.selectionActionMessage.textContent = aiAvailability.message;
    return;
  }
  openProvocationStyleOverlay();
};

const handleSelectionTriggeredProvocationGenerate = async (): Promise<void> => {
  if (!state.pendingSelectionProvocationTarget) {
    return;
  }
  const aiAvailability = deriveAiAvailability();
  if (!aiAvailability.enabled) {
    elements.provocationStyleMessage.textContent = aiAvailability.message;
    return;
  }

  elements.provocationStyleMessage.textContent = '';
  const noteId = state.pendingSelectionProvocationTarget.noteId;
  closeProvocationStyleOverlay();
  await generateProvocation({
    noteId,
    style: state.pendingSelectionProvocationStyle
  });
};

const handleSelectionTriggeredNoteCreate = async (): Promise<void> => {
  if (!state.pendingSelectionProvocationTarget) {
    return;
  }

  elements.selectionNoteMessage.textContent = '';
  const noteText = elements.selectionNoteInput.value;
  await handleNewNoteFromSelection(noteText);
  elements.selectionNoteInput.value = '';
  closeProvocationStyleOverlay();
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
  closeSettingsModal();
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
    elements.selectionActionMessage.textContent = '';
    elements.selectionNoteMessage.textContent = '';
    elements.provocationStyleMessage.textContent = '';
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

    if (state.provocationStyleOverlayOpen) {
      if (state.selectionPopoverMode === 'note') {
        elements.selectionNoteMessage.textContent = message;
      } else if (state.selectionPopoverMode === 'provocation') {
        elements.provocationStyleMessage.textContent = message;
      } else {
        elements.selectionActionMessage.textContent = message;
      }
      elements.importMessage.textContent = message;
      elements.settingsMessage.textContent = message;
    } else if (state.settingsModalOpen) {
      elements.settingsMessage.textContent = message;
      elements.importMessage.textContent = message;
    } else if (getActiveDocument()) {
      elements.importMessage.textContent = message;
      elements.settingsMessage.textContent = message;
    } else {
      elements.workspaceMessage.textContent = message;
    }
  }
};

const wireEvents = (): void => {
  elements.sectionContent.addEventListener('mouseup', () => {
    updateSelectionAnchor({ openPopoverOnSelection: true });
  });
  elements.sectionContent.addEventListener('keyup', () => {
    updateSelectionAnchor({ openPopoverOnSelection: true });
  });
  elements.pdfDocument.addEventListener('mouseup', () => {
    updateSelectionAnchor({ openPopoverOnSelection: true });
  });
  elements.pdfDocument.addEventListener('keyup', () => {
    updateSelectionAnchor({ openPopoverOnSelection: true });
  });
  elements.sectionContent.addEventListener('scroll', () => {
    repositionSelectionTriggeredOverlay();
  });
  elements.pdfViewport.addEventListener('scroll', () => {
    repositionSelectionTriggeredOverlay();
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
      closeOutlineDrawer();
      await handleImport();
      appendLog('Document imported.');
    });
  });

  elements.unassignedNavButton.addEventListener('click', () => {
    closeOutlineDrawer();
    setCenterView('unassigned');
  });

  elements.outlineToggleButton.addEventListener('click', () => {
    toggleOutlineDrawer();
  });

  elements.outlineCloseButton.addEventListener('click', () => {
    closeOutlineDrawer();
  });

  elements.outlineBackdrop.addEventListener('click', () => {
    closeOutlineDrawer();
  });

  desktopApi.app.onSettingsOpen(() => {
    void withUiErrorHandling(async () => {
      await openSettingsModal();
    });
  });

  elements.settingsCloseButton.addEventListener('click', () => {
    closeSettingsModal();
  });

  elements.settingsCancelButton.addEventListener('click', () => {
    closeSettingsModal();
  });

  elements.settingsModal.addEventListener('click', (event) => {
    if (event.target === elements.settingsModal) {
      closeSettingsModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.provocationStyleOverlayOpen) {
      closeProvocationStyleOverlay();
      return;
    }

    if (event.key === 'Escape' && state.settingsModalOpen) {
      closeSettingsModal();
      return;
    }

    if (event.key === 'Escape' && state.outlineDrawerOpen) {
      closeOutlineDrawer();
    }
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Node)) {
      if (state.provocationStyleMenuOpen) {
        setProvocationStyleMenuOpen(false);
      }
      if (state.provocationStyleOverlayOpen) {
        closeProvocationStyleOverlay();
      }
      return;
    }

    if (state.provocationStyleOverlayOpen && !elements.provocationStyleOverlay.contains(event.target)) {
      if (Date.now() - state.provocationStyleOverlayOpenedAtMs < 180) {
        return;
      }
      closeProvocationStyleOverlay();
      return;
    }

    if (!state.provocationStyleMenuOpen) {
      return;
    }

    if (!elements.provocationStyleMenu.contains(event.target) && !elements.provocationStyleMenuButton.contains(event.target)) {
      setProvocationStyleMenuOpen(false);
    }
  });

  window.addEventListener('resize', () => {
    if (state.provocationStyleOverlayOpen) {
      positionProvocationStyleOverlay();
    }
  });

  elements.settingsReimportButton.addEventListener('click', () => {
    void withUiErrorHandling(async () => {
      await handleReimport();
      appendLog('Document re-imported.');
    });
  });

  elements.feedFilterAllButton.addEventListener('click', () => {
    setActiveFeedFilter('all');
  });

  elements.feedFilterNotesButton.addEventListener('click', () => {
    setActiveFeedFilter('notes');
  });

  elements.feedFilterProvocationButton.addEventListener('click', () => {
    setActiveFeedFilter('provocation');
  });

  elements.pdfZoomOutButton.addEventListener('click', () => {
    const currentZoom = state.activeSection ? getPdfZoom(state.activeSection.document.id) : PDF_ZOOM_DEFAULT;
    setPdfZoom(currentZoom - PDF_ZOOM_STEP);
  });
  elements.pdfZoomInButton.addEventListener('click', () => {
    const currentZoom = state.activeSection ? getPdfZoom(state.activeSection.document.id) : PDF_ZOOM_DEFAULT;
    setPdfZoom(currentZoom + PDF_ZOOM_STEP);
  });
  elements.pdfZoomResetButton.addEventListener('click', () => {
    setPdfZoom(PDF_ZOOM_DEFAULT);
  });

  elements.provocationStyleMenuButton.addEventListener('click', () => {
    setProvocationStyleMenuOpen(!state.provocationStyleMenuOpen);
  });

  elements.selectionActionNoteButton.addEventListener('click', () => {
    handleSelectionActionChooseNote();
  });

  elements.selectionActionProvocationButton.addEventListener('click', () => {
    handleSelectionActionChooseProvocation();
  });

  elements.selectionNoteBackButton.addEventListener('click', () => {
    setSelectionPopoverMode('chooser');
    renderSelectionActionOverlay();
  });

  elements.selectionNoteCreateButton.addEventListener('click', () => {
    void withUiErrorHandling(async () => {
      await handleSelectionTriggeredNoteCreate();
    });
  });

  for (const option of provocationStyleOptions) {
    option.addEventListener('click', () => {
      const style = option.dataset.style;
      if (!style || !PROVOCATION_STYLES.includes(style as ProvocationStyle)) {
        return;
      }
      setPendingSelectionProvocationStyle(style as ProvocationStyle);
    });
  }

  elements.provocationStyleCancelButton.addEventListener('click', () => {
    setSelectionPopoverMode('chooser');
    renderSelectionActionOverlay();
  });

  elements.provocationStyleGenerateButton.addEventListener('click', () => {
    void withUiErrorHandling(async () => {
      await handleSelectionTriggeredProvocationGenerate();
    });
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
  renderFeedFilters();
  renderSectionView();
  renderUnassignedView();
  renderUnifiedFeed();
  renderAuthSettings();
  renderProvocation();
  renderStatusBar();
  renderReassignmentModal();
  appendLog('Desktop shell loaded.');
};

void bootstrap();
