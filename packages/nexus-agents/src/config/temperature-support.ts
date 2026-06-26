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
 *    codex-5.2→gpt-5.2-codex, codex-5.1-mini→o3-mini, so gateway voters at the
 *    default 0.3 400 on all of them.
 *
 * {@link temperatureUnsupportedForModel} is the single source of truth both the
 * native Claude adapter and the OpenAI-compatible gateway adapter consult before
 * forwarding `temperature`. When it returns true the adapter OMITS the param
 * (value 1.0 is the API default, so omitting is equivalent). It returns FALSE for
 * every model NOT known to reject temperature (gpt-4o, gpt-4, gemini, …), biasing
 * AGAINST false-positive stripping — a false negative is a 400, a false positive
 * only loses the consistency setting.
 *
 * @module config/temperature-support
 */

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
 * Claude branch of {@link temperatureUnsupportedForModel} (#4061). `bare` is the
 * id sliced from the first `claude` (provider prefix stripped). Unsupported when
 * the version is after Opus 4.6, or the family is unrecognized/non-numbered
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
 * OpenAI branch of {@link temperatureUnsupportedForModel} (#4062). True ONLY for
 * the reasoning models documented to reject `temperature`; everything else
 * (gpt-4o, gpt-4, gpt-3.5, gemini, openrouter-*, …) returns false so its
 * temperature is preserved. `id` is the full lower-cased model id.
 *
 * - o-series: `o1`/`o3`/`o3-mini`/`o4-mini` — `o` + digit at the START of the last
 *   path segment (so `claude-opus`/`openrouter-*` cannot match — and the Claude
 *   branch already ran first regardless).
 * - codex: all current `codex…` routes are GPT-5-reasoning-based.
 * - GPT-5 family: `gpt-5` / `gpt5` (anchored after the `5` so `gpt-50`/`gpt-512`
 *   do NOT match) — EXCEPT the non-reasoning `gpt-5-chat` variant.
 */
function openAiReasoningTemperatureUnsupported(id: string): boolean {
  const segment = id.includes('/') ? id.slice(id.lastIndexOf('/') + 1) : id;
  if (/^o[0-9]/.test(segment)) return true;
  if (segment.includes('codex')) return true;
  if (/gpt-?5(?![0-9])/.test(segment) && !segment.includes('gpt-5-chat')) return true;
  return false;
}

/**
 * Whether `modelId` REJECTS a non-default `temperature` and the param must be
 * dropped before the request is sent. Single source of truth for both adapters.
 *
 * - Claude models → see {@link claudeTemperatureUnsupported} (after Opus 4.6, #4061).
 * - OpenAI reasoning models → see {@link openAiReasoningTemperatureUnsupported}
 *   (o-series / GPT-5 family / codex, #4062).
 * - Everything else (gpt-4o, gpt-4, gemini-*, openrouter-*, …) → `false`.
 *
 * Biased AGAINST false positives: a missed model is a 400 outage, a wrongly
 * matched one only loses the consistency setting. Robust to gateway id variants —
 * provider prefixes (`anthropic/…`, `openai/…`), `-`/`_` separators, dated suffixes.
 */
export function temperatureUnsupportedForModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  const claudeAt = id.indexOf('claude');
  if (claudeAt !== -1) {
    return claudeTemperatureUnsupported(id.slice(claudeAt)); // strip provider prefix
  }
  return openAiReasoningTemperatureUnsupported(id);
}
