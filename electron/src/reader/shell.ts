export type RightPaneTab = 'all' | 'notes' | 'provocation';
export type CenterView = 'section' | 'unassigned-notes';

export interface ReaderShellSnapshot {
  activeDocumentId: string | null;
  activeSectionId: string | null;
  selectedTab: RightPaneTab;
  centerView: CenterView;
  rightPaneTabs: readonly RightPaneTab[];
  leftNavItems: readonly string[];
}

const RIGHT_PANE_TABS: readonly RightPaneTab[] = ['all', 'notes', 'provocation'];
const LEFT_NAV_ITEMS: readonly string[] = ['sections', 'unassigned-notes'];

export class ReaderShellController {
  private activeDocumentId: string | null = null;

  private readonly selectedTabByDocument = new Map<string, RightPaneTab>();

  private readonly activeSectionByDocument = new Map<string, string | null>();

  private readonly centerViewByDocument = new Map<string, CenterView>();

  openDocument(documentId: string, initialSectionId: string | null = null): void {
    this.activeDocumentId = documentId;

    if (!this.selectedTabByDocument.has(documentId)) {
      this.selectedTabByDocument.set(documentId, 'all');
    }

    if (!this.centerViewByDocument.has(documentId)) {
      this.centerViewByDocument.set(documentId, 'section');
    }

    if (!this.activeSectionByDocument.has(documentId)) {
      this.activeSectionByDocument.set(documentId, initialSectionId);
    } else if (initialSectionId) {
      this.activeSectionByDocument.set(documentId, initialSectionId);
    }
  }

  selectSection(sectionId: string): void {
    const documentId = this.getActiveDocumentIdOrThrow();
    this.activeSectionByDocument.set(documentId, sectionId);
    this.centerViewByDocument.set(documentId, 'section');
  }

  openUnassignedNotesView(): void {
    const documentId = this.getActiveDocumentIdOrThrow();
    this.centerViewByDocument.set(documentId, 'unassigned-notes');
  }

  selectRightPaneTab(tab: RightPaneTab): void {
    const documentId = this.getActiveDocumentIdOrThrow();
    this.selectedTabByDocument.set(documentId, tab);
  }

  snapshot(): ReaderShellSnapshot {
    const documentId = this.activeDocumentId;

    return {
      activeDocumentId: documentId,
      activeSectionId: documentId ? (this.activeSectionByDocument.get(documentId) ?? null) : null,
      selectedTab: documentId ? (this.selectedTabByDocument.get(documentId) ?? 'all') : 'all',
      centerView: documentId ? (this.centerViewByDocument.get(documentId) ?? 'section') : 'section',
      rightPaneTabs: RIGHT_PANE_TABS,
      leftNavItems: LEFT_NAV_ITEMS
    };
  }

  private getActiveDocumentIdOrThrow(): string {
    if (!this.activeDocumentId) {
      throw new Error('No active document');
    }

    return this.activeDocumentId;
  }
}
