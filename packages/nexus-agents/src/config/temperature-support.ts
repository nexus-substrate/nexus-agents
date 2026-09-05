/**
 * nexus-agents/config — model `temperature` support (#4061, #4062).
 *
 * Some models reject a custom `temperature` with a hard 400, so both adapters
 * must OMIT the param for them. Two families:
 *
 * 1. Anthropic Claude AFTER Opus 4.6 (#4061). Per the installed `@anthropic-ai/sdk`
 *    (messages.d.ts): "Models released after Claude Opus 4.6 do not support setting
 *    temperature. A value of 1.0 will be accepted for backwards compatibility, all
 *    other values will be rejected with a 400 error."
 * 2. OpenAI REASONING models (#4062): the o-series (o1/o3/o3-mini/o4-mini) reject
 *    `temperature` outright ("Unsupported parameter"), and the GPT-5 family accepts
 *    only the default ("Only the default (1) value is supported") — except the
 *    non-reasoning `gpt-5-chat` variant. This repo routes codex-5.3→gpt-5.4,
 *    codex-5.2→gpt-5.3-codex-spark, codex-5.1-mini→gpt-5.4-mini (#5091), so
 *    gateway voters at the default 0.3 400 on all of them.
 *
 * {@link temperatureUnsupportedForModel} is the single source of truth both the
 * native Claude adapter and the OpenAI-compatible gateway adapter consult before
 * forwarding `temperature`. When it returns true the adapter OMITS the param
 * (value 1.0 is the API default, so omitting is equivalent). It returns FALSE for
 * every model NOT known to reject temperature (gpt-4o, gpt-4, gemini, …), biasing
 * AGAINST false-positive stripping — a false negative is a 400, a false positive
 * only loses the consistency setting.
 *
 * As of #4067 the predicate is a THIN SHIM over the data-driven resolver in
 * `model-parameter-support.ts` (registry `unsupportedParameters` first, then the
 * same regex fallback that used to live here). The three adapter call sites and
 * the `warnTemperatureDropped` / `_resetTemperatureWarnings` surface are unchanged.
 *
 * @module config/temperature-support
 */

import { createLogger } from '../core/index.js';
import { modelSupportsParameter } from './model-parameter-support.js';

const logger = createLogger({ component: 'temperature-support' });

/**
 * Models we have ALREADY warned about dropping `temperature` for, so the loud
 * warning fires once per model per process rather than on every request (a voter
 * panel makes many calls). Repeats log at debug.
 */
const warnedDroppedModels = new Set<string>();

/**
 * FAIL LOUDLY when `temperature` is omitted because the target model rejects it
 * (#4066 layer 3). `temperature` is a BEHAVIORAL parameter — silently dropping it
 * means a determinism/consistency setting is ignored with no signal (e.g. 0.0 and
 * 0.7 yield identical output), the canonical footgun. So the first drop per model
 * is a WARN that says the param was omitted and the request runs at the provider
 * default; subsequent drops for that model log at debug to avoid per-call spam.
 */
export function warnTemperatureDropped(modelId: string): void {
  if (warnedDroppedModels.has(modelId)) {
    logger.debug('Omitted unsupported temperature (already warned for this model)', {
      modelId,
      parameter: 'temperature',
    });
    return;
  }
  warnedDroppedModels.add(modelId);
  logger.warn(
    `Model "${modelId}" does not support a custom \`temperature\` (the provider rejects ` +
      `non-default values with a 400). nexus-agents omitted it; the request runs at the ` +
      `provider default. Any determinism/consistency you expected from temperature has NO ` +
      `effect on this model.`,
    { modelId, parameter: 'temperature', severity: 'behavioral' }
  );
}

/** Test seam: clear the once-per-model warning dedupe set. */
export function _resetTemperatureWarnings(): void {
  warnedDroppedModels.clear();
}

/**
 * Whether `modelId` REJECTS a non-default `temperature` and the param must be
 * dropped before the request is sent. Single source of truth for both adapters.
 *
 * Thin shim over {@link modelSupportsParameter} (#4067): registry
 * `unsupportedParameters` data wins, else the regex fallback (Claude after Opus
 * 4.6 #4061; OpenAI o-series / GPT-5 family / codex #4062; everything else
 * `false`). Biased AGAINST false positives: a missed model is a 400 outage, a
 * wrongly matched one only loses the consistency setting. Robust to gateway id
 * variants — provider prefixes (`anthropic/…`, `openai/…`), `-`/`_` separators,
 * dated suffixes.
 */
export function temperatureUnsupportedForModel(modelId: string): boolean {
  return !modelSupportsParameter(modelId, 'temperature');
}
