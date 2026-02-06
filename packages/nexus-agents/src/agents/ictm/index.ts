/**
 * nexus-agents/agents - ICTM Module
 *
 * AOrchestra ICTM (Instructions, Context, Tools, Model) pattern
 * for dynamic sub-agent creation.
 *
 * @see https://arxiv.org/abs/2602.03786
 * @see Issue #756
 *
 * @module agents/ictm
 */

// Types and schemas
export type {
  ContextPruneStrategy,
  ContextFilter,
  ToolSet,
  ReasoningDepth,
  ModelSelection,
  ICTMConfig,
  ICTMInferenceResult,
  CuratedContextItem,
} from './ictm-types.js';

export {
  ContextPruneStrategySchema,
  ContextFilterSchema,
  ToolSetSchema,
  ReasoningDepthSchema,
  ModelSelectionSchema,
  ICTMConfigSchema,
  ICTMInferenceResultSchema,
} from './ictm-types.js';

// Context curation
export {
  curateContext,
  estimateTokens,
  createContextItem,
  scoreByRecency,
  scoreByImportance,
  scoreByHybrid,
  type CurationResult,
} from './context-curator.js';

// Factory
export { ictmToExpertConfig, inferICTM, validateICTM, getRecommendedRole } from './ictm-factory.js';
