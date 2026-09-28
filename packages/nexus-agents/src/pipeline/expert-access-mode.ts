/**
 * Access-mode validation and resolution for `executeExpert` (#6768, #6792).
 *
 * @module pipeline/expert-access-mode
 */

import { createLogger } from '../core/index.js';
import type { ExecutionAccessMode } from '../core/index.js';
import type { CliPermissionDenial } from '../cli-adapters/types-core.js';

const logger = createLogger({ component: 'expert-bridge' });

/** What the arm that served an expert call reported about its host access (#6792). */
export interface ServedAccess {
  accessMode?: ExecutionAccessMode;
  textOnly?: true;
  permissionDenials?: readonly CliPermissionDenial[];
}

/** The {@link ServedAccess} fields of a router response; absent fields stay absent. */
export function servedAccessOf(value: ServedAccess): ServedAccess {
  return {
    ...(value.accessMode !== undefined && { accessMode: value.accessMode }),
    ...(value.textOnly === true && { textOnly: true }),
    ...(value.permissionDenials !== undefined && { permissionDenials: value.permissionDenials }),
  };
}

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
 * `result` stamped with the mode its caller asked for (#6792), and the call's
 * access logged: the requested mode, the mode the served arm reported
 * enforcing (absent when none served), and which arm it was.
 */
export function withRequestedAccessMode<
  T extends ServedAccess & { readonly routedArm?: string; readonly cli?: string },
>(result: T, requestedAccessMode: ExecutionAccessMode, expertType: string): T {
  logger.debug('Expert call access mode', {
    expertType,
    requestedAccessMode,
    accessMode: result.accessMode,
    servedBy: result.routedArm ?? result.cli,
    textOnly: result.textOnly === true,
  });
  return { ...result, requestedAccessMode };
}

/**
 * The mode an expert call asks for (#6792): the caller's, or `'default'`
 * when it named none. The served arm reports what it enforced separately.
 */
export function requestedAccessModeOf(
  options: { accessMode?: ExecutionAccessMode | undefined } | undefined
): ExecutionAccessMode {
  return options?.accessMode ?? 'default';
}
