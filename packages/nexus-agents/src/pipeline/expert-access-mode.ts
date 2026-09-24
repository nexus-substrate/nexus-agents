/**
 * Access-mode validation and resolution for `executeExpert` (#6768, #6792).
 *
 * @module pipeline/expert-access-mode
 */

import type { ExecutionAccessMode } from '../core/index.js';

/**
 * Every {@link ExecutionAccessMode}. A `Record` over the union, so adding a
 * mode without listing it here fails to compile.
 */
const EXECUTION_ACCESS_MODES: Readonly<Record<ExecutionAccessMode, true>> = {
  default: true,
  'read-only-analysis': true,
  'workspace-edit': true,
};

/**
 * Reject an `accessMode` outside {@link ExecutionAccessMode} (#6768).
 * `executeExpert` is published, so a JavaScript caller can pass anything; a
 * misspelled mode such as `'read-only'` would otherwise run with the default
 * access AND the MCP config, the opposite of what the caller asked for.
 */
export function assertAccessMode(accessMode: unknown): void {
  if (accessMode === undefined) return;
  if (typeof accessMode === 'string' && Object.hasOwn(EXECUTION_ACCESS_MODES, accessMode)) return;
  throw new TypeError(
    `executeExpert: unknown accessMode ${JSON.stringify(accessMode)}; expected one of ${Object.keys(
      EXECUTION_ACCESS_MODES
    ).join(', ')}`
  );
}

/**
 * The mode an expert call runs under (#6792): the caller's, or `'default'`
 * when it named none. This is what the call's result records.
 */
export function effectiveAccessMode(
  options: { accessMode?: ExecutionAccessMode | undefined } | undefined
): ExecutionAccessMode {
  return options?.accessMode ?? 'default';
}
