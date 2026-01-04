/**
 * nexus-agents/mcp - Delegate to Model Tool
 *
 * MCP tool for capability-matched task routing.
 * Routes tasks to optimal model based on task requirements and available capacity.
 *
 * (Source: MCP Protocol 2025-11-25)
 * (Source: cli-project_plan.md v2.0.0)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ILogger } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';

/**
 * Preferred capability for task routing.
 */
export type PreferredCapability = 'reasoning' | 'context' | 'speed' | 'code';

/**
 * Model capability profile for routing decisions.
 */
export interface CapabilityProfile {
  /** Complex reasoning ability (0-10) */
  readonly reasoning: number;
  /** Maximum context window in tokens */
  readonly contextWindow: number;
  /** Code generation quality (0-10) */
  readonly codeGeneration: number;
  /** Response latency score (0-10, higher = faster) */
  readonly speed: number;
  /** Cost efficiency (0-10, higher = cheaper) */
  readonly cost: number;
}

/**
 * Available model configurations with capability profiles.
 * (Source: cli-project_plan.md v2.0.0 - Capability Matching Matrix)
 */
export const MODEL_CAPABILITIES: Record<string, CapabilityProfile> = {
  'claude-opus': {
    reasoning: 10,
    contextWindow: 200_000,
    codeGeneration: 9,
    speed: 5,
    cost: 3,
  },
  'claude-sonnet': {
    reasoning: 9,
    contextWindow: 200_000,
    codeGeneration: 9,
    speed: 7,
    cost: 6,
  },
  'claude-haiku': {
    reasoning: 7,
    contextWindow: 200_000,
    codeGeneration: 7,
    speed: 9,
    cost: 9,
  },
  'gemini-pro': {
    reasoning: 8,
    contextWindow: 1_000_000,
    codeGeneration: 7,
    speed: 8,
    cost: 8,
  },
  'gemini-flash': {
    reasoning: 6,
    contextWindow: 1_000_000,
    codeGeneration: 6,
    speed: 10,
    cost: 10,
  },
  'codex-5.2': {
    reasoning: 9,
    contextWindow: 400_000,
    codeGeneration: 10,
    speed: 8,
    cost: 7,
  },
  'codex-5.1-mini': {
    reasoning: 7,
    contextWindow: 400_000,
    codeGeneration: 8,
    speed: 9,
    cost: 9,
  },
} as const;

/**
 * Input schema for the delegate_to_model tool.
 */
export const DelegateInputSchema = z.object({
  task: z.string().min(1).describe('Task to execute or analyze'),
  preferred_capability: z
    .enum(['reasoning', 'context', 'speed', 'code'])
    .optional()
    .describe('Preferred capability for routing: reasoning, context, speed, or code'),
  model_hint: z
    .string()
    .optional()
    .describe('Explicit model preference (e.g., claude-opus, gemini-pro)'),
  estimate_tokens: z
    .boolean()
    .optional()
    .default(false)
    .describe('If true, return token estimate only without execution'),
});

export type DelegateInput = z.infer<typeof DelegateInputSchema>;

/**
 * Output schema for the delegate_to_model tool response.
 */
export const DelegateOutputSchema = z.object({
  recommended_model: z.string().describe('The model recommended for this task'),
  reasoning: z.string().describe('Why this model was selected'),
  capabilities: z.object({
    reasoning: z.number(),
    contextWindow: z.number(),
    codeGeneration: z.number(),
    speed: z.number(),
    cost: z.number(),
  }),
  estimated_tokens: z.number().describe('Estimated tokens for task'),
  alternatives: z
    .array(
      z.object({
        model: z.string(),
        score: z.number(),
        tradeoff: z.string(),
      })
    )
    .describe('Alternative model options with tradeoffs'),
});

export type DelegateOutput = z.infer<typeof DelegateOutputSchema>;

/**
 * Dependencies for the delegate_to_model tool.
 */
export interface DelegateDeps {
  /** Logger instance */
  logger?: ILogger;
  /** Optional rate limiter */
  rateLimiter?: RateLimiter;
}

/**
 * Analyzes task to determine requirements.
 */
interface TaskRequirements {
  estimatedTokens: number;
  needsReasoning: boolean;
  needsLargeContext: boolean;
  needsSpeed: boolean;
  needsCodeGen: boolean;
  isCostSensitive: boolean;
}

/** Keywords indicating reasoning needs. */
const REASONING_KEYWORDS = [
  'analyze',
  'design',
  'architect',
  'compare',
  'evaluate',
  'complex',
  'think',
  'reason',
  'explain why',
  'trade-off',
];

/** Keywords indicating large context needs. */
const CONTEXT_KEYWORDS = [
  'codebase',
  'repository',
  'all files',
  'entire',
  'whole project',
  'summarize',
  'review all',
];

/** Keywords indicating speed needs. */
const SPEED_KEYWORDS = ['quick', 'fast', 'simple', 'brief', 'short', 'immediately'];

/** Keywords indicating code generation needs. */
const CODE_KEYWORDS = [
  'implement',
  'code',
  'write',
  'function',
  'test',
  'refactor',
  'fix',
  'debug',
  'generate',
];

/** Keywords indicating cost sensitivity. */
const COST_KEYWORDS = ['cheap', 'cost', 'budget', 'economical', 'free'];

/**
 * Checks if any keyword from list is in the text.
 */
function hasKeyword(text: string, keywords: readonly string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

/**
 * Analyzes a task string to determine requirements.
 */
function analyzeTask(task: string): TaskRequirements {
  const taskLower = task.toLowerCase();
  const estimatedTokens = Math.ceil(task.length / 4) * 2;

  return {
    estimatedTokens,
    needsReasoning: hasKeyword(taskLower, REASONING_KEYWORDS),
    needsLargeContext: hasKeyword(taskLower, CONTEXT_KEYWORDS),
    needsSpeed: hasKeyword(taskLower, SPEED_KEYWORDS),
    needsCodeGen: hasKeyword(taskLower, CODE_KEYWORDS),
    isCostSensitive: hasKeyword(taskLower, COST_KEYWORDS),
  };
}

/**
 * Calculates score bonus based on task requirements.
 */
function calcRequirementsScore(profile: CapabilityProfile, requirements: TaskRequirements): number {
  let score = 0;
  if (requirements.needsReasoning) score += profile.reasoning * 2;
  if (requirements.needsSpeed) score += profile.speed * 2;
  if (requirements.needsCodeGen) score += profile.codeGeneration * 2;
  if (requirements.isCostSensitive) score += profile.cost * 2;
  return score;
}

/**
 * Calculates context window score bonus.
 */
function calcContextScore(profile: CapabilityProfile, requirements: TaskRequirements): number {
  if (!requirements.needsLargeContext) return 0;
  let score = 0;
  if (profile.contextWindow >= requirements.estimatedTokens * 2) score += 20;
  if (profile.contextWindow >= 500_000) score += 10;
  return score;
}

/**
 * Calculates preferred capability bonus.
 */
function calcPreferenceScore(profile: CapabilityProfile, pref?: PreferredCapability): number {
  if (!pref) return 0;
  const bonusMap: Record<PreferredCapability, number> = {
    reasoning: profile.reasoning * 3,
    context: profile.contextWindow / 100_000,
    speed: profile.speed * 3,
    code: profile.codeGeneration * 3,
  };
  return bonusMap[pref];
}

/**
 * Scores a model based on task requirements.
 */
function scoreModel(
  _modelName: string,
  profile: CapabilityProfile,
  requirements: TaskRequirements,
  preferredCapability?: PreferredCapability
): number {
  const reqScore = calcRequirementsScore(profile, requirements);
  const ctxScore = calcContextScore(profile, requirements);
  const prefScore = calcPreferenceScore(profile, preferredCapability);
  const baseScore = profile.reasoning + profile.speed + profile.cost;
  return reqScore + ctxScore + prefScore + baseScore;
}

/** Model scoring result. */
interface ScoredModel {
  name: string;
  profile: CapabilityProfile;
  score: number;
}

/**
 * Builds reasoning list from requirements.
 */
function buildReasons(requirements: TaskRequirements, pref?: string): string[] {
  const reasons: string[] = [];
  if (requirements.needsReasoning) reasons.push('complex reasoning required');
  if (requirements.needsLargeContext) reasons.push('large context needed');
  if (requirements.needsSpeed) reasons.push('fast response preferred');
  if (requirements.needsCodeGen) reasons.push('code generation task');
  if (requirements.isCostSensitive) reasons.push('cost-sensitive');
  if (pref !== undefined && pref !== '') reasons.push(`preferred: ${pref}`);
  return reasons;
}

/**
 * Determines tradeoff string for an alternative model.
 */
function getTradeoff(bestProfile: CapabilityProfile, altProfile: CapabilityProfile): string {
  if (altProfile.speed > bestProfile.speed) return 'faster but less capable';
  if (altProfile.cost > bestProfile.cost) return 'cheaper but less capable';
  if (altProfile.contextWindow > bestProfile.contextWindow) return 'larger context but slower';
  if (altProfile.reasoning > bestProfile.reasoning) return 'better reasoning but slower';
  return 'different tradeoffs';
}

/**
 * Scores and sorts all models.
 */
function scoreAllModels(requirements: TaskRequirements, pref?: PreferredCapability): ScoredModel[] {
  return Object.entries(MODEL_CAPABILITIES)
    .map(([name, profile]) => ({
      name,
      profile,
      score: scoreModel(name, profile, requirements, pref),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Selects the optimal model for a task.
 */
function selectModel(
  input: DelegateInput,
  requirements: TaskRequirements
): {
  model: string;
  reasoning: string;
  alternatives: Array<{ model: string; score: number; tradeoff: string }>;
} {
  const hint = input.model_hint;
  if (hint !== undefined && hint !== '' && MODEL_CAPABILITIES[hint] !== undefined) {
    return {
      model: hint,
      reasoning: `Using explicitly requested model: ${hint}`,
      alternatives: [],
    };
  }

  const pref = input.preferred_capability;
  const scored = scoreAllModels(requirements, pref);
  const best = scored[0];

  if (!best) {
    return {
      model: 'claude-sonnet',
      reasoning: 'Default fallback to Claude Sonnet',
      alternatives: [],
    };
  }

  const reasons = buildReasons(requirements, input.preferred_capability);
  const reasoning =
    reasons.length > 0
      ? `Selected ${best.name} (score: ${best.score.toFixed(1)}) because: ${reasons.join(', ')}`
      : `Selected ${best.name} as the best overall match (score: ${best.score.toFixed(1)})`;

  const alternatives = scored.slice(1, 4).map((alt) => ({
    model: alt.name,
    score: alt.score,
    tradeoff: getTradeoff(best.profile, alt.profile),
  }));

  return { model: best.name, reasoning, alternatives };
}

/** Tool result type. */
type ToolResult = { isError?: boolean; content: Array<{ type: 'text'; text: string }> };

/** Creates error result. */
function errorResult(text: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

/** Creates success result. */
function successResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

/** Checks rate limit, returns error result if exceeded. */
function checkRateLimit(rateLimiter?: RateLimiter): ToolResult | null {
  if (!rateLimiter) return null;
  if (rateLimiter.tryAcquire()) return null;
  const state = rateLimiter.getState();
  return errorResult(`Rate limit exceeded. Try again in ${String(state.nextTokenMs)}ms.`);
}

/** Builds delegate output from selection and requirements. */
function buildDelegateOutput(
  selection: ReturnType<typeof selectModel>,
  requirements: TaskRequirements
): DelegateOutput | null {
  const caps = MODEL_CAPABILITIES[selection.model];
  if (!caps) return null;
  return {
    recommended_model: selection.model,
    reasoning: selection.reasoning,
    capabilities: caps,
    estimated_tokens: requirements.estimatedTokens,
    alternatives: selection.alternatives,
  };
}

/**
 * Creates the handler for the delegate_to_model tool.
 */
function createDelegateHandler(deps: DelegateDeps, logger: ILogger): (args: unknown) => ToolResult {
  return (args: unknown): ToolResult => {
    const rateLimitError = checkRateLimit(deps.rateLimiter);
    if (rateLimitError) return rateLimitError;

    const validated = DelegateInputSchema.safeParse(args);
    if (!validated.success) {
      const msg = validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      logger.warn('Invalid delegate_to_model input', { errors: validated.error.issues });
      return errorResult(`Validation error: ${msg}`);
    }

    const input = validated.data;
    logger.info('Analyzing task for model routing', { taskLength: input.task.length });

    const requirements = analyzeTask(input.task);
    logger.debug('Task requirements analyzed', { ...requirements });

    const selection = selectModel(input, requirements);
    const output = buildDelegateOutput(selection, requirements);

    if (!output) return errorResult(`Unknown model: ${selection.model}`);

    logger.info('Model recommendation complete', { recommendedModel: output.recommended_model });
    return successResult(JSON.stringify(output, null, 2));
  };
}

/**
 * Tool input schema definition.
 */
const TOOL_SCHEMA = {
  task: z.string().min(1).describe('Task to execute or analyze'),
  preferred_capability: z
    .enum(['reasoning', 'context', 'speed', 'code'])
    .optional()
    .describe('Preferred capability for routing'),
  model_hint: z.string().optional().describe('Explicit model preference'),
  estimate_tokens: z.boolean().optional().describe('Return token estimate only'),
};

/**
 * Registers the delegate_to_model tool with the MCP server.
 *
 * @param server - MCP server instance
 * @param deps - Dependencies
 */
export function registerDelegateToModelTool(server: McpServer, deps: DelegateDeps): void {
  const logger = deps.logger ?? createLogger({ tool: 'delegate_to_model' });
  const description =
    'Route a task to the optimal model based on capability matching. Returns model recommendation with reasoning.';

  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Consistent with other tools in codebase
  server.tool('delegate_to_model', description, TOOL_SCHEMA, createDelegateHandler(deps, logger));
  logger.info('Registered delegate_to_model tool');
}

/**
 * Exports for testing.
 */
export const _testing = {
  analyzeTask,
  scoreModel,
  selectModel,
};
