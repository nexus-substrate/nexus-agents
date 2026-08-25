/**
 * Tests for the public API surface gate (#4784).
 *
 * The gate shipped in #4757 with no tests, and #4784 found it could not block a
 * merge at all. Before it becomes a required check (#4785) its diff has to be
 * pinned — above all in the two shapes that already went wrong once: a member
 * change masked because the identical line exists under another symbol (#4744),
 * and a block that differs while the membership diff comes back empty.
 *
 * @module scripts/check-api-surface.test
 */
import { describe, it, expect } from 'vitest';
import { diffSurface } from './check-api-surface.js';

/** Two symbols that deliberately share a member line — the #4744 shape. */
const COMMITTED = [
  'interface ResultMetadata',
  '  tokensUsed?: number | undefined;',
  '  model: string;',
  'interface StepResult',
  '  tokensUsed?: number | undefined;',
  '  status: string;',
].join('\n');

describe('diffSurface', () => {
  it('reports nothing when the surfaces are identical', () => {
    const { added, removed } = diffSurface(COMMITTED, COMMITTED);

    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });

  it('names a widened member under the symbol that owns it, even when the old line survives elsewhere', () => {
    // The #4744 regression: `tokensUsed?: number | undefined;` still appears
    // verbatim under StepResult, so a global line-set diff reported
    // "unchanged". Membership only means something inside one declaration.
    const current = COMMITTED.replace(
      'interface ResultMetadata\n  tokensUsed?: number | undefined;',
      'interface ResultMetadata\n  tokensUsed?: number | null | undefined;'
    );

    const { added, removed } = diffSurface(COMMITTED, current);

    expect(added).toEqual(['interface ResultMetadata >  tokensUsed?: number | null | undefined;']);
    expect(removed).toEqual(['interface ResultMetadata >  tokensUsed?: number | undefined;']);
  });

  it('flags a new symbol', () => {
    const current = `${COMMITTED}\ninterface FreshType\n  id: string;`;

    const { added, removed } = diffSurface(COMMITTED, current);

    expect(added).toEqual(['interface FreshType  [new symbol]']);
    expect(removed).toEqual([]);
  });

  it('flags a removed symbol — the breaking direction', () => {
    const current =
      'interface ResultMetadata\n  tokensUsed?: number | undefined;\n  model: string;';

    const { added, removed } = diffSurface(COMMITTED, current);

    expect(removed).toEqual(['interface StepResult  [symbol gone]']);
    expect(added).toEqual([]);
  });

  it('falls back to [block changed] when the blocks differ but membership does not', () => {
    // `changedLines` compares membership, so dropping ONE of two identical
    // member lines yields an empty line diff. Without the fail-safe the gate
    // would report a real change as unchanged — the vacuous-pass shape.
    const committed = 'interface Dup\n  a: string;\n  a: string;';
    const current = 'interface Dup\n  a: string;';

    const { added, removed } = diffSurface(committed, current);

    expect(added).toEqual(['interface Dup  [block changed]']);
    expect(removed).toEqual([]);
  });

  // #4784 / name-the-empty-case: absence must not render as health. An empty
  // snapshot is the state a truncated write or a failed extraction leaves
  // behind, and it is exactly when the gate must shout.
  describe('the empty case', () => {
    it('reports every symbol as removed when the CURRENT surface is empty', () => {
      const { added, removed } = diffSurface(COMMITTED, '');

      expect(removed).toEqual([
        'interface ResultMetadata  [symbol gone]',
        'interface StepResult  [symbol gone]',
      ]);
      expect(added).toEqual([]);
      // The point of the case: a failed extraction must not read as "no change".
      expect(removed.length).toBeGreaterThan(0);
    });

    it('reports every symbol as new when the COMMITTED snapshot is empty', () => {
      const { added, removed } = diffSurface('', COMMITTED);

      expect(added).toEqual([
        'interface ResultMetadata  [new symbol]',
        'interface StepResult  [new symbol]',
      ]);
      expect(removed).toEqual([]);
    });

    it('reports nothing when BOTH are empty — the only honest silent pass', () => {
      const { added, removed } = diffSurface('', '');

      expect(added).toEqual([]);
      expect(removed).toEqual([]);
    });
  });

  it('ignores blank lines and comments so header churn is not a diff', () => {
    const withNoise = `# Exported symbols: 2\n\n${COMMITTED}\n\n`;

    const { added, removed } = diffSurface(withNoise, COMMITTED);

    expect(added).toEqual([]);
    expect(removed).toEqual([]);
  });
});
