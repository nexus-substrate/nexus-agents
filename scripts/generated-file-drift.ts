/**
 * Shared helpers for generators that WRITE a prettier-formatted file and CHECK
 * it for drift against a regeneration.
 *
 * Extracted from `inject-governance.ts` (#6002) so a second generator
 * (`update-research-index.ts`) can use the same formatting authority and the
 * same first-difference report without importing the governance injector —
 * whose module graph (ts-morph, every drift gate) is far more than a
 * formatter.
 *
 * @module scripts/generated-file-drift
 */

import * as prettier from 'prettier';

/**
 * The ONE formatting authority for generated files (#6062): prettier, with the
 * config resolved for `path` and `path`'s parser. Both a generator's writer and
 * its staleness check go through here, so what `generate` writes and what
 * `check` expects are normalized by the same pass. When they were not, any
 * prose prettier reshapes (an inline code span wrapped across a line break, a
 * table column it pads) made `check` fail forever while prescribing a
 * `generate` that changed nothing — or, for the research index, made
 * `generate` produce a diff that prettier then reverted (#6002).
 */
export async function formatWithPrettier(path: string, content: string): Promise<string> {
  const config = await prettier.resolveConfig(path);
  return prettier.format(content, { ...(config ?? {}), filepath: path });
}

/** Marker for a side that ran out of lines before the other did. */
export const END_OF_BLOCK = '<end of block>';
/** The same, for a whole-file comparison (#6087). */
export const END_OF_FILE = '<end of file>';

/**
 * The first line at which two texts differ: its 0-based index plus the
 * `expected` and `onDisk` text at that index (or `exhausted` for a side that
 * ran out of lines first). The caller guarantees the texts are not equal, so a
 * line is always found.
 */
export function firstDifferingLine(
  expected: string,
  onDisk: string,
  exhausted: string = END_OF_BLOCK
): { index: number; expected: string; onDisk: string } {
  const a = expected.split('\n');
  const b = onDisk.split('\n');
  const limit = Math.max(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) index += 1;
  return { index, expected: a[index] ?? exhausted, onDisk: b[index] ?? exhausted };
}
