/**
 * nexus-agents/agents - Expert Selector
 *
 * Selects the best experts for a task based on capability matching,
 * domain alignment, and scoring algorithms.
 */

import type { Task, AgentRole } from '../../core/index.js';
import { ok, err, NexusError, ErrorCode, createSharedTaskAnalyzer } from '../../core/index.js';
import type { Result, ISharedTaskAnalyzer } from '../../core/index.js';
import {
  toExpertTaskAnalysisResult,
  type ExpertTaskAnalysisResult,
  type ExpertTaskDomain,
  type ExpertTaskComplexity,
} from '../../core/task-analysis/task-profile-adapter.js';

// Legacy type aliases for backward compatibility
type TaskAnalysisResult = ExpertTaskAnalysisResult;
type TaskDomain = ExpertTaskDomain;

// Complexity constants matching legacy values
const TaskComplexity = {
  LOW: 'low' as ExpertTaskComplexity,
  MEDIUM: 'medium' as ExpertTaskComplexity,
  HIGH: 'high' as ExpertTaskComplexity,
} as const;
import { DEFAULT_EXPERTS } from './expert-defaults.js';
import type {
  ExpertDefinition,
  ExpertRegistry,
  ExpertMatch,
  SelectionResult,
  SelectionOptions,
  ExpertCollaborationPatternType,
} from './expert-selector-types.js';
import { ExpertCollaborationPattern, SelectionOptionsSchema } from './expert-selector-types.js';

// Re-export types for backward compatibility
export type {
  ExpertDefinition,
  ExpertRegistry,
  ScoreBreakdown,
  ExpertMatch,
  SelectionResult,
  SelectionOptions,
  ExpertCollaborationPatternType,
} from './expert-selector-types.js';
export {
  ExpertCollaborationPattern,
  ScoreBreakdownSchema,
  ExpertMatchSchema,
  SelectionResultSchema,
  SelectionOptionsSchema,
} from './expert-selector-types.js';

/** Error thrown when expert selection fails. */
export class SelectionError extends NexusError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(message, { code: ErrorCode.AGENT_NOT_FOUND, ...options });
    this.name = 'SelectionError';
  }
}

// ============================================================================
// Default Expert Registry
// ============================================================================

/** Cached default registry singleton for performance optimization. */
let cachedDefaultRegistry: ExpertRegistry | null = null;

/** Cached task analyzer singleton for performance optimization. */
let cachedAnalyzer: ISharedTaskAnalyzer | null = null;

/**
 * Gets the cached task analyzer, creating it if needed.
 */
function getAnalyzer(): ISharedTaskAnalyzer {
  cachedAnalyzer ??= createSharedTaskAnalyzer();
  return cachedAnalyzer;
}

/**
 * Analyzes a task using SharedTaskAnalyzer and converts to expert format.
 * This replaces the legacy analyzeTask() call.
 */
function analyzeTaskForExperts(task: Task): TaskAnalysisResult {
  const analyzer = getAnalyzer();
  const sharedResult = analyzer.analyze(task);
  return toExpertTaskAnalysisResult(sharedResult);
}

/**
 * Gets the cached default expert registry, creating it if needed.
 * This avoids recreating the registry on every call to quickSelect().
 */
function getDefaultRegistry(): ExpertRegistry {
  cachedDefaultRegistry ??= createDefaultRegistry();
  return cachedDefaultRegistry;
}

/**
 * Resets the cached default registry and analyzer.
 * Primarily useful for testing to ensure test isolation.
 */
export function resetDefaultRegistry(): void {
  cachedDefaultRegistry = null;
  cachedAnalyzer = null;
}

/**
 * Creates a default expert registry with built-in experts.
 */
export function createDefaultRegistry(): ExpertRegistry {
  const experts = [...DEFAULT_EXPERTS];

  return {
    getAll: () => [...experts],
    getById: (id: string) => experts.find((e) => e.id === id),
    getByRole: (role: AgentRole) => experts.filter((e) => e.role === role),
    getByDomain: (domain: TaskDomain) =>
      experts.filter((e) => e.primaryDomain === domain || e.secondaryDomains.includes(domain)),
    getAvailable: () => experts.filter((e) => e.available),
  };
}

// ============================================================================
// Scoring Functions
// ============================================================================

const DEFAULT_MIN_SCORE = 0.1;
const DEFAULT_MAX_ALTERNATIVES = 3;
const CAPABILITY_WEIGHT = 0.4;
const DOMAIN_WEIGHT = 0.4;
const EXPERT_WEIGHT = 0.2;

function calculateCapabilityScore(
  expert: ExpertDefinition,
  requiredCapabilities: readonly string[],
  customWeights?: Record<string, number>
): { score: number; matched: string[] } {
  if (requiredCapabilities.length === 0) return { score: 0.5, matched: [] };
  const matched: string[] = [];
  let totalWeight = 0,
    matchedWeight = 0;
  for (const req of requiredCapabilities) {
    const w = customWeights?.[req] ?? 1;
    totalWeight += w;
    if (expert.capabilities.includes(req)) {
      matched.push(req);
      matchedWeight += w;
    }
  }
  return { score: totalWeight > 0 ? matchedWeight / totalWeight : 0, matched };
}

function calculateDomainScore(
  expert: ExpertDefinition,
  primaryDomain: TaskDomain,
  secondaryDomains: readonly TaskDomain[],
  preferredDomains?: TaskDomain[]
): number {
  let score = 0;
  if (expert.primaryDomain === primaryDomain) score = 1.0;
  else if (expert.secondaryDomains.includes(primaryDomain)) score = 0.7;
  else if (expert.primaryDomain === 'general') score = 0.3;
  for (const sec of secondaryDomains) {
    if (expert.primaryDomain === sec) score += 0.15;
    else if (expert.secondaryDomains.includes(sec)) score += 0.1;
  }
  if (
    preferredDomains !== undefined &&
    preferredDomains.length > 0 &&
    preferredDomains.includes(expert.primaryDomain)
  )
    score += 0.1;
  return Math.min(1.0, score);
}

function generateReasoning(
  expert: ExpertDefinition,
  analysis: TaskAnalysisResult,
  matchedCaps: string[],
  domainScore: number
): string {
  const parts: string[] = [];
  if (expert.primaryDomain === analysis.domain)
    parts.push(`Primary expertise in ${analysis.domain} domain`);
  else if (expert.secondaryDomains.includes(analysis.domain))
    parts.push(`Secondary expertise in ${analysis.domain} domain`);
  else if (domainScore > 0)
    parts.push(`Can handle ${analysis.domain} tasks with general knowledge`);
  if (matchedCaps.length > 0)
    parts.push(`Matched capabilities: ${matchedCaps.slice(0, 3).join(', ')}`);
  if (analysis.complexity === TaskComplexity.HIGH && expert.capabilities.includes('collaboration'))
    parts.push('Suited for complex tasks requiring collaboration');
  return parts.join('. ') + '.';
}

function scoreExpert(
  expert: ExpertDefinition,
  analysis: TaskAnalysisResult,
  options?: SelectionOptions
): ExpertMatch {
  const { score: capabilityScore, matched } = calculateCapabilityScore(
    expert,
    analysis.requiredCapabilities,
    options?.capabilityWeights
  );
  const domainScore = calculateDomainScore(
    expert,
    analysis.domain,
    analysis.secondaryDomains,
    options?.preferredDomains
  );
  const finalScore =
    capabilityScore * CAPABILITY_WEIGHT +
    domainScore * DOMAIN_WEIGHT +
    expert.weight * EXPERT_WEIGHT;
  return {
    expertId: expert.id,
    score: finalScore,
    matchedCapabilities: matched,
    reasoning: generateReasoning(expert, analysis, matched, domainScore),
    scoreBreakdown: { capabilityScore, domainScore, weightScore: expert.weight, finalScore },
  };
}

function isHighComplexityMultiDomain(a: TaskAnalysisResult): boolean {
  return a.complexity === TaskComplexity.HIGH && a.secondaryDomains.length > 0;
}
function isCodeSecurityTask(a: TaskAnalysisResult): boolean {
  return a.domain === 'code' && a.secondaryDomains.includes('security' as TaskDomain);
}
function isCodeTestingTask(a: TaskAnalysisResult): boolean {
  return a.domain === 'code' && a.secondaryDomains.includes('testing' as TaskDomain);
}
function isHighEffortMultiDomain(a: TaskAnalysisResult): boolean {
  return a.estimatedEffort >= 7 && a.secondaryDomains.length >= 2;
}

/** Determines if collaboration is needed based on task analysis. */
function shouldCollaborate(
  analysis: TaskAnalysisResult,
  options?: SelectionOptions
): { needed: boolean; pattern?: ExpertCollaborationPatternType } {
  // Handle forceCollaboration explicitly to avoid nullable boolean issue
  if (options?.forceCollaboration === true) {
    return { needed: true, pattern: ExpertCollaborationPattern.PARALLEL };
  }

  if (isHighComplexityMultiDomain(analysis)) {
    return { needed: true, pattern: ExpertCollaborationPattern.SEQUENTIAL };
  }

  if (isCodeSecurityTask(analysis)) {
    return { needed: true, pattern: ExpertCollaborationPattern.REVIEW_CHAIN };
  }

  if (isCodeTestingTask(analysis)) {
    return { needed: true, pattern: ExpertCollaborationPattern.PARALLEL };
  }

  if (isHighEffortMultiDomain(analysis)) {
    return { needed: true, pattern: ExpertCollaborationPattern.SEQUENTIAL };
  }

  return { needed: false };
}

// ============================================================================
// Selection Helper Functions
// ============================================================================

/** Validates selection options. */
function validateOptions(options: SelectionOptions): Result<void, SelectionError> {
  const result = SelectionOptionsSchema.safeParse(options);
  if (!result.success) {
    return err(
      new SelectionError('Invalid selection options', {
        context: { validationErrors: result.error.issues },
      })
    );
  }
  return ok(undefined);
}

/** Gets filtered list of available experts. */
function getFilteredExperts(
  registry: ExpertRegistry,
  excludeExperts?: string[]
): ExpertDefinition[] {
  const experts = registry.getAvailable();
  if (!excludeExperts || excludeExperts.length === 0) return experts;
  const excluded = new Set(excludeExperts);
  return experts.filter((e) => !excluded.has(e.id));
}

/** Scores and sorts all experts. */
function scoreAndSortExperts(
  experts: ExpertDefinition[],
  analysis: TaskAnalysisResult,
  options?: SelectionOptions
): ExpertMatch[] {
  return experts.map((e) => scoreExpert(e, analysis, options)).sort((a, b) => b.score - a.score);
}

/** Creates a fallback result when no matches meet minimum score. */
function createFallbackResult(bestMatch: ExpertMatch, confidence: number): SelectionResult {
  return { primary: bestMatch, alternatives: [], requiresCollaboration: false, confidence };
}

/** Builds the final selection result. */
function buildSelectionResult(
  primary: ExpertMatch,
  filteredMatches: ExpertMatch[],
  analysis: TaskAnalysisResult,
  options?: SelectionOptions
): SelectionResult {
  const maxAlternatives = options?.maxAlternatives ?? DEFAULT_MAX_ALTERNATIVES;
  const alternatives = filteredMatches.slice(1, maxAlternatives + 1);
  const { needed: requiresCollaboration, pattern: suggestedPattern } = shouldCollaborate(
    analysis,
    options
  );
  const scoreSpread = primary.score - (alternatives[0]?.score ?? 0);
  const confidence = Math.min(0.95, analysis.confidence * (0.7 + scoreSpread * 0.3));
  const result: SelectionResult = { primary, alternatives, requiresCollaboration, confidence };
  if (suggestedPattern !== undefined) result.suggestedPattern = suggestedPattern;
  return result;
}

/** Handles the case when no filtered matches exist. */
function handleNoFilteredMatches(
  matches: ExpertMatch[],
  analysis: TaskAnalysisResult,
  taskId: string
): Result<SelectionResult, SelectionError> {
  const bestMatch = matches[0];
  if (bestMatch === undefined) {
    return err(new SelectionError('No experts available for matching', { context: { taskId } }));
  }
  return ok(createFallbackResult(bestMatch, analysis.confidence * 0.5));
}

/** Processes filtered matches to produce final result. */
function processFilteredMatches(
  filteredMatches: ExpertMatch[],
  analysis: TaskAnalysisResult,
  options: SelectionOptions | undefined,
  taskId: string
): Result<SelectionResult, SelectionError> {
  const primary = filteredMatches[0];
  if (primary === undefined) {
    return err(new SelectionError('No experts available for matching', { context: { taskId } }));
  }
  return ok(buildSelectionResult(primary, filteredMatches, analysis, options));
}

// ============================================================================
// Main Selection Function
// ============================================================================

/**
 * Selects the best experts for a task.
 * @param task - The task to select experts for
 * @param registry - Registry of available experts
 * @param options - Optional selection configuration
 */
export function selectExperts(
  task: Task,
  registry: ExpertRegistry,
  options?: SelectionOptions
): Result<SelectionResult, SelectionError> {
  if (options !== undefined) {
    const validation = validateOptions(options);
    if (!validation.ok) {
      return validation;
    }
  }

  // Use SharedTaskAnalyzer via adapter (never fails, returns fallback values)
  const analysis = analyzeTaskForExperts(task);
  const experts = getFilteredExperts(registry, options?.excludeExperts);
  if (experts.length === 0) {
    return err(new SelectionError('No available experts found', { context: { taskId: task.id } }));
  }

  const matches = scoreAndSortExperts(experts, analysis, options);
  const minScore = options?.minScore ?? DEFAULT_MIN_SCORE;
  const filteredMatches = matches.filter((m) => m.score >= minScore);

  if (filteredMatches.length === 0) {
    return handleNoFilteredMatches(matches, analysis, task.id);
  }
  return processFilteredMatches(filteredMatches, analysis, options, task.id);
}

/**
 * Quick selection using default registry.
 * Convenience function for simple use cases.
 * Uses a cached registry for performance optimization.
 */
export function quickSelect(
  task: Task,
  options?: SelectionOptions
): Result<SelectionResult, SelectionError> {
  const registry = getDefaultRegistry();
  return selectExperts(task, registry, options);
}
