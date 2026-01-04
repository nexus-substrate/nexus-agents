/**
 * @nexus-agents/agents - Expert Selector
 *
 * Selects the best experts for a task based on capability matching,
 * domain alignment, and scoring algorithms.
 */

import { z } from 'zod';
import type { Task, AgentRole } from '../../core/index.js';
import { ok, err, NexusError, ErrorCode } from '../../core/index.js';
import type { Result } from '../../core/index.js';
import {
  analyzeTask,
  type TaskAnalysisResult,
  type TaskDomain,
  TaskComplexity,
} from './task-analyzer.js';
import { DEFAULT_EXPERTS } from './expert-defaults.js';

/** Error thrown when expert selection fails. */
export class SelectionError extends NexusError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(message, { code: ErrorCode.AGENT_NOT_FOUND, ...options });
    this.name = 'SelectionError';
  }
}

/** Collaboration patterns for multi-expert tasks. */
export const ExpertCollaborationPattern = {
  SEQUENTIAL: 'sequential',
  PARALLEL: 'parallel',
  REVIEW_CHAIN: 'review_chain',
  PAIR: 'pair',
} as const;

export type ExpertCollaborationPatternType =
  (typeof ExpertCollaborationPattern)[keyof typeof ExpertCollaborationPattern];

/** Definition of an expert's capabilities and metadata. */
export interface ExpertDefinition {
  id: string;
  role: AgentRole;
  name: string;
  description: string;
  capabilities: string[];
  primaryDomain: TaskDomain;
  secondaryDomains: TaskDomain[];
  weight: number;
  available: boolean;
}

/** Registry of available experts. */
export interface ExpertRegistry {
  getAll(): ExpertDefinition[];
  getById(id: string): ExpertDefinition | undefined;
  getByRole(role: AgentRole): ExpertDefinition[];
  getByDomain(domain: TaskDomain): ExpertDefinition[];
  getAvailable(): ExpertDefinition[];
}

/** Breakdown of how the match score was calculated. */
export interface ScoreBreakdown {
  capabilityScore: number;
  domainScore: number;
  weightScore: number;
  finalScore: number;
}

/** Match result for a single expert. */
export interface ExpertMatch {
  expertId: string;
  score: number;
  matchedCapabilities: string[];
  reasoning: string;
  scoreBreakdown: ScoreBreakdown;
}

/** Result of expert selection. */
export interface SelectionResult {
  primary: ExpertMatch;
  alternatives: ExpertMatch[];
  requiresCollaboration: boolean;
  suggestedPattern?: ExpertCollaborationPatternType;
  confidence: number;
}

/** Options for expert selection. */
export interface SelectionOptions {
  minScore?: number;
  maxAlternatives?: number;
  capabilityWeights?: Record<string, number>;
  preferredDomains?: TaskDomain[];
  excludeExperts?: string[];
  forceCollaboration?: boolean;
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const ScoreBreakdownSchema = z.object({
  capabilityScore: z.number().min(0).max(1),
  domainScore: z.number().min(0).max(1),
  weightScore: z.number().min(0).max(1),
  finalScore: z.number().min(0).max(1),
});

export const ExpertMatchSchema = z.object({
  expertId: z.string().min(1),
  score: z.number().min(0).max(1),
  matchedCapabilities: z.array(z.string()),
  reasoning: z.string(),
  scoreBreakdown: ScoreBreakdownSchema,
});

export const SelectionResultSchema = z.object({
  primary: ExpertMatchSchema,
  alternatives: z.array(ExpertMatchSchema),
  requiresCollaboration: z.boolean(),
  suggestedPattern: z.enum(['sequential', 'parallel', 'review_chain', 'pair']).optional(),
  confidence: z.number().min(0).max(1),
});

export const SelectionOptionsSchema = z.object({
  minScore: z.number().min(0).max(1).optional(),
  maxAlternatives: z.number().min(0).max(10).optional(),
  capabilityWeights: z.record(z.number().min(0).max(10)).optional(),
  preferredDomains: z
    .array(z.enum(['code', 'security', 'architecture', 'documentation', 'testing', 'general']))
    .optional(),
  excludeExperts: z.array(z.string()).optional(),
  forceCollaboration: z.boolean().optional(),
});

// ============================================================================
// Default Expert Registry
// ============================================================================

/** Cached default registry singleton for performance optimization. */
let cachedDefaultRegistry: ExpertRegistry | null = null;

/**
 * Gets the cached default expert registry, creating it if needed.
 * This avoids recreating the registry on every call to quickSelect().
 */
function getDefaultRegistry(): ExpertRegistry {
  cachedDefaultRegistry ??= createDefaultRegistry();
  return cachedDefaultRegistry;
}

/**
 * Resets the cached default registry.
 * Primarily useful for testing to ensure test isolation.
 */
export function resetDefaultRegistry(): void {
  cachedDefaultRegistry = null;
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
  requiredCapabilities: string[],
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
  secondaryDomains: TaskDomain[],
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

  const analysisResult = analyzeTask(task);
  if (!analysisResult.ok) {
    return err(
      new SelectionError(`Task analysis failed: ${analysisResult.error.message}`, {
        cause: analysisResult.error,
        context: { taskId: task.id },
      })
    );
  }

  const analysis = analysisResult.value;
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
