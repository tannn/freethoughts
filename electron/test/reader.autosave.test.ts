import { afterEach, describe, expect, it, vi } from 'vitest';
import { NoteAutosaveController } from '../src/reader/autosave.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('note autosave controller', () => {
  it('autosaves on short debounce using latest draft content', async () => {
    vi.useFakeTimers();
    const saves: Array<{ noteId: string; content: string }> = [];

    const autosave = new NoteAutosaveController((noteId, content) => {
      saves.push({ noteId, content });
    }, 200);

    autosave.queue('note-1', 'draft-1');
    autosave.queue('note-1', 'draft-2');

    vi.advanceTimersByTime(199);
    await Promise.resolve();
    expect(saves).toEqual([]);

    vi.advanceTimersByTime(1);
    await Promise.resolve();

    expect(saves).toEqual([{ noteId: 'note-1', content: 'draft-2' }]);
    autosave.dispose();
  });

  it('flushes immediately on editor blur', async () => {
    vi.useFakeTimers();
    const saves: Array<{ noteId: string; content: string }> = [];

    const autosave = new NoteAutosaveController((noteId, content) => {
      saves.push({ noteId, content });
    }, 500);

    autosave.queue('note-2', 'blur-save');
    await autosave.onBlur('note-2');

    expect(saves).toEqual([{ noteId: 'note-2', content: 'blur-save' }]);

    vi.advanceTimersByTime(500);
    await Promise.resolve();
    expect(saves).toHaveLength(1);
    autosave.dispose();
  });
});
