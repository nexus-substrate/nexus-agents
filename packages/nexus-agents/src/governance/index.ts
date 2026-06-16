/**
 * nexus-agents/governance
 *
 * Governance infrastructure for system integrity:
 * - Fitness scoring for architectural quality
 * - Consolidation tracking
 * - Deprecation management
 *
 * @module governance
 * (Source: System Mandate LOOP H-K)
 */

export {
  FitnessScoreCalculator,
  createFitnessScoreCalculator,
  calculateFitnessScore,
  type FitnessDimensions,
  type FitnessAudit,
  type FitnessFinding,
} from './fitness-score.js';

export {
  ClaimsRegistrySchema,
  ClaimEntrySchema,
  VerificationSchema,
  VerificationMethodSchema,
  ClaimStatusSchema,
  EvidenceTypeSchema,
  parseClaimsRegistry,
  loadClaimsRegistry,
  type ClaimsRegistry,
  type ClaimEntry,
  type Verification,
  type VerificationMethod,
  type ClaimStatus,
  type EvidenceType,
} from './claims-registry.js';

export {
  verifyClaim,
  verifyClaims,
  countEnumMembers,
  countManifestTools,
  nodeFs,
  type ClaimFs,
  type ClaimResult,
  type VerifyReport,
} from './claims-verify.js';
