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

/** A request param the seam dropped, with why (feeds the layer-3 telemetry child #4069). */
export interface DroppedParam {
  readonly param: string;
  readonly reason: string;
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
      warnTemperatureDropped(modelId);
      dropped.push({ param: 'temperature', reason: `model_rejects:${modelId}` });
    }
  }
  return { ...(temperature !== undefined ? { temperature } : {}), dropped, transformed: [] };
}
