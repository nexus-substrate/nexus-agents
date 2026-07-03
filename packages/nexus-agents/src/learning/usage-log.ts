/**
 * usage-log — append-only per-call usage events with cost.
 *
 * Source: Issue #2469 (epic #2467 child).
 *
 * For operators running against metered API gateways, per-call cost +
 * tokens + latency is the data they need to manage spend. This module
 * provides three things:
 *
 *   1. `recordUsageEvent(event)` — append a per-call record to a JSONL
 *      log under <NEXUS_DATA_DIR>/usage/usage-YYYY-MM.jsonl.
 *   2. `loadUsageEvents({...})` — read events for a window, filtered
 *      by model / category.
 *   3. `computeCostDetail(modelId, inputTokens, outputTokens)` (and its
 *      thin wrapper `computeCostUSD`) — compute cost from the FULL model
 *      registry pricing chain (manifest > in-tree > models.dev > generated
 *      LiteLLM catalog), including the #4164 normalized/identity resolution
 *      tier for decorated gateway model ids. A model with no pricing
 *      anywhere in the chain is reported as `priced: false` so consumers
 *      can treat the missing cost as UNMEASURED (#3855), never a real $0.
 *
 * The `usage` CLI command (cli/usage-command.ts) consumes this for the
 * operator dashboard. Existing OutcomeStore is intentionally untouched
 * — its schema is for routing/learning signals, not billing.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { getNexusDataDir } from '../config/nexus-data-dir.js';
// NOTE: only the FUNCTION is imported here — `getDefaultRegistry()` must never
// be CALLED at module scope (#3185 bootstrap hazard: first construction reads
// the manifest overlay/snapshot from disk). All calls happen at invocation
// time inside computeCostDetail.
import { getDefaultRegistry, type MatchedVia } from '../config/model-registry.js';

export interface UsageEvent {
  /** ISO 8601 timestamp of the call. */
  readonly timestamp: string;
  /** Model identifier (e.g., 'claude-sonnet-4', 'gpt-4o'). */
  readonly modelId: string;
  /** Provider/adapter (e.g., 'anthropic', 'openai', 'openai-compat'). */
  readonly providerId: string;
  /** Token counts. */
  readonly inputTokens: number;
  readonly outputTokens: number;
  /**
   * Cost in USD. Computed at write time from the full model-registry pricing
   * chain (see `computeCostDetail`). 0 with `priced: false` means the model
   * was UNPRICED (cost unknown), not a real $0 — check `priced` before
   * treating this as a measured figure.
   */
  readonly usdCost: number;
  /** Wall-clock latency in milliseconds. */
  readonly latencyMs: number;
  /** Whether the call succeeded. */
  readonly success: boolean;
  /**
   * Optional task category — populated when the call was made on behalf of
   * a routed task (so aggregation can roll up by category).
   */
  readonly category?: string;
  /** Optional failure code when success === false. */
  readonly errorCode?: string;
  /**
   * Whether pricing data existed for the model at write time (#4165), so
   * audit can distinguish a real $0 from an unpriced model. Absent on lines
   * written before this field existed.
   */
  readonly priced?: boolean;
  /**
   * Pricing provenance: the canonical registry id whose pricing was applied
   * (the entry's `resolvedFrom` when the #4164 fuzzy tier matched a decorated
   * id, else the caller's model id). Present only when `priced` is true.
   */
  readonly priceSource?: string;
}

/** Result of a pricing-aware cost computation (#4165). */
export interface CostDetail {
  /** Cost in USD. Always 0 when `priced` is false — an unknown, not a $0. */
  readonly costUsd: number;
  /** Whether the resolved registry entry carried pricing data. */
  readonly priced: boolean;
  /**
   * Canonical id the pricing/metadata came from: the entry's `resolvedFrom`
   * when the #4164 fuzzy tier matched a decorated id, else the caller's id.
   */
  readonly resolvedId: string;
  /** Fuzzy-resolution provenance (#4164), passed through from the entry. */
  readonly matchedVia?: MatchedVia;
}

/**
 * Compute cost in USD given a model and token counts, with pricing
 * provenance. Reads the FULL registry chain via
 * `getDefaultRegistry().getEntry()` — manifest > in-tree > models.dev >
 * generated LiteLLM catalog, plus the #4164 normalized/identity tier that
 * resolves decorated model names from OpenAI-compatible gateways to their
 * canonical entry's pricing.
 *
 * `priced: false` (with `costUsd: 0`) means NO pricing existed anywhere in
 * the chain — consumers must treat the cost as UNMEASURED (#3855), never a
 * real $0. Operators can add pricing for gateway-only models via the
 * models-manifest overlay.
 */
export function computeCostDetail(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): CostDetail {
  // Registry read happens at INVOCATION time, never module load — first
  // construction touches the filesystem (#3185 bootstrap hazard).
  const entry = getDefaultRegistry().getEntry(modelId);
  const resolvedId = entry.resolvedFrom ?? modelId;
  const provenance = entry.matchedVia !== undefined ? { matchedVia: entry.matchedVia } : {};
  if (entry.pricing === undefined) {
    return { costUsd: 0, priced: false, resolvedId, ...provenance };
  }
  // Multiply token counts by per-million rate then divide. Use Math.round
  // at micro-USD precision so JSONL files don't drift to floating-point
  // noise on small calls.
  const microUsd = Math.round(
    inputTokens * entry.pricing.inputPer1M + outputTokens * entry.pricing.outputPer1M
  );
  return { costUsd: microUsd / 1_000_000, priced: true, resolvedId, ...provenance };
}

/**
 * Thin wrapper over {@link computeCostDetail} returning only the USD figure.
 * Returns 0 both for a genuinely free model and for a model with no pricing
 * data — callers that must tell those apart (unpriced ⇒ UNMEASURED, #3855)
 * should use `computeCostDetail` and check `priced`.
 */
export function computeCostUSD(modelId: string, inputTokens: number, outputTokens: number): number {
  return computeCostDetail(modelId, inputTokens, outputTokens).costUsd;
}

/** Resolve the active usage log path for the current month. */
export function getUsageLogPath(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return join(getNexusDataDir(), 'usage', `usage-${String(year)}-${month}.jsonl`);
}

/**
 * Append a usage event to the current month's log. Best-effort — failures
 * are silent (we don't want to fail a successful model call because we
 * couldn't write a log line).
 */
export function recordUsageEvent(event: UsageEvent): void {
  try {
    const path = getUsageLogPath(new Date(event.timestamp));
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(event)}\n`, 'utf-8');
  } catch {
    // Intentionally silent — telemetry must not break user calls.
  }
}

export interface LoadUsageOptions {
  /** Restrict to events at or after this ISO timestamp. */
  readonly sinceIso?: string;
  /** Restrict to events before this ISO timestamp. */
  readonly untilIso?: string;
  /** Only events for this model. */
  readonly modelId?: string;
  /** Only events for this category. */
  readonly category?: string;
}

function listUsageFiles(dir: string): readonly string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir).filter((f) => f.startsWith('usage-') && f.endsWith('.jsonl'));
  } catch {
    return [];
  }
}

interface LoadFilter {
  readonly sinceMs: number;
  readonly untilMs: number;
  readonly modelId: string | undefined;
  readonly category: string | undefined;
}

function eventMatches(parsed: UsageEvent, f: LoadFilter): boolean {
  const ts = Date.parse(parsed.timestamp);
  if (ts < f.sinceMs || ts >= f.untilMs) return false;
  if (f.modelId !== undefined && parsed.modelId !== f.modelId) return false;
  if (f.category !== undefined && parsed.category !== f.category) return false;
  return true;
}

function parseFileLines(filePath: string, filter: LoadFilter): readonly UsageEvent[] {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }
  const out: UsageEvent[] = [];
  for (const line of content.split('\n')) {
    if (line.trim() === '') continue;
    try {
      const parsed = JSON.parse(line) as UsageEvent;
      if (eventMatches(parsed, filter)) out.push(parsed);
    } catch {
      // Skip malformed line; keep reading.
      continue;
    }
  }
  return out;
}

/**
 * Load all usage events from disk that match the filter. Reads every
 * monthly log file under the data dir; for sub-second filtering at scale
 * a future PR can index by month, but linear scan is fine at the
 * "operator dashboard" scale this command targets.
 */
export function loadUsageEvents(opts: LoadUsageOptions = {}): readonly UsageEvent[] {
  const dir = join(getNexusDataDir(), 'usage');
  const files = listUsageFiles(dir);
  if (files.length === 0) return [];
  const filter: LoadFilter = {
    sinceMs: opts.sinceIso !== undefined ? Date.parse(opts.sinceIso) : Number.NEGATIVE_INFINITY,
    untilMs: opts.untilIso !== undefined ? Date.parse(opts.untilIso) : Number.POSITIVE_INFINITY,
    modelId: opts.modelId,
    category: opts.category,
  };
  const events: UsageEvent[] = [];
  for (const f of files) {
    events.push(...parseFileLines(join(dir, f), filter));
  }
  return events;
}

export interface ModelRollup {
  readonly modelId: string;
  readonly providerId: string;
  readonly callCount: number;
  readonly successCount: number;
  readonly successRate: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalUsdCost: number;
  readonly avgLatencyMs: number;
  readonly costPerSuccessUsd: number;
}

/**
 * Aggregate events into per-model rollups. Sorted by total cost descending
 * — the model burning the most money at top. Useful for "where is my spend
 * going?" investigations.
 */
export function rollupByModel(events: readonly UsageEvent[]): readonly ModelRollup[] {
  const groups = new Map<string, UsageEvent[]>();
  for (const e of events) {
    const arr = groups.get(e.modelId);
    if (arr === undefined) groups.set(e.modelId, [e]);
    else arr.push(e);
  }
  const rollups: ModelRollup[] = [];
  for (const [modelId, group] of groups) {
    const callCount = group.length;
    const successCount = group.filter((e) => e.success).length;
    const totalInputTokens = group.reduce((s, e) => s + e.inputTokens, 0);
    const totalOutputTokens = group.reduce((s, e) => s + e.outputTokens, 0);
    const totalUsdCost = group.reduce((s, e) => s + e.usdCost, 0);
    const totalLatency = group.reduce((s, e) => s + e.latencyMs, 0);
    const successRate = callCount === 0 ? 0 : successCount / callCount;
    const avgLatencyMs = callCount === 0 ? 0 : totalLatency / callCount;
    const costPerSuccessUsd = successCount === 0 ? totalUsdCost : totalUsdCost / successCount;
    rollups.push({
      modelId,
      providerId: group[0]?.providerId ?? 'unknown',
      callCount,
      successCount,
      successRate,
      totalInputTokens,
      totalOutputTokens,
      totalUsdCost,
      avgLatencyMs,
      costPerSuccessUsd,
    });
  }
  return rollups.sort((a, b) => b.totalUsdCost - a.totalUsdCost);
}
