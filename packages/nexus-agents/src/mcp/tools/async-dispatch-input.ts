/**
 * The one async-dispatch input every async-capable MCP tool composes (#4968).
 *
 * Ten tools dispatch through `runAsJob`, and before this module they did not
 * agree on what the switch was called: `mode` on three (`consensus_vote`,
 * `run_workflow`, `orchestrate`), `dispatch` on seven. Because the advertised
 * schemas strip unknown keys, the WRONG spelling was silently ignored — a
 * caller sending `consensus_vote { dispatch: 'async' }` got a 97-second
 * synchronous run and no jobId. Panel decision (quick panel, 3 of 3): `dispatch`
 * is canonical everywhere, `mode` is accepted as a deprecated alias on the three
 * that had it (removal is next-major, #6225), and the wrong key is rejected
 * instead of dropped.
 *
 * Where the wrong-key rejection has to live. The MCP SDK builds
 * `z.object(inputSchema)` from the ADVERTISED shape and hands the handler the
 * parsed, already-stripped object (`validateToolInput` in
 * `@modelcontextprotocol/sdk/server/mcp.js`). So neither a `.refine()` on the
 * tool's internal schema nor a `z.preprocess` in the handler can see a key the
 * SDK removed — either would be a check that cannot fire on the real path
 * while passing every unit test that calls the handler directly. The only
 * schema element that sees the raw value of `mode` is a `mode` entry in the
 * advertised shape itself; {@link REJECTED_MODE_KEY} is that entry. It is the
 * "declare the forbidden key with a never-type carrying the message" form the
 * panel's architect seat named.
 *
 * @module mcp/tools/async-dispatch-input
 */

import { z } from 'zod';

/** The two dispatch values. `undefined` is treated as `'sync'` by every handler. */
export const DISPATCH_MODES = ['sync', 'async'] as const;

export type DispatchMode = (typeof DISPATCH_MODES)[number];

/** The enum both field builders return. */
export type DispatchEnum = z.ZodEnum<{ readonly sync: 'sync'; readonly async: 'async' }>;

/** The type of {@link REJECTED_MODE_KEY}: absent is fine, any value is an error. */
export type RejectedModeKey = z.ZodOptional<z.ZodNever>;

/** Next-major issue that removes the deprecated `mode` alias. */
export const MODE_ALIAS_REMOVAL_ISSUE = '#6225';

const DISPATCH_DESCRIPTION =
  "Async dispatch (#4968). 'sync' (default): run inline and return the result. " +
  "'async': return { status: 'pending', jobId } immediately and run in the background; " +
  'poll get_job_result({ jobId }).';

/** Error a wrong-key `mode: 'sync' | 'async'` produces on a tool whose switch is `dispatch`. */
export const WRONG_KEY_MODE_MESSAGE =
  '`mode` is not the async switch on this tool; send `dispatch: "async"` (or "sync") instead (#4968).';

/** Error when a deprecated-`mode` tool receives both keys with different values. */
export function dispatchModeConflictMessage(dispatch: DispatchMode, mode: DispatchMode): string {
  return (
    `\`dispatch: "${dispatch}"\` and \`mode: "${mode}"\` disagree; send only \`dispatch\` ` +
    `(\`mode\` is a deprecated alias, removed in ${MODE_ALIAS_REMOVAL_ISSUE}).`
  );
}

function describeDispatch(note: string | undefined): string {
  return note === undefined ? DISPATCH_DESCRIPTION : `${DISPATCH_DESCRIPTION} ${note}`;
}

/**
 * The canonical field, optional: the parsed value is `undefined` when the
 * caller omits it. Tools whose parsed type materialises the default use
 * {@link dispatchFieldDefaultSync} instead — same enum, same description.
 *
 * @param note - Tool-specific suffix, e.g. "Ignored for dryRun."
 */
export function dispatchField(note?: string): z.ZodOptional<DispatchEnum> {
  return z.enum(DISPATCH_MODES).optional().describe(describeDispatch(note));
}

/** {@link dispatchField} with `'sync'` materialised as the parsed default. */
export function dispatchFieldDefaultSync(note?: string): z.ZodDefault<DispatchEnum> {
  return z.enum(DISPATCH_MODES).default('sync').describe(describeDispatch(note));
}

/**
 * Advertised-shape entry for tools that have NO `mode` of their own. Any value
 * is rejected — `z.never` — with {@link WRONG_KEY_MODE_MESSAGE}, so the trap
 * the issue describes (`mode: 'async'` silently dropped, synchronous run)
 * fails loudly at the SDK's input validation. Absent is fine: `.optional()`.
 *
 * `run_dev_pipeline` cannot use this because its `mode` is a real field
 * (`'autonomous' | 'harness'`); it keeps its enum and routes the trap values
 * through {@link modeEnumErrorNamingDispatch}.
 */
export const REJECTED_MODE_KEY: RejectedModeKey = z
  .never({ error: WRONG_KEY_MODE_MESSAGE })
  .optional()
  .describe(
    "Not an input of this tool. The async switch is `dispatch`; `mode: 'async'` is rejected (#4968)."
  );

/** Shape fragment for the `dispatch`-only tools: canonical field + wrong-key trap. */
export function asyncDispatchInput(note?: string): {
  dispatch: z.ZodOptional<DispatchEnum>;
  mode: RejectedModeKey;
} {
  return { dispatch: dispatchField(note), mode: REJECTED_MODE_KEY };
}

/** {@link asyncDispatchInput} for tools whose parsed `dispatch` defaults to `'sync'`. */
export function asyncDispatchInputDefaultSync(note?: string): {
  dispatch: z.ZodDefault<DispatchEnum>;
  mode: RejectedModeKey;
} {
  return { dispatch: dispatchFieldDefaultSync(note), mode: REJECTED_MODE_KEY };
}

/** Shape of the issue Zod hands an enum's `error` function; only `input` is read. */
interface EnumIssueInput {
  readonly input?: unknown;
}

/**
 * `error` function for a tool whose `mode` is a REAL enum with other values
 * (`run_dev_pipeline`). A trap value (`'sync' | 'async'`) gets
 * {@link WRONG_KEY_MODE_MESSAGE}; any other wrong value keeps Zod's own
 * "expected one of …" message (returning `undefined` defers to it).
 */
export function modeEnumErrorNamingDispatch(issue: EnumIssueInput): string | undefined {
  return isDispatchMode(issue.input) ? WRONG_KEY_MODE_MESSAGE : undefined;
}

function isDispatchMode(value: unknown): value is DispatchMode {
  return value === 'sync' || value === 'async';
}

/**
 * Shape fragment for the three tools that spelled the switch `mode`: the
 * canonical `dispatch` plus `mode` as a deprecated alias. Compose it into the
 * object AND apply {@link refineDispatchModeAgreement} on the object so a call
 * carrying both with different values is a validation error rather than a
 * silent precedence choice.
 */
export const DEPRECATED_MODE_ALIAS_INPUT = {
  dispatch: dispatchField(),
  mode: z
    .enum(DISPATCH_MODES)
    .optional()
    .describe(
      `DEPRECATED alias of \`dispatch\` (removed in the next major, ${MODE_ALIAS_REMOVAL_ISSUE}). ` +
        'Send `dispatch` instead; a call that sends only `mode` still works and returns a deprecation warning.'
    ),
};

/** The parsed keys the resolution helpers read. */
export interface DispatchAliasInput {
  readonly dispatch?: DispatchMode | undefined;
  readonly mode?: DispatchMode | undefined;
}

/**
 * `superRefine` callback for a deprecated-`mode` tool's object schema: both
 * keys present with different values is an error naming both. Same value
 * twice is allowed (harmless redundancy).
 */
export function refineDispatchModeAgreement(value: DispatchAliasInput, ctx: z.RefinementCtx): void {
  if (value.dispatch === undefined || value.mode === undefined) return;
  if (value.dispatch === value.mode) return;
  ctx.addIssue({
    code: 'custom',
    path: ['dispatch'],
    message: dispatchModeConflictMessage(value.dispatch, value.mode),
  });
}

/**
 * The effective dispatch value on a deprecated-`mode` tool: `dispatch` wins,
 * `mode` fills in when `dispatch` is absent. The conflict case never reaches
 * here — {@link refineDispatchModeAgreement} rejects it at parse.
 */
export function resolveDispatch(input: DispatchAliasInput): DispatchMode | undefined {
  return input.dispatch ?? input.mode;
}

/**
 * The deprecation warning a deprecated-`mode` tool attaches when the caller
 * sent `mode` and not `dispatch`; `undefined` otherwise (nothing to warn about
 * when `dispatch` is present, whatever `mode` says).
 */
export function deprecatedModeWarning(input: DispatchAliasInput): string | undefined {
  if (input.mode === undefined || input.dispatch !== undefined) return undefined;
  return (
    `\`mode: "${input.mode}"\` is deprecated; send \`dispatch: "${input.mode}"\`. ` +
    `\`mode\` is removed in the next major (${MODE_ALIAS_REMOVAL_ISSUE}).`
  );
}

/**
 * `_meta` key carrying caller-facing warnings on a tool result (#4968).
 *
 * `_meta` is the result envelope's out-of-band channel — the error envelope
 * (`nexus-agents/error`, #2649) and the build stamp (`nexus-agents/build`,
 * #5008) already ride there, because `structuredContent` is validated against
 * each tool's `outputSchema` and `content[].text` is the payload. The value is
 * a `string[]`; absent when there is nothing to warn about.
 */
export const WARNINGS_META_KEY = 'nexus-agents/warnings';

/** Result envelopes the warning helper can decorate: anything carrying `_meta`. */
export interface HasMeta {
  _meta?: Record<string, unknown>;
}

/**
 * Attach caller-facing warnings to a result under {@link WARNINGS_META_KEY},
 * preserving any `_meta` the tool already set (the async pending envelope
 * carries none; a structured error carries the error envelope). A missing or
 * empty warning list returns the result unchanged, so the key is present only
 * when it says something.
 */
export function withWarnings<T extends HasMeta>(
  result: T,
  warnings: readonly (string | undefined)[]
): T {
  const present = warnings.filter((w): w is string => w !== undefined);
  if (present.length === 0) return result;
  const existing = result._meta?.[WARNINGS_META_KEY];
  const prior = Array.isArray(existing) ? existing.filter((w) => typeof w === 'string') : [];
  return { ...result, _meta: { ...result._meta, [WARNINGS_META_KEY]: [...prior, ...present] } };
}
