/**
 * Every consumed routing signal prefix must have a producer (#4836).
 *
 * Routing stages communicate through free-form strings in `ctx.signals`. A
 * consumer calls `startsWith('some:prefix')`; a producer pushes a template
 * literal. Nothing checks the two agree, and when they disagree the consumer
 * silently falls back to a default that is indistinguishable from a real
 * reading — so the failure is invisible in output, logs and tests alike.
 *
 * That has happened twice, independently:
 *   - #4832 `DistilledRuleStage` reads `task-category:` and `capability:type=`;
 *     the real signal is `capability:task-`. Category filtering never runs, so
 *     a rule distilled from security outcomes is applied to a docs task.
 *   - #4834 `LinUCBStage` reads `budget:utilization-` (hyphen) while
 *     `BudgetStage` emits `budget:utilization=`. The bandit's budget feature is
 *     permanently `0.5`.
 *
 * Both are string-equality bugs a type system cannot catch, which is what makes
 * a test the right instrument. Mirrors `scripts/workflow-output-wiring.test.ts`,
 * which asserts the same producer/consumer property for GitHub Actions outputs.
 *
 * @module cli-adapters/routing/signal-contract.test
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join } from 'node:path';

const ROUTING_DIR = join(process.cwd(), 'src', 'cli-adapters', 'routing');

/**
 * Consumed prefixes with no producer TODAY, each a tracked defect.
 *
 * This is a ratchet, not an exemption list: entries come off as the issues are
 * fixed, and a NEW unmatched prefix fails immediately. Do not add to it to make
 * a red test green — an unmatched prefix means the consumer is reading
 * something nobody sends.
 */
const KNOWN_BROKEN: ReadonlyMap<string, string> = new Map([]);

function routingSources(): string[] {
  return globSync('**/*.ts', { cwd: ROUTING_DIR }).filter(
    (f) => !f.endsWith('.test.ts') && !f.endsWith('.spec.ts')
  );
}

/** Literal prefixes a stage tests for with `startsWith('…')`. */
function consumedPrefixes(files: readonly string[]): Set<string> {
  const found = new Set<string>();
  for (const rel of files) {
    const text = readFileSync(join(ROUTING_DIR, rel), 'utf8');
    for (const m of text.matchAll(/startsWith\('([^']+)'\)/g)) {
      const prefix = m[1];
      // Only signal-shaped strings; `startsWith('/')` on a path is not one.
      if (prefix !== undefined && /^[a-z][a-z-]*[:]/i.test(prefix)) found.add(prefix);
    }
  }
  return found;
}

/** Literal heads of `signals.push(`…`)` template pushes. */
function producedHeads(files: readonly string[]): string[] {
  const heads: string[] = [];
  for (const rel of files) {
    const text = readFileSync(join(ROUTING_DIR, rel), 'utf8');
    for (const m of text.matchAll(/signals\.push\(`([^`$]*)/g)) {
      if (m[1] !== undefined && m[1] !== '') heads.push(m[1]);
    }
  }
  return heads;
}

describe('routing signal contract (#4836)', () => {
  const files = routingSources();
  const consumed = consumedPrefixes(files);
  const produced = producedHeads(files);

  it('finds routing sources, consumers and producers to compare', () => {
    // Guard the guard: an empty side would make the assertion below vacuous,
    // which is the exact defect class this file exists to catch.
    expect(files.length).toBeGreaterThan(5);
    expect(consumed.size).toBeGreaterThan(0);
    expect(produced.length).toBeGreaterThan(5);
  });

  it('every consumed signal prefix is emitted by some producer', () => {
    const unmatched = [...consumed].filter(
      (prefix) => !produced.some((head) => head.startsWith(prefix))
    );
    const unexpected = unmatched.filter((p) => !KNOWN_BROKEN.has(p));

    expect(
      unexpected,
      `These prefixes are read by a routing stage but emitted by nothing, so the ` +
        `consumer silently falls back to a default: ${unexpected.join(', ')}`
    ).toEqual([]);
  });

  it('keeps the known-broken list honest — no stale entries', () => {
    // If a prefix is fixed but left listed, the ratchet stops tightening.
    const stillBroken = [...KNOWN_BROKEN.keys()].filter(
      (prefix) => !produced.some((head) => head.startsWith(prefix))
    );

    expect(
      [...KNOWN_BROKEN.keys()].filter((p) => !stillBroken.includes(p)),
      'Now has a producer — remove it from KNOWN_BROKEN and close the issue'
    ).toEqual([]);
  });
});
