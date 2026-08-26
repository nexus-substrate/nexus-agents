/**
 * Every async-capable tool must ADVERTISE every input its handler accepts.
 *
 * @module mcp/tools/async-tool-schema-parity.test
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const TOOLS_DIR = join(import.meta.dirname);

/**
 * Tools registering `SomeSchema.shape` cannot drift; a hand-written object
 * literal can. This finds the second kind.
 *
 * #4969: `consensus_vote` advertised a subset omitting `mode`, so its entire
 * async/idempotency/cancellation path was unreachable — while the tool's own
 * description told callers to pass it.
 * #4972: `run_workflow` omitted `idempotencyKey`, so replay-safety was
 * unreachable and the replay/collision envelopes could never fire.
 *
 * Both were hand-written mirrors. Both had passing test suites.
 */
function handWrittenSchemaRegistrations(): Array<{ file: string; line: number }> {
  const found: Array<{ file: string; line: number }> = [];
  for (const file of readdirSync(TOOLS_DIR)) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
    const src = readFileSync(join(TOOLS_DIR, file), 'utf8');
    // A doc mention is not a call site — `cancel-job-tool.ts` discusses
    // `runAsJob` at length and dispatches nothing.
    if (!/runAsJob[<(]/.test(src)) continue;
    src.split('\n').forEach((line, i) => {
      const m = /inputSchema:\s*([A-Za-z_][A-Za-z0-9_]*)\s*,/.exec(line);
      if (m === null) return;
      const identifier = m[1] ?? '';
      // A registration naming a bare identifier is only safe if that identifier
      // is itself assigned from `.shape`.
      const assignedFromShape = new RegExp(`${identifier}\\s*=\\s*[A-Za-z0-9_]+\\.shape`).test(src);
      if (!assignedFromShape) found.push({ file, line: i + 1 });
    });
  }
  return found;
}

/**
 * Mirrors that exist today and match their internal schema. Each is a place the
 * next divergence can happen; the list may only shrink. Tracked in #4972.
 */
const KNOWN_HAND_WRITTEN = new Set([
  'orchestrate.ts',
  'execute-spec-tool.ts',
  'run-graph-workflow.ts',
]);

describe('async-capable tools advertise their full input schema (#4972)', () => {
  it('finds the async-capable tools it is scanning', () => {
    // Guard the guard: a scan that matched nothing would report a clean repo,
    // which is exactly the shape these findings are about.
    const asyncTools = readdirSync(TOOLS_DIR).filter(
      (f) =>
        f.endsWith('.ts') &&
        !f.endsWith('.test.ts') &&
        /runAsJob[<(]/.test(readFileSync(join(TOOLS_DIR, f), 'utf8'))
    );

    expect(asyncTools.length).toBeGreaterThanOrEqual(8);
  });

  it('registers no hand-copied input schema', () => {
    // `.shape` makes the advertised surface the internal one by construction.
    // A hand-written mirror is a second list that has now silently diverged
    // twice; this refuses the third.
    const fresh = handWrittenSchemaRegistrations().filter((r) => !KNOWN_HAND_WRITTEN.has(r.file));

    expect(fresh).toEqual([]);
  });

  it('keeps the known-mirror list honest', () => {
    // An allowlist nobody prunes becomes permission. If a tool on this list has
    // been converted to `.shape`, its entry must go — otherwise the list stops
    // describing the repo and starts excusing it.
    const stillHandWritten = new Set(handWrittenSchemaRegistrations().map((r) => r.file));
    const stale = [...KNOWN_HAND_WRITTEN].filter((f) => !stillHandWritten.has(f));

    expect(stale).toEqual([]);
  });
});
