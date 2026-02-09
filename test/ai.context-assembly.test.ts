import { describe, expect, it } from 'vitest';
import { buildDeterministicProvocationContext } from '../src/ai/contextAssembly.js';

describe('deterministic provocation context assembly', () => {
  it('assembles context from the active document section only', () => {
    const context = buildDeterministicProvocationContext(
      [
        { id: 's1', heading: 'One', content: 'alpha', orderIndex: 0 },
        { id: 's2', heading: 'Two', content: 'beta', orderIndex: 1 },
        { id: 's3', heading: 'Three', content: 'gamma', orderIndex: 2 }
      ],
      's2',
      100
    );

    expect(context.includedSectionIds).toEqual(['s2']);
    expect(context.text).toContain('[Active] Two');
    expect(context.text).not.toContain('[Previous]');
    expect(context.text).not.toContain('[Next]');
  });

  it('clips deterministically from the tail of the last included section', () => {
    const longWords = Array.from({ length: 20 }, (_, i) => `word${i + 1}`).join(' ');

    const context = buildDeterministicProvocationContext(
      [
        { id: 's1', heading: 'One', content: 'a b c', orderIndex: 0 },
        { id: 's2', heading: 'Two', content: longWords, orderIndex: 1 },
        { id: 's3', heading: 'Three', content: 'd e f', orderIndex: 2 }
      ],
      's2',
      12
    );

    expect(context.estimatedInputTokens).toBeLessThanOrEqual(12);
    expect(context.text).toContain('Active');
  });
});
