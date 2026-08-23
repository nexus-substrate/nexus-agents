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

  // Every check below reads its evidence off `workflow.steps`. With zero steps
  // `![].some(isForbidden)` and `[].every(withinRetries)` are both vacuously
  // true, so an empty workflow used to score a perfect 1 on constraints it was
  // never measured against (#4585). Name the empty case once: no steps, no
  // evidence of satisfaction — consistent with `hasValidSteps`, which already
  // treats a zero-step workflow as invalid.
  const hasSteps = workflow.steps.length > 0;

  // Check forbidden agents
  if (constraints.forbiddenAgents && constraints.forbiddenAgents.length > 0) {
    const forbidden = new Set<AgentRole>(constraints.forbiddenAgents);
    checks.push(hasSteps && !workflow.steps.some((s) => forbidden.has(s.agent)));
  }

  // Check max retries
  if (constraints.maxRetriesPerStep !== undefined) {
    const maxRetries = constraints.maxRetriesPerStep;
    checks.push(hasSteps && workflow.steps.every((s) => (s.retries ?? 0) <= maxRetries));
  }

  // Check parallel requirement
  if (constraints.requireParallel !== undefined) {
    const hasParallel = workflow.steps.some((s) => s.parallel === true);
    checks.push(hasSteps && hasParallel === constraints.requireParallel);
  }

  // `checks.length === 0` is absence of *criteria*, not absence of *evidence*,
  // and 1 is the honest answer (#4585). The `hasSteps` guard above covers the
  // vacuous case: a declared constraint that no step was read to verify.
  // Here the task declared no step-derived constraint at all, so the ratio's
  // denominator is genuinely zero and nothing can be violated - the same
  // convention as `!constraints` above and as the two coverage scores, which
  // both return 1 when nothing is required. Returning 0 instead would depress
  // completeness by a constant that depends only on the task's constraint
  // shape, identically for every candidate workflow, so it could never
  // discriminate between workflows - it would only make the weighted score
  // report "unconstrained task" as "bad workflow".
  if (checks.length === 0) return 1;
  return checks.filter(Boolean).length / checks.length;
}

/**
 * Structural complaint about the workflow shape, or null if it is well-formed.
 *
 * `hasNoCycles` now reports a zero-step workflow as unverifiable rather than
 * vacuously acyclic (#4585), so the two failures are named separately — an
 * empty workflow has no cycle to report.
 */
function structuralFeedback(workflow: WorkflowDefinition): string | null {
  if (workflow.steps.length === 0) {
    return 'Workflow has no steps - nothing to execute or verify';
  }
  if (!hasNoCycles(workflow)) {
    return 'Workflow contains dependency cycles - invalid structure';
  }
  return null;
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
  const structural = structuralFeedback(workflow);
  if (structural !== null) {
    feedback.push(structural);
  }

  if (feedback.length === 0) {
    feedback.push('Workflow structure looks good');
  }

  return feedback;
}
