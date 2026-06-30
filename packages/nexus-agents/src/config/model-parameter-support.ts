/**
 * nexus-agents/config — data-driven model request-parameter capability resolver
 * (#4067, epic #4066 layer 1).
 *
 * Generalizes the ad-hoc `temperatureUnsupportedForModel` (#4061/#4062) into a
 * registry-first resolver. Two questions every adapter param-builder asks before
 * forwarding a request parameter:
 *
 * 1. Does this model REJECT a given parameter (so the adapter must omit it)?
 *    {@link unsupportedParametersForModel} / {@link modelSupportsParameter}.
 * 2. Which max-tokens param name does it expect — `max_tokens` (chat-completions
 *    default) or `max_completion_tokens` (OpenAI reasoning models, #4049)?
 *    {@link getMaxTokensParamForModel}.
 *
 * RESOLUTION ORDER (each function): (a) registry capability data — the in-tree
 * `ModelCapability.unsupportedParameters` / `.maxTokensParam` looked up via
 * `lookupInTreeCapability`; if present, it WINS; (b) otherwise the regex fallback
 * below, preserving the EXACT logic that lived in `temperature-support.ts` so
 * unregistered ids (Claude 4.7/4.8, bare o-series) keep resolving correctly.
 *
 * Deterministic: a given id (with a stable registry) yields the same result every
 * call. Biased AGAINST false-positive stripping — a missed rejection is a 400
 * outage, a wrongly-stripped param only loses a tuning knob (the same bias the
 * temperature predicate documented). `temperature-support.ts` is now a thin shim
 * over {@link modelSupportsParameter}.
 *
 * @module config/model-parameter-support
 */

import { lookupInTreeCapability } from './model-config-helpers.js';

// ---------------------------------------------------------------------------
// Regex fallback internals (moved verbatim from temperature-support.ts, #4061)
// ---------------------------------------------------------------------------

interface ClaudeMajorMinor {
  readonly major: number;
  readonly minor: number;
}

/**
 * Parse the FIRST numeric version from a (provider-prefix-stripped) Claude model
 * id — a major with an OPTIONAL minor, tolerating `-`, `_`, and `.` separators.
 *
 * A trailing snapshot date (`-20250514`, 6+ digits) is stripped FIRST so it cannot
 * be mistaken for a minor: `claude-opus-4-20250514` is Opus **4.0**, not 4.20250514.
 * A bare major with no minor is treated as `.0` (`claude-opus-4` → 4.0,
 * `claude-fable-5` → 5.0). major/minor are kept as separate integers so `4.10`
 * compares ABOVE `4.6` (a `parseFloat` would collapse to 4.1). Returns `null` only
 * when the id carries no version digits at all (e.g. `claude-instant`,
 * `claude-newfamily`).
 */
function parseClaudeMajorMinor(bareId: string): ClaudeMajorMinor | null {
  const undated = bareId.replace(/[-_]\d{6,}$/, '');
  const match = /(\d+)(?:[-_.](\d+))?/.exec(undated);
  if (match === null) return null;
  const major = Number.parseInt(match[1] as string, 10);
  const minor = match[2] !== undefined ? Number.parseInt(match[2], 10) : 0;
  if (Number.isNaN(major) || Number.isNaN(minor)) return null;
  return { major, minor };
}

/** Recognized LEGACY Claude families that still support `temperature` (pre-4.x). */
const LEGACY_TEMPERATURE_SUPPORTING = /claude[-_](?:instant|1|2|3)(?:[-_.]|$)/;

/**
 * Claude branch of the temperature regex fallback (#4061). `bare` is the id
 * sliced from the first `claude` (provider prefix stripped). Unsupported when the
 * version is after Opus 4.6, or the family is unrecognized/non-numbered
 * (`claude-fable-5`, future) — a deliberate SAFE-DROP, since a benign fall-back to
 * the API default beats a 400.
 */
function claudeTemperatureUnsupported(bare: string): boolean {
  const version = parseClaudeMajorMinor(bare);
  if (version !== null) {
    // "after Opus 4.6": major > 4, or 4.7+ within the 4.x line.
    return version.major > 4 || (version.major === 4 && version.minor >= 7);
  }
  if (LEGACY_TEMPERATURE_SUPPORTING.test(bare)) return false;
  return true;
}

/**
 * OpenAI REASONING-model detection (#4062). True ONLY for the reasoning models
 * documented to reject `temperature` and to use `max_completion_tokens`;
 * everything else (gpt-4o, gpt-4, gpt-3.5, gemini, openrouter-*, …) returns false.
 * `id` is the full lower-cased model id.
 *
 * - o-series: `o1`/`o3`/`o3-mini`/`o4-mini` — `o` + digit at the START of the last
 *   path segment (so `claude-opus`/`openrouter-*` cannot match).
 * - codex: all current `codex…` routes are GPT-5-reasoning-based.
 * - GPT-5 family: `gpt-5` / `gpt5` (anchored after the `5` so `gpt-50`/`gpt-512`
 *   do NOT match) — EXCEPT the non-reasoning `gpt-5-chat` variant.
 */
function openAiReasoning(id: string): boolean {
  const segment = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id;
  if (/^o[0-9]/.test(segment)) return true;
  if (segment.includes('codex')) return true;
  if (/gpt-?5(?![0-9])/.test(segment) && !segment.includes('gpt-5-chat')) return true;
  return false;
}

/**
 * Regex fallback for whether `modelId` rejects a non-default `temperature`. The
 * EXACT predicate that was `temperatureUnsupportedForModel` before #4067 — Claude
 * after Opus 4.6, OpenAI o-series / GPT-5 family / codex; everything else false.
 * Robust to gateway id variants (provider prefixes, `-`/`_` separators, dated
 * suffixes).
 */
function regexRejectsTemperature(modelId: string): boolean {
  const id = modelId.toLowerCase();
  const claudeAt = id.indexOf('claude');
  if (claudeAt !== -1) {
    return claudeTemperatureUnsupported(id.slice(claudeAt)); // strip provider prefix
  }
  return openAiReasoning(id);
}

/** Regex fallback for OpenAI-reasoning detection (Claude ids are never reasoning here). */
function regexIsOpenAiReasoning(modelId: string): boolean {
  const id = modelId.toLowerCase();
  if (id.includes('claude')) return false;
  return openAiReasoning(id);
}

// ---------------------------------------------------------------------------
// Public resolver API
// ---------------------------------------------------------------------------

/**
 * Parameters `modelId` REJECTS. Registry capability data first
 * (`ModelCapability.unsupportedParameters`), else the regex fallback for
 * unregistered models (Claude>4.6, OpenAI o-series/codex/gpt-5 reject
 * `'temperature'`; nothing else, for now). Deterministic.
 */
export function unsupportedParametersForModel(modelId: string): readonly string[] {
  const cap = lookupInTreeCapability(modelId);
  if (cap?.unsupportedParameters !== undefined) return cap.unsupportedParameters;
  return regexRejectsTemperature(modelId) ? ['temperature'] : [];
}

/** True iff `modelId` accepts `param`. */
export function modelSupportsParameter(modelId: string, param: string): boolean {
  return !unsupportedParametersForModel(modelId).includes(param);
}

/**
 * The max-tokens param name `modelId` expects: registry `maxTokensParam` first,
 * else regex fallback (OpenAI reasoning → `'max_completion_tokens'`, else
 * `'max_tokens'`).
 */
export function getMaxTokensParamForModel(modelId: string): 'max_tokens' | 'max_completion_tokens' {
  const cap = lookupInTreeCapability(modelId);
  if (cap?.maxTokensParam !== undefined) return cap.maxTokensParam;
  return regexIsOpenAiReasoning(modelId) ? 'max_completion_tokens' : 'max_tokens';
}

// ---------------------------------------------------------------------------
// Known-incompatibility registry — the drift guard's source of truth (#4070)
// ---------------------------------------------------------------------------

/**
 * One DOCUMENTED model-parameter incompatibility — a real incident the resolver
 * MUST keep handling. A `param` entry asserts the model rejects that request
 * parameter ({@link modelSupportsParameter} must be false); a `maxTokensParam`
 * entry asserts the max-tokens field name ({@link getMaxTokensParamForModel}).
 */
export interface KnownParameterIncompatibility {
  /** A model id that hits the case (registry-encoded OR regex-fallback). */
  readonly modelId: string;
  /** The rejected request parameter (mutually exclusive with `maxTokensParam`). */
  readonly param?: string;
  /** The expected max-tokens field name (mutually exclusive with `param`). */
  readonly maxTokensParam?: 'max_tokens' | 'max_completion_tokens';
  /** The GitHub incident this case locks in, so a reviewer sees WHY it matters. */
  readonly issue: number;
}

/**
 * The documented model-parameter incompatibilities (#4061/#4062/#4049) as a single
 * declarative, greppable source of truth. The layer-4 drift guard (#4070) asserts
 * every entry against the resolver, so the next param drift — a bumped Claude
 * threshold, an edited regex, a removed `unsupportedParameters` on a registered
 * model — fails CI instead of silently 400-ing in production. Exported so it doubles
 * as documentation and as the anchor the (deferred) provider-reality reconciliation
 * checks against. Spans BOTH the registry data path and the regex fallback path.
 */
export const KNOWN_PARAMETER_INCOMPATIBILITIES: readonly KnownParameterIncompatibility[] = [
  // #4061 — Claude after Opus 4.6 rejects a non-1.0 temperature with a 400 (regex fallback; unregistered concrete id).
  { modelId: 'claude-opus-4-8', param: 'temperature', issue: 4061 },
  // #4062 — OpenAI reasoning families reject temperature (o-series/gpt-5 via regex fallback; codex via registry data).
  { modelId: 'o3-mini', param: 'temperature', issue: 4062 },
  { modelId: 'gpt-5', param: 'temperature', issue: 4062 },
  { modelId: 'codex-5.3', param: 'temperature', issue: 4062 },
  // #4049 — OpenAI reasoning models expect `max_completion_tokens`, not `max_tokens` (codex via registry; o-series via fallback).
  { modelId: 'codex-5.3', maxTokensParam: 'max_completion_tokens', issue: 4049 },
  { modelId: 'o3-mini', maxTokensParam: 'max_completion_tokens', issue: 4049 },
];
