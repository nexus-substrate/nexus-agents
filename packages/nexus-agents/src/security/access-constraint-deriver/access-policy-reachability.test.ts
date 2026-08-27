/**
 * ClawGuard reachability contract (#5022).
 *
 * Every other test in this directory establishes the access policy itself,
 * with `withAccessPolicy(...)`, and then asserts what the enforcer decides.
 * That is the one input production never supplies: `withAccessPolicy` has
 * exactly two production callers, both wrapping in-process orchestrator /
 * expert execution, and an inbound MCP request is a SIBLING async context
 * rather than a descendant of either. So 124 tests passed over a subsystem
 * that was a pass-through for every real dispatch.
 *
 * These tests therefore assert REACHABILITY rather than verdicts: they run a
 * handler through the real middleware stack the way the server does, with no
 * policy in scope, and record what the guard actually does.
 *
 * WHY THIS PINS THE CURRENT (BROKEN) BEHAVIOUR ON PURPOSE. #5022 asks which
 * boundary ClawGuard should guard, and a 7-voter panel split 2-2-1-1 without
 * reaching the supermajority bar, so the question is open. Until it is
 * answered, the failure mode to prevent is a SILENT change: someone
 * establishing a policy at dispatch without deciding the boundary would flip
 * enforcement on for every registered tool. If a change here turns these red,
 * that is the signal — resolve #5022 and rewrite this file to state the new
 * contract. Do not relax an assertion to make it green.
 *
 * @module security/access-constraint-deriver/access-policy-reachability.test
 */

import { describe, it, expect, vi } from 'vitest';
import { withMiddleware } from '../../mcp/middleware/middleware-chain.js';
import { getActivePolicy, withAccessPolicy, withAuditTrail } from './mcp-guard.js';
import type { AuditEvent, AuditTrail } from '../audit-trail.js';
import type { TaskAccessPolicy } from './types.js';

function policy(overrides: Partial<TaskAccessPolicy> = {}): TaskAccessPolicy {
  return {
    allowedTools: [],
    allowedPathPatterns: [],
    allowedOperations: '*',
    objectiveHash: 'reachability-fixture',
    derivedAt: '2026-08-27T00:00:00.000-04:00',
    source: 'llm',
    mode: 'enforce',
    ...overrides,
  };
}

function okResult(): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text' as const, text: 'handler-ran' }] };
}

describe('ClawGuard reachability at inbound MCP dispatch (#5022)', () => {
  it('observes no policy in scope when a wrapped tool is dispatched normally', async () => {
    const seen: Array<TaskAccessPolicy | undefined> = [];
    const wrapped = withMiddleware('exec_shell', () => {
      seen.push(getActivePolicy());
      return Promise.resolve(okResult());
    });

    await wrapped({});

    // This is the whole defect in one assertion. When it starts failing,
    // a policy reaches dispatch — which is a #5022 decision, not a refactor.
    expect(seen).toEqual([undefined]);
  });

  it('runs the handler for a tool that `enforce` would deny, because the guard never evaluates', async () => {
    const handler = vi.fn(() => Promise.resolve(okResult()));
    const wrapped = withMiddleware('exec_shell', handler);

    const result = (await wrapped({})) as { isError?: boolean };

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.isError).toBeUndefined();
  });

  it('does not gate an unbypassable denylisted tool at this boundary', async () => {
    const handler = vi.fn(() => Promise.resolve(okResult()));
    const wrapped = withMiddleware('git_push_force', handler);

    const result = (await wrapped({})) as { isError?: boolean };

    // `denylist.ts` calls these patterns unbypassable and `mcp-guard.ts` once
    // claimed even `off` mode denied them. Neither holds here: the denylist
    // lives inside `checkAccess`, which a missing policy short-circuits before.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.isError).toBeUndefined();
  });

  it('still EVALUATES once a policy is in scope — the mount is live (#5106)', async () => {
    const handler = vi.fn(() => Promise.resolve(okResult()));
    const wrapped = withMiddleware('git_push_force', handler);
    const events: AuditEvent[] = [];
    const trail = { append: (e: AuditEvent) => void events.push(e) } as unknown as AuditTrail;

    const result = (await withAccessPolicy(policy(), () =>
      withAuditTrail(trail, () => wrapped({}))
    )) as { isError?: boolean };

    // The contrast with the previous test is the point, and it is what keeps
    // the three above from passing for a boring reason such as the mount
    // having been removed. Since #5106 the evidence is the RECORD rather than
    // a blocked call: ClawGuard is advisory, so it forwards and reports.
    //
    // This assertion is deliberately still here, and must stay until #5107
    // deletes the mount — at which point it inverts to pin PolicyFirewall.
    // Do not delete it to make a refactor green.
    expect(events).toHaveLength(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.isError).toBeUndefined();
  });

  it('an empty allowlist is unmeasured, so a policy in scope does not deny everything', async () => {
    const handler = vi.fn(() => Promise.resolve(okResult()));
    const wrapped = withMiddleware('exec_shell', handler);

    const result = (await withAccessPolicy(policy({ mode: 'enforce' }), () => wrapped({}))) as {
      isError?: boolean;
    };

    // Before #5022, establishing a policy at dispatch would have denied every
    // guarded call under `enforce`, since no producer emits tool names. This
    // is the assertion that makes fixing the scope safe rather than an outage.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.isError).toBeUndefined();
  });
});

/**
 * The `unmeasured` verdict is keyed on `allowedTools.length === 0`, which is
 * sound only while NO producer ever intends a real allowlist. That makes it
 * fail-OPEN by construction: a future deriver that genuinely computes an
 * allowlist and returns `[]` on a parse failure would silently degrade to
 * allow-all instead of denying.
 *
 * Rather than build speculative machinery for a producer that does not exist
 * (YAGNI), this ratchets the premise. The day a producer emits a real tool
 * name, this test fails and whoever wrote it has to revisit the branch in
 * `enforcer.ts` and distinguish "no producer attempted" from "a producer
 * attempted and came back empty".
 */
/** A site that WRITES `allowedTools`, and whether the value is a bare literal. */
interface WriteSite {
  readonly where: string;
  readonly text: string;
  readonly literal: boolean;
}

/**
 * Classifies one source line. Returns undefined when the line is not a write
 * to `allowedTools` — a mention inside a message template, a
 * `matchedRule: 'allowedTools'` string, a read such as
 * `policy.allowedTools === '*'`, or a Zod/type declaration.
 */
function classifyAllowedToolsLine(trimmed: string): { literal: boolean } | undefined {
  const colon = /^allowedTools:\s*(.+?),?$/.exec(trimmed);
  const shorthand = /^allowedTools,$/.test(trimmed) || /[{,]\s*allowedTools\s*[,}]/.test(trimmed);
  const memberAssign = /\.allowedTools\s*=[^=]/.test(trimmed);
  if (colon === null && !shorthand && !memberAssign) return undefined;

  const value = (colon?.[1] ?? '').trim();
  // Type positions and Zod schema fields declare the field, not a value.
  if (colon !== null && /^(z\.|.*\|)/.test(value)) return undefined;

  // A literal `[]` or `'*'` is the only shape meaning "no producer intends an
  // allowlist". Shorthand (`{ allowedTools, ...rest }`) and post-hoc
  // assignment (`policy.allowedTools = names`) are deliberately NOT literals:
  // they are the shapes a real producer would take, and their arrival is
  // exactly the trigger to revisit the `unmeasured` branch in enforcer.ts.
  return { literal: colon !== null && /^(\[\]|'\*')$/.test(value) };
}

async function listSourceFiles(dir: string): Promise<string[]> {
  const { readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const entries = await readdir(dir, { withFileTypes: true });
  const out = await Promise.all(
    entries.map(async (e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : listSourceFiles(full);
      return e.isFile() && e.name.endsWith('.ts') && !e.name.includes('.test.') ? [full] : [];
    })
  );
  return out.flat();
}

/** Every site that writes `allowedTools`, in files that build a ClawGuard policy. */
async function scanProducers(): Promise<{ filesScanned: number; sites: WriteSite[] }> {
  const { readFile } = await import('node:fs/promises');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');

  const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const sites: WriteSite[] = [];
  let filesScanned = 0;

  for (const file of await listSourceFiles(srcRoot)) {
    const text = await readFile(file, 'utf8');
    // Elsewhere in the tree `allowedTools` belongs to unrelated types — role
    // capabilities, expert config, the Claude CLI flag — that never reach
    // checkAccess.
    if (!text.includes('TaskAccessPolicy')) continue;
    filesScanned += 1;

    for (const [i, line] of text.split('\n').entries()) {
      if (!line.includes('allowedTools')) continue;
      const trimmed = line.trim();
      const verdict = classifyAllowedToolsLine(trimmed);
      if (verdict === undefined) continue;
      sites.push({
        where: `${file.slice(srcRoot.length + 1)}:${String(i + 1)}`,
        text: trimmed,
        literal: verdict.literal,
      });
    }
  }
  return { filesScanned, sites };
}

describe('producer contract: nothing intends a real allowlist yet (#5022)', () => {
  it('finds the known producers, so the scan cannot pass by finding nothing', async () => {
    const { filesScanned, sites } = await scanProducers();

    // Without these the offender check below is vacuous: rename
    // TaskAccessPolicy, or let srcRoot resolve one level off, and the filter
    // matches zero files while the test stays green.
    expect(filesScanned).toBeGreaterThan(0);
    expect(sites.length).toBeGreaterThan(0);

    for (const producer of ['deriver.ts', 'llm-deriver.ts', 'fallback-regex.ts']) {
      expect(sites.some((site) => site.where.includes(producer))).toBe(true);
    }
  });

  it('has no production site assigning a real allowlist to a TaskAccessPolicy', async () => {
    const { sites } = await scanProducers();

    // `unmeasured` is keyed on `allowedTools.length === 0`, which is sound only
    // while nothing INTENDS a real allowlist — it is fail-open by construction.
    // Rather than build machinery for a producer that does not exist, this
    // ratchets the premise: when one lands, this fails and names it, and the
    // author has to distinguish "no producer attempted" from "a producer
    // attempted and came back empty".
    expect(
      sites.filter((site) => !site.literal).map((site) => `${site.where}: ${site.text}`)
    ).toEqual([]);
  });
});
