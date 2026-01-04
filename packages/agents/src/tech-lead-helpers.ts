/**
 * @nexus-agents/agents - TechLead Helper Functions
 *
 * Helper functions for TechLead task analysis, decomposition, and synthesis.
 */

import type { AgentRole, Task } from '@nexus-agents/core';
import type {
  SubTask,
  TaskAnalysis,
  ExpertAssignment,
  SynthesizedResult,
  ResultSummary,
  TechLeadOptions,
} from './tech-lead-types.js';
import { EXPERT_CAPABILITIES } from './tech-lead-types.js';

/**
 * Infer task type from description keywords.
 */
export function inferTaskType(description: string): string {
  const typeKeywords: Record<string, string[]> = {
    implementation: ['implement', 'create', 'build', 'develop', 'write code'],
    refactoring: ['refactor', 'improve', 'optimize', 'clean up'],
    architecture: ['architect', 'design system', 'structure', 'pattern'],
    security_audit: ['security', 'vulnerability', 'audit', 'penetration'],
    documentation: ['document', 'readme', 'api doc', 'explain'],
    testing: ['test', 'coverage', 'unit test', 'integration'],
    code_review: ['review', 'check code', 'analyze code'],
  };

  for (const [taskType, keywords] of Object.entries(typeKeywords)) {
    for (const keyword of keywords) {
      if (description.includes(keyword)) {
        return taskType;
      }
    }
  }

  return 'general';
}

/**
 * Extract requirements from task description.
 */
export function extractRequirements(description: string): string[] {
  const requirements: string[] = [];
  const lines = description.split(/[.\n]/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.length > 10 &&
      (trimmed.includes('must') ||
        trimmed.includes('should') ||
        trimmed.includes('need') ||
        trimmed.includes('require'))
    ) {
      requirements.push(trimmed);
    }
  }

  return requirements.slice(0, 5);
}

/**
 * Identify risks based on task description keywords.
 */
export function identifyRisks(description: string): string[] {
  const risks: string[] = [];

  if (description.includes('database') || description.includes('migration')) {
    risks.push('Data integrity during changes');
  }
  if (description.includes('security')) {
    risks.push('Security vulnerabilities if not thorough');
  }
  if (description.includes('performance')) {
    risks.push('Performance regression');
  }
  if (description.includes('api') || description.includes('interface')) {
    risks.push('Breaking API changes');
  }
  if (description.includes('concurrent') || description.includes('parallel')) {
    risks.push('Race conditions');
  }

  return risks;
}

/**
 * Suggest approach based on task type and complexity.
 */
export function suggestApproach(taskType: string, complexity: number): string {
  if (complexity >= 7) {
    return `High complexity ${taskType} task. Recommend iterative approach with frequent reviews.`;
  }
  if (complexity >= 4) {
    return `Medium complexity ${taskType} task. Standard development process with testing.`;
  }
  return `Low complexity ${taskType} task. Direct implementation with basic validation.`;
}

/**
 * Create a subtask with the given parameters.
 */
export interface CreateSubtaskParams {
  baseId: string;
  num: number;
  parentTaskId: string;
  description: string;
  expectedOutput: string;
  deps: string[];
  priority: 'critical' | 'high' | 'medium' | 'low';
  complexity: number;
  capabilities: string[];
}

export function createSubtask(params: CreateSubtaskParams): SubTask {
  const {
    baseId,
    num,
    parentTaskId,
    description,
    expectedOutput,
    deps,
    priority,
    complexity,
    capabilities,
  } = params;
  return {
    id: `${baseId}-${String(num)}`,
    parentTaskId,
    description,
    expectedOutput,
    dependencies: deps.map((d) => `${baseId}-${d}`),
    priority,
    status: 'pending',
    complexity,
    requiredCapabilities: capabilities,
  };
}

/**
 * Perform heuristic task analysis without model adapter.
 */
export function heuristicAnalysis(task: Task, options: Required<TechLeadOptions>): TaskAnalysis {
  const description = task.description.toLowerCase();
  const wordCount = task.description.split(/\s+/).length;

  // Estimate complexity based on task characteristics
  let complexity = 3;
  if (wordCount > 100) complexity += 2;
  if (wordCount > 200) complexity += 2;
  if (description.includes('security')) complexity += 1;
  if (description.includes('architecture')) complexity += 1;
  if (description.includes('refactor')) complexity += 1;
  complexity = Math.min(10, complexity);

  const taskType = inferTaskType(description);
  const requirements = extractRequirements(description);

  return {
    taskId: task.id,
    complexity,
    taskType,
    requirements,
    risks: identifyRisks(description),
    needsDecomposition: complexity >= options.decompositionThreshold,
    approach: suggestApproach(taskType, complexity),
    estimatedEffort: Math.ceil(complexity * 1.5),
  };
}

/**
 * Perform heuristic task decomposition without model adapter.
 */
export function heuristicDecomposition(
  task: Task,
  analysis: TaskAnalysis,
  maxSubtasks: number
): SubTask[] {
  const subtasks: SubTask[] = [];
  const baseId = `${task.id}-sub`;

  if (analysis.taskType === 'implementation') {
    subtasks.push(
      createSubtask({
        baseId,
        num: 1,
        parentTaskId: task.id,
        description: 'Design the implementation approach',
        expectedOutput: 'Design document',
        deps: [],
        priority: 'high',
        complexity: 4,
        capabilities: ['research'],
      }),
      createSubtask({
        baseId,
        num: 2,
        parentTaskId: task.id,
        description: 'Implement core functionality',
        expectedOutput: 'Working code',
        deps: ['1'],
        priority: 'critical',
        complexity: 6,
        capabilities: ['code_generation'],
      }),
      createSubtask({
        baseId,
        num: 3,
        parentTaskId: task.id,
        description: 'Write unit tests',
        expectedOutput: 'Test suite',
        deps: ['2'],
        priority: 'high',
        complexity: 4,
        capabilities: ['code_generation'],
      })
    );
  } else if (analysis.taskType === 'architecture') {
    subtasks.push(
      createSubtask({
        baseId,
        num: 1,
        parentTaskId: task.id,
        description: 'Analyze current architecture',
        expectedOutput: 'Architecture analysis',
        deps: [],
        priority: 'high',
        complexity: 5,
        capabilities: ['research'],
      }),
      createSubtask({
        baseId,
        num: 2,
        parentTaskId: task.id,
        description: 'Design new architecture',
        expectedOutput: 'Architecture proposal',
        deps: ['1'],
        priority: 'critical',
        complexity: 7,
        capabilities: ['research'],
      }),
      createSubtask({
        baseId,
        num: 3,
        parentTaskId: task.id,
        description: 'Document architecture decisions',
        expectedOutput: 'ADR document',
        deps: ['2'],
        priority: 'medium',
        complexity: 3,
        capabilities: ['research'],
      })
    );
  } else if (analysis.taskType === 'security_audit') {
    subtasks.push(
      createSubtask({
        baseId,
        num: 1,
        parentTaskId: task.id,
        description: 'Review code for vulnerabilities',
        expectedOutput: 'Security findings',
        deps: [],
        priority: 'critical',
        complexity: 6,
        capabilities: ['code_review'],
      }),
      createSubtask({
        baseId,
        num: 2,
        parentTaskId: task.id,
        description: 'Check dependency security',
        expectedOutput: 'Dependency report',
        deps: [],
        priority: 'high',
        complexity: 4,
        capabilities: ['research'],
      }),
      createSubtask({
        baseId,
        num: 3,
        parentTaskId: task.id,
        description: 'Document security recommendations',
        expectedOutput: 'Security report',
        deps: ['1', '2'],
        priority: 'high',
        complexity: 4,
        capabilities: ['research'],
      })
    );
  } else {
    // Generic decomposition
    subtasks.push(
      createSubtask({
        baseId,
        num: 1,
        parentTaskId: task.id,
        description: 'Analyze requirements',
        expectedOutput: 'Requirements document',
        deps: [],
        priority: 'high',
        complexity: 3,
        capabilities: ['research'],
      }),
      createSubtask({
        baseId,
        num: 2,
        parentTaskId: task.id,
        description: 'Execute main task',
        expectedOutput: 'Primary deliverable',
        deps: ['1'],
        priority: 'critical',
        complexity: analysis.complexity,
        capabilities: ['task_execution'],
      }),
      createSubtask({
        baseId,
        num: 3,
        parentTaskId: task.id,
        description: 'Review and validate',
        expectedOutput: 'Validation report',
        deps: ['2'],
        priority: 'medium',
        complexity: 3,
        capabilities: ['code_review'],
      })
    );
  }

  return subtasks.slice(0, maxSubtasks);
}

/**
 * Build selection reason for expert assignment.
 */
export function buildSelectionReason(role: AgentRole, subtask: SubTask): string {
  const capabilities = EXPERT_CAPABILITIES[role];
  const matched = subtask.requiredCapabilities.filter((c) => capabilities.includes(c));

  if (matched.length > 0) {
    return `Matches capabilities: ${matched.join(', ')}`;
  }

  return `Best available for task type`;
}

/**
 * Select an expert for a single subtask.
 */
export function selectExpertForSubtask(
  subtask: SubTask,
  expertWeights: Partial<Record<AgentRole, number>>
): ExpertAssignment {
  // If already assigned, use that role
  if (subtask.assignedRole !== undefined) {
    return {
      subtaskId: subtask.id,
      expertRole: subtask.assignedRole,
      selectionReason: 'Pre-assigned role',
      confidence: 1.0,
    };
  }

  const scores = scoreExperts(subtask, expertWeights);
  const { bestRole, bestScore } = findBestExpert(scores);
  const maxPossibleScore = subtask.requiredCapabilities.length * 2 + 3;
  const confidence = maxPossibleScore > 0 ? Math.min(1, bestScore / maxPossibleScore) : 0.5;

  return {
    subtaskId: subtask.id,
    expertRole: bestRole,
    selectionReason: buildSelectionReason(bestRole, subtask),
    confidence,
  };
}

/**
 * Score a single expert role for capability match.
 */
function scoreRoleCapabilities(
  subtask: SubTask,
  role: AgentRole,
  expertWeights: Partial<Record<AgentRole, number>>
): number {
  const capabilities = EXPERT_CAPABILITIES[role];
  let score = 0;

  for (const required of subtask.requiredCapabilities) {
    if (capabilities.includes(required)) {
      score += 2;
    }
  }

  const weight = expertWeights[role] ?? 1;
  return score * weight;
}

/**
 * Apply keyword-based score boosts.
 */
function applyKeywordBoosts(scores: Record<AgentRole, number>, description: string): void {
  const desc = description.toLowerCase();
  const boosts: Array<{ keywords: string[]; role: AgentRole }> = [
    { keywords: ['code', 'implement'], role: 'code_expert' },
    { keywords: ['architecture', 'design'], role: 'architecture_expert' },
    { keywords: ['security', 'vulnerab'], role: 'security_expert' },
    { keywords: ['document', 'readme'], role: 'documentation_expert' },
    { keywords: ['test', 'coverage'], role: 'testing_expert' },
  ];

  for (const { keywords, role } of boosts) {
    if (keywords.some((kw) => desc.includes(kw))) {
      scores[role] += 3;
    }
  }
}

/**
 * Score all expert roles for a subtask.
 */
function scoreExperts(
  subtask: SubTask,
  expertWeights: Partial<Record<AgentRole, number>>
): Record<AgentRole, number> {
  const roles: AgentRole[] = [
    'tech_lead',
    'code_expert',
    'architecture_expert',
    'security_expert',
    'documentation_expert',
    'testing_expert',
    'custom',
  ];

  const scores: Record<AgentRole, number> = {} as Record<AgentRole, number>;
  for (const role of roles) {
    scores[role] = scoreRoleCapabilities(subtask, role, expertWeights);
  }

  applyKeywordBoosts(scores, subtask.description);

  return scores;
}

/**
 * Find the best expert from scores.
 */
function findBestExpert(scores: Record<AgentRole, number>): {
  bestRole: AgentRole;
  bestScore: number;
} {
  let bestRole: AgentRole = 'code_expert';
  let bestScore = 0;

  for (const [role, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestRole = role as AgentRole;
    }
  }

  return { bestRole, bestScore };
}

/**
 * Perform heuristic result synthesis without model adapter.
 */
export function heuristicSynthesis(
  results: import('@nexus-agents/core').TaskResult[]
): SynthesizedResult {
  const summaries: ResultSummary[] = results.map((r) => ({
    subtaskId: r.taskId,
    summary: typeof r.output === 'string' ? r.output.slice(0, 200) : 'Completed',
    quality: 0.8,
    contributions: ['Task output'],
  }));

  const outputs = results.map((r) =>
    typeof r.output === 'string' ? r.output : JSON.stringify(r.output)
  );

  return {
    combinedOutput: outputs.join('\n\n---\n\n'),
    summary: `Synthesized ${String(results.length)} results`,
    resultSummaries: summaries,
    conflicts: [],
    qualityScore: 0.8,
    recommendations: ['Review combined output for consistency'],
  };
}

/**
 * Create synthesis for a single result.
 */
export function createSingleResultSynthesis(
  result: import('@nexus-agents/core').TaskResult
): SynthesizedResult {
  const output = typeof result.output === 'string' ? result.output : JSON.stringify(result.output);

  return {
    combinedOutput: output,
    summary: 'Single result synthesis',
    resultSummaries: [
      {
        subtaskId: result.taskId,
        summary: output.slice(0, 200),
        quality: 0.9,
        contributions: ['Complete task output'],
      },
    ],
    conflicts: [],
    qualityScore: 0.9,
    recommendations: [],
  };
}

/**
 * Identify parallel execution groups from subtasks.
 */
export function identifyParallelGroups(subtasks: SubTask[]): string[][] {
  const groups: string[][] = [];
  const assigned = new Set<string>();

  while (assigned.size < subtasks.length) {
    const group: string[] = [];

    for (const subtask of subtasks) {
      if (assigned.has(subtask.id)) continue;

      const depsResolved = subtask.dependencies.every((d) => assigned.has(d));
      if (depsResolved) {
        group.push(subtask.id);
      }
    }

    if (group.length === 0) break; // Prevent infinite loop on circular deps

    for (const id of group) {
      assigned.add(id);
    }
    groups.push(group);
  }

  return groups;
}

/**
 * Estimate duration from subtasks.
 */
export function estimateDuration(subtasks: SubTask[]): number {
  if (subtasks.length === 0) return 0;

  // Sum complexity for sequential estimate
  const totalComplexity = subtasks.reduce((sum, st) => sum + st.complexity, 0);
  return totalComplexity * 60 * 1000; // Convert to ms (1 complexity unit = 1 minute)
}

/**
 * Extract text content from model response.
 */
export function extractTextContent(content: Array<{ type: string; text?: string }>): string {
  return content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}
