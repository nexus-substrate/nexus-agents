/**
 * Policy Feature Extraction
 *
 * Feature extraction for rule-based agent selection policy.
 * Extracts scoring features from orchestration state including
 * recent agent usage, progress, stuck detection, and task keywords.
 *
 * @module agents/orchestration/policy-feature-extraction
 * (Source: Issue #335, Issue #352, arXiv:2505.19591)
 */

import type { PuppeteerState, AgentStepOutput } from './puppeteer-types.js';
// Shared utilities per ADR-0013
import { STOPWORDS } from '../../utils/text-utils.js';

// =============================================================================
// Scoring Features
// =============================================================================

/**
 * Features extracted from state for scoring.
 */
export interface ScoringFeatures {
  /** Number of steps taken */
  stepCount: number;
  /** IDs of recently selected agents */
  recentAgents: string[];
  /** Current estimated progress */
  progress: number;
  /** Whether task appears to be stuck */
  isStuck: boolean;
  /** Keywords from task description */
  taskKeywords: string[];
  /** Last agent's reasoning pattern (if any) */
  lastPattern?: string;
}

// =============================================================================
// Pattern Mapping
// =============================================================================

/** Map agent ID keywords to reasoning patterns. */
const AGENT_PATTERN_MAP: Readonly<Record<string, string>> = {
  decomposer: 'decomposition',
  reflector: 'reflection',
  refiner: 'refinement',
  critic: 'critique',
  executor: 'execution',
  terminator: 'termination',
};

// =============================================================================
// Feature Extraction Functions
// =============================================================================

/**
 * Extract keywords from task description.
 */
export function extractKeywords(description: string): string[] {
  return description
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word))
    .slice(0, 10);
}

/**
 * Compute Jaccard-like similarity between recent output strings.
 */
function computeSimilarity(strings: string[]): number {
  if (strings.length < 2) return 0;

  // Simple Jaccard-like similarity based on word overlap
  const wordSets = strings.map((s) => new Set(s.toLowerCase().split(/\s+/)));
  const lastSet = wordSets[wordSets.length - 1];
  const prevSet = wordSets[wordSets.length - 2];

  if (lastSet === undefined || prevSet === undefined) return 0;
  if (lastSet.size === 0 || prevSet.size === 0) return 0;

  let intersection = 0;
  for (const word of lastSet) {
    if (prevSet.has(word)) intersection++;
  }

  const union = lastSet.size + prevSet.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Detect if the orchestration appears stuck (recent outputs very similar).
 */
export function detectStuckState(recentOutputs: readonly AgentStepOutput[]): boolean {
  if (recentOutputs.length < 2) return false;

  // Check if recent outputs are very similar (potential loop)
  const outputStrings = recentOutputs.map((o) =>
    typeof o.output === 'string' ? o.output : JSON.stringify(o.output)
  );

  const similarity = computeSimilarity(outputStrings);
  return similarity > 0.9;
}

/**
 * Infer the reasoning pattern from the last agent's ID.
 */
export function inferLastPattern(recentOutputs: readonly AgentStepOutput[]): string | undefined {
  if (recentOutputs.length === 0) return undefined;

  const lastOutput = recentOutputs[recentOutputs.length - 1];
  if (lastOutput === undefined) return undefined;

  const lastAgentId = lastOutput.agentId;

  for (const [key, pattern] of Object.entries(AGENT_PATTERN_MAP)) {
    if (lastAgentId.includes(key)) return pattern;
  }

  return undefined;
}

/**
 * Extract all scoring features from orchestration state.
 */
export function extractFeatures(state: PuppeteerState): ScoringFeatures {
  const recentWindow = 3;
  const recentOutputs = state.agentOutputs.slice(-recentWindow);
  const recentAgents = recentOutputs.map((o) => o.agentId);
  const lastPattern = inferLastPattern(recentOutputs);

  const features: ScoringFeatures = {
    stepCount: state.step,
    recentAgents,
    progress: state.metadata.progress,
    isStuck: detectStuckState(recentOutputs),
    taskKeywords: extractKeywords(state.task.description),
  };

  if (lastPattern !== undefined) {
    return { ...features, lastPattern };
  }

  return features;
}
