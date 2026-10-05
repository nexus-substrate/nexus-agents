/**
 * The one async-dispatch input every async-capable MCP tool composes (#4968).
 *
 * Every async-capable tool uses `dispatch: 'sync' | 'async'`. The former
 * `mode` alias on consensus_vote, run_workflow and orchestrate was removed
 * in 9.0 (#6225); calls using that key fail validation and name `dispatch`.
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

const DISPATCH_DESCRIPTION =
  "Async dispatch (#4968). 'sync' (default): run inline and return the result. " +
  "'async': return { status: 'pending', jobId } immediately and run in the background; " +
  'poll get_job_result({ jobId }).';

/** Error a wrong-key `mode: 'sync' | 'async'` produces on a tool whose switch is `dispatch`. */
export const WRONG_KEY_MODE_MESSAGE =
  '`mode` is not the async switch on this tool; send `dispatch: "async"` (or "sync") instead (#4968).';

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
