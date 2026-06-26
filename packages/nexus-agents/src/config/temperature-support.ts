/**
 * nexus-agents/config — model `temperature` support (#4061).
 *
 * Anthropic Claude models released AFTER Opus 4.6 do not support setting
 * `temperature`. Per the installed `@anthropic-ai/sdk` (messages.d.ts): "Models
 * released after Claude Opus 4.6 do not support setting temperature. A value of
 * 1.0 will be accepted for backwards compatibility, all other values will be
 * rejected with a 400 error." So sending the voter / base-agent default (0.3) to
 * Opus 4.7 / 4.8 — or routing them through an OpenAI-compatible gateway that
 * forwards the param — yields a hard 400.
 *
 * {@link temperatureUnsupportedForModel} is the single source of truth both the
 * native Claude adapter and the OpenAI-compatible gateway adapter consult before
 * forwarding `temperature`. When it returns true the adapter OMITS the param
 * (value 1.0 is the API default, so omitting is equivalent and sidesteps the
 * deprecation).
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
 * Whether `modelId` REJECTS a non-default `temperature` and the param must be
 * dropped before the request is sent.
 *
 * - Non-Claude models (gpt-*, gemini-*, …) → `false`: never touched here.
 * - Claude opus/sonnet/haiku with a parseable version > 4.6 → `true` (the SDK
 *   boundary: 4.7+, 5.x).
 * - Recognized legacy Claude (claude-2/3/instant) → `false`: still support it.
 * - Any OTHER Claude id (no parseable version and not legacy — e.g.
 *   `claude-fable-5`, a future Claude family, or a bare alias) → `true`. This
 *   SAFE-DROP default is deliberate: dropping `temperature` is a benign fall-back
 *   to the API default, whereas forwarding it to a model that rejects it is a 400
 *   outage. Errors are worse than losing a temperature setting.
 *
 * Robust to gateway id variants — provider prefixes (`anthropic/…`, `custom/…`),
 * `-`/`_` separators (`claude-opus-4-8`, `claude_4_8`), and dated suffixes.
 */
export function temperatureUnsupportedForModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  const claudeAt = id.indexOf('claude');
  if (claudeAt === -1) return false; // not a Claude model — leave temperature alone
  const bare = id.slice(claudeAt); // strip any `anthropic/` / `custom/` prefix

  const version = parseClaudeMajorMinor(bare);
  if (version !== null) {
    // "after Opus 4.6": major > 4, or 4.7+ within the 4.x line.
    return version.major > 4 || (version.major === 4 && version.minor >= 7);
  }
  // No version digits at all (e.g. `claude-instant`, a bare family alias, an
  // unknown future family): legacy families keep temperature; everything else
  // Claude is treated as unsupported (safe-drop — a benign default beats a 400).
  if (LEGACY_TEMPERATURE_SUPPORTING.test(bare)) return false;
  return true;
}
