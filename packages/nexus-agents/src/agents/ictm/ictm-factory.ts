/**
 * nexus-agents/agents - ICTM Factory
 *
 * Factory for creating expert agents from ICTM configurations
 * and inferring ICTM configs from subtask analysis.
 *
 * @see Issue #756
 * @module agents/ictm/ictm-factory
 */

import type { AgentCapability } from '../../core/index.js';
import type { ExpertConfig, ModelPreference } from '../experts/expert-config.js';
import type { SubTask, TaskAnalysis } from '../tech-lead-types.js';
import { EXPERT_CAPABILITIES, TASK_TYPE_EXPERTS } from '../tech-lead-types.js';
import type {
  ICTMConfig,
  ICTMInferenceResult,
  ContextFilter,
  ToolSet,
  ModelSelection,
  ReasoningDepth,
} from './ictm-types.js';
import { ICTMConfigSchema } from './ictm-types.js';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default context token budget per sub-agent */
const DEFAULT_CONTEXT_TOKENS = 8000;

/** Complexity threshold for extended reasoning */
const HIGH_COMPLEXITY = 7;

/** Complexity threshold for minimal reasoning */
const LOW_COMPLEXITY = 3;

/** Default temperature by reasoning depth */
const TEMPERATURE_BY_REASONING: Record<ReasoningDepth, number> = {
  minimal: 0.5,
  standard: 0.3,
  extended: 0.1,
};

/** Maximum response tokens by reasoning depth */
const MAX_TOKENS_BY_REASONING: Record<ReasoningDepth, number> = {
  minimal: 2048,
  standard: 4096,
  extended: 8192,
};

// =============================================================================
// ICTM → ExpertConfig CONVERSION
// =============================================================================

/**
 * Convert an ICTM config to an ExpertConfig for the existing expert factory.
 *
 * This bridges the ICTM pattern to the existing expert creation pipeline,
 * enabling backward compatibility with all existing expert infrastructure.
 */
export function ictmToExpertConfig(ictm: ICTMConfig, subtaskId: string): ExpertConfig {
  const modelPreference: ModelPreference = {};
  if (ictm.model.temperature !== undefined) {
    modelPreference.temperature = ictm.model.temperature;
  }
  if (ictm.model.maxTokens !== undefined) {
    modelPreference.maxTokens = ictm.model.maxTokens;
  }
  if (ictm.model.provider !== undefined) {
    modelPreference.provider = ictm.model.provider;
  }
  if (ictm.model.modelId !== undefined) {
    modelPreference.modelId = ictm.model.modelId;
  }

  return {
    id: `ictm-${subtaskId}`,
    name: `ICTM Agent (${subtaskId})`,
    role: 'custom',
    systemPrompt: ictm.instructions,
    capabilities: ictm.tools.capabilities as AgentCapability[],
    modelPreference,
    metadata: {
      ...ictm.metadata,
      ictm: true,
      contextFilter: ictm.context,
      toolRestrictions: ictm.tools.restrictions,
      reasoningDepth: ictm.model.reasoning,
    },
  };
}

// =============================================================================
// ICTM INFERENCE
// =============================================================================

/**
 * Infer the reasoning depth from subtask complexity.
 */
function inferReasoningDepth(complexity: number): ReasoningDepth {
  if (complexity >= HIGH_COMPLEXITY) {
    return 'extended';
  }
  if (complexity <= LOW_COMPLEXITY) {
    return 'minimal';
  }
  return 'standard';
}

/**
 * Infer context filter from subtask and analysis.
 */
function inferContextFilter(subtask: SubTask, analysis: TaskAnalysis): ContextFilter {
  // High complexity tasks get more context
  const tokenMultiplier = subtask.complexity >= HIGH_COMPLEXITY ? 2 : 1;
  const maxTokens = DEFAULT_CONTEXT_TOKENS * tokenMultiplier;

  // Tasks with dependencies need history for continuity
  const includeHistory = subtask.dependencies.length > 0;

  // High-risk tasks need higher relevance filtering
  const relevanceThreshold = analysis.risks.length > 2 ? 0.6 : 0.3;

  // Complex tasks benefit from importance-based pruning
  const pruneStrategy =
    subtask.complexity >= HIGH_COMPLEXITY
      ? ('importance' as const)
      : includeHistory
        ? ('hybrid' as const)
        : ('recency' as const);

  return { maxTokens, relevanceThreshold, includeHistory, pruneStrategy };
}

/**
 * Infer tool capabilities from subtask.
 */
function inferTools(subtask: SubTask): ToolSet {
  // Start with the subtask's required capabilities
  const capabilities = [...subtask.requiredCapabilities];

  // Always include task_execution as a baseline
  if (!capabilities.includes('task_execution')) {
    capabilities.push('task_execution');
  }

  // If assigned role exists, merge its capabilities
  if (subtask.assignedRole !== undefined) {
    const roleCaps = EXPERT_CAPABILITIES[subtask.assignedRole];
    for (const cap of roleCaps) {
      if (!capabilities.includes(cap)) {
        capabilities.push(cap);
      }
    }
  }

  return { capabilities };
}

/**
 * Infer model selection from subtask complexity.
 */
function inferModelSelection(subtask: SubTask): ModelSelection {
  const reasoning = inferReasoningDepth(subtask.complexity);

  return {
    temperature: TEMPERATURE_BY_REASONING[reasoning],
    maxTokens: MAX_TOKENS_BY_REASONING[reasoning],
    reasoning,
  };
}

/**
 * Build task-specific instructions from subtask and analysis context.
 */
function buildInstructions(subtask: SubTask, analysis: TaskAnalysis): string {
  const lines: string[] = [];

  lines.push(`## Task: ${subtask.description}`);
  lines.push('');
  lines.push(`**Expected Output:** ${subtask.expectedOutput}`);
  lines.push(`**Priority:** ${subtask.priority}`);
  lines.push(`**Complexity:** ${String(subtask.complexity)}/10`);

  if (analysis.requirements.length > 0) {
    lines.push('');
    lines.push('**Requirements:**');
    for (const req of analysis.requirements) {
      lines.push(`- ${req}`);
    }
  }

  if (analysis.risks.length > 0) {
    lines.push('');
    lines.push('**Risks to Address:**');
    for (const risk of analysis.risks) {
      lines.push(`- ${risk}`);
    }
  }

  if (subtask.dependencies.length > 0) {
    lines.push('');
    lines.push(`**Dependencies:** ${subtask.dependencies.join(', ')}`);
    lines.push('Review outputs from dependent tasks before proceeding.');
  }

  lines.push('');
  lines.push(`**Approach:** ${analysis.approach}`);

  return lines.join('\n');
}

/**
 * Calculate inference confidence based on available information.
 */
function calculateConfidence(subtask: SubTask, analysis: TaskAnalysis): number {
  let confidence = 0.5;

  // More info about the task → higher confidence
  if (subtask.requiredCapabilities.length > 0) confidence += 0.1;
  if (subtask.assignedRole !== undefined) confidence += 0.1;
  if (analysis.requirements.length > 0) confidence += 0.1;
  if (analysis.approach.length > 20) confidence += 0.1;

  // Ambiguity reduces confidence
  if (analysis.risks.length > 3) confidence -= 0.1;

  return Math.max(0, Math.min(1, confidence));
}

/**
 * Infer an optimal ICTM configuration from a subtask and its parent task analysis.
 *
 * This is the core intelligence of the ICTM pattern — it analyzes the subtask
 * to determine the best instructions, context filter, tools, and model config.
 *
 * @param subtask - The subtask to create a sub-agent for
 * @param analysis - Analysis of the parent task
 * @returns ICTMInferenceResult with config and reasoning
 */
export function inferICTM(subtask: SubTask, analysis: TaskAnalysis): ICTMInferenceResult {
  const instructions = buildInstructions(subtask, analysis);
  const context = inferContextFilter(subtask, analysis);
  const tools = inferTools(subtask);
  const model = inferModelSelection(subtask);
  const confidence = calculateConfidence(subtask, analysis);

  const reasoning = inferReasoningDepth(subtask.complexity);

  const config: ICTMConfig = { instructions, context, tools, model };

  return {
    config,
    reasoning: {
      instructions: `Built from subtask description, requirements, and risks`,
      context: `maxTokens=${String(context.maxTokens)}, strategy=${context.pruneStrategy}, history=${String(context.includeHistory)}`,
      tools: `${String(tools.capabilities.length)} capabilities from subtask requirements`,
      model: `reasoning=${reasoning}, temp=${String(model.temperature)}`,
    },
    confidence,
  };
}

/**
 * Validate an ICTM config using Zod schema.
 * Returns the validated config or null on failure.
 */
export function validateICTM(config: unknown): ICTMConfig | null {
  const result = ICTMConfigSchema.safeParse(config);
  return result.success ? result.data : null;
}

/**
 * Get the recommended expert role for a task type.
 * Falls back to 'code_expert' for unknown types.
 */
export function getRecommendedRole(taskType: string): string {
  return TASK_TYPE_EXPERTS[taskType] ?? 'code_expert';
}
