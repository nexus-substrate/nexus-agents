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
