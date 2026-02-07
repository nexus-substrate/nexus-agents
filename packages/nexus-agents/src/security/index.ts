/**
 * nexus-agents/security - Module Exports
 *
 * Security components including sandboxing, isolation, safety evaluation,
 * and untrusted input hardening (Epic #818).
 *
 * @module security
 */

// Sandbox module
export * from './sandbox/index.js';

// Safety-bench module (Issue #332, arXiv:2412.14470)
export * from './safety-bench/index.js';

// Untrusted input hardening — Phase 1 (Epic #818)
export * from './trust-types.js';
export { sanitizeInput } from './input-sanitizer.js';
export {
  classifyTrust,
  mapAuthorAssociation,
  canInfluenceDecisions,
  requiresCorroboration,
  getRequiredTrustTier,
} from './trust-classifier.js';
export type { ClassifyInput, ClassifyResult } from './trust-classifier.js';
export {
  AgentActionSchema,
  SourceCitationSchema,
  validateAgentAction,
  isReadOnlyAction,
  isMutatingAction,
  requiresCitation,
} from './action-schema.js';
export type {
  AgentAction,
  AgentActionType,
  SourceCitation,
  ActionValidationResult,
} from './action-schema.js';
