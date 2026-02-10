export type SaveNoteDraftFn = (noteId: string, content: string) => Promise<void> | void;

export class NoteAutosaveController {
  private readonly pendingDraftByNoteId = new Map<string, string>();

  private readonly timerByNoteId = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly saveDraft: SaveNoteDraftFn,
    private readonly debounceMs = 250
  ) {}

  queue(noteId: string, content: string): void {
    this.pendingDraftByNoteId.set(noteId, content);

    const existing = this.timerByNoteId.get(noteId);
    if (existing) {
      clearTimeout(existing);
    }

    const timeout = setTimeout(() => {
      void this.flush(noteId);
    }, this.debounceMs);

    this.timerByNoteId.set(noteId, timeout);
  }

  async onBlur(noteId: string): Promise<void> {
    await this.flush(noteId);
  }

  async flush(noteId: string): Promise<void> {
    const timer = this.timerByNoteId.get(noteId);
    if (timer) {
      clearTimeout(timer);
      this.timerByNoteId.delete(noteId);
    }

    const draft = this.pendingDraftByNoteId.get(noteId);
    if (draft === undefined) {
      return;
    }

    this.pendingDraftByNoteId.delete(noteId);
    await this.saveDraft(noteId, draft);
  }

  dispose(): void {
    for (const timer of this.timerByNoteId.values()) {
      clearTimeout(timer);
    }

    this.timerByNoteId.clear();
    this.pendingDraftByNoteId.clear();
  }
}
