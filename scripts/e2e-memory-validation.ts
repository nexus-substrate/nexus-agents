#!/usr/bin/env tsx

/* eslint-disable max-lines-per-function */
/* eslint-disable complexity */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
// Diagnostic validation script — the linear narrative is the point.
// `main` is a single sequential probe of every phase; splitting it would
// fragment the readout. `!` assertions reach into the JSON result envelope
// where we know the shape from the just-called handler.
/**
 * End-to-end validation of the memory pipeline on a clean data dir.
 *
 * Exercises the production code paths modified in PR #2791:
 *   1. Boot ToolMemoryManager (triggers Phase 5 registry attaches +
 *      Phase 9 cleanup-on-startup).
 *   2. Verify the cleanup marker was written by the constructor.
 *   3. Record real beliefs through `recordBelief()` (3 clean, 1 polluted).
 *   4. Confirm memory_stats reports belief count = 4 with all 5 backends
 *      attached and reporting real numbers (not the old `() => 0` placeholder).
 *   5. Force a second cleanup pass against the live store.
 *   6. Verify polluted row is gone (count = 3, polluted subject not in store).
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'nexus-e2e-'));
process.env['NEXUS_DATA_DIR'] = dataDir;

async function main(): Promise<void> {
  process.stdout.write(`E2E memory validation — NEXUS_DATA_DIR=${dataDir}\n\n`);

  // Imports after NEXUS_DATA_DIR is set.
  const toolMemoryModule = await import('../packages/nexus-agents/src/mcp/tools/tool-memory.ts');
  const memoryStatsModule = await import('../packages/nexus-agents/src/mcp/tools/memory-stats.ts');
  const cleanupModule = await import('../packages/nexus-agents/src/context/belief-cleanup.ts');
  const outcomeStoreModule =
    await import('../packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts');
  // Trigger lazy attach by getting the singleton.
  outcomeStoreModule.getOutcomeStore();
  type ToolMemoryAPI = {
    getToolMemory: () => {
      recordBelief: (
        s: string,
        p: string,
        o: string,
        c?: 'high' | 'medium' | 'low'
      ) => Promise<void>;
      getBeliefCount: () => number;
      queryBeliefs: (q: { subject?: string }) => Promise<unknown>;
    };
    shutdownToolMemory: () => void;
  };
  const { getToolMemory, shutdownToolMemory } = toolMemoryModule as unknown as ToolMemoryAPI;
  const { registerMemoryStatsTool } = memoryStatsModule;
  const { runBeliefCleanup } = cleanupModule;

  // ─── Step 1: Boot ToolMemoryManager ─────────────────────────────────────
  const tm = getToolMemory();
  process.stdout.write('[1/6] ToolMemoryManager bootstrapped\n');

  // Allow async SQLite init + Phase 9 cleanup to settle.
  await new Promise((r) => setTimeout(r, 2000));
  process.stdout.write('[2/6] async init settled\n');

  // ─── Step 2: Verify cleanup marker was written ──────────────────────────
  const markerPath = join(dataDir, 'memory', '.belief-cleanup-done');
  const markerExisted = existsSync(markerPath);
  let markerContent: { scanned?: number; removed?: number; completedAt?: string } = {};
  if (markerExisted) {
    markerContent = JSON.parse(readFileSync(markerPath, 'utf-8')) as typeof markerContent;
  }
  process.stdout.write(
    `[3/6] cleanup marker: ${markerExisted ? 'EXISTS' : 'MISSING'} (scanned=${String(markerContent.scanned)})\n`
  );

  // ─── Step 3: Record real beliefs through the production API ─────────────
  await tm.recordBelief('arXiv:2502.12110', 'has_topic', 'agentic memory', 'high');
  await tm.recordBelief('arXiv:2310.08560', 'has_topic', 'adaptive memory', 'high');
  await tm.recordBelief('SqliteBackend', 'is_part_of', 'nexus-memory', 'medium');
  // The polluted shape — matches the pre-#2755 feed-fallback bug.
  await tm.recordBelief(
    'arXiv Query: search_query=quantum&id_list=&max_results=10',
    'pollution',
    'feed-fallback bug pre-#2755',
    'low'
  );
  process.stdout.write('[4/6] recorded 3 clean + 1 polluted belief\n');

  // ─── Step 4: Call memory_stats end-to-end ───────────────────────────────
  type Handler = (
    args: unknown,
    extra: unknown
  ) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
  let handler!: Handler;
  const mockServer = {
    registerTool: (_n: string, _s: unknown, h: Handler) => {
      handler = h;
    },
  };
  const rateLimiter = {
    tryAcquire: () => true,
    getState: () => ({ remaining: 99, nextTokenMs: 0 }),
  };
  registerMemoryStatsTool(mockServer as never, { rateLimiter: rateLimiter as never });

  type RegistryRow = { domain: string; count: number | null; error: string | null };
  type Response = {
    backends: { session: boolean; belief: boolean; agentic: boolean };
    belief: { beliefsCount: number };
    registry: readonly RegistryRow[];
  };
  const r1 = await handler({}, {});
  if (r1.isError === true) throw new Error(`memory_stats error: ${r1.content[0]!.text}`);
  const before = JSON.parse(r1.content[0]!.text) as Response;
  process.stdout.write('[5/6] memory_stats called (before cleanup re-run)\n');

  const beliefRowBefore = before.registry.find((row) => row.domain === 'belief');

  // ─── Step 5: Force a second cleanup pass against the live store ─────────
  // Use the same store the manager holds. The cleanup driver doesn't know
  // about the manager directly, but the production wiring uses
  // `beliefs.query` and `beliefs.forget` — exposing the manager-internal
  // beliefs through the same callbacks here.
  type ToolMemoryManagerInternal = {
    beliefs: {
      query: (q: { includeSuperseded?: boolean }) => Promise<{
        ok: boolean;
        value?: readonly unknown[];
      }>;
      forget: (id: string) => Promise<unknown>;
    };
  };
  const internal = tm as unknown as ToolMemoryManagerInternal;
  const cleanupResult = await runBeliefCleanup({
    loadBeliefs: async () => {
      const q = await internal.beliefs.query({ includeSuperseded: true });
      return (q.ok && q.value !== undefined ? q.value : []) as never;
    },
    deleteBelief: async (id) => {
      await internal.beliefs.forget(id);
    },
    markerDir: join(dataDir, 'memory'),
    force: true,
  });
  process.stdout.write(
    `[6/6] forced cleanup re-run: scanned=${String(cleanupResult.scanned)} removed=${String(cleanupResult.removed)}\n`
  );

  // Call memory_stats again to verify counts shifted.
  let handler2!: Handler;
  const mockServer2 = {
    registerTool: (_n: string, _s: unknown, h: Handler) => {
      handler2 = h;
    },
  };
  registerMemoryStatsTool(mockServer2 as never, { rateLimiter: rateLimiter as never });
  const r2 = await handler2({}, {});
  const after = JSON.parse(r2.content[0]!.text) as Response;
  const beliefRowAfter = after.registry.find((row) => row.domain === 'belief');

  // ─── Validation checks ──────────────────────────────────────────────────
  process.stdout.write('\n══ validation ══\n\n');
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];

  checks.push({
    name: 'Phase 9 cleanup ran on startup (marker file)',
    ok: markerExisted,
    detail: `marker at ${markerPath}`,
  });
  checks.push({
    name: 'cleanup marker reports scanned=0 on empty boot',
    ok: markerContent.scanned === 0,
    detail: `marker.scanned=${String(markerContent.scanned)}`,
  });
  checks.push({
    name: 'registry attaches all 5 expected tool-memory domains',
    ok: ['belief', 'agentic', 'adaptive', 'typed', 'mobimem'].every((d) =>
      before.registry.some((row) => row.domain === d)
    ),
    detail: `domains: ${before.registry.map((row) => row.domain).join(', ')}`,
  });
  checks.push({
    name: 'no registry domain returned an error',
    ok: before.registry.every((row) => row.error === null),
    detail: 'all stats() resolved cleanly',
  });
  checks.push({
    name: 'belief.count reflects 4 retains via memory_stats registry',
    ok: beliefRowBefore?.count === 4,
    detail: `belief.count=${String(beliefRowBefore?.count)} (expected 4)`,
  });
  checks.push({
    name: 'all registry counts are real numbers (not () => 0 placeholder)',
    ok: before.registry.every((row) => typeof row.count === 'number'),
    detail: before.registry.map((row) => `${row.domain}=${String(row.count)}`).join(', '),
  });
  checks.push({
    name: 'forced cleanup pass scanned the live store',
    ok: cleanupResult.scanned === 4,
    detail: `scanned=${String(cleanupResult.scanned)} (expected 4)`,
  });
  checks.push({
    name: 'forced cleanup pass removed the polluted row',
    ok: cleanupResult.removed === 1,
    detail: `removed=${String(cleanupResult.removed)} (expected 1)`,
  });
  checks.push({
    name: 'belief.count dropped after cleanup',
    ok: beliefRowAfter?.count === 3,
    detail: `belief.count=${String(beliefRowAfter?.count)} (expected 3)`,
  });
  // Verify the polluted subject is actually gone (not just count math).
  const q = await internal.beliefs.query({ includeSuperseded: true });
  const remaining = (q.ok && q.value !== undefined ? q.value : []) as readonly {
    subject: string;
  }[];
  const stillPolluted = remaining.some((b) => /arXiv Query:/i.test(b.subject));
  checks.push({
    name: 'no polluted-shape belief survives in the store',
    ok: !stillPolluted,
    detail: `remaining subjects: ${remaining.map((b) => b.subject.slice(0, 40)).join(' | ')}`,
  });

  // ─── Phase 1 of #2792: registry-level search fan-out ────────────────────
  // Resolve nexus-memory the same way tool-memory.ts does so we share the
  // singleton (importing via absolute path creates a fresh module instance
  // and loses the production registry).
  const nm =
    await import('/home/william/git/nexus-agents/packages/nexus-agents/node_modules/nexus-memory/dist/index.js');
  const registry = nm.getMemoryRegistry();
  const beliefBackend = registry.get('belief');
  if (beliefBackend !== undefined) {
    const hits = (await beliefBackend.query({
      where: { text: 'arXiv:2502.12110' } as unknown as Partial<unknown>,
      limit: 5,
    })) as readonly { subject?: string }[];
    checks.push({
      name: 'registry.belief.query({ where: { text } }) returns matching belief',
      ok: hits.length >= 1 && hits.some((h) => h.subject === 'arXiv:2502.12110'),
      detail: `hits=${String(hits.length)} subjects: ${hits
        .map((h) => h.subject ?? '?')
        .slice(0, 3)
        .join(' | ')}`,
    });
  } else {
    checks.push({
      name: 'registry.belief.query fan-out',
      ok: false,
      detail: 'belief backend not in registry — wiring broken',
    });
  }

  let passed = 0;
  let failed = 0;
  for (const c of checks) {
    process.stdout.write(`  ${c.ok ? '✓' : '✗'} ${c.name}\n      ${c.detail}\n`);
    if (c.ok) passed++;
    else failed++;
  }
  process.stdout.write(`\n${String(passed)} passed, ${String(failed)} failed\n\n`);

  process.stdout.write('Registry section (after cleanup):\n');
  process.stdout.write(JSON.stringify(after.registry, null, 2));
  process.stdout.write('\n');

  shutdownToolMemory();
  rmSync(dataDir, { recursive: true, force: true });
  if (failed > 0) process.exit(1);
}

main().catch((e: unknown) => {
  process.stderr.write(`\nE2E failed: ${e instanceof Error ? e.message : String(e)}\n`);
  if (e instanceof Error && e.stack !== undefined) process.stderr.write(`${e.stack}\n`);
  rmSync(dataDir, { recursive: true, force: true });
  process.exit(1);
});
