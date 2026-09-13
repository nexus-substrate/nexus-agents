/**
 * Panel model diversity (#6115).
 *
 * `costSummary.perModel` showed the final model per seat but not the ASSIGNED
 * one, so "7 of 7 on gemini" was visible only to someone who knew the
 * round-robin. This module measures what the response and the summary line
 * disclose: how many distinct models actually answered, and how many seats
 * answered somewhere other than where they were assigned.
 *
 * Shared by the MCP response (`consensus-vote-types`) and the CLI / GitHub
 * renderings (`vote-summary-lines`) so the two cannot drift.
 *
 * @module cli/vote-diversity
 */

import { countDistinctModels, UNRESOLVED_MODEL_ID } from '../config/model-equivalence.js';
import type { AgentVoteResult, SeatFallback } from './vote-types.js';
import { bareCliName } from './voter-fallback.js';

/**
 * Always present on the response, explicit zeros included: an absent key
 * would read as a healthy spread, which is exactly what the three
 * single-model panels looked like.
 */
export interface PanelDiversity {
  /** Distinct models (by canonical identity, #4390) among the seats that answered. */
  readonly distinctModels: number;
  /** Seats that answered on a CLI or model other than the one assigned. */
  readonly fallbacks: number;
}

/** A seat that answered elsewhere, with where it landed. */
export interface SeatFallbackDetail {
  readonly role: AgentVoteResult['role'];
  readonly fallback: SeatFallback;
  /** The CLI that answered, bare (`gemini`), or `?` when the result carries none. */
  readonly toCli: string;
  readonly toModel: string | undefined;
}

/** The seats whose answer counts — the same subset `reportVoteIndependence` judges. */
function answeringSeats(votes: readonly AgentVoteResult[]): AgentVoteResult[] {
  return votes.filter((v) => v.source === 'llm');
}

/** A seat's model when it resolved one; the placeholder is not a model. */
function resolvedModel(v: AgentVoteResult): string | undefined {
  return v.model === undefined || v.model === '' || v.model === UNRESOLVED_MODEL_ID
    ? undefined
    : v.model;
}

/** Every answering seat that carries a fallback, in panel order. */
export function seatFallbacks(votes: readonly AgentVoteResult[]): SeatFallbackDetail[] {
  const out: SeatFallbackDetail[] = [];
  for (const v of answeringSeats(votes)) {
    if (v.fallback === undefined) continue;
    out.push({
      role: v.role,
      fallback: v.fallback,
      toCli: v.cli === undefined ? '?' : bareCliName(v.cli),
      toModel: resolvedModel(v),
    });
  }
  return out;
}

/**
 * Distinct answering models and fallback count. A panel nobody answered is
 * `{ 0, 0 }` — `countDistinctModels([])` is 0 and no seat can have fallen
 * over — which is the named empty case, not a claim of diversity.
 */
export function panelDiversityOf(votes: readonly AgentVoteResult[]): PanelDiversity {
  const models = answeringSeats(votes)
    .map(resolvedModel)
    .filter((m): m is string => m !== undefined);
  return {
    distinctModels: countDistinctModels(models),
    fallbacks: seatFallbacks(votes).length,
  };
}

/** Panels smaller than this cannot make a meaningful independence claim to weaken. */
const MIN_PANEL_FOR_DIVERSITY_WARNING = 3;

/**
 * The warning for a panel of 3+ seats whose every answering seat ran on ONE
 * model. Undefined on a diverse panel, a small panel, a panel nobody answered
 * (the degradation warning already covers that one), and a panel where an
 * answering seat never resolved its model — "all on one model" is a claim,
 * and an unresolved seat is a seat the claim cannot cover (#4983).
 */
export function singleModelPanelWarning(votes: readonly AgentVoteResult[]): string | undefined {
  if (votes.length < MIN_PANEL_FOR_DIVERSITY_WARNING) return undefined;
  const answered = answeringSeats(votes);
  const models = answered.map(resolvedModel);
  const model = models[0];
  if (model === undefined || models.includes(undefined)) return undefined;
  if (panelDiversityOf(votes).distinctModels !== 1) return undefined;
  const silent = votes.length - answered.length;
  const missing = silent > 0 ? ` (${String(silent)} did not answer)` : '';
  return (
    `All ${String(answered.length)} seats answered on ${model}${missing}; ` +
    'independence is weaker than assigned.'
  );
}
