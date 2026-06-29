/**
 * nexus-agents/adapters — shared optional-parameter decision seam (#4068, epic #4066 layer 2).
 *
 * The claude / openai / sdk adapters each inlined an IDENTICAL temperature
 * drop-decision before forwarding a request: consult the layer-1 capability
 * resolver, drop `temperature` (and warn once) when the model rejects it, else
 * pass it through. This module is the single seam for that decision so the three
 * call sites stop duplicating it.
 *
 * It returns DECISION METADATA, not a provider-neutral params dict: each adapter
 * still owns its own wire shape (field names + nesting for stop/tools/
 * response_format/max-tokens), so the seam only decides the shared bit
 * (temperature) and records what it dropped/transformed for the layer-3 telemetry
 * child (#4069). Behavior-preserving by construction.
 *
 * @module adapters/optional-params
 */

import { modelSupportsParameter } from '../config/model-parameter-support.js';
import { warnTemperatureDropped } from '../config/temperature-support.js';
import type { CompletionRequest } from '../core/index.js';

/**
 * Severity of a dropped param (#4069, epic #4066 layer 3). Behavioral params
 * (temperature/seed/top_p) affect determinism/output — dropping one silently is
 * the canonical footgun, so it is surfaced LOUDLY (WARN). Everything else is
 * cosmetic — dropping it is quiet (DEBUG).
 */
export type ParamSeverity = 'behavioral' | 'cosmetic';

/** Params whose silent drop changes model output/determinism — loud when dropped. */
const BEHAVIORAL_PARAMS = new Set<string>(['temperature', 'seed', 'top_p']);

/** Classify a request param as behavioral (loud-on-drop) or cosmetic (quiet). */
export function parameterSeverity(param: string): ParamSeverity {
  return BEHAVIORAL_PARAMS.has(param) ? 'behavioral' : 'cosmetic';
}

/** A request param the seam dropped, with why (feeds the layer-3 telemetry child #4069). */
export interface DroppedParam {
  readonly param: string;
  readonly reason: string;
  /** Behavioral (loud) vs cosmetic (quiet) — see {@link parameterSeverity}. */
  readonly severity: ParamSeverity;
}

/**
 * Would-have-self-healed counter (#4069, epic #4066 layer 3). Keyed
 * `${modelId}:${param}`. Counts every PROACTIVE drop (this module) AND every
 * REACTIVE param-naming 400 the adapter classifies as MODEL_PARAMETER_UNSUPPORTED
 * (base-adapter). Both are exactly the events the reactive self-heal path (#4071)
 * would catch, so this single counter measures how often #4071 would have fired.
 */
const wouldHaveSelfHealed = new Map<string, number>();

/** Record one would-have-self-healed event for `modelId`'s `param` (#4069). */
export function recordWouldHaveSelfHealed(modelId: string, param: string): void {
  const key = `${modelId}:${param}`;
  wouldHaveSelfHealed.set(key, (wouldHaveSelfHealed.get(key) ?? 0) + 1);
}

/** Snapshot of the would-have-self-healed counts (defensive copy). */
export function getWouldHaveSelfHealedCounts(): ReadonlyMap<string, number> {
  return new Map(wouldHaveSelfHealed);
}

/** Test seam: clear the would-have-self-healed counter. */
export function _resetWouldHaveSelfHealed(): void {
  wouldHaveSelfHealed.clear();
}

/** A request param the seam transformed (name/value). Reserved for #4069 / a later max-tokens increment; empty today. */
export interface TransformedParam {
  readonly param: string;
  readonly from: unknown;
  readonly to: unknown;
}

/** The provider-NEUTRAL decision the adapters apply to their own wire shape. */
export interface OptionalParamPlan {
  /** Present iff temperature should be sent (the adapter sets it under its own field name — all 3 use `temperature`). Absent = drop it. */
  readonly temperature?: number;
  readonly dropped: readonly DroppedParam[];
  readonly transformed: readonly TransformedParam[];
}

/**
 * Centralizes the temperature drop-decision shared by the claude/openai/sdk adapters
 * (#4068, epic #4066 layer 2). Consults the layer-1 resolver; when the model rejects
 * temperature it is dropped (and `warnTemperatureDropped` fires, exactly as before) and
 * recorded in `dropped` for the layer-3 telemetry child (#4069). Behavior-preserving:
 * the adapters previously inlined this identically. Returns DECISION METADATA, not a
 * neutral params dict (each adapter still owns its wire names/nesting for stop/tools/etc).
 */
export function planOptionalParams(request: CompletionRequest, modelId: string): OptionalParamPlan {
  const dropped: DroppedParam[] = [];
  let temperature: number | undefined;
  if (request.temperature !== undefined) {
    if (modelSupportsParameter(modelId, 'temperature')) {
      temperature = request.temperature;
    } else {
      // ONE loud line per drop, deduped: warnTemperatureDropped is the consolidated
      // behavioral WARN (severity:'behavioral'), once per model then debug (#4066
      // layer 3). temperature is the only param dropped today and it is behavioral,
      // so there is no second emit — adding one would double-warn.
      warnTemperatureDropped(modelId);
      // Record the proactive drop: every time the reactive self-heal path (#4071)
      // would have fired on a temperature-rejecting 400.
      recordWouldHaveSelfHealed(modelId, 'temperature');
      dropped.push({
        param: 'temperature',
        reason: `model_rejects:${modelId}`,
        severity: parameterSeverity('temperature'),
      });
    }
  }
  return { ...(temperature !== undefined ? { temperature } : {}), dropped, transformed: [] };
}
