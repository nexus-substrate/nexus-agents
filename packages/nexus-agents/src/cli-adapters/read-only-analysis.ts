/**
 * Read-only analysis mode for CLI tasks (#6754).
 *
 * Voter and reviewer seats run CLIs in a read-only analysis mode: the seat may
 * read, but may not run commands, edit files or fetch from the network. Each
 * adapter maps the mode to its CLI's own enforcement in `getCommand`. This
 * module holds the one rule every adapter shares: an adapter that does not
 * declare enforcement refuses the task instead of running with its defaults.
 */

import type { CliError, CliTask, ICliAdapter } from './types.js';
import { createCallerInputCliError } from './cli-error-helpers.js';

/** Whether `task` asks for read-only analysis mode. */
export function isReadOnlyAnalysis(task: Pick<CliTask, 'accessMode'>): boolean {
  return task.accessMode === 'read-only-analysis';
}

/**
 * The refusal for a read-only task on an adapter that cannot enforce the mode,
 * or `undefined` when the task may run. Fails closed: only an adapter whose
 * `enforcesReadOnlyAnalysis` is exactly `true` passes.
 */
export function readOnlyAnalysisRefusal(
  adapter: Pick<ICliAdapter, 'name' | 'enforcesReadOnlyAnalysis'>,
  task: Pick<CliTask, 'accessMode'>
): CliError | undefined {
  if (!isReadOnlyAnalysis(task)) return undefined;
  if (adapter.enforcesReadOnlyAnalysis === true) return undefined;
  return readOnlyAnalysisConflict(adapter.name, 'this adapter cannot enforce it');
}

/**
 * The refusal for a read-only task whose other options would defeat the mode
 * (for example a permission bypass), so an adapter never picks one silently.
 */
export function readOnlyAnalysisConflict(cli: ICliAdapter['name'], reason: string): CliError {
  return createCallerInputCliError(
    `Refusing to run ${cli} in read-only analysis mode: ${reason}.`,
    cli
  );
}
