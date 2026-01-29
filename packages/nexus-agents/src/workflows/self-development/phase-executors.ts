/**
 * Phase Executors
 *
 * Re-exports from the phases/ directory for backward compatibility.
 * Individual phase execution logic for the self-development workflow.
 * Wires up existing protocols: TRINITY, Reflexion, Consensus, Self-Debug, Self-Refine.
 *
 * @module workflows/self-development/phase-executors
 */

// Re-export all phase executors from the phases directory
export {
  createSimpleAgent,
  executeAnalyze,
  executeResearch,
  executePlan,
  executeRefine,
  executeVote,
  VotingUnavailableError,
  executeImplement,
  executeVerify,
  executeCommit,
  findPersonaRole,
  buildRefinementTask,
} from './phases/index.js';
