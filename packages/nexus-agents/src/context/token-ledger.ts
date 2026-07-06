/**
 * Per-call token ledger tagged by context-source (#4252, Phase 0 of epic #4251).
 *
 * Why: the token-optimization vote (#4251) found that without a per-call,
 * per-source token record, none of the claimed savings from later phases
 * (#4253 per-call context caps, #4254 repo-map) are falsifiable — there is
 * no baseline to diff against. `TokenBudgetTracker` (`token-budget-tracker.ts`)
 * already tracks usage, but only as a running SESSION/task total — it cannot
 * answer "how many tokens came from the memory backends vs. a raw grep vs.
 * research synthesis, for this one call." This module adds that dimension.
 *
 * ## Extend, don't fork
 *
 * This deliberately reuses rather than reinvents:
 * - **Fields**: `inputTokens`/`outputTokens`/`taskId` mirror
 *   {@link TokenUsageRecord} in `token-budget-tracker.ts` — this is the same
 *   vocabulary, widened with `tool` and `contextSource` (the two dimensions
 *   {@link TokenBudgetTracker} does not carry per-event).
 * - **Estimation**: callers that need to turn rendered text into a token count
 *   (e.g. the `context-retriever.ts` wiring, #4252 acceptance) should use
 *   {@link TokenCounter.estimate} (`token-counter.ts`) rather than a third
 *   copy of the chars-per-token heuristic.
 * - **Persistence**: the shared {@link JsonlStore} primitive (`config/jsonl-store`,
 *   #3762) — the same hydrate-on-construct / append-on-write / Zod-validate-
 *   each-line mechanism that backs {@link PersistentOutcomeStore}, the
 *   `ci-health` event log, and `governance/tool-fitness-ledger.ts` (#3851),
 *   which this module's shape most closely mirrors. Bounded by
 *   oldest-eviction rotation so the file can never grow without limit.
 * - **Path**: resolves via {@link nexusDataPath} at `token-ledger/ledger.jsonl`.
 *   `token-ledger` is NOT in `PER_REPO_SUBDIRS`, so it routes cross-repo
 *   (homedir-scoped) like `tool-fitness` — token usage is an operator-wide
 *   telemetry signal, not scoped to one codebase.
 * - Append is best-effort: a telemetry sink must never throw into the
 *   operation it observes (inherited from the JsonlStore contract).
 *
 * ## Scope
 *
 * DATA LAYER + a minimal query surface ({@link TokenLedger.summarize}). The
 * full A/B diff harness that fixes a task sample and diffs `getContextForTask`
 * token counts across two configurations (the #4251 acceptance criterion) is
 * OUT of scope for this issue — `summarize()` accepts a `{ sinceMs, untilMs }`
 * window so a before/after comparison is already possible by calling it twice
 * with windows that bracket a change (e.g. a deploy timestamp). The dedicated
 * harness is a documented follow-up tracked under epic #4251.
 *
 * @module context/token-ledger
 */

import { z } from 'zod';

import { JsonlStore } from '../config/jsonl-store.js';
import { nexusDataPath } from '../config/nexus-data-dir.js';

// ============================================================================
// Context-source tags
// ============================================================================

/**
 * Known context-source tags (#4252). This list documents the vocabulary call
 * sites should draw from — it is NOT a closed enum enforced by the schema
 * (see {@link TokenLedgerEventSchema}), so a later phase can introduce a new
 * tag (e.g. #4254's repo-map, already listed here in anticipation) without a
 * ledger schema migration.
 */
export const CONTEXT_SOURCE_TAGS = [
  /** Assembled context from `getContextForTask` / the shared memory backends. */
  'memory-backend',
  /** Content synthesized from the research registry/pipeline. */
  'research-synthesis',
  /** Content from a repo-map / codebase-structure summary (#4254). */
  'repo-map',
  /** Unclassified free-text input (e.g. a raw grep/file dump). */
  'raw',
  /** Output returned by a tool call, fed back in as input elsewhere. */
  'tool-output',
  /** System-prompt / instruction scaffolding, not task-specific content. */
  'system',
] as const;

/** A known context-source tag. See {@link CONTEXT_SOURCE_TAGS}. */
export type ContextSourceTag = (typeof CONTEXT_SOURCE_TAGS)[number];

// ============================================================================
// Schema
// ============================================================================

/**
 * One recorded per-call token event. Versioned (`v`) for forward-compatible
 * on-disk evolution, matching the `tool-fitness` / `ci-health` event idiom.
 * `contextSource` is a bounded-length string rather than a `z.enum` of
 * {@link CONTEXT_SOURCE_TAGS} so a future tag never fails validation and gets
 * silently dropped by {@link JsonlStore} (see its `append` contract).
 */
export const TokenLedgerEventSchema = z.object({
  /** Schema version. Forward-compat for on-disk evolution. */
  v: z.literal(1),
  /** ISO-8601 timestamp of the call. */
  ts: z.iso.datetime(),
  /** Tool/call-site identifier (e.g. an MCP tool name or module.function). */
  tool: z.string().min(1).max(200),
  /** Context-source classification. See {@link CONTEXT_SOURCE_TAGS}. */
  contextSource: z.string().min(1).max(64),
  /** Input tokens attributed to this call/source. */
  inputTokens: z.number().nonnegative(),
  /** Output tokens attributed to this call. `0` when the call is context-only. */
  outputTokens: z.number().nonnegative(),
  /** Model identifier, when the calling surface exposes one. */
  model: z.string().min(1).max(200).optional(),
  /** Task/operation identifier, mirroring {@link TokenUsageRecord.taskId}. */
  taskId: z.string().min(1).max(200).optional(),
  /**
   * Free-form call-site variant (e.g. `'ranked' | 'legacy'` for the
   * `context-retriever.ts` rendering path, #4252 wiring). Optional dimension
   * so producers that have no variant to report don't need a placeholder.
   */
  variant: z.string().min(1).max(100).optional(),
});
export type TokenLedgerEvent = z.infer<typeof TokenLedgerEventSchema>;

// ============================================================================
// Aggregates
// ============================================================================

/** Summed token counts for one group (a source tag, a tool, or the whole ledger). */
export interface TokenLedgerAggregate {
  /** Number of recorded calls in this group. */
  readonly entries: number;
  /** Sum of `inputTokens`. */
  readonly inputTokens: number;
  /** Sum of `outputTokens`. */
  readonly outputTokens: number;
  /** `inputTokens + outputTokens`. */
  readonly totalTokens: number;
}

/** Result of {@link TokenLedger.summarize} — the #4252 query surface. */
export interface TokenLedgerSummary {
  /** Totals across every event in the queried window. */
  readonly overall: TokenLedgerAggregate;
  /** Totals grouped by `contextSource` tag. */
  readonly bySource: Readonly<Record<string, TokenLedgerAggregate>>;
  /** Totals grouped by `tool`. */
  readonly byTool: Readonly<Record<string, TokenLedgerAggregate>>;
}

/** Optional time window for {@link TokenLedger.summarize}. Both bounds are epoch ms. */
export interface TokenLedgerWindow {
  /** Inclusive lower bound. Omit for no lower bound. */
  readonly sinceMs?: number;
  /** Exclusive upper bound. Omit for no upper bound. */
  readonly untilMs?: number;
}

// ============================================================================
// Configuration
// ============================================================================

/** Default retained-event cap. Bounds disk + hydrate cost (the #3089 concern). */
const DEFAULT_MAX_EVENTS = 50_000;

/** Subdir + file name under the nexus data dir (cross-repo / homedir-scoped). */
const LEDGER_SUBDIR = 'token-ledger';
const LEDGER_FILE = 'ledger.jsonl';

export interface TokenLedgerConfig {
  /**
   * Absolute path to the JSONL file. Defaults to
   * `<nexusDataDir>/token-ledger/ledger.jsonl`. Pass an explicit path in tests
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
 * Per-call token ledger. A thin record/aggregate/query API over the shared
 * {@link JsonlStore} primitive — it owns the token-ledger SCHEMA and
 * aggregation, and delegates all persistence plumbing to JsonlStore.
 */
export class TokenLedger {
  private readonly store: JsonlStore<TokenLedgerEvent>;

  constructor(config?: TokenLedgerConfig) {
    this.store = new JsonlStore<TokenLedgerEvent>({
      filePath: config?.filePath ?? nexusDataPath(LEDGER_SUBDIR, LEDGER_FILE),
      schema: TokenLedgerEventSchema,
      maxRecords: config?.maxEvents ?? DEFAULT_MAX_EVENTS,
      component: 'TokenLedger',
    });
  }

  /**
   * Record one call's token usage. `v`/`ts` are stamped here so callers pass
   * only the observed signal. Best-effort durability (inherited from
   * JsonlStore): never throws into the observed operation.
   */
  record(event: {
    tool: string;
    contextSource: string;
    inputTokens: number;
    outputTokens?: number;
    model?: string;
    taskId?: string;
    variant?: string;
    /** Override the timestamp (defaults to now). Mainly for tests/backfill. */
    ts?: string;
  }): void {
    const record: TokenLedgerEvent = {
      v: 1,
      ts: event.ts ?? new Date().toISOString(),
      tool: event.tool,
      contextSource: event.contextSource,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens ?? 0,
      ...(event.model !== undefined ? { model: event.model } : {}),
      ...(event.taskId !== undefined ? { taskId: event.taskId } : {}),
      ...(event.variant !== undefined ? { variant: event.variant } : {}),
    };
    this.store.append(record);
  }

  /** Total retained events. */
  size(): number {
    return this.store.count();
  }

  /** All retained events, oldest first. Mainly for tests/inspection. */
  all(): readonly TokenLedgerEvent[] {
    return this.store.all();
  }

  /**
   * Aggregate totals by `contextSource` tag and by `tool`, optionally
   * restricted to a time window (#4252 query surface). Pure over the current
   * retained event set — no I/O.
   *
   * Manual before/after comparison (the #4251 A/B measurement need) is
   * possible today by calling this twice with windows that bracket a change,
   * e.g. `summarize({ untilMs: deployedAt })` vs.
   * `summarize({ sinceMs: deployedAt })`. A dedicated harness that fixes a
   * task sample and runs it under two configurations is deliberately out of
   * scope here — tracked as a follow-up under epic #4251.
   */
  summarize(window: TokenLedgerWindow = {}): TokenLedgerSummary {
    const events = this.store.all().filter((e) => withinWindow(e.ts, window));
    return aggregateEvents(events);
  }
}

/** Whether an ISO timestamp falls within `window`. Missing bounds never exclude. */
function withinWindow(ts: string, window: TokenLedgerWindow): boolean {
  const t = Date.parse(ts);
  if (window.sinceMs !== undefined && t < window.sinceMs) return false;
  if (window.untilMs !== undefined && t >= window.untilMs) return false;
  return true;
}

/** A zeroed {@link TokenLedgerAggregate}. */
function emptyAggregate(): TokenLedgerAggregate {
  return { entries: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

/** Fold one event into an aggregate. Pure. */
function addEvent(agg: TokenLedgerAggregate, e: TokenLedgerEvent): TokenLedgerAggregate {
  return {
    entries: agg.entries + 1,
    inputTokens: agg.inputTokens + e.inputTokens,
    outputTokens: agg.outputTokens + e.outputTokens,
    totalTokens: agg.totalTokens + e.inputTokens + e.outputTokens,
  };
}

/** Fold an event list into overall + by-source + by-tool aggregates. Pure. */
function aggregateEvents(events: readonly TokenLedgerEvent[]): TokenLedgerSummary {
  let overall = emptyAggregate();
  const bySource = new Map<string, TokenLedgerAggregate>();
  const byTool = new Map<string, TokenLedgerAggregate>();
  for (const e of events) {
    overall = addEvent(overall, e);
    bySource.set(e.contextSource, addEvent(bySource.get(e.contextSource) ?? emptyAggregate(), e));
    byTool.set(e.tool, addEvent(byTool.get(e.tool) ?? emptyAggregate(), e));
  }
  return {
    overall,
    bySource: Object.fromEntries(bySource),
    byTool: Object.fromEntries(byTool),
  };
}

// ============================================================================
// Singleton
// ============================================================================

let singleton: TokenLedger | undefined;

/**
 * Process-wide ledger backed by the default on-disk path. Lazily constructed
 * so tests that never touch it don't create a data dir. Tests that DO
 * exercise persistence should construct their own {@link TokenLedger} with an
 * explicit `filePath` to stay isolated.
 */
export function getTokenLedger(): TokenLedger {
  singleton ??= new TokenLedger();
  return singleton;
}

/** Test helper — drops the process singleton so the next get reconstructs it. */
export function _resetTokenLedgerForTests(): void {
  singleton = undefined;
}
