/**
 * agy invocation helpers shared by the gemini adapter and the `pnpm review`
 * script (#4389), so both spawn agy with the same default model and the same
 * print-mode wait.
 *
 * @module cli-adapters/adapters/agy-invocation
 */

import { getCliModelName, getDefaultModelForCli } from '../../config/model-config-helpers.js';

/** Derive the CLI model name for the default Gemini model from the canonical registry. */
export const DEFAULT_GEMINI_CLI_MODEL: string = getCliModelName(getDefaultModelForCli('gemini'));

/** Headroom between agy's print-mode wait and the subprocess guard (#6277). */
const AGY_PRINT_TIMEOUT_HEADROOM_MS = 5_000;
/** Shortest wait handed to agy; below this a seat cannot answer at all. */
const AGY_PRINT_TIMEOUT_FLOOR_S = 30;

/**
 * agy's `--print-timeout` argv (Go duration, whole seconds) for a task
 * budget: the guard minus a fixed headroom, never below the floor. No
 * budget → no flag, so agy's own default applies.
 */
export function agyPrintTimeoutArgs(timeoutMs: number | undefined): readonly string[] {
  if (timeoutMs === undefined) return [];
  const seconds = Math.floor((timeoutMs - AGY_PRINT_TIMEOUT_HEADROOM_MS) / 1000);
  return ['--print-timeout', `${String(Math.max(AGY_PRINT_TIMEOUT_FLOOR_S, seconds))}s`];
}
