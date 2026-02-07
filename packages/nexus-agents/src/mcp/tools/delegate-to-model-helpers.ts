/**
 * nexus-agents/mcp - Delegate to Model Helpers
 *
 * Helper functions for task analysis and model selection.
 *
 * @module mcp/tools/delegate-to-model-helpers
 */

import type { RateLimiter } from '../middleware/rate-limiter.js';
import type {
  BillingMode,
  PreferredCapability,
  CapabilityProfile,
  DelegateInput,
  DelegateOutput,
  TaskRequirements,
  ScoredModel,
  ToolResult,
} from './delegate-to-model-types.js';
import {
  MODEL_CAPABILITIES,
  REASONING_KEYWORDS,
  CONTEXT_KEYWORDS,
  SPEED_KEYWORDS,
  CODE_KEYWORDS,
  COST_KEYWORDS,
  IMAGE_GEN_KEYWORDS,
  AUDIO_OUTPUT_KEYWORDS,
  MCP_KEYWORDS,
  EXPLORATION_KEYWORDS,
} from './delegate-to-model-types.js';
import { DEFAULT_MODEL_CAPABILITIES, modelSupportsAll } from '../../config/model-capabilities.js';
import type { SpecializationMatch } from '../../config/task-specialization-types.js';
import { detectTaskCategory } from '../../config/task-specialization.js';

/**
 * Checks if any keyword from list is in the text.
 */
export function hasKeyword(text: string, keywords: readonly string[]): boolean {
  return keywords.some((k) => text.includes(k));
}

/**
 * Analyzes a task string to determine requirements.
 */
export function analyzeTask(task: string): TaskRequirements {
  const taskLower = task.toLowerCase();
  const estimatedTokens = Math.ceil(task.length / 4) * 2;

  return {
    estimatedTokens,
    needsReasoning: hasKeyword(taskLower, REASONING_KEYWORDS),
    needsLargeContext: hasKeyword(taskLower, CONTEXT_KEYWORDS),
    needsSpeed: hasKeyword(taskLower, SPEED_KEYWORDS),
    needsCodeGen: hasKeyword(taskLower, CODE_KEYWORDS),
    isCostSensitive: hasKeyword(taskLower, COST_KEYWORDS),
    needsImageGen: hasKeyword(taskLower, IMAGE_GEN_KEYWORDS),
    needsAudioOutput: hasKeyword(taskLower, AUDIO_OUTPUT_KEYWORDS),
    needsMcp: hasKeyword(taskLower, MCP_KEYWORDS),
    needsExploration: hasKeyword(taskLower, EXPLORATION_KEYWORDS),
  };
}

/**
 * Calculates score bonus based on task requirements.
 * In plan billing mode, isCostSensitive bonus is suppressed (cost is irrelevant).
 */
export function calcRequirementsScore(
  profile: CapabilityProfile,
  requirements: TaskRequirements,
  billingMode: BillingMode = 'api'
): number {
  let score = 0;
  if (requirements.needsReasoning) score += profile.reasoning * 2;
  if (requirements.needsSpeed) score += profile.speed * 2;
  if (requirements.needsCodeGen) score += profile.codeGeneration * 2;
  if (requirements.isCostSensitive && billingMode !== 'plan') score += profile.cost * 2;
  // Exploration bonus: large context models excel at research tasks (Issue #807)
  if (requirements.needsExploration) {
    if (profile.contextWindow >= 500_000) score += 15;
    score += profile.reasoning;
  }
  return score;
}

/**
 * Calculates context window score bonus.
 */
export function calcContextScore(
  profile: CapabilityProfile,
  requirements: TaskRequirements
): number {
  if (!requirements.needsLargeContext) return 0;
  let score = 0;
  if (profile.contextWindow >= requirements.estimatedTokens * 2) score += 20;
  if (profile.contextWindow >= 500_000) score += 10;
  return score;
}

/**
 * Calculates preferred capability bonus.
 */
export function calcPreferenceScore(
  profile: CapabilityProfile,
  pref?: PreferredCapability
): number {
  if (!pref) return 0;
  const bonusMap: Record<PreferredCapability, number> = {
    reasoning: profile.reasoning * 3,
    context: profile.contextWindow / 100_000,
    speed: profile.speed * 3,
    code: profile.codeGeneration * 3,
  };
  return bonusMap[pref];
}

/** Look up the CLI name for a model ID from the capabilities matrix. */
export function getCliForModel(modelId: string): string | undefined {
  return DEFAULT_MODEL_CAPABILITIES.models.find((m) => m.id === modelId)?.cliName;
}

/**
 * Calculates bonus from task specialization matrix (Issue #858).
 * Models whose CLI matches the preferred CLI get the bonus.
 */
export function calcSpecializationBonus(
  modelName: string,
  match: SpecializationMatch | null
): number {
  if (match === null) return 0;
  const cli = getCliForModel(modelName);
  if (cli === match.primaryCli) return match.bonus;
  if (cli === match.secondaryCli) return Math.floor(match.bonus / 2);
  return 0;
}

/** Options for scoreModel beyond the required model/profile/requirements. */
export interface ScoreModelOptions {
  readonly preferredCapability?: PreferredCapability;
  readonly billingMode?: BillingMode;
  readonly specialization?: SpecializationMatch | null;
}

/**
 * Scores a model based on task requirements.
 * In plan billing mode, cost component is zeroed out so quality wins.
 */
export function scoreModel(
  modelName: string,
  profile: CapabilityProfile,
  requirements: TaskRequirements,
  options: ScoreModelOptions = {}
): number {
  const billingMode = options.billingMode ?? 'api';
  const reqScore = calcRequirementsScore(profile, requirements, billingMode);
  const ctxScore = calcContextScore(profile, requirements);
  const prefScore = calcPreferenceScore(profile, options.preferredCapability);
  const specScore = calcSpecializationBonus(modelName, options.specialization ?? null);
  const costComponent = billingMode === 'plan' ? 0 : profile.cost;
  const baseScore = profile.reasoning + profile.speed + costComponent;
  return reqScore + ctxScore + prefScore + specScore + baseScore;
}

/**
 * Builds reasoning list from requirements.
 */
/** Requirement flag to reason description mapping. */
const REASON_MAP: ReadonlyArray<[keyof TaskRequirements, string]> = [
  ['needsReasoning', 'complex reasoning required'],
  ['needsLargeContext', 'large context needed'],
  ['needsSpeed', 'fast response preferred'],
  ['needsCodeGen', 'code generation task'],
  ['isCostSensitive', 'cost-sensitive'],
  ['needsImageGen', 'image generation required'],
  ['needsAudioOutput', 'audio output required'],
  ['needsMcp', 'MCP tool support required'],
  ['needsExploration', 'exploration/research task benefits from large context'],
];

export function buildReasons(
  requirements: TaskRequirements,
  pref?: string,
  billingMode: BillingMode = 'api',
  specialization: SpecializationMatch | null = null
): string[] {
  const reasons = REASON_MAP.filter(([key]) => requirements[key] === true).map(([, desc]) => desc);
  if (specialization !== null)
    reasons.push(`${specialization.category} task (prefer ${specialization.primaryCli})`);
  if (pref !== undefined && pref !== '') reasons.push(`preferred: ${pref}`);
  if (billingMode === 'plan') reasons.push('plan billing (cost ignored)');
  return reasons;
}

/**
 * Determines tradeoff string for an alternative model.
 */
export function getTradeoff(bestProfile: CapabilityProfile, altProfile: CapabilityProfile): string {
  if (altProfile.speed > bestProfile.speed) return 'faster but less capable';
  if (altProfile.cost > bestProfile.cost) return 'cheaper but less capable';
  if (altProfile.contextWindow > bestProfile.contextWindow) return 'larger context but slower';
  if (altProfile.reasoning > bestProfile.reasoning) return 'better reasoning but slower';
  return 'different tradeoffs';
}

/**
 * Builds modality requirements for capability filtering (Issue #685).
 */
/**
 * Builds modality filter criteria from task requirements (Issue #685).
 */
function buildModalityFilter(requirements: TaskRequirements): {
  outputModalities: Array<'image_png' | 'audio_pcm'>;
  toolCapabilities: Array<'mcp'>;
} | null {
  const needsFiltering =
    requirements.needsImageGen || requirements.needsAudioOutput || requirements.needsMcp;
  if (!needsFiltering) return null;

  const outputMods: Array<'image_png' | 'audio_pcm'> = [];
  if (requirements.needsImageGen) outputMods.push('image_png');
  if (requirements.needsAudioOutput) outputMods.push('audio_pcm');

  return {
    outputModalities: outputMods,
    toolCapabilities: requirements.needsMcp ? ['mcp'] : [],
  };
}

/**
 * Filters models by modality requirements using the capabilities matrix (Issue #685).
 * Returns model IDs that satisfy all detected modality needs, or null if no filtering needed.
 */
export function filterByModality(requirements: TaskRequirements): Set<string> | null {
  const modalReqs = buildModalityFilter(requirements);
  if (modalReqs === null) return null;

  const eligible = new Set<string>();
  for (const model of DEFAULT_MODEL_CAPABILITIES.models) {
    if (modelSupportsAll(model.id, modalReqs)) {
      eligible.add(model.id);
    }
  }
  return eligible.size > 0 ? eligible : null;
}

/**
 * Scores and sorts all models, optionally filtering by modality requirements.
 * When specialization is provided, models matching the preferred CLI get a bonus.
 */
export function scoreAllModels(
  requirements: TaskRequirements,
  pref?: PreferredCapability,
  billingMode: BillingMode = 'api',
  specialization: SpecializationMatch | null = null
): ScoredModel[] {
  const eligible = filterByModality(requirements);

  const opts: ScoreModelOptions = { preferredCapability: pref, billingMode, specialization };
  return Object.entries(MODEL_CAPABILITIES)
    .filter(([name]) => eligible === null || eligible.has(name))
    .map(([name, profile]) => ({
      name,
      profile,
      score: scoreModel(name, profile, requirements, opts),
    }))
    .sort((a, b) => b.score - a.score);
}

/**
 * Selects the optimal model for a task.
 */
export function selectModel(
  input: DelegateInput,
  requirements: TaskRequirements,
  billingMode: BillingMode = 'api'
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
  const specialization = detectTaskCategory(input.task);
  const scored = scoreAllModels(requirements, pref, billingMode, specialization);
  const best = scored[0];

  if (!best) {
    return {
      model: 'claude-sonnet',
      reasoning: 'Default fallback to Claude Sonnet',
      alternatives: [],
    };
  }

  const reasons = buildReasons(
    requirements,
    input.preferred_capability,
    billingMode,
    specialization
  );
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

/** Creates error result. */
export function errorResult(text: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

/** Creates success result. */
export function successResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

/** Checks rate limit, returns error result if exceeded. */
export function checkRateLimit(rateLimiter: RateLimiter): ToolResult | null {
  if (rateLimiter.tryAcquire()) return null;
  const state = rateLimiter.getState();
  return errorResult(`Rate limit exceeded. Try again in ${String(state.nextTokenMs)}ms.`);
}

/** Builds delegate output from selection and requirements. */
export function buildDelegateOutput(
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
