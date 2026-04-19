/**
 * Access Constraint Deriver — Barrel export (#1977).
 *
 * @module security/access-constraint-deriver
 */

export { resolveAccessPolicyMode } from './config.js';
export { deriveAccessPolicy, hashObjective } from './deriver.js';
export { checkAccess } from './enforcer.js';
export {
  UNBYPASSABLE_PATH_PATTERNS,
  UNBYPASSABLE_TOOL_NAMES,
  isPathDenied,
  isToolDenied,
  matchDenyPattern,
} from './denylist.js';
export { PolicyCache, getPolicyCache, resetPolicyCache } from './cache.js';
export {
  AccessPolicyModeSchema,
  AccessPolicySourceSchema,
  AccessOperationSchema,
  TaskAccessPolicySchema,
} from './types.js';
export type {
  AccessDecision,
  AccessOperation,
  AccessPolicyMode,
  AccessPolicySource,
  TaskAccessPolicy,
} from './types.js';
