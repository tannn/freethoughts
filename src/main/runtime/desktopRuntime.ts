import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import {
  AiSettingsRepository,
  AiSettingsService,
  CodexAppServerClient,
  OpenAIClient,
  ProvocationService,
  RoutedProvocationGenerationClient,
  type ApiKeyManagementProvider,
  type ApiKeyProvider,
  type CodexAppServerGenerationTransport,
  type OpenAiTransport,
  type UpdateAiSettingsInput
} from '../../ai/index.js';
import { importDocumentFromPath } from '../../ingestion/runtimeImport.js';
import { createDocumentWithFingerprint, updateDocumentFingerprint } from '../../persistence/documents.js';
import {
  AuthSessionRepository,
  AUTH_SESSION_PROVIDER,
  type AuthSessionRecord,
  type AuthSessionStatus
} from '../../persistence/authSessions.js';
import { SqliteCli } from '../../persistence/migrations/sqliteCli.js';
import { runReimportTransaction, type ReimportSectionInput } from '../../persistence/reimportTransaction.js';
import {
  WorkspaceRepository,
  type WorkspaceAuthMode,
  type WorkspaceRecord
} from '../../persistence/workspaces.js';
import { NotesRepository, type NoteRecord } from '../../reader/notesRepository.js';
import { ReassignmentService, type UnassignedNoteItem } from '../../reader/reassignment.js';
import { getAiActionAvailability, getSourceFileStatus, type SourceFileStatus } from '../../reader/status.js';
import { AppError } from '../../shared/ipc/errors.js';
import { assertOnline, getNetworkStatus, type OnlineProvider } from '../network/status.js';
import {
  UnavailableCodexSubscriptionAuthAdapter,
  type CodexAuthSessionState,
  type CodexSubscriptionAuthAdapter
} from './codexSubscriptionAuthAdapter.js';

const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;

interface DocumentRow {
  id: string;
  workspace_id: string;
  source_path: string;
  current_revision_id: string | null;
  created_at: string;
  updated_at: string;
}

interface DocumentSummaryRow {
  id: string;
  workspace_id: string;
  source_path: string;
  current_revision_id: string | null;
  created_at: string;
  updated_at: string;
  section_count: number;
  unassigned_count: number;
  provocations_enabled: number | null;
}

interface SectionRow {
  id: string;
  document_id: string;
  revision_id: string;
  anchor_key: string;
  heading: string;
  order_index: number;
  content: string;
}

interface NextRevisionRow {
  next_revision_number: number;
}

interface NoteDocumentRow {
  id: string;
  document_id: string;
}

export interface DocumentSummary {
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

export interface WorkspaceSnapshot {
  workspace: WorkspaceRecord;
  documents: DocumentSummary[];
}

export interface SectionListItem {
  id: string;
  heading: string;
  orderIndex: number;
  anchorKey: string;
}

export interface SectionDetail {
  id: string;
  documentId: string;
  heading: string;
  content: string;
  orderIndex: number;
  anchorKey: string;
}

export interface SectionSnapshot {
  document: DocumentSummary;
  section: SectionDetail;
  notes: NoteRecord[];
  activeProvocation: ReturnType<ProvocationService['getActive']>;
  provocations: ReturnType<ProvocationService['listHistory']>;
  aiAvailability: ReturnType<typeof getAiActionAvailability>;
  sourceFileStatus: SourceFileStatus;
}

export interface SectionListSnapshot {
  document: DocumentSummary;
  sections: SectionListItem[];
  unassignedNotes: UnassignedNoteItem[];
}

export interface DocumentSnapshot {
  document: DocumentSummary;
  sections: SectionListItem[];
  unassignedNotes: UnassignedNoteItem[];
  firstSectionId: string | null;
  sourceFileStatus: SourceFileStatus;
}

export interface RuntimeApiKeyProvider extends ApiKeyManagementProvider, ApiKeyProvider {}

export interface DesktopRuntimeOptions {
  dbPath: string;
  apiKeyProvider: RuntimeApiKeyProvider;
  codexAuthAdapter?: CodexSubscriptionAuthAdapter;
  codexAppServerTransport?: CodexAppServerGenerationTransport;
  onlineProvider?: OnlineProvider;
  openAiTransport?: OpenAiTransport;
}

export interface GenerateProvocationPayload {
  requestId: string;
  documentId: string;
  sectionId: string;
  noteId?: string;
  style?: 'skeptical' | 'creative' | 'methodological';
  confirmReplace?: boolean;
  acknowledgeCloudWarning?: boolean;
}

export interface UpdateSettingsPayload extends UpdateAiSettingsInput {
  documentId?: string;
  provocationsEnabled?: boolean;
}

export interface AuthStatusSnapshot {
  mode: WorkspaceAuthMode;
  codex: {
    provider: typeof AUTH_SESSION_PROVIDER;
    available: boolean;
    status: AuthSessionStatus;
    accountLabel: string | null;
    lastValidatedAt: string | null;
  };
}

export interface AuthLoginStartSnapshot {
  authUrl: string;
  correlationState: string;
}

export class DesktopRuntime {
  private readonly dbPath: string;

  private readonly sqlite: SqliteCli;

  private readonly workspaceRepository: WorkspaceRepository;

  private readonly authSessionRepository: AuthSessionRepository;

  private readonly notesRepository: NotesRepository;

  private readonly reassignmentService: ReassignmentService;

  private readonly settingsRepository: AiSettingsRepository;

  private readonly settingsService: AiSettingsService;

  private readonly apiKeyProvider: RuntimeApiKeyProvider;

  private readonly openAiClient: OpenAIClient;

  private readonly codexAppServerClient: CodexAppServerClient;

  private readonly provocationService: ProvocationService;

  private readonly codexAuthAdapter: CodexSubscriptionAuthAdapter;

  private readonly onlineProvider?: OnlineProvider;

  private activeWorkspaceId: string | null = null;

  constructor(options: DesktopRuntimeOptions) {
    this.dbPath = options.dbPath;
    this.sqlite = new SqliteCli(this.dbPath);
    this.workspaceRepository = new WorkspaceRepository(this.dbPath);
    this.authSessionRepository = new AuthSessionRepository(this.dbPath);
    this.notesRepository = new NotesRepository(this.dbPath);
    this.reassignmentService = new ReassignmentService(this.dbPath);
    this.settingsRepository = new AiSettingsRepository(this.dbPath);
    this.apiKeyProvider = options.apiKeyProvider;
    this.settingsService = new AiSettingsService(this.settingsRepository, this.apiKeyProvider);
    this.openAiClient = new OpenAIClient(
      this.settingsRepository,
      this.apiKeyProvider,
      options.openAiTransport
    );
    this.codexAppServerClient = new CodexAppServerClient({
      settingsRepository: this.settingsRepository,
      transport: options.codexAppServerTransport
    });
    const generationClient = new RoutedProvocationGenerationClient(
      () => this.resolveGenerationClientForActiveWorkspace(),
      [this.openAiClient, this.codexAppServerClient]
    );
    this.provocationService = new ProvocationService(
      this.dbPath,
      this.settingsRepository,
      generationClient
    );
    this.codexAuthAdapter = options.codexAuthAdapter ?? new UnavailableCodexSubscriptionAuthAdapter();
    this.onlineProvider = options.onlineProvider;
  }

  openWorkspace(workspacePath: string): WorkspaceSnapshot {
    const workspace = this.workspaceRepository.openWorkspace(workspacePath);
    this.activeWorkspaceId = workspace.id;
    return {
      workspace,
      documents: this.listWorkspaceDocuments(workspace.id)
    };
  }

  createWorkspace(workspacePath: string): WorkspaceSnapshot {
    const absoluteWorkspacePath = resolve(workspacePath.trim());
    try {
      mkdirSync(absoluteWorkspacePath, { recursive: true });
    } catch {
      throw new AppError('E_INTERNAL', 'Failed to create workspace folder', {
        workspacePath: absoluteWorkspacePath
      });
    }

    const workspace = this.workspaceRepository.createWorkspace(absoluteWorkspacePath);
    this.activeWorkspaceId = workspace.id;
    return {
      workspace,
      documents: this.listWorkspaceDocuments(workspace.id)
    };
  }

  importDocument(sourcePath: string): DocumentSnapshot {
    const workspaceId = this.requireActiveWorkspaceId();
    const imported = importDocumentFromPath(sourcePath);
    const existing = this.findDocumentBySourcePath(workspaceId, imported.sourcePath);
    if (existing) {
      throw new AppError('E_CONFLICT', 'Document already imported in this workspace', {
        documentId: existing.id,
        sourcePath: imported.sourcePath
      });
    }

    const documentId = `doc-${randomUUID()}`;
    const revisionId = `rev-${randomUUID()}`;

    createDocumentWithFingerprint(this.dbPath, {
      id: documentId,
      workspaceId,
      sourcePath: imported.sourcePath,
      currentRevisionId: null,
      fingerprint: imported.fingerprint
    });

    const sections = this.mapReimportSections(documentId, imported.sections);

    try {
      runReimportTransaction(this.dbPath, {
        documentId,
        revisionId,
        revisionNumber: 1,
        sourcePath: imported.sourcePath,
        sourceSize: imported.fingerprint.size,
        sourceMtime: imported.fingerprint.mtime,
        sourceSha256: imported.fingerprint.sha256,
        sections
      });
    } catch (error) {
      this.sqlite.exec(`DELETE FROM documents WHERE id = ${sqlString(documentId)};`);
      throw error;
    }

    return this.buildDocumentSnapshot(documentId);
  }

  reimportDocument(documentId: string): DocumentSnapshot {
    const document = this.requireDocumentInActiveWorkspace(documentId);
    const sourceStatus = getSourceFileStatus(document.source_path);
    if (sourceStatus.status === 'missing') {
      throw new AppError('E_NOT_FOUND', sourceStatus.message, {
        documentId,
        sourcePath: document.source_path,
        actions: sourceStatus.actions
      });
    }

    const imported = importDocumentFromPath(document.source_path);
    const revisionId = `rev-${randomUUID()}`;
    const nextRevisionNumber = this.getNextRevisionNumber(documentId);
    const sections = this.mapReimportSections(documentId, imported.sections);

    runReimportTransaction(this.dbPath, {
      documentId,
      revisionId,
      revisionNumber: nextRevisionNumber,
      sourcePath: imported.sourcePath,
      sourceSize: imported.fingerprint.size,
      sourceMtime: imported.fingerprint.mtime,
      sourceSha256: imported.fingerprint.sha256,
      sections
    });

    return this.buildDocumentSnapshot(documentId);
  }

  locateDocument(documentId: string, sourcePath: string): DocumentSnapshot {
    const document = this.requireDocumentInActiveWorkspace(documentId);
    const imported = importDocumentFromPath(sourcePath);

    updateDocumentFingerprint(this.dbPath, {
      documentId: document.id,
      sourcePath: imported.sourcePath,
      fingerprint: imported.fingerprint
    });

    return this.buildDocumentSnapshot(document.id);
  }

  listSections(documentId: string): SectionListSnapshot {
    this.requireDocumentInActiveWorkspace(documentId);
    const document = this.requireDocumentSummary(documentId);
    const sections = this.listCurrentSections(documentId).map((section) => ({
      id: section.id,
      heading: section.heading,
      orderIndex: section.order_index,
      anchorKey: section.anchor_key
    }));

    return {
      document,
      sections,
      unassignedNotes: this.reassignmentService.listUnassignedNotes(documentId)
    };
  }

  getSection(sectionId: string): SectionSnapshot {
    const section = this.requireCurrentRevisionSection(sectionId);
    const document = this.requireDocumentInActiveWorkspace(section.document_id);
    const documentSummary = this.requireDocumentSummary(document.id);
    const notes = this.notesRepository.listBySection(document.id, section.id);
    const network = getNetworkStatus(this.onlineProvider);
    const aiAvailability = getAiActionAvailability(network.online, documentSummary.provocationsEnabled);
    const provocationHistory = this.provocationService.listHistory(section.document_id, section.id);

    return {
      document: documentSummary,
      section: {
        id: section.id,
        documentId: section.document_id,
        heading: section.heading,
        content: section.content,
        orderIndex: section.order_index,
        anchorKey: section.anchor_key
      },
      notes,
      activeProvocation: provocationHistory[0] ?? null,
      provocations: provocationHistory,
      aiAvailability,
      sourceFileStatus: getSourceFileStatus(document.source_path)
    };
  }

  createNote(payload: {
    documentId: string;
    sectionId: string;
    text: string;
    paragraphOrdinal?: number | null;
    startOffset?: number | null;
    endOffset?: number | null;
    selectedTextExcerpt?: string | null;
  }): NoteRecord {
    this.requireDocumentInActiveWorkspace(payload.documentId);
    this.assertSectionInCurrentRevision(payload.documentId, payload.sectionId);
    return this.notesRepository.create({
      documentId: payload.documentId,
      sectionId: payload.sectionId,
      content: payload.text,
      paragraphOrdinal: payload.paragraphOrdinal ?? null,
      startOffset: payload.startOffset ?? null,
      endOffset: payload.endOffset ?? null,
      selectedTextExcerpt: payload.selectedTextExcerpt ?? null
    });
  }

  updateNote(payload: { noteId: string; text: string }): NoteRecord {
    const note = this.requireNote(payload.noteId);
    this.requireDocumentInActiveWorkspace(note.document_id);
    return this.notesRepository.update(payload.noteId, payload.text);
  }

  deleteNote(payload: { noteId: string }): { noteId: string } {
    const note = this.requireNote(payload.noteId);
    this.requireDocumentInActiveWorkspace(note.document_id);
    this.notesRepository.delete(payload.noteId);
    return { noteId: payload.noteId };
  }

  reassignNote(payload: { noteId: string; targetSectionId: string }): {
    noteId: string;
    targetSectionId: string;
    unassignedNotes: UnassignedNoteItem[];
  } {
    const note = this.requireNote(payload.noteId);
    this.requireDocumentInActiveWorkspace(note.document_id);

    this.reassignmentService.reassign(note.document_id, payload.noteId, payload.targetSectionId);

    return {
      noteId: payload.noteId,
      targetSectionId: payload.targetSectionId,
      unassignedNotes: this.reassignmentService.listUnassignedNotes(note.document_id)
    };
  }

  async generateProvocation(payload: GenerateProvocationPayload) {
    const workspace = this.requireActiveWorkspace();
    const document = this.requireDocumentInActiveWorkspace(payload.documentId);
    assertOnline(this.onlineProvider);
    this.ensureCloudWarningAcknowledged(Boolean(payload.acknowledgeCloudWarning));

    const sourceStatus = getSourceFileStatus(document.source_path);
    if (sourceStatus.status === 'missing') {
      throw new AppError('E_NOT_FOUND', sourceStatus.message, {
        documentId: document.id,
        sourcePath: document.source_path,
        actions: sourceStatus.actions
      });
    }
    if (workspace.authMode === 'codex_subscription') {
      await this.ensureCodexGenerationReady(workspace.id);
    }

    return this.provocationService.generate({
      requestId: payload.requestId,
      documentId: payload.documentId,
      sectionId: payload.sectionId,
      noteId: payload.noteId,
      style: payload.style,
      confirmReplace: payload.confirmReplace
    });
  }

  cancelAiRequest(
    payload: { requestId: string } | { documentId: string; sectionId: string; dismissActive: true }
  ): { requestId: string; cancelled: boolean } | { dismissed: boolean } {
    if ('dismissActive' in payload && payload.dismissActive) {
      this.requireDocumentInActiveWorkspace(payload.documentId);
      this.provocationService.dismiss(payload.documentId, payload.sectionId);
      return { dismissed: true };
    }

    if (!('requestId' in payload)) {
      throw new AppError('E_VALIDATION', 'requestId is required for cancel');
    }

    return {
      requestId: payload.requestId,
      cancelled: this.provocationService.cancel(payload.requestId)
    };
  }

  deleteProvocation(payload: { provocationId: string }): { provocationId: string; deleted: boolean } {
    const provocation = this.provocationService.getById(payload.provocationId);
    if (!provocation || !provocation.isActive) {
      throw new AppError('E_NOT_FOUND', 'Provocation not found', {
        provocationId: payload.provocationId
      });
    }

    this.requireDocumentInActiveWorkspace(provocation.documentId);
    const deleted = this.provocationService.deleteById(payload.provocationId);
    return { provocationId: payload.provocationId, deleted };
  }

  async getSettings() {
    const settings = this.settingsService.getSettings();
    const auth = await this.getAuthStatus();
    return {
      ...settings,
      auth
    };
  }

  updateSettings(payload: UpdateSettingsPayload) {
    let documentSettings:
      | {
          documentId: string;
          provocationsEnabled: boolean;
        }
      | undefined;

    if (payload.documentId !== undefined || payload.provocationsEnabled !== undefined) {
      if (!payload.documentId) {
        throw new AppError('E_VALIDATION', 'documentId is required when updating document settings', {
          field: 'documentId'
        });
      }

      if (payload.provocationsEnabled === undefined) {
        throw new AppError('E_VALIDATION', 'provocationsEnabled is required when updating document settings', {
          field: 'provocationsEnabled'
        });
      }

      this.requireDocumentInActiveWorkspace(payload.documentId);
      documentSettings = this.settingsRepository.updateDocumentSettings(payload.documentId, {
        provocationsEnabled: payload.provocationsEnabled
      });
    }

    const workspaceSettingsPatch: UpdateAiSettingsInput = {
      generationModel: payload.generationModel,
      defaultProvocationStyle: payload.defaultProvocationStyle,
      openAiApiKey: payload.openAiApiKey,
      clearOpenAiApiKey: payload.clearOpenAiApiKey
    };

    const shouldUpdateWorkspaceSettings =
      workspaceSettingsPatch.generationModel !== undefined ||
      workspaceSettingsPatch.defaultProvocationStyle !== undefined ||
      workspaceSettingsPatch.openAiApiKey !== undefined ||
      workspaceSettingsPatch.clearOpenAiApiKey !== undefined;

    const workspaceSettings = shouldUpdateWorkspaceSettings
      ? this.settingsService.updateSettings(workspaceSettingsPatch)
      : this.settingsService.getSettings();

    return {
      ...workspaceSettings,
      ...(documentSettings
        ? {
            documentSettings
          }
        : {})
    };
  }

  getNetworkStatus() {
    return getNetworkStatus(this.onlineProvider);
  }

  async getAuthStatus(): Promise<AuthStatusSnapshot> {
    const workspace = this.requireActiveWorkspace();
    const persistedSession = this.authSessionRepository.getCodexSession(workspace.id);

    if (workspace.authMode !== 'codex_subscription') {
      return this.buildAuthStatusSnapshot(workspace, persistedSession, true);
    }

    const adapterStatus = await this.getCodexStatusFromAdapter(workspace.id);
    if (!adapterStatus.available) {
      return this.buildAuthStatusSnapshot(workspace, persistedSession, false);
    }

    const session = this.persistCodexSessionState(workspace.id, adapterStatus.session);
    return this.buildAuthStatusSnapshot(workspace, session, true);
  }

  async startAuthLogin(): Promise<AuthLoginStartSnapshot> {
    const workspace = this.requireActiveWorkspace();
    this.requireCodexMode(workspace, 'Codex subscription login requires Codex auth mode');

    const result = await this.codexAuthAdapter.loginStart({ workspaceId: workspace.id });
    const authUrl = result.authUrl.trim();
    const correlationState = result.correlationState.trim();

    if (!authUrl || !correlationState) {
      throw new AppError('E_PROVIDER', 'Codex auth login start returned invalid data', {
        action: 'retry_login'
      });
    }

    this.authSessionRepository.upsertCodexSession(workspace.id, { status: 'pending' });
    return { authUrl, correlationState };
  }

  async completeAuthLogin(correlationState: string): Promise<AuthStatusSnapshot> {
    const workspace = this.requireActiveWorkspace();
    this.requireCodexMode(workspace, 'Codex subscription login completion requires Codex auth mode');

    const normalizedCorrelationState = correlationState.trim();
    if (!normalizedCorrelationState) {
      throw new AppError('E_VALIDATION', 'correlationState is required', { field: 'correlationState' });
    }

    const adapterState = await this.codexAuthAdapter.loginComplete({
      workspaceId: workspace.id,
      correlationState: normalizedCorrelationState
    });
    const session = this.persistCodexSessionState(workspace.id, adapterState);

    if (session.status === 'authenticated') {
      return this.buildAuthStatusSnapshot(workspace, session, true);
    }

    throw this.actionableAuthStateError(session.status);
  }

  async logoutAuth(): Promise<AuthStatusSnapshot> {
    const workspace = this.requireActiveWorkspace();
    let adapterAvailable = true;

    try {
      await this.codexAuthAdapter.logout({ workspaceId: workspace.id });
    } catch (error) {
      if (error instanceof AppError && error.code === 'E_PROVIDER') {
        adapterAvailable = false;
      } else {
        throw error;
      }
    }

    const session = this.authSessionRepository.upsertCodexSession(workspace.id, {
      status: 'signed_out',
      accountLabel: null,
      lastValidatedAt: null
    });

    return this.buildAuthStatusSnapshot(workspace, session, adapterAvailable);
  }

  async switchAuthMode(mode: WorkspaceAuthMode): Promise<AuthStatusSnapshot> {
    const workspaceId = this.requireActiveWorkspaceId();
    const updatedWorkspace = this.workspaceRepository.updateAuthMode(workspaceId, mode);
    if (mode === 'codex_subscription') {
      return this.getAuthStatus();
    }

    const session = this.authSessionRepository.getCodexSession(workspaceId);
    return this.buildAuthStatusSnapshot(updatedWorkspace, session, true);
  }

  private requireActiveWorkspaceId(): string {
    if (!this.activeWorkspaceId) {
      throw new AppError('E_CONFLICT', 'No workspace is open. Open or create a workspace first.');
    }

    return this.activeWorkspaceId;
  }

  private requireActiveWorkspace(): WorkspaceRecord {
    const workspaceId = this.requireActiveWorkspaceId();
    const workspace = this.workspaceRepository.getWorkspaceById(workspaceId);
    if (!workspace) {
      throw new AppError('E_NOT_FOUND', 'Active workspace not found', { workspaceId });
    }
    return workspace;
  }

  private ensureCloudWarningAcknowledged(acknowledgeCloudWarning: boolean): void {
    const workspace = this.requireActiveWorkspace();

    if (workspace.cloudWarningAcknowledgedAt) {
      return;
    }

    if (!acknowledgeCloudWarning) {
      throw new AppError(
        'E_CONFLICT',
        'Cloud processing warning acknowledgment is required before first AI action.',
        {
          requiresCloudWarningAcknowledgment: true,
          workspaceId: workspace.id
        }
      );
    }

    this.workspaceRepository.acknowledgeCloudWarning(workspace.id);
  }

  private async getCodexStatusFromAdapter(
    workspaceId: string
  ): Promise<{ available: true; session: CodexAuthSessionState } | { available: false }> {
    try {
      const session = await this.codexAuthAdapter.getStatus({ workspaceId });
      return { available: true, session };
    } catch (error) {
      if (error instanceof AppError && error.code === 'E_PROVIDER') {
        return { available: false };
      }

      throw error;
    }
  }

  private resolveGenerationClientForActiveWorkspace() {
    const workspace = this.requireActiveWorkspace();
    return workspace.authMode === 'codex_subscription'
      ? this.codexAppServerClient
      : this.openAiClient;
  }

  private async ensureCodexGenerationReady(workspaceId: string): Promise<void> {
    const adapterStatus = await this.getCodexStatusFromAdapter(workspaceId);
    if (!adapterStatus.available) {
      throw this.authRuntimeUnavailableError();
    }

    const session = this.persistCodexSessionState(workspaceId, adapterStatus.session);
    if (session.status !== 'authenticated') {
      throw this.actionableAuthStateError(session.status);
    }
  }

  private persistCodexSessionState(workspaceId: string, state: CodexAuthSessionState): AuthSessionRecord {
    const lastValidatedAt =
      state.lastValidatedAt !== undefined
        ? state.lastValidatedAt
        : (state.status === 'authenticated' ? new Date().toISOString() : null);

    return this.authSessionRepository.upsertCodexSession(workspaceId, {
      status: state.status,
      accountLabel: state.accountLabel ?? null,
      lastValidatedAt
    });
  }

  private buildAuthStatusSnapshot(
    workspace: WorkspaceRecord,
    session: AuthSessionRecord | null,
    adapterAvailable: boolean
  ): AuthStatusSnapshot {
    return {
      mode: workspace.authMode,
      codex: {
        provider: AUTH_SESSION_PROVIDER,
        available: adapterAvailable,
        status: session?.status ?? 'signed_out',
        accountLabel: session?.accountLabel ?? null,
        lastValidatedAt: session?.lastValidatedAt ?? null
      }
    };
  }

  private actionableAuthStateError(status: AuthSessionStatus): AppError {
    if (status === 'cancelled') {
      return new AppError('E_CONFLICT', 'Codex subscription login cancelled.', {
        authStatus: status,
        action: 'retry_or_switch_mode',
        options: ['retry_login', 'switch_to_api_key']
      });
    }

    if (status === 'expired') {
      return new AppError('E_UNAUTHORIZED', 'Codex subscription session expired.', {
        authStatus: status,
        action: 'reauth',
        options: ['sign_in_again', 'switch_to_api_key']
      });
    }

    if (status === 'invalid') {
      return new AppError('E_UNAUTHORIZED', 'Codex subscription session is invalid.', {
        authStatus: status,
        action: 'reauth',
        options: ['sign_in_again', 'switch_to_api_key']
      });
    }

    if (status === 'pending') {
      return new AppError('E_CONFLICT', 'Codex subscription login is still pending completion.', {
        authStatus: status,
        action: 'complete_login'
      });
    }

    return new AppError('E_UNAUTHORIZED', 'Codex subscription login required.', {
      authStatus: status,
      action: 'login',
      options: ['start_login', 'switch_to_api_key']
    });
  }

  private authRuntimeUnavailableError(): AppError {
    return new AppError('E_PROVIDER', 'Codex subscription login is unavailable in this runtime.', {
      action: 'switch_to_api_key',
      options: ['switch_to_api_key']
    });
  }

  private requireCodexMode(workspace: WorkspaceRecord, message: string): void {
    if (workspace.authMode === 'codex_subscription') {
      return;
    }

    throw new AppError('E_CONFLICT', message, {
      authMode: workspace.authMode,
      requiredAuthMode: 'codex_subscription',
      action: 'auth.switchMode'
    });
  }

  private mapReimportSections(
    documentId: string,
    sections: Array<{ anchorKey: string; heading: string; orderIndex: number; content: string }>
  ): ReimportSectionInput[] {
    return sections.map((section, index) => ({
      id: `sec-${randomUUID()}`,
      anchorKey: section.anchorKey,
      heading: section.heading,
      ordinal: this.parseAnchorOrdinal(section.anchorKey),
      orderIndex: section.orderIndex ?? index,
      content: section.content
    }));
  }

  private parseAnchorOrdinal(anchorKey: string): number {
    const hashIndex = anchorKey.lastIndexOf('#');
    if (hashIndex === -1) {
      return 1;
    }

    const ordinal = Number.parseInt(anchorKey.slice(hashIndex + 1), 10);
    return Number.isFinite(ordinal) && ordinal > 0 ? ordinal : 1;
  }

  private getNextRevisionNumber(documentId: string): number {
    const rows = this.sqlite.queryJson<NextRevisionRow>(`
      SELECT COALESCE(MAX(revision_number), 0) + 1 AS next_revision_number
      FROM document_revisions
      WHERE document_id = ${sqlString(documentId)};
    `);

    return rows[0]?.next_revision_number ?? 1;
  }

  private requireDocumentInActiveWorkspace(documentId: string): DocumentRow {
    const workspaceId = this.requireActiveWorkspaceId();
    const rows = this.sqlite.queryJson<DocumentRow>(`
      SELECT id, workspace_id, source_path, current_revision_id, created_at, updated_at
      FROM documents
      WHERE id = ${sqlString(documentId)}
      LIMIT 1;
    `);

    const document = rows[0];
    if (!document) {
      throw new AppError('E_NOT_FOUND', 'Document not found', { documentId });
    }

    if (document.workspace_id !== workspaceId) {
      throw new AppError('E_CONFLICT', 'Document does not belong to active workspace', {
        documentId,
        activeWorkspaceId: workspaceId
      });
    }

    return document;
  }

  private requireCurrentRevisionSection(sectionId: string): SectionRow {
    const rows = this.sqlite.queryJson<SectionRow>(`
      SELECT s.id, s.document_id, s.revision_id, s.anchor_key, s.heading, s.order_index, s.content
      FROM sections s
      INNER JOIN documents d ON d.id = s.document_id
      WHERE s.id = ${sqlString(sectionId)}
        AND s.revision_id = d.current_revision_id
      LIMIT 1;
    `);

    const section = rows[0];
    if (!section) {
      throw new AppError('E_NOT_FOUND', 'Section not found in current document revision', { sectionId });
    }

    return section;
  }

  private requireNote(noteId: string): NoteDocumentRow {
    const rows = this.sqlite.queryJson<NoteDocumentRow>(`
      SELECT id, document_id
      FROM notes
      WHERE id = ${sqlString(noteId)}
      LIMIT 1;
    `);

    const note = rows[0];
    if (!note) {
      throw new AppError('E_NOT_FOUND', 'Note not found', { noteId });
    }

    return note;
  }

  private listCurrentSections(documentId: string): SectionRow[] {
    const rows = this.sqlite.queryJson<SectionRow>(`
      SELECT id, document_id, revision_id, anchor_key, heading, order_index, content
      FROM sections
      WHERE document_id = ${sqlString(documentId)}
        AND revision_id = (
          SELECT current_revision_id
          FROM documents
          WHERE id = ${sqlString(documentId)}
          LIMIT 1
        )
      ORDER BY order_index ASC;
    `);

    return rows;
  }

  private assertSectionInCurrentRevision(documentId: string, sectionId: string): void {
    const rows = this.sqlite.queryJson<{ id: string }>(`
      SELECT s.id
      FROM sections s
      INNER JOIN documents d ON d.id = s.document_id
      WHERE s.id = ${sqlString(sectionId)}
        AND s.document_id = ${sqlString(documentId)}
        AND s.revision_id = d.current_revision_id
      LIMIT 1;
    `);

    if (!rows[0]) {
      throw new AppError('E_CONFLICT', 'Section is not in current document revision', {
        documentId,
        sectionId
      });
    }
  }

  private buildDocumentSnapshot(documentId: string): DocumentSnapshot {
    const document = this.requireDocumentSummary(documentId);
    const sections = this.listCurrentSections(documentId).map((section) => ({
      id: section.id,
      heading: section.heading,
      orderIndex: section.order_index,
      anchorKey: section.anchor_key
    }));

    const unassignedNotes = this.reassignmentService.listUnassignedNotes(documentId);

    return {
      document,
      sections,
      unassignedNotes,
      firstSectionId: sections[0]?.id ?? null,
      sourceFileStatus: document.sourceFileStatus
    };
  }

  private requireDocumentSummary(documentId: string): DocumentSummary {
    const rows = this.sqlite.queryJson<DocumentSummaryRow>(`
      SELECT
        d.id,
        d.workspace_id,
        d.source_path,
        d.current_revision_id,
        d.created_at,
        d.updated_at,
        (
          SELECT COUNT(*)
          FROM sections s
          WHERE s.document_id = d.id
            AND s.revision_id = d.current_revision_id
        ) AS section_count,
        (
          SELECT COUNT(*)
          FROM note_reassignment_queue q
          WHERE q.document_id = d.id
            AND q.status = 'open'
        ) AS unassigned_count,
        COALESCE(ds.provocations_enabled, 1) AS provocations_enabled
      FROM documents d
      LEFT JOIN document_settings ds ON ds.document_id = d.id
      WHERE d.id = ${sqlString(documentId)}
      LIMIT 1;
    `);

    const row = rows[0];
    if (!row) {
      throw new AppError('E_NOT_FOUND', 'Document not found', { documentId });
    }

    return this.mapDocumentSummaryRow(row);
  }

  private listWorkspaceDocuments(workspaceId: string): DocumentSummary[] {
    const rows = this.sqlite.queryJson<DocumentSummaryRow>(`
      SELECT
        d.id,
        d.workspace_id,
        d.source_path,
        d.current_revision_id,
        d.created_at,
        d.updated_at,
        (
          SELECT COUNT(*)
          FROM sections s
          WHERE s.document_id = d.id
            AND s.revision_id = d.current_revision_id
        ) AS section_count,
        (
          SELECT COUNT(*)
          FROM note_reassignment_queue q
          WHERE q.document_id = d.id
            AND q.status = 'open'
        ) AS unassigned_count,
        COALESCE(ds.provocations_enabled, 1) AS provocations_enabled
      FROM documents d
      LEFT JOIN document_settings ds ON ds.document_id = d.id
      WHERE d.workspace_id = ${sqlString(workspaceId)}
      ORDER BY d.updated_at DESC, d.created_at DESC, d.id ASC;
    `);

    return rows.map((row) => this.mapDocumentSummaryRow(row));
  }

  private mapDocumentSummaryRow(row: DocumentSummaryRow): DocumentSummary {
    const extension = extname(row.source_path).toLowerCase();
    const fileType =
      extension === '.pdf' || extension === '.txt' || extension === '.md'
        ? (extension.slice(1) as 'pdf' | 'txt' | 'md')
        : 'unknown';

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      title: this.extractTitle(row.source_path),
      sourcePath: row.source_path,
      fileType,
      currentRevisionId: row.current_revision_id,
      sectionCount: row.section_count,
      unassignedCount: row.unassigned_count,
      provocationsEnabled: (row.provocations_enabled ?? 1) === 1,
      sourceFileStatus: getSourceFileStatus(row.source_path),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private extractTitle(sourcePath: string): string {
    const normalized = sourcePath.replaceAll('\\', '/');
    const segments = normalized.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? sourcePath;
  }

  private findDocumentBySourcePath(workspaceId: string, sourcePath: string): DocumentRow | null {
    const rows = this.sqlite.queryJson<DocumentRow>(`
      SELECT id, workspace_id, source_path, current_revision_id, created_at, updated_at
      FROM documents
      WHERE workspace_id = ${sqlString(workspaceId)}
        AND source_path = ${sqlString(sourcePath)}
      LIMIT 1;
    `);

    return rows[0] ?? null;
  }
}
