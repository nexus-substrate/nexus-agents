/**
 * Phase Executors - Module Exports
 *
 * Individual phase execution logic for the self-development workflow.
 * Each phase is wired to existing protocols: TRINITY, Reflexion, Consensus, etc.
 *
 * @module workflows/self-development/phases
 */

// Shared utilities
export { createSimpleAgent, checkFailFast, MissingDependencyError } from './shared.js';

// Phase 1: ANALYZE
export { executeAnalyze, AnalyzeUnavailableError } from './analyze.js';

// Phase 2: RESEARCH
export { executeResearch, ResearchUnavailableError } from './research.js';

// Phase 3: PLAN (TRINITY)
export { executePlan, PlanUnavailableError } from './plan.js';

// Phase 4: REFINE (Reflexion)
export {
  executeRefine,
  findPersonaRole,
  buildRefinementTask,
  RefineUnavailableError,
} from './refine.js';

// Phase 5: VOTE (Consensus)
export { executeVote, VotingUnavailableError } from './vote.js';

// Phase 7: IMPLEMENT
export { executeImplement, ImplementUnavailableError } from './implement.js';

// Phase 8: VERIFY & Phase 9: COMMIT
export { executeVerify, executeCommit } from './verify-commit.js';
