/**
 * Access Constraint Deriver — Barrel export (#1977).
 *
 * @module security/access-constraint-deriver
 */

export { resolveAccessPolicyMode } from './config.js';
export { deriveAccessPolicy, deriveWithTelemetry, hashObjective } from './deriver.js';
export type { DerivationOptions, DerivationTelemetry } from './deriver.js';
export { deriveFallbackPolicy, FALLBACK_KEYWORDS } from './fallback-regex.js';
export {
  deriveViaLlm,
  DEFAULT_LLM_TIMEOUT_MS,
  INDUCTION_PROMPT,
  LlmPolicyOutputSchema,
} from './llm-deriver.js';
export type { LlmPolicyOutput, LlmDerivationResult } from './llm-deriver.js';
export { gateTrust } from './trust-gate.js';
export type { TrustGateDecision } from './trust-gate.js';
export { checkAccess } from './enforcer.js';
export {
  withAccessPolicy,
  getActivePolicy,
  guardMcpToolCall,
  denyToToolResult,
  createAccessPolicyMiddleware,
} from './mcp-guard.js';
export type { GuardArgs } from './mcp-guard.js';
export { createAccessPolicyChainMiddleware } from './chain-adapter.js';
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
