/**
 * nexus-agents/mcp - Delegate to Model Helpers
 *
 * Helper functions for task analysis and model selection.
 *
 * @module mcp/tools/delegate-to-model-helpers
 */

import type { RateLimiter } from '../middleware/rate-limiter.js';
import type {
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
} from './delegate-to-model-types.js';

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
  };
}

/**
 * Calculates score bonus based on task requirements.
 */
export function calcRequirementsScore(
  profile: CapabilityProfile,
  requirements: TaskRequirements
): number {
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

/**
 * Scores a model based on task requirements.
 */
export function scoreModel(
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

/**
 * Builds reasoning list from requirements.
 */
export function buildReasons(requirements: TaskRequirements, pref?: string): string[] {
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
export function getTradeoff(bestProfile: CapabilityProfile, altProfile: CapabilityProfile): string {
  if (altProfile.speed > bestProfile.speed) return 'faster but less capable';
  if (altProfile.cost > bestProfile.cost) return 'cheaper but less capable';
  if (altProfile.contextWindow > bestProfile.contextWindow) return 'larger context but slower';
  if (altProfile.reasoning > bestProfile.reasoning) return 'better reasoning but slower';
  return 'different tradeoffs';
}

/**
 * Scores and sorts all models.
 */
export function scoreAllModels(
  requirements: TaskRequirements,
  pref?: PreferredCapability
): ScoredModel[] {
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
export function selectModel(
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
