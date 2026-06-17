/**
 * Tool-fitness ledger — data layer (#3851, child of epic #3850).
 *
 * Records per-tool fitness signals so a later consumer can reason about which
 * of the ~47 MCP tools are pulling their weight. Each MCP invocation (seen by
 * the tool-wrapper / secure-handler middleware) can be appended as one fitness
 * event; the ledger aggregates events into a per-tool stat — invocation count,
 * last-used timestamp, success/failure correlation, and a cost placeholder
 * (full cost lands with Epic G).
 *
 * ## Persistence idiom
 *
 * This MIRRORS the established durable-telemetry idiom rather than inventing a
 * parallel one:
 *
 * - Storage is the shared {@link JsonlStore} primitive (`config/jsonl-store`,
 *   #3762) — the same hydrate-on-construct / append-on-write / Zod-validate-
 *   each-line mechanism that backs {@link PersistentOutcomeStore} and the
 *   `ci-health` event log. Bounded by oldest-eviction rotation so the file can
 *   never grow without limit (the #3089 size-cap concern).
 * - The path resolves via {@link nexusDataPath} at `tool-fitness/ledger.jsonl`.
 *   `tool-fitness` is NOT in `PER_REPO_SUBDIRS`, so it routes cross-repo
 *   (homedir-scoped) — tool fitness accumulates across the operator's whole
 *   workflow, like the learning/usage state, not per-codebase like `runs`.
 * - Append is best-effort: a telemetry sink must never throw into the operation
 *   it observes (inherited from the JsonlStore contract).
 *
 * ## Concurrency (#3852 concern 2)
 *
 * {@link JsonlStore} (the shared #3762 primitive behind PersistentOutcomeStore)
 * uses Node's synchronous `appendFileSync` for the fast path. On Linux a single
 * `write(2)` of a sub-`PIPE_BUF` line to a file opened `O_APPEND` is atomic, so
 * two processes appending to the homedir-shared ledger interleave at line
 * granularity rather than corrupting a line — and the hydrate path already skips
 * any partially-written/corrupt line (graceful degradation). The RESIDUAL is the
 * over-cap **rewrite** path ({@link JsonlStore.rewriteFile}): a full-file
 * `writeFileSync` is NOT coordinated across processes, so two concurrent
 * rewrites can race and one can lose the other's just-appended lines. This is a
 * PRE-EXISTING property of the shared primitive (inherited from #3762, same as
 * PersistentOutcomeStore), not introduced here. It is acceptable for THIS
 * consumer because the surfaced signal is suggest-tier only (a lossy line here
 * or there cannot cause an autonomous action) and the loss is bounded to events
 * near the rotation boundary. See the concurrency test in the test file.
 *
 * ## Scope
 *
 * DATA LAYER (+ consumed by #3852). This module owns the tool-fitness schema and
 * aggregation. The `tool-fitness` SignalCategory consumer now lives in
 * `improvement_review` (#3852) — so this producer HAS a real in-src consumer and
 * no longer carries the `@export-no-consumer-yet` marker. It still does NOT
 * implement any pruning/removal pipeline — that is later in epic #3850 and is
 * NEVER autonomous (human ratification via the Epic D path).
 *
 * @module governance/tool-fitness-ledger
 */

import { z } from 'zod';

import { JsonlStore } from '../config/jsonl-store.js';
import { nexusDataPath } from '../config/nexus-data-dir.js';

// ============================================================================
// Schemas
// ============================================================================

/**
 * One recorded fitness event for a single tool invocation. Versioned (`v`) for
 * forward-compatible on-disk evolution, matching the `ci-health` event idiom.
 */
export const ToolFitnessEventSchema = z.object({
  /** Schema version. Forward-compat for on-disk evolution. */
  v: z.literal(1),
  /** ISO-8601 timestamp of the invocation. */
  ts: z.iso.datetime(),
  /** Tool identifier (e.g. the MCP tool name). */
  tool: z.string().min(1).max(100),
  /** Whether the invocation succeeded. Drives the success/failure correlation. */
  success: z.boolean(),
  /**
   * Cost of the invocation in arbitrary units (e.g. tokens), when the calling
   * surface exposes it. Placeholder until full cost accounting lands with
   * Epic G — absent (not zero) when unknown so aggregates don't conflate
   * "free" with "unmeasured".
   */
  cost: z.number().nonnegative().optional(),
  /**
   * OPTIONAL workspace/repo dimension (#3852 concern 1 — context-poisoning).
   * The ledger is homedir-global, so a tool that fails only in ONE workspace
   * (local perms, missing deps, repo-specific config) would otherwise aggregate
   * into a single global fitness number and could wrongly flag a tool that is
   * healthy everywhere else. Recording the originating workspace lets the
   * consumer scope/weight fitness so a one-workspace failure doesn't get
   * globally penalized. BACKWARD-COMPATIBLE: optional, absent on legacy events
   * (treated as the unattributed/global bucket by the consumer).
   */
  workspace: z.string().min(1).max(256).optional(),
});
export type ToolFitnessEvent = z.infer<typeof ToolFitnessEventSchema>;

/** Aggregated fitness stats for a single tool. */
export interface ToolFitnessStat {
  /** Tool identifier. */
  readonly tool: string;
  /** Total recorded invocations. */
  readonly invocationCount: number;
  /** Count where `success === true`. */
  readonly successCount: number;
  /** Count where `success === false`. */
  readonly failureCount: number;
  /**
   * `successCount / invocationCount`. `0` when `invocationCount === 0`
   * (which cannot occur for a returned stat, but keeps the type total).
   */
  readonly successRate: number;
  /** ISO-8601 timestamp of the most recent invocation. */
  readonly lastUsedAt: string;
  /**
   * Sum of `cost` across events that carried one. `undefined` when NO event
   * for this tool reported a cost — distinguishes "unmeasured" from "zero".
   */
  readonly totalCost: number | undefined;
  /**
   * Distinct workspaces that recorded an event for this tool (#3852 concern 1).
   * Sorted, deduped. Events with no `workspace` contribute the sentinel
   * {@link UNATTRIBUTED_WORKSPACE}. The consumer uses this to scope fitness:
   * a tool failing in ONE workspace but healthy in others is NOT a global
   * deprecation candidate.
   */
  readonly workspaces: readonly string[];
}

/** Sentinel bucket for events that carried no `workspace` (legacy/global). */
export const UNATTRIBUTED_WORKSPACE = '(unattributed)';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Default retained-event cap. Bounds disk + hydrate cost of an unbounded
 * append loop (the #3089 concern). Tunable per-instance via
 * {@link ToolFitnessLedgerConfig.maxEvents} for tests.
 */
const DEFAULT_MAX_EVENTS = 50_000;

/** Subdir + file name under the nexus data dir (cross-repo / homedir-scoped). */
const LEDGER_SUBDIR = 'tool-fitness';
const LEDGER_FILE = 'ledger.jsonl';

export interface ToolFitnessLedgerConfig {
  /**
   * Absolute path to the JSONL file. Defaults to
   * `<nexusDataDir>/tool-fitness/ledger.jsonl`. Pass an explicit path in tests
   * to isolate from the real data dir.
   */
  readonly filePath?: string;
  /** Max retained events before oldest-eviction. Defaults to {@link DEFAULT_MAX_EVENTS}. */
  readonly maxEvents?: number;
}

// ============================================================================
// Ledger
// ============================================================================

/**
 * Per-tool fitness ledger. A thin record/aggregate/query API over the shared
 * {@link JsonlStore} primitive — it owns the tool-fitness SCHEMA and the
 * aggregation, and delegates all persistence plumbing to JsonlStore.
 */
export class ToolFitnessLedger {
  private readonly store: JsonlStore<ToolFitnessEvent>;

  constructor(config?: ToolFitnessLedgerConfig) {
    this.store = new JsonlStore<ToolFitnessEvent>({
      filePath: config?.filePath ?? nexusDataPath(LEDGER_SUBDIR, LEDGER_FILE),
      schema: ToolFitnessEventSchema,
      maxRecords: config?.maxEvents ?? DEFAULT_MAX_EVENTS,
      component: 'ToolFitnessLedger',
    });
  }

  /**
   * Record one tool invocation. `v`/`ts` are stamped here so callers pass only
   * the observed signal. Best-effort durability (inherited from JsonlStore):
   * never throws into the observed operation.
   */
  record(event: {
    tool: string;
    success: boolean;
    cost?: number;
    /**
     * Originating workspace/repo (#3852 concern 1). Optional + backward-compat:
     * absent events fall into the {@link UNATTRIBUTED_WORKSPACE} bucket.
     */
    workspace?: string;
    /** Override the timestamp (defaults to now). Mainly for tests/backfill. */
    ts?: string;
  }): void {
    const record: ToolFitnessEvent = {
      v: 1,
      ts: event.ts ?? new Date().toISOString(),
      tool: event.tool,
      success: event.success,
      ...(event.cost !== undefined ? { cost: event.cost } : {}),
      ...(event.workspace !== undefined ? { workspace: event.workspace } : {}),
    };
    this.store.append(record);
  }

  /** Total retained events across all tools. */
  size(): number {
    return this.store.count();
  }

  /**
   * Aggregate stats for a single tool, or `undefined` when the tool has no
   * recorded events (unknown tool / empty ledger). Pure over the current
   * event set — no I/O.
   */
  statFor(tool: string): ToolFitnessStat | undefined {
    const events = this.store.all().filter((e) => e.tool === tool);
    if (events.length === 0) return undefined;
    return aggregate(tool, events);
  }

  /**
   * Aggregate stats for a single tool RESTRICTED to one workspace (#3852
   * concern 1 — context-poisoning). Pass {@link UNATTRIBUTED_WORKSPACE} to
   * select the legacy/global bucket of events that carried no `workspace`.
   * Returns `undefined` when the tool has no events in that workspace.
   *
   * This is the primitive that lets the consumer answer "is this tool low-fitness
   * EVERYWHERE, or only in one repo?" so a single-workspace failure can't
   * globally mis-flag a healthy tool.
   */
  statForInWorkspace(tool: string, workspace: string): ToolFitnessStat | undefined {
    const events = this.store
      .all()
      .filter((e) => e.tool === tool && (e.workspace ?? UNATTRIBUTED_WORKSPACE) === workspace);
    if (events.length === 0) return undefined;
    return aggregate(tool, events);
  }

  /**
   * Aggregate stats for every tool with at least one event, sorted by
   * descending invocation count (most-used first) then tool name for a stable
   * order. Returns `[]` for an empty ledger.
   */
  report(): readonly ToolFitnessStat[] {
    const byTool = new Map<string, ToolFitnessEvent[]>();
    for (const event of this.store.all()) {
      const bucket = byTool.get(event.tool);
      if (bucket === undefined) byTool.set(event.tool, [event]);
      else bucket.push(event);
    }
    const stats: ToolFitnessStat[] = [];
    for (const [tool, events] of byTool) {
      stats.push(aggregate(tool, events));
    }
    stats.sort((a, b) => b.invocationCount - a.invocationCount || a.tool.localeCompare(b.tool));
    return stats;
  }
}

// ============================================================================
// Pure aggregation
// ============================================================================

/**
 * Fold a non-empty event list for one tool into a {@link ToolFitnessStat}.
 * Pure (fixture-testable): same input always yields the same output.
 */
function aggregate(tool: string, events: readonly ToolFitnessEvent[]): ToolFitnessStat {
  let successCount = 0;
  let lastUsedAt = '';
  let totalCost: number | undefined;
  const workspaces = new Set<string>();
  for (const event of events) {
    if (event.success) successCount++;
    if (lastUsedAt === '' || Date.parse(event.ts) >= Date.parse(lastUsedAt)) lastUsedAt = event.ts;
    if (event.cost !== undefined) totalCost = (totalCost ?? 0) + event.cost;
    workspaces.add(event.workspace ?? UNATTRIBUTED_WORKSPACE);
  }
  const invocationCount = events.length;
  return {
    tool,
    invocationCount,
    successCount,
    failureCount: invocationCount - successCount,
    successRate: successCount / invocationCount,
    lastUsedAt,
    totalCost,
    workspaces: [...workspaces].sort((a, b) => a.localeCompare(b)),
  };
}

// ============================================================================
// Singleton
// ============================================================================

let singleton: ToolFitnessLedger | undefined;

/**
 * Process-wide ledger backed by the default on-disk path. Lazily constructed
 * so tests that never touch it don't create a data dir. Tests that DO exercise
 * persistence should construct their own {@link ToolFitnessLedger} with an
 * explicit `filePath` to stay isolated.
 */
export function getToolFitnessLedger(): ToolFitnessLedger {
  singleton ??= new ToolFitnessLedger();
  return singleton;
}

/** Test helper — drops the process singleton so the next get reconstructs it. */
export function _resetToolFitnessLedgerForTests(): void {
  singleton = undefined;
}
