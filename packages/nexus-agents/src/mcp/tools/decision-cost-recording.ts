/**
 * decision-cost-recording — attach a per-decision cost rollup to the EXISTING
 * consensus_vote / pr_review result + persist it.
 *
 * Source: Issue #3855 (epic #3854 child, M4).
 *
 * This is the consumer that rides the existing decision surfaces (#3855
 * explicitly forbids a new MCP tool — the 47-tool ceiling). It bridges a
 * panel's per-voter results into {@link VoterCostInput}s, reads the live billing
 * mode from `NEXUS_BILLING_MODE`, rolls them up via the pure
 * {@link rollupDecisionCost}, persists the summary to the {@link DecisionCostStore},
 * and returns the summary so the tool can attach it to its response.
 *
 * Per-voter token/cost is propagated where the adapter layer reported it; voters
 * with no usage — or whose model has no pricing anywhere in the registry chain
 * (#4165) — are folded in as UNMEASURED (not a measured $0) — see
 * {@link module:observability/decision-cost}. Record + measure ONLY — no routing
 * or weighting change.
 *
 * @module mcp/tools/decision-cost-recording
 */

import type { AgentVoteResult } from '../../cli/vote-types.js';
import { createLogger, getTimeProvider, type ILogger } from '../../core/index.js';
import { computeCostDetail } from '../../learning/usage-log.js';
import { DecisionCostStore, type DecisionGate } from '../../observability/decision-cost-store.js';
import type {
  DecisionBillingMode,
  DecisionCostSummary,
  VoterCostInput,
} from '../../observability/decision-cost.js';

/** Resolve the active billing mode from env (default 'plan'). */
export function resolveBillingMode(): DecisionBillingMode {
  return process.env['NEXUS_BILLING_MODE'] === 'api' ? 'api' : 'plan';
}

/**
 * Bridge a panel's per-voter results into per-voter cost inputs.
 *
 * The vote result carries the model id (#3855) and, where the adapter reported
 * it, token counts. When tokens are present we derive the api-mode cost via the
 * same registry-backed {@link computeCostDetail} the per-call usage log uses, so
 * a per-decision rollup and the per-call usage log price identically. When no
 * usage was reported the voter is left with no tokens/cost ⇒ unmeasured.
 *
 * When the model resolves WITHOUT pricing anywhere in the registry chain
 * (#4165), `costUsd` is OMITTED — tokens are kept — so the rollup counts the
 * voter as UNMEASURED (#3855: missing cost is unmeasured, never a measured $0).
 */
/**
 * Copy only the token counters the adapter actually reported. Every field is
 * spread conditionally so an absent counter stays absent — a fabricated 0
 * would read as a measurement (#4439).
 *
 * The cache figures ride along for visibility only: cost is still priced on
 * uncached input, because the registry carries no cache-read rate and pricing
 * the cached portion at the input rate would overstate spend (#4435).
 */
function reportedTokenFields(v: AgentVoteResult): Partial<VoterCostInput> {
  return {
    ...(v.inputTokens !== undefined ? { inputTokens: v.inputTokens } : {}),
    ...(v.outputTokens !== undefined ? { outputTokens: v.outputTokens } : {}),
    ...(v.cachedInputTokens !== undefined ? { cachedInputTokens: v.cachedInputTokens } : {}),
    ...(v.cacheCreationInputTokens !== undefined
      ? { cacheCreationInputTokens: v.cacheCreationInputTokens }
      : {}),
  };
}

export function votesToCostInputs(votes: readonly AgentVoteResult[]): VoterCostInput[] {
  return votes.map((v) => {
    const hasTokens = v.inputTokens !== undefined || v.outputTokens !== undefined;
    const detail =
      hasTokens && v.model !== undefined
        ? computeCostDetail(v.model, v.inputTokens ?? 0, v.outputTokens ?? 0)
        : undefined;
    const input: VoterCostInput = {
      role: v.role,
      model: v.model,
      ...reportedTokenFields(v),
      ...(detail?.priced === true ? { costUsd: detail.costUsd } : {}),
    };
    return input;
  });
}

export interface RecordDecisionCostOptions {
  /** Stable id for the decision (correlation id / jobId / proposal hash). */
  readonly decisionId: string;
  /** Which gate type incurred the cost. */
  readonly gate: DecisionGate;
  /** The panel's per-voter results. */
  readonly votes: readonly AgentVoteResult[];
  /** Override the store (testing). */
  readonly store?: DecisionCostStore;
  /** Override the billing mode (testing); defaults to the env-resolved mode. */
  readonly billingMode?: DecisionBillingMode;
  /** Override the logger (testing); defaults to a module logger. */
  readonly logger?: ILogger;
}

const defaultLogger = createLogger({ component: 'decision-cost-recording' });

/**
 * Process-lifetime count of decision-cost rollups that FAILED to persist (#3910).
 *
 * The store is best-effort and never throws, so a dropped rollup is otherwise
 * invisible. Incrementing a counter (and logging — see {@link recordDecisionCost})
 * makes missing cost telemetry observable rather than silently swallowed. Reset
 * is test-only.
 */
let droppedCostRecordCount = 0;

/** Read the count of decision-cost rollups dropped at persist time (#3910). */
export function getDroppedCostRecordCount(): number {
  return droppedCostRecordCount;
}

/**
 * Warn rate-limiter for dropped cost rollups (#3916).
 *
 * If the store goes unwritable (disk full / perms / I/O), a per-decision warn
 * would flood the logs and could degrade the main decision path — ironically
 * risking the never-fail invariant the warn exists to protect. So the warn is
 * rate-limited: emit it for the first {@link WARN_BURST} consecutive drops, then
 * at most once per {@link WARN_PERIOD} further drops. The COUNTER still
 * increments on EVERY drop (it stays exact regardless of suppression), and the
 * decision still never fails. The emitted warn carries `suppressedSinceLastWarn`
 * so a reader can see how many drops a single line stands in for.
 */
const WARN_BURST = 5;
const WARN_PERIOD = 1000;
// Never stay silent longer than this on a SLOW leak (#3916): pure count-based
// suppression (every 1000th) would hide ~999 drops for ~41 days at 1/hr. A
// time escape surfaces a persistent low-rate failure within the window.
const WARN_MAX_SILENCE_MS = 60_000;
let warnCountSinceReset = 0;
let lastWarnAtMs = 0;
let warnClockOverrideMs: number | null = null;

/** Testing seam: pin the warn-limiter clock (#3916). Pass null to use real time. */
export function _setWarnClockForTests(ms: number | null): void {
  warnClockOverrideMs = ms;
}

function warnNowMs(): number {
  return warnClockOverrideMs ?? Date.now();
}

/**
 * Whether this drop should emit a warn: the first {@link WARN_BURST} consecutive
 * drops, then every {@link WARN_PERIOD}-th, OR after {@link WARN_MAX_SILENCE_MS}
 * of silence (so a slow leak still surfaces rather than being suppressed for
 * thousands of drops). Side effect: anchors the silence timer on each emitted warn.
 */
function shouldWarnForDrop(dropIndex: number): boolean {
  const now = warnNowMs();
  const countTrigger = dropIndex <= WARN_BURST || (dropIndex - WARN_BURST) % WARN_PERIOD === 0;
  const timeTrigger = dropIndex > WARN_BURST && now - lastWarnAtMs >= WARN_MAX_SILENCE_MS;
  if (countTrigger || timeTrigger) {
    lastWarnAtMs = now;
    return true;
  }
  return false;
}

/** Reset the dropped-cost-record counter and warn limiter (testing only, #3910/#3916). */
export function resetDroppedCostRecordCount(): void {
  droppedCostRecordCount = 0;
  warnCountSinceReset = 0;
  lastWarnAtMs = 0;
  warnClockOverrideMs = null;
}

/** Read how many dropped-cost warns have actually been emitted (testing, #3916). */
export function getDroppedCostWarnCount(): number {
  return warnCountSinceReset;
}

/**
 * Roll up + persist a decision's cost and return the summary for the response.
 *
 * Best-effort persistence: the store never throws into the caller (an
 * observability sink must not break the decision it observes), so on any
 * failure the rollup is still returned for the response. Riding the existing
 * surface — the caller attaches the returned `summary` to its result object.
 *
 * Non-silent drops (#3910): when the rollup fails to persist (fs error / schema
 * reject) the store reports `persisted: false`; we log a warning AND increment a
 * counter so dropped billing telemetry is visible, instead of vanishing. The
 * decision still proceeds — the summary is always returned.
 */
export function recordDecisionCost(options: RecordDecisionCostOptions): DecisionCostSummary {
  const billingMode = options.billingMode ?? resolveBillingMode();
  const voters = votesToCostInputs(options.votes);
  const store = options.store ?? new DecisionCostStore();
  const logger = options.logger ?? defaultLogger;
  const timestamp = new Date(getTimeProvider().now()).toISOString();
  const { record, persisted } = store.record({
    decisionId: options.decisionId,
    gate: options.gate,
    voters,
    billingMode,
    timestamp,
  });
  if (!persisted) {
    // Count EVERY drop (stays exact); rate-limit only the warn so an unwritable
    // store can't flood the log per-decision and degrade the main path (#3916).
    droppedCostRecordCount += 1;
    if (shouldWarnForDrop(droppedCostRecordCount)) {
      const suppressedSinceLastWarn = droppedCostRecordCount - warnCountSinceReset - 1;
      warnCountSinceReset += 1;
      logger.warn('Decision-cost rollup dropped (failed to persist) — billing telemetry lost', {
        decisionId: options.decisionId,
        gate: options.gate,
        totalCostUsd: record.summary.totalCostUsd,
        totalTokens: record.summary.totalTokens,
        droppedCostRecordCount,
        suppressedSinceLastWarn,
      });
    }
  }
  return record.summary;
}
