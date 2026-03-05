/**
 * AOrchestra Agent Planner
 *
 * Maps TaskAnalysisResult to an optimal expert team composition.
 * Selects relevant experts from 9 built-in types based on task
 * characteristics, complexity, and required capabilities.
 *
 * (Source: arXiv:2602.03786 — AOrchestra)
 * @module orchestration/aorchestra/agent-planner
 */

import type {
  TaskAnalysisResult,
  TaskTypeCategory,
  ComplexityLevel,
} from '../../core/task-analysis/shared-task-analyzer.js';
import type { BuiltInExpertType } from '../../agents/experts/expert-config.js';
import { matchTriggers } from './trigger-table.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A single expert assignment within a plan.
 */
export interface AgentPlanEntry {
  /** Expert role to create */
  readonly role: BuiltInExpertType;
  /** Focused sub-task description for this expert */
  readonly subTask: string;
  /** Execution priority (1 = highest, run first) */
  readonly priority: number;
  /** Why this expert was selected */
  readonly reasoning: string;
  /** Wave group for parallel execution (1-based, lower = earlier) */
  readonly wave: number;
}

/** Minimum expert success rate before deprioritization (Issue #1325). */
const RELIABILITY_THRESHOLD = 0.5;

/** Ambiguity score above which a task may need clarification. */
const AMBIGUITY_THRESHOLD = 0.5;

/**
 * Options for planAgentTeam.
 */
export interface PlanAgentTeamOptions {
  /** File paths involved in the task — used for trigger table matching. */
  readonly filePaths?: readonly string[];
  /** Historical expert success rates (role → success rate 0..1). Experts below 50% are skipped. */
  readonly expertReliability?: ReadonlyMap<string, number>;
}

/**
 * Complete agent plan for a task.
 */
export interface AgentPlan {
  /** Ordered list of expert assignments */
  readonly entries: readonly AgentPlanEntry[];
  /** Total experts in plan */
  readonly totalExperts: number;
  /** Source task type */
  readonly taskType: TaskTypeCategory;
  /** Source complexity level */
  readonly complexity: ComplexityLevel;
  /** Overall planning reasoning */
  readonly reasoning: string;
  /** Suggested workers per wave — adaptive based on complexity and dependencies. */
  readonly suggestedWaveSize: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum experts per plan (policy constraint) */
const MAX_EXPERTS = 5;

/** Maximum workers per wave (matching CLAUDE.md subagent guidance) */
export const MAX_WORKERS_PER_WAVE = 3;

/**
 * Primary experts for each task type category.
 * Order matters — first expert is highest priority.
 */
const TASK_TYPE_EXPERTS: Record<TaskTypeCategory, readonly BuiltInExpertType[]> = {
  architecture: ['architecture', 'security', 'code'],
  code_implementation: ['code', 'testing', 'architecture'],
  code_review: ['code', 'security', 'testing'],
  test_generation: ['testing', 'code'],
  documentation: ['documentation', 'code'],
  large_codebase: ['architecture', 'code', 'devops'],
  bulk_operations: ['devops', 'code', 'testing'],
  general: ['code', 'architecture'],
};

/**
 * Maximum experts by complexity level.
 */
const COMPLEXITY_MAX: Record<ComplexityLevel, number> = {
  simple: 1,
  moderate: 2,
  complex: 3,
  expert: 5,
};

/**
 * Expert dependency map — experts that should run AFTER their dependencies.
 * Used for dependency-aware wave assignment (Issue #1317).
 *
 * Key: expert role that has dependencies
 * Value: roles that must complete BEFORE this expert runs
 */
export const EXPERT_DEPENDENCIES: Readonly<
  Partial<Record<BuiltInExpertType, readonly BuiltInExpertType[]>>
> = {
  testing: ['code'],
  security: ['code'],
  documentation: ['code', 'architecture'],
};

/**
 * Compute the optimal wave size based on task shape.
 *
 * - 1 expert: 1 worker/wave (no parallelism needed)
 * - Tasks with expert dependencies: 2 workers/wave (maximizes cross-wave context)
 * - Parallel-safe tasks (no dependencies): MAX_WORKERS_PER_WAVE
 *
 * @param expertCount - Number of experts in the plan
 * @param complexity - Task complexity level
 * @param hasDependencies - Whether any expert has declared dependencies
 * @returns Optimal workers per wave (1..MAX_WORKERS_PER_WAVE)
 */
export function computeOptimalWaveSize(
  expertCount: number,
  complexity: ComplexityLevel,
  hasDependencies: boolean
): number {
  if (expertCount <= 1) return 1;
  if (complexity === 'simple') return 1;
  if (hasDependencies) return 2;
  return MAX_WORKERS_PER_WAVE;
}

/**
 * Sub-task templates per expert role.
 * {task} is replaced with the original task description.
 */
const SUBTASK_TEMPLATES: Record<BuiltInExpertType, string> = {
  code: 'Implement the code changes for: {task}',
  architecture: 'Review architecture implications of: {task}',
  security: 'Assess security implications of: {task}',
  documentation: 'Update documentation for: {task}',
  testing: 'Write tests covering: {task}',
  devops: 'Handle infrastructure and deployment for: {task}',
  research: 'Research approaches and best practices for: {task}',
  pm: 'Analyze requirements and acceptance criteria for: {task}',
  ux: 'Evaluate user experience impact of: {task}',
  infrastructure: 'Assess physical infrastructure and hardware management for: {task}',
};

// ============================================================================
// Planning Logic
// ============================================================================

/** Checks if an expert role is reliable enough to include based on historical data. */
function isReliable(role: BuiltInExpertType, reliability?: ReadonlyMap<string, number>): boolean {
  if (reliability === undefined) return true;
  const rate = reliability.get(role);
  if (rate === undefined) return true; // No data → assume reliable
  return rate >= RELIABILITY_THRESHOLD;
}

/** Shared context for expert selection — avoids passing 6+ params. */
interface ExpertSelectionContext {
  readonly analysis: TaskAnalysisResult;
  readonly taskDescription: string;
  readonly maxExperts: number;
  readonly reliability: ReadonlyMap<string, number> | undefined;
  readonly selected: Set<BuiltInExpertType>;
  readonly entries: AgentPlanEntry[];
}

/** Attempts to add a single expert role if eligible and budget allows. */
function tryAddExpert(ctx: ExpertSelectionContext, role: BuiltInExpertType): void {
  if (ctx.selected.size >= ctx.maxExperts) return;
  if (ctx.selected.has(role)) return;
  if (!isReliable(role, ctx.reliability)) return;
  ctx.selected.add(role);
  ctx.entries.push(createEntry(role, ctx.taskDescription, ctx.selected.size));
}

/**
 * Selects experts based on task type, required capabilities, file triggers, and reliability.
 */
function selectExperts(
  analysis: TaskAnalysisResult,
  taskDescription: string,
  filePaths?: readonly string[],
  expertReliability?: ReadonlyMap<string, number>
): readonly AgentPlanEntry[] {
  const ctx: ExpertSelectionContext = {
    analysis,
    taskDescription,
    maxExperts: Math.min(COMPLEXITY_MAX[analysis.complexity], MAX_EXPERTS),
    reliability: expertReliability,
    selected: new Set<BuiltInExpertType>(),
    entries: [],
  };

  // Add primary experts from task type mapping (skip unreliable ones)
  for (const role of TASK_TYPE_EXPERTS[analysis.taskType]) {
    tryAddExpert(ctx, role);
  }

  // Add experts from required capabilities if budget allows
  addCapabilityExperts(ctx);

  // Add experts from file-pattern trigger table if budget allows (Issue #1314)
  if (filePaths !== undefined && filePaths.length > 0) {
    for (const role of matchTriggers(filePaths)) {
      tryAddExpert(ctx, role);
    }
  }

  return ctx.entries;
}

/**
 * Adds experts based on detected required capabilities.
 */
function addCapabilityExperts(ctx: ExpertSelectionContext): void {
  for (const expertHint of ctx.analysis.requiredCapabilities.experts) {
    const mapped = mapHintToRole(expertHint);
    if (mapped !== undefined) tryAddExpert(ctx, mapped);
  }

  // Security expert for complex tasks if not already included (and reliable)
  if (ctx.analysis.complexity === 'expert') {
    tryAddExpert(ctx, 'security');
  }
}

/**
 * Creates a plan entry for a given expert role (wave assigned later).
 */
function createEntry(
  role: BuiltInExpertType,
  taskDescription: string,
  priority: number
): AgentPlanEntry {
  const truncated = taskDescription.slice(0, 200);
  const wave = Math.ceil(priority / MAX_WORKERS_PER_WAVE);
  return {
    role,
    subTask: SUBTASK_TEMPLATES[role].replace('{task}', truncated),
    priority,
    reasoning: `Selected for ${role} expertise`,
    wave,
  };
}

/**
 * Compute the maximum wave among an expert's dependencies.
 * Returns 0 if no dependencies are present in the plan.
 */
function getMaxDependencyWave(
  role: BuiltInExpertType,
  roleToWave: ReadonlyMap<BuiltInExpertType, number>
): number {
  const deps = EXPERT_DEPENDENCIES[role];
  if (deps === undefined || deps.length === 0) return 0;

  let maxWave = 0;
  for (const dep of deps) {
    const depWave = roleToWave.get(dep);
    if (depWave !== undefined && depWave > maxWave) {
      maxWave = depWave;
    }
  }
  return maxWave;
}

/**
 * Reassign waves based on expert dependencies.
 *
 * For each expert with declared dependencies, ensure its wave is strictly
 * greater than the maximum wave of its dependencies. Experts with no
 * dependencies keep their positional wave assignment.
 */
function assignDependencyAwareWaves(entries: readonly AgentPlanEntry[]): AgentPlanEntry[] {
  if (entries.length <= 1) return [...entries];

  const roleToWave = new Map<BuiltInExpertType, number>();
  for (const entry of entries) {
    roleToWave.set(entry.role, entry.wave);
  }

  // Iterate until stable — max iterations = number of entries (DAG depth)
  let changed = true;
  for (let i = 0; i < entries.length && changed; i++) {
    changed = false;
    for (const entry of entries) {
      const maxDepWave = getMaxDependencyWave(entry.role, roleToWave);
      const currentWave = roleToWave.get(entry.role);
      if (currentWave !== undefined && maxDepWave > 0 && currentWave <= maxDepWave) {
        roleToWave.set(entry.role, maxDepWave + 1);
        changed = true;
      }
    }
  }

  return entries.map((entry) => ({
    ...entry,
    wave: roleToWave.get(entry.role) ?? entry.wave,
  }));
}

/**
 * Maps a capability hint string to a built-in expert type.
 */
function mapHintToRole(hint: string): BuiltInExpertType | undefined {
  const lower = hint.toLowerCase();
  // Order matters: check longer/more-specific keywords first
  // to avoid 'research' matching 'arch' before 'research'
  const mappings: ReadonlyArray<[string, BuiltInExpertType]> = [
    ['security', 'security'],
    ['testing', 'testing'],
    ['test', 'testing'],
    ['documentation', 'documentation'],
    ['research', 'research'],
    ['architecture', 'architecture'],
    ['arch', 'architecture'],
    ['infrastructure', 'infrastructure'],
    ['bare metal', 'infrastructure'],
    ['hardware', 'infrastructure'],
    ['ipmi', 'infrastructure'],
    ['idrac', 'infrastructure'],
    ['server rack', 'infrastructure'],
    ['oob', 'infrastructure'],
    ['devops', 'devops'],
    ['deploy', 'devops'],
    ['infra', 'infrastructure'],
    ['implement', 'code'],
    ['code', 'code'],
    ['product', 'pm'],
    ['pm', 'pm'],
    ['design', 'ux'],
    ['ux', 'ux'],
  ];

  for (const [keyword, role] of mappings) {
    if (lower.includes(keyword)) return role;
  }
  return undefined;
}

/**
 * Generates planning reasoning summary.
 */
function generateReasoning(analysis: TaskAnalysisResult, entryCount: number): string {
  const parts: string[] = [
    `Task type: ${analysis.taskType}`,
    `Complexity: ${analysis.complexity} (score: ${analysis.complexityScore.toFixed(1)})`,
    `Experts selected: ${String(entryCount)}/${String(COMPLEXITY_MAX[analysis.complexity])} max`,
  ];

  if (analysis.ambiguityScore > AMBIGUITY_THRESHOLD) {
    parts.push(`High ambiguity (${analysis.ambiguityScore.toFixed(2)}) — may need clarification`);
  }

  return parts.join('. ') + '.';
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Plans an optimal expert team for a given task analysis.
 *
 * Uses task type, complexity, and required capabilities to select
 * relevant experts from the 9 built-in types. Simple tasks get 1 expert,
 * expert-level tasks get up to 5.
 *
 * @param analysis - Result from SharedTaskAnalyzer.analyze()
 * @param taskDescription - Original task description for sub-task generation
 * @returns AgentPlan with selected experts and sub-tasks
 *
 * @example
 * ```typescript
 * const analysis = analyzer.analyze('Add OAuth2 authentication');
 * const plan = planAgentTeam(analysis, 'Add OAuth2 authentication');
 * // plan.entries: [{ role: 'code', ... }, { role: 'security', ... }]
 * ```
 */
export function planAgentTeam(
  analysis: TaskAnalysisResult,
  taskDescription: string,
  options?: PlanAgentTeamOptions
): AgentPlan {
  const rawEntries = selectExperts(
    analysis,
    taskDescription,
    options?.filePaths,
    options?.expertReliability
  );
  const entries = assignDependencyAwareWaves(rawEntries);
  const hasDependencies = entries.some((e) => EXPERT_DEPENDENCIES[e.role] !== undefined);
  const suggestedWaveSize = computeOptimalWaveSize(
    entries.length,
    analysis.complexity,
    hasDependencies
  );

  return {
    entries,
    totalExperts: entries.length,
    taskType: analysis.taskType,
    complexity: analysis.complexity,
    reasoning: generateReasoning(analysis, entries.length),
    suggestedWaveSize,
  };
}
