import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppError } from '../src/shared/ipc/errors.js';
import { assertAiActionAllowed, getAiActionAvailability, getSourceFileStatus } from '../src/reader/status.js';
import { createTempDir } from './helpers/db.js';

describe('reader status helpers', () => {
  it('returns offline and disabled states for AI actions', () => {
    expect(getAiActionAvailability(false, true)).toEqual({
      enabled: false,
      reason: 'offline',
      message: 'AI actions disabled while offline.'
    });

    expect(getAiActionAvailability(true, false)).toEqual({
      enabled: false,
      reason: 'provocations-disabled',
      message: 'Provocations are disabled for this document.'
    });

    expect(getAiActionAvailability(true, true)).toEqual({
      enabled: true,
      reason: 'ok',
      message: 'AI actions available'
    });
  });

  it('fails fast for AI actions when offline or disabled', () => {
    expect(() => assertAiActionAllowed(false, true)).toThrowError(AppError);
    expect(() => assertAiActionAllowed(false, true)).toThrowError(/offline/i);

    expect(() => assertAiActionAllowed(true, false)).toThrowError(AppError);
    expect(() => assertAiActionAllowed(true, false)).toThrowError(/disabled/i);

    expect(() => assertAiActionAllowed(true, true)).not.toThrow();
  });

  it('returns locate/re-import actions when source file is missing', () => {
    const dir = createTempDir();
    const existing = join(dir, 'source.md');
    const missing = join(dir, 'missing.md');

    writeFileSync(existing, 'hello', 'utf8');

    expect(getSourceFileStatus(existing)).toEqual({
      status: 'available',
      message: 'Source file available',
      actions: []
    });

    expect(getSourceFileStatus(missing)).toEqual({
      status: 'missing',
      message: 'Source file not found at original path.',
      actions: ['Locate file', 'Re-import']
    });
  });
});
