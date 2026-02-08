/**
 * nexus-agents/agents - Orchestrator Task Decomposition Helpers
 *
 * Helper functions for decomposing tasks into subtasks based on task type.
 */

import type { Task } from '../core/index.js';
import type { SubTask, TaskAnalysis } from './tech-lead-types.js';

/**
 * Parameters for creating a subtask.
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

/**
 * Create a subtask with the given parameters.
 */
function createSubtask(params: CreateSubtaskParams): SubTask {
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
 * Create subtasks for implementation task type.
 */
function createImplementationSubtasks(baseId: string, parentTaskId: string): SubTask[] {
  return [
    createSubtask({
      baseId,
      num: 1,
      parentTaskId,
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
      parentTaskId,
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
      parentTaskId,
      description: 'Write unit tests',
      expectedOutput: 'Test suite',
      deps: ['2'],
      priority: 'high',
      complexity: 4,
      capabilities: ['code_generation'],
    }),
  ];
}

/**
 * Create subtasks for architecture task type.
 */
function createArchitectureSubtasks(baseId: string, parentTaskId: string): SubTask[] {
  return [
    createSubtask({
      baseId,
      num: 1,
      parentTaskId,
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
      parentTaskId,
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
      parentTaskId,
      description: 'Document architecture decisions',
      expectedOutput: 'ADR document',
      deps: ['2'],
      priority: 'medium',
      complexity: 3,
      capabilities: ['research'],
    }),
  ];
}

/**
 * Create subtasks for security audit task type.
 */
function createSecurityAuditSubtasks(baseId: string, parentTaskId: string): SubTask[] {
  return [
    createSubtask({
      baseId,
      num: 1,
      parentTaskId,
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
      parentTaskId,
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
      parentTaskId,
      description: 'Document security recommendations',
      expectedOutput: 'Security report',
      deps: ['1', '2'],
      priority: 'high',
      complexity: 4,
      capabilities: ['research'],
    }),
  ];
}

/**
 * Create subtasks for generic task type.
 */
function createGenericSubtasks(
  baseId: string,
  parentTaskId: string,
  complexity: number
): SubTask[] {
  return [
    createSubtask({
      baseId,
      num: 1,
      parentTaskId,
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
      parentTaskId,
      description: 'Execute main task',
      expectedOutput: 'Primary deliverable',
      deps: ['1'],
      priority: 'critical',
      complexity,
      capabilities: ['task_execution'],
    }),
    createSubtask({
      baseId,
      num: 3,
      parentTaskId,
      description: 'Review and validate',
      expectedOutput: 'Validation report',
      deps: ['2'],
      priority: 'medium',
      complexity: 3,
      capabilities: ['code_review'],
    }),
  ];
}

/**
 * Perform heuristic task decomposition without model adapter.
 */
export function heuristicDecomposition(
  task: Task,
  analysis: TaskAnalysis,
  maxSubtasks: number
): SubTask[] {
  const baseId = `${task.id}-sub`;
  let subtasks: SubTask[];

  switch (analysis.taskType) {
    case 'implementation':
      subtasks = createImplementationSubtasks(baseId, task.id);
      break;
    case 'architecture':
      subtasks = createArchitectureSubtasks(baseId, task.id);
      break;
    case 'security_audit':
      subtasks = createSecurityAuditSubtasks(baseId, task.id);
      break;
    default:
      subtasks = createGenericSubtasks(baseId, task.id, analysis.complexity);
  }

  return subtasks.slice(0, maxSubtasks);
}
