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
 * with no usage are folded in as UNMEASURED (not a measured $0) — see
 * {@link module:observability/decision-cost}. Record + measure ONLY — no routing
 * or weighting change.
 *
 * @module mcp/tools/decision-cost-recording
 */

import type { AgentVoteResult } from '../../cli/vote-types.js';
import { createLogger, getTimeProvider, type ILogger } from '../../core/index.js';
import { computeCostUSD } from '../../learning/usage-log.js';
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
 * same registry-backed {@link computeCostUSD} the per-call usage log uses, so a
 * per-decision rollup and the per-call usage log price identically. When no
 * usage was reported the voter is left with no tokens/cost ⇒ unmeasured.
 */
export function votesToCostInputs(votes: readonly AgentVoteResult[]): VoterCostInput[] {
  return votes.map((v) => {
    const hasTokens = v.inputTokens !== undefined || v.outputTokens !== undefined;
    const input: VoterCostInput = {
      role: v.role,
      model: v.model,
      ...(v.inputTokens !== undefined ? { inputTokens: v.inputTokens } : {}),
      ...(v.outputTokens !== undefined ? { outputTokens: v.outputTokens } : {}),
      ...(hasTokens && v.model !== undefined
        ? { costUsd: computeCostUSD(v.model, v.inputTokens ?? 0, v.outputTokens ?? 0) }
        : {}),
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
let warnCountSinceReset = 0;

/** Whether this drop should emit a warn under the first-N-then-periodic limiter. */
function shouldWarnForDrop(dropIndex: number): boolean {
  if (dropIndex <= WARN_BURST) return true;
  return (dropIndex - WARN_BURST) % WARN_PERIOD === 0;
}

/** Reset the dropped-cost-record counter and warn limiter (testing only, #3910/#3916). */
export function resetDroppedCostRecordCount(): void {
  droppedCostRecordCount = 0;
  warnCountSinceReset = 0;
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
