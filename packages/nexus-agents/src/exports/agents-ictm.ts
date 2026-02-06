/**
 * nexus-agents - ICTM Module Exports
 *
 * AOrchestra ICTM (Instructions, Context, Tools, Model) pattern
 * for dynamic sub-agent creation.
 *
 * Split from agents.ts to stay under the 400-line limit.
 *
 * @see Issue #756
 * @module exports/agents-ictm
 */

export {
  // ICTM types
  type ContextPruneStrategy,
  type ContextFilter,
  type ToolSet,
  type ReasoningDepth,
  type ModelSelection,
  type ICTMConfig,
  type ICTMInferenceResult,
  type CuratedContextItem,
  // ICTM schemas
  ContextPruneStrategySchema,
  ContextFilterSchema,
  ToolSetSchema,
  ReasoningDepthSchema,
  ModelSelectionSchema,
  ICTMConfigSchema,
  ICTMInferenceResultSchema,
  // Context curation
  curateContext,
  estimateTokens,
  createContextItem,
  scoreByRecency,
  scoreByImportance,
  scoreByHybrid,
  type CurationResult,
  // Factory
  ictmToExpertConfig,
  inferICTM,
  validateICTM,
  getRecommendedRole,
} from '../agents/index.js';
