/**
 * Dedup ordering must not be a confidence comparison that isn't one (#5119).
 *
 * `pickBestFinding` used `candidate.confidence > existing.confidence`. For a
 * triangulated finding, `confidence` is `0.7 + priority(cli)` — a constant keyed
 * on the CLI's name that never consults the model's output. So the comparison
 * read as if it weighed evidence while it only compared CLI names, and a better
 * finding from a lower-priority CLI lost to a worse one, deterministically.
 *
 * Driven through `executeTriangulatedReview`, the real entry point, rather than
 * by exporting the internal helper for the test. Exporting it would have made
 * this a test of a function nothing else calls; going through the entry point
 * exercises parse → dedup → merge as production does, and the export ratchet
 * (#3024) correctly refused the shortcut.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { executeTriangulatedReview } from './triangulated-review.js';
import type { ICliAdapter, CliName, CliResponse, CliError } from '../cli-adapters/types.js';
import type { Result } from '../core/index.js';
import { ok } from '../core/index.js';

/** One finding, at a fixed file+line so every CLI's copy dedups together. */
function findingJson(title: string): string {
  return JSON.stringify([
    {
      category: 'security',
      severity: 'high',
      title,
      description: `desc for ${title}`,
      file: 'src/thing.ts',
      line: 10,
    },
  ]);
}

/** An adapter that returns exactly the given review payload. */
function adapterReturning(name: CliName, text: string): ICliAdapter {
  return {
    name,
    transport: 'subprocess',
    capabilities: {},
    execute: vi.fn((): Promise<Result<CliResponse, CliError>> =>
      Promise.resolve(ok({ text, model: `-model` }))
    ),
    healthCheck: vi.fn(),
    getCapacity: vi.fn(),
    getVersion: vi.fn(),
    getModelInfo: vi.fn(),
  } as unknown as ICliAdapter;
}

async function survivingTitle(
  adapters: ReadonlyMap<CliName, ICliAdapter>
): Promise<string | undefined> {
  const result = await executeTriangulatedReview('diff', adapters);
  if (!result.ok) throw new Error(`review failed: ${result.error.message}`);
  // Guard the guard: if dedup produced nothing, every title assertion below
  // would pass vacuously against `undefined`.
  expect(result.value.findings).toHaveLength(1);
  return result.value.findings[0]?.finding.title;
}

describe('dedup survivor is chosen by CLI priority, not confidence (#5119)', () => {
  it('keeps the higher-priority CLI findings when two CLIs report the same issue', async () => {
    // codex 0.15 > gemini 0.05, per the specialization matrix.
    const adapters = new Map<CliName, ICliAdapter>([
      ['codex', adapterReturning('codex', findingJson('from-codex'))],
      ['gemini', adapterReturning('gemini', findingJson('from-gemini'))],
    ]);

    expect(await survivingTitle(adapters)).toBe('from-codex');
  });

  it('is unaffected by the order the CLIs are supplied in', async () => {
    // A tiebreak that depended on arrival order would make the whole review
    // non-reproducible, and the sort is what a reader would blame.
    const adapters = new Map<CliName, ICliAdapter>([
      ['gemini', adapterReturning('gemini', findingJson('from-gemini'))],
      ['codex', adapterReturning('codex', findingJson('from-codex'))],
    ]);

    expect(await survivingTitle(adapters)).toBe('from-codex');
  });

  it('records both CLIs as reporters even though only one finding survives', async () => {
    // The corroboration count IS a real measurement, unlike the base
    // confidence, so dropping it would lose the one honest signal here.
    const adapters = new Map<CliName, ICliAdapter>([
      ['codex', adapterReturning('codex', findingJson('from-codex'))],
      ['gemini', adapterReturning('gemini', findingJson('from-gemini'))],
    ]);

    const result = await executeTriangulatedReview('diff', adapters);
    if (!result.ok) throw new Error('review failed');
    expect([...(result.value.findings[0]?.reportedBy ?? [])].sort()).toEqual(['codex', 'gemini']);
    expect(result.value.findings[0]?.corroborationCount).toBe(2);
  });
});

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'triangulated-review.ts'),
  'utf8'
);

describe('the tiebreak is decoupled from confidence, structurally (#5119)', () => {
  // These are source assertions, and deliberately so. Mutation testing showed
  // that restoring the ORIGINAL `candidate.confidence > existing.confidence`
  // leaves every behavioural test above green — the two rules cannot be told
  // apart end-to-end, which is exactly why the defect went unnoticed. A
  // behavioural test claiming to catch it would be reporting a pass it did not
  // earn, so the decoupling is pinned where it is actually visible.

  it('pickBestFinding does not read the confidence field', () => {
    const fn = /function pickBestFinding\([\s\S]*?\n\}/.exec(SOURCE)?.[0] ?? '';
    expect(fn).not.toBe('');
    expect(fn).toMatch(/findingPriority\(/);
    // The regression: comparing `.confidence` compares CLI names while reading
    // as if it weighed evidence.
    expect(fn).not.toMatch(/\.confidence/);
  });

  it('says the value is not a measurement where it is assigned', () => {
    expect(SOURCE).toMatch(/NOT a measurement \(#5119\)/);
  });
});

describe('REVIEW_CLI_ORDER and CLI_REVIEW_PRIORITY must not diverge (#5119)', () => {
  // Found while mutation-testing the above: making the priority a constant 0
  // ALSO left every behavioural test green. The reason is a coupling nobody
  // documented — REVIEW_CLI_ORDER (codex, claude, gemini) happens to be in
  // descending priority order (0.15, 0.1, 0.05), and ties keep the incumbent,
  // so the first CLI dispatched is always the highest-priority one and the
  // tiebreak never actually decides anything.
  //
  // That makes the two constants load-bearing on each other with nothing
  // saying so. Reorder REVIEW_CLI_ORDER — to put a faster CLI first, say — and
  // the dedup survivor silently changes for every review.
  it('the dispatch order is descending by priority', () => {
    const orderMatch = /const REVIEW_CLI_ORDER: readonly CliName\[\] = \[([^\]]*)\]/.exec(SOURCE);
    const order = (orderMatch?.[1] ?? '')
      .split(',')
      .map((s) => s.trim().replace(/['"]/g, ''))
      .filter((s) => s.length > 0);
    expect(order.length).toBeGreaterThan(1);

    const priorityBlock = /const CLI_REVIEW_PRIORITY[^{]*\{([^}]*)\}/.exec(SOURCE)?.[1] ?? '';
    const priorities = new Map<string, number>();
    for (const m of priorityBlock.matchAll(/(\w+):\s*([0-9.]+)/g)) {
      priorities.set(m[1] ?? '', Number(m[2]));
    }
    expect(priorities.size).toBeGreaterThan(1);

    const dispatched = order.map((cli) => priorities.get(cli) ?? -1);
    expect(dispatched).not.toContain(-1);
    // If this fails, the tiebreak has started deciding real outcomes. That may
    // be intended — but it changes which findings users see, so it should be a
    // deliberate edit rather than a side effect of reordering a list.
    expect([...dispatched]).toEqual([...dispatched].sort((a, b) => b - a));
  });
});
