/**
 * nexus-agents/agents - TechLead Helper Functions
 *
 * Helper functions for TechLead task analysis, decomposition, and synthesis.
 */

import type { Task, TaskResult } from '../core/index.js';
import type {
  SubTask,
  TaskAnalysis,
  SynthesizedResult,
  ResultSummary,
  TechLeadOptions,
} from './tech-lead-types.js';

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

// Re-export heuristicDecomposition from the dedicated decomposition module
export { heuristicDecomposition } from './tech-lead-decomposition.js';

// Re-export expert selection functions from the dedicated module
export { buildSelectionReason, selectExpertForSubtask } from './tech-lead-expert-selection.js';

/**
 * Perform heuristic result synthesis without model adapter.
 */
export function heuristicSynthesis(results: TaskResult[]): SynthesizedResult {
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
export function createSingleResultSynthesis(result: TaskResult): SynthesizedResult {
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
