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
import { getTimeProvider } from '../../core/index.js';
import { computeCostUSD } from '../../learning/usage-log.js';
import {
  DecisionCostStore,
  type DecisionCostRecord,
  type DecisionGate,
} from '../../observability/decision-cost-store.js';
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
export function votesToCostInputs(
  votes: readonly (AgentVoteResult & {
    readonly inputTokens?: number | undefined;
    readonly outputTokens?: number | undefined;
  })[]
): VoterCostInput[] {
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
}

/**
 * Roll up + persist a decision's cost and return the summary for the response.
 *
 * Best-effort persistence: the store never throws into the caller (an
 * observability sink must not break the decision it observes), so on any
 * failure the rollup is still returned for the response. Riding the existing
 * surface — the caller attaches the returned `summary` to its result object.
 */
export function recordDecisionCost(options: RecordDecisionCostOptions): DecisionCostSummary {
  const billingMode = options.billingMode ?? resolveBillingMode();
  const voters = votesToCostInputs(options.votes);
  const store = options.store ?? new DecisionCostStore();
  const timestamp = new Date(getTimeProvider().now()).toISOString();
  const record: DecisionCostRecord = store.record({
    decisionId: options.decisionId,
    gate: options.gate,
    voters,
    billingMode,
    timestamp,
  });
  return record.summary;
}
