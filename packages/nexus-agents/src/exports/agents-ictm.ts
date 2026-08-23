// Do NOT de-slash the `@module` tag below. This file is a TypeDoc entry point
// and `outputFileStrategy: "modules"` derives the output path from the module
// name, so `exports/agents-ictm` is what publishes this page at `/api/exports/agents-ictm`
// rather than `/api/agents-ictm`. Sixteen sibling barrels land flat because they
// carry no tag; the asymmetry is deliberate. A 7-voter panel on #4523 resolved
// that a published doc URL is a stable interface and declined to normalise
// these three for symmetry. Pinned by `scripts/check-typedoc-layout.ts`.
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
