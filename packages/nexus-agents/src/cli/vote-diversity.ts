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
import { vendorFamilyOf } from './voter-family-dealing.js';

/**
 * Always present on the response, explicit zeros included: an absent key
 * would read as a healthy spread, which is exactly what the three
 * single-model panels looked like.
 */
export interface PanelDiversity {
  /** Distinct models (by canonical identity, #4390) among the seats that answered. */
  readonly distinctModels: number;
  /**
   * Distinct model families — vendors: anthropic, openai, google, ... (#6606) —
   * among the seats that answered. A seat whose model names no recognised
   * vendor is counted in {@link unclassifiedSeats}, never as a family.
   */
  readonly distinctFamilies: number;
  /** Answering seats whose resolved model names no recognised vendor (#6606). */
  readonly unclassifiedSeats: number;
  /**
   * Answering seats whose model never resolved — absent, empty, or the
   * `pending-detection` placeholder (#6660). They sit in none of the other
   * counts, so without this one "1 distinct, 1 family" could describe a panel
   * where six of seven answering seats named no model at all.
   * {@link panelDiversityOf} always sets it, explicit zero included; optional
   * in the type only so the published shape widens additively.
   */
  readonly unresolvedSeats?: number;
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
  const resolved = answeringSeats(votes).map(resolvedModel);
  const models = resolved.filter((m): m is string => m !== undefined);
  const families = models.map(vendorFamilyOf);
  const classified = families.filter((f) => f !== 'unknown');
  return {
    distinctModels: countDistinctModels(models),
    distinctFamilies: new Set(classified).size,
    unclassifiedSeats: families.length - classified.length,
    unresolvedSeats: resolved.length - models.length,
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

/**
 * The warning for a 3+ panel whose answering seats ran SEVERAL models of ONE
 * family (#6606): three Anthropic models are one vendor's judgement, however
 * distinct their ids. Undefined when the panel spans families, runs a single
 * model (the single-model warning names that one), is under 3 seats, or has
 * nobody answering — and when any answering seat is unresolved or
 * unclassified, because "all one family" is a claim that seat cannot support.
 */
export function singleFamilyPanelWarning(votes: readonly AgentVoteResult[]): string | undefined {
  if (votes.length < MIN_PANEL_FOR_DIVERSITY_WARNING) return undefined;
  const answered = answeringSeats(votes);
  const models = answered.map(resolvedModel);
  const model = models[0];
  if (model === undefined || models.includes(undefined)) return undefined;
  const { distinctModels, distinctFamilies, unclassifiedSeats } = panelDiversityOf(votes);
  if (distinctFamilies !== 1 || unclassifiedSeats > 0 || distinctModels < 2) return undefined;
  return (
    `All ${String(answered.length)} answering seats ran ${vendorFamilyOf(model)} models ` +
    `(${String(distinctModels)} distinct); independence is weaker than assigned.`
  );
}
