/**
 * Restricted access modes for CLI tasks (#6754, #6792).
 *
 * - Read-only analysis (#6754): voter, reviewer and orchestrate-worker seats
 *   may read, but may not run commands, edit files or fetch from the network.
 * - Workspace edit (#6792): the implement expert may read and edit files in
 *   its working directory, but may not run commands, fetch from the network
 *   or load MCP servers.
 *
 * Each adapter maps a mode to its CLI's own enforcement in `getCommand`. This
 * module holds the rules every adapter shares: an adapter declares each mode
 * it enforces separately, and one that does not declare the task's mode
 * refuses the task instead of running with its defaults.
 */

import type { ExecutionAccessMode } from '../core/index.js';
import type { CliError, CliTask, ICliAdapter } from './types.js';
import { createCallerInputCliError } from './cli-error-helpers.js';

/** A mode other than `'default'`: one an adapter must declare to serve. */
type RestrictedAccessMode = Exclude<ExecutionAccessMode, 'default'>;

/** The adapter declarations {@link adapterEnforces} reads. */
type AccessModeDeclarations = Pick<
  ICliAdapter,
  'enforcesReadOnlyAnalysis' | 'enforcesWorkspaceEdit'
>;

/**
 * How each restricted mode is named in messages and which declaration it
 * reads. A `Record` over the union, so adding a mode without an entry here
 * fails to compile.
 */
const RESTRICTED_MODES: Readonly<
  Record<
    RestrictedAccessMode,
    { readonly label: string; readonly declaredBy: keyof AccessModeDeclarations }
  >
> = {
  'read-only-analysis': { label: 'read-only analysis', declaredBy: 'enforcesReadOnlyAnalysis' },
  'workspace-edit': { label: 'workspace-edit', declaredBy: 'enforcesWorkspaceEdit' },
};

/** Whether `task` asks for read-only analysis mode. */
export function isReadOnlyAnalysis(task: Pick<CliTask, 'accessMode'>): boolean {
  return task.accessMode === 'read-only-analysis';
}

/** Whether `task` asks for workspace-edit mode (#6792). */
export function isWorkspaceEdit(task: Pick<CliTask, 'accessMode'>): boolean {
  return task.accessMode === 'workspace-edit';
}

/** The task's restricted mode, or `undefined` when it runs in the default mode. */
export function restrictedAccessMode(
  task: Pick<CliTask, 'accessMode'>
): RestrictedAccessMode | undefined {
  const mode = task.accessMode;
  return mode === undefined || mode === 'default' ? undefined : mode;
}

/**
 * Whether `adapter` may serve `task` under the task's access mode. A
 * default-mode task is served by any adapter; a restricted one only by an
 * adapter whose declaration for THAT mode is exactly `true`.
 */
export function adapterEnforces(
  adapter: AccessModeDeclarations | undefined,
  task: Pick<CliTask, 'accessMode'>
): boolean {
  const mode = restrictedAccessMode(task);
  if (mode === undefined) return true;
  return adapter?.[RESTRICTED_MODES[mode].declaredBy] === true;
}

/** The human-readable name of a restricted mode, e.g. `read-only analysis`. */
export function accessModeLabel(mode: RestrictedAccessMode): string {
  return RESTRICTED_MODES[mode].label;
}

/**
 * The refusal for a restricted task on an adapter that does not declare the
 * task's mode, or `undefined` when the task may run. Fails closed: only an
 * adapter whose declaration for the mode is exactly `true` passes.
 */
export function unenforcedAccessModeRefusal(
  adapter: Pick<ICliAdapter, 'name'> & AccessModeDeclarations,
  task: Pick<CliTask, 'accessMode'>
): CliError | undefined {
  const mode = restrictedAccessMode(task);
  if (mode === undefined || adapterEnforces(adapter, task)) return undefined;
  return accessModeConflict(adapter.name, mode, 'this adapter cannot enforce it');
}

/**
 * The refusal for a restricted task whose other options would defeat the mode
 * (for example a permission bypass), so an adapter never picks one silently.
 */
export function accessModeConflict(
  cli: ICliAdapter['name'],
  mode: RestrictedAccessMode,
  reason: string
): CliError {
  return createCallerInputCliError(
    `Refusing to run ${cli} in ${accessModeLabel(mode)} mode: ${reason}.`,
    cli
  );
}
