/**
 * nexus-agents/workflows - AFlow Completeness Evaluation
 *
 * Completeness scoring methods for workflow evaluation.
 * Measures agent coverage, capability coverage, and constraint satisfaction.
 *
 * @module workflows/aflow/evaluation-completeness
 * (Source: Issue #329, arXiv:2410.10762)
 */

import type { WorkflowDefinition, AgentRole } from '../../core/index.js';
import type { TaskSpecification, TaskConstraints } from './aflow-types.js';
import { CAPABILITY_ACTION_MAPPING } from './evaluation-types.js';
import { hasNoCycles } from './evaluation-structure.js';

/**
 * Evaluate workflow completeness against task requirements.
 * Returns average of agent coverage, capability coverage, and constraint scores.
 */
export function evaluateCompleteness(
  workflow: WorkflowDefinition,
  task: TaskSpecification
): number {
  const scores: number[] = [
    calculateAgentCoverageScore(workflow, task),
    calculateCapabilityCoverageScore(workflow, task),
    calculateConstraintScore(workflow, task.constraints),
  ];

  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Calculate required agent coverage score.
 */
export function calculateAgentCoverageScore(
  workflow: WorkflowDefinition,
  task: TaskSpecification
): number {
  const requiredAgents = task.constraints?.requiredAgents ?? [];
  if (requiredAgents.length === 0) return 1;

  const presentAgents = new Set(workflow.steps.map((s) => s.agent));
  const covered = requiredAgents.filter((a) => presentAgents.has(a)).length;

  return covered / requiredAgents.length;
}

/**
 * Calculate capability coverage score.
 */
export function calculateCapabilityCoverageScore(
  workflow: WorkflowDefinition,
  task: TaskSpecification
): number {
  const required = task.requiredCapabilities;
  if (required.length === 0) return 1;

  let covered = 0;
  for (const cap of required) {
    const actions = CAPABILITY_ACTION_MAPPING[cap] ?? [cap];
    const hasCapability = workflow.steps.some(
      (s) => actions.includes(s.action) || s.agent.includes(cap)
    );
    if (hasCapability) covered++;
  }

  return covered / required.length;
}

/**
 * Calculate constraint satisfaction score.
 */
export function calculateConstraintScore(
  workflow: WorkflowDefinition,
  constraints?: TaskConstraints
): number {
  if (!constraints) return 1;

  const checks: boolean[] = [];

  // Check forbidden agents
  if (constraints.forbiddenAgents && constraints.forbiddenAgents.length > 0) {
    const forbidden = new Set<AgentRole>(constraints.forbiddenAgents);
    checks.push(!workflow.steps.some((s) => forbidden.has(s.agent)));
  }

  // Check max retries
  if (constraints.maxRetriesPerStep !== undefined) {
    const maxRetries = constraints.maxRetriesPerStep;
    checks.push(workflow.steps.every((s) => (s.retries ?? 0) <= maxRetries));
  }

  // Check parallel requirement
  if (constraints.requireParallel !== undefined) {
    const hasParallel = workflow.steps.some((s) => s.parallel === true);
    checks.push(hasParallel === constraints.requireParallel);
  }

  if (checks.length === 0) return 1;
  return checks.filter(Boolean).length / checks.length;
}

/**
 * Generate human-readable feedback about the workflow.
 */
export function generateFeedback(
  workflow: WorkflowDefinition,
  task: TaskSpecification
): readonly string[] {
  const feedback: string[] = [];

  // Check step count
  if (workflow.steps.length < 2) {
    feedback.push('Workflow has fewer than 2 steps - may be too simple');
  }

  // Check for required agents
  const requiredAgents = task.constraints?.requiredAgents ?? [];
  const presentAgents = new Set(workflow.steps.map((s) => s.agent));
  const missingAgents = requiredAgents.filter((a) => !presentAgents.has(a));
  if (missingAgents.length > 0) {
    feedback.push(`Missing required agents: ${missingAgents.join(', ')}`);
  }

  // Check for parallel opportunities
  const parallelSteps = workflow.steps.filter((s) => s.parallel === true).length;
  if (parallelSteps === 0 && workflow.steps.length > 2) {
    feedback.push('Consider adding parallel execution for efficiency');
  }

  // Check dependency chain
  const hasNoDeps = workflow.steps.filter((s) => !s.dependsOn || s.dependsOn.length === 0);
  if (hasNoDeps.length > 1) {
    feedback.push(`${String(hasNoDeps.length)} steps have no dependencies - verify ordering`);
  }

  // Check for valid structure
  if (!hasNoCycles(workflow)) {
    feedback.push('Workflow contains dependency cycles - invalid structure');
  }

  if (feedback.length === 0) {
    feedback.push('Workflow structure looks good');
  }

  return feedback;
}
