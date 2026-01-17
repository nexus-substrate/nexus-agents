/**
 * nexus-agents/workflows - AFlow Workflow Evaluation
 *
 * Evaluation functions for scoring generated workflows.
 * Used during MCTS simulation phase to assess workflow quality.
 *
 * @module workflows/aflow/evaluation
 * (Source: Issue #329, arXiv:2410.10762)
 */

import type { WorkflowDefinition, AgentRole } from '../../core/index.js';
import type { EvaluationResult, TaskSpecification, TaskConstraints } from './aflow-types.js';

/**
 * Weights for evaluation components.
 */
export interface EvaluationWeights {
  readonly structure: number;
  readonly efficiency: number;
  readonly completeness: number;
  readonly redundancyPenalty: number;
}

/**
 * Default evaluation weights.
 */
export const DEFAULT_EVALUATION_WEIGHTS: EvaluationWeights = {
  structure: 0.3,
  efficiency: 0.25,
  completeness: 0.35,
  redundancyPenalty: 0.1,
};

/**
 * Workflow evaluator for AFlow.
 */
export class WorkflowEvaluator {
  private readonly weights: EvaluationWeights;

  constructor(weights: Partial<EvaluationWeights> = {}) {
    this.weights = { ...DEFAULT_EVALUATION_WEIGHTS, ...weights };
  }

  /**
   * Evaluate a workflow against a task specification.
   */
  evaluate(workflow: WorkflowDefinition, task: TaskSpecification): EvaluationResult {
    const structureScore = this.evaluateStructure(workflow);
    const efficiencyScore = this.evaluateEfficiency(workflow, task);
    const completenessScore = this.evaluateCompleteness(workflow, task);
    const redundancyPenalty = this.calculateRedundancyPenalty(workflow);
    const feedback = this.generateFeedback(workflow, task);
    const estimatedCost = this.estimateCost(workflow);

    // Calculate weighted score
    const score = this.calculateOverallScore(
      structureScore,
      efficiencyScore,
      completenessScore,
      redundancyPenalty
    );

    return {
      score,
      structureScore,
      efficiencyScore,
      completenessScore,
      redundancyPenalty,
      feedback,
      estimatedCost,
    };
  }

  /**
   * Calculate overall score from components.
   */
  private calculateOverallScore(
    structure: number,
    efficiency: number,
    completeness: number,
    redundancy: number
  ): number {
    const raw =
      structure * this.weights.structure +
      efficiency * this.weights.efficiency +
      completeness * this.weights.completeness -
      redundancy * this.weights.redundancyPenalty;

    // Clamp to 0-1
    return Math.max(0, Math.min(1, raw));
  }

  /**
   * Evaluate workflow structural validity.
   */
  evaluateStructure(workflow: WorkflowDefinition): number {
    const checks = [
      this.hasValidSteps(workflow),
      this.hasNoCycles(workflow),
      this.hasValidDependencies(workflow),
      this.hasUniqueStepIds(workflow),
      this.hasValidAgentRoles(workflow),
    ];

    const passed = checks.filter(Boolean).length;
    return passed / checks.length;
  }

  /**
   * Check if workflow has valid steps.
   */
  private hasValidSteps(workflow: WorkflowDefinition): boolean {
    return (
      workflow.steps.length >= 1 &&
      workflow.steps.every((s) => s.id.length > 0 && s.agent.length > 0 && s.action.length > 0)
    );
  }

  /**
   * Check if workflow has no dependency cycles.
   */
  private hasNoCycles(workflow: WorkflowDefinition): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (stepId: string): boolean => {
      if (recursionStack.has(stepId)) return true;
      if (visited.has(stepId)) return false;

      visited.add(stepId);
      recursionStack.add(stepId);

      const step = workflow.steps.find((s) => s.id === stepId);
      for (const dep of step?.dependsOn ?? []) {
        if (hasCycle(dep)) return true;
      }

      recursionStack.delete(stepId);
      return false;
    };

    return !workflow.steps.some((s) => hasCycle(s.id));
  }

  /**
   * Check if all dependencies reference valid steps.
   */
  private hasValidDependencies(workflow: WorkflowDefinition): boolean {
    const stepIds = new Set(workflow.steps.map((s) => s.id));
    return workflow.steps.every((s) => (s.dependsOn ?? []).every((dep) => stepIds.has(dep)));
  }

  /**
   * Check if all step IDs are unique.
   */
  private hasUniqueStepIds(workflow: WorkflowDefinition): boolean {
    const ids = workflow.steps.map((s) => s.id);
    return ids.length === new Set(ids).size;
  }

  /**
   * Check if all agent roles are valid.
   */
  private hasValidAgentRoles(workflow: WorkflowDefinition): boolean {
    const validRoles = new Set<string>([
      'tech_lead',
      'code_expert',
      'security_expert',
      'architecture_expert',
      'documentation_expert',
      'testing_expert',
      'thinker',
      'worker',
      'verifier',
      'custom',
    ]);
    return workflow.steps.every((s) => validRoles.has(s.agent));
  }

  /**
   * Evaluate workflow efficiency.
   */
  evaluateEfficiency(workflow: WorkflowDefinition, task: TaskSpecification): number {
    const scores: number[] = [];

    // Parallelism score - more parallel steps = more efficient
    scores.push(this.calculateParallelismScore(workflow));

    // Dependency efficiency - fewer unnecessary dependencies
    scores.push(this.calculateDependencyEfficiency(workflow));

    // Timeout appropriateness
    scores.push(this.calculateTimeoutScore(workflow, task));

    // Step count efficiency
    scores.push(this.calculateStepCountScore(workflow, task));

    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  /**
   * Calculate parallelism score.
   */
  private calculateParallelismScore(workflow: WorkflowDefinition): number {
    if (workflow.steps.length <= 1) return 1;

    const parallelSteps = workflow.steps.filter((s) => s.parallel === true).length;
    const maxParallel = Math.max(1, Math.floor(workflow.steps.length / 2));

    return Math.min(1, parallelSteps / maxParallel);
  }

  /**
   * Calculate dependency efficiency score.
   */
  private calculateDependencyEfficiency(workflow: WorkflowDefinition): number {
    if (workflow.steps.length <= 1) return 1;

    const totalDeps = workflow.steps.reduce((sum, s) => sum + (s.dependsOn?.length ?? 0), 0);
    const maxReasonableDeps = workflow.steps.length - 1;

    if (totalDeps === 0) return 0.5; // No dependencies at all is suboptimal
    if (totalDeps > maxReasonableDeps * 2) return 0; // Too many dependencies

    return 1 - Math.abs(totalDeps - maxReasonableDeps) / (maxReasonableDeps * 2);
  }

  /**
   * Calculate timeout appropriateness score.
   */
  private calculateTimeoutScore(workflow: WorkflowDefinition, task: TaskSpecification): number {
    const maxTotal = task.constraints?.maxTotalTimeout ?? 300000;
    const totalTimeout = workflow.steps.reduce((sum, s) => sum + (s.timeout ?? 60000), 0);

    if (totalTimeout > maxTotal) {
      return Math.max(0, 1 - (totalTimeout - maxTotal) / maxTotal);
    }

    // Penalize if way under (might indicate missing steps)
    if (totalTimeout < maxTotal * 0.1) {
      return 0.5;
    }

    return 1;
  }

  /**
   * Calculate step count efficiency score.
   */
  private calculateStepCountScore(workflow: WorkflowDefinition, task: TaskSpecification): number {
    const stepCount = workflow.steps.length;
    const requiredCount = task.constraints?.requiredAgents?.length ?? 2;

    // Penalize if too few steps for required capabilities
    if (stepCount < requiredCount) {
      return stepCount / requiredCount;
    }

    // Penalize if way too many steps
    if (stepCount > requiredCount * 3) {
      return Math.max(0, 1 - (stepCount - requiredCount * 3) / (requiredCount * 3));
    }

    return 1;
  }

  /**
   * Evaluate workflow completeness against task requirements.
   */
  evaluateCompleteness(workflow: WorkflowDefinition, task: TaskSpecification): number {
    const scores: number[] = [];

    // Required agents coverage
    scores.push(this.calculateAgentCoverageScore(workflow, task));

    // Required capabilities coverage
    scores.push(this.calculateCapabilityCoverageScore(workflow, task));

    // Constraint satisfaction
    scores.push(this.calculateConstraintScore(workflow, task.constraints));

    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  /**
   * Calculate required agent coverage score.
   */
  private calculateAgentCoverageScore(
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
  private calculateCapabilityCoverageScore(
    workflow: WorkflowDefinition,
    task: TaskSpecification
  ): number {
    const required = task.requiredCapabilities;
    if (required.length === 0) return 1;

    // Map capabilities to actions/agents
    const capabilityMapping: Record<string, string[]> = {
      code: ['implement', 'code', 'develop'],
      security: ['review', 'audit', 'scan'],
      testing: ['test', 'verify', 'validate'],
      architecture: ['design', 'architect', 'plan'],
      documentation: ['document', 'explain', 'describe'],
    };

    let covered = 0;
    for (const cap of required) {
      const actions = capabilityMapping[cap] ?? [cap];
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
  private calculateConstraintScore(
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
   * Calculate redundancy penalty.
   */
  calculateRedundancyPenalty(workflow: WorkflowDefinition): number {
    const penalties: number[] = [];

    // Duplicate agent-action combinations
    const combos = workflow.steps.map((s) => `${s.agent}:${s.action}`);
    const uniqueCombos = new Set(combos);
    if (combos.length > uniqueCombos.size) {
      penalties.push((combos.length - uniqueCombos.size) / combos.length);
    }

    // Sequential steps with same agent (could be combined)
    let sameAgentSequence = 0;
    for (let i = 1; i < workflow.steps.length; i++) {
      const currentStep = workflow.steps[i];
      const prevStep = workflow.steps[i - 1];
      if (currentStep?.agent === prevStep?.agent && currentStep && prevStep) {
        sameAgentSequence++;
      }
    }
    if (workflow.steps.length > 1) {
      penalties.push(sameAgentSequence / (workflow.steps.length - 1));
    }

    return penalties.length > 0 ? penalties.reduce((a, b) => a + b, 0) / penalties.length : 0;
  }

  /**
   * Generate human-readable feedback about the workflow.
   */
  generateFeedback(workflow: WorkflowDefinition, task: TaskSpecification): readonly string[] {
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
    if (!this.hasNoCycles(workflow)) {
      feedback.push('Workflow contains dependency cycles - invalid structure');
    }

    if (feedback.length === 0) {
      feedback.push('Workflow structure looks good');
    }

    return feedback;
  }

  /**
   * Estimate execution cost based on step configuration.
   */
  estimateCost(workflow: WorkflowDefinition): number {
    // Simple cost model: base cost per step + cost for retries + cost for timeout
    const baseCostPerStep = 100;
    const costPerRetry = 50;
    const costPerTimeout = 0.001; // Per ms

    let totalCost = 0;
    for (const step of workflow.steps) {
      totalCost += baseCostPerStep;
      totalCost += (step.retries ?? 0) * costPerRetry;
      totalCost += (step.timeout ?? 60000) * costPerTimeout;
    }

    return Math.round(totalCost);
  }

  /**
   * Quick check if workflow is minimally viable.
   */
  isViable(workflow: WorkflowDefinition, minSteps: number): boolean {
    return (
      workflow.steps.length >= minSteps &&
      this.hasValidSteps(workflow) &&
      this.hasNoCycles(workflow) &&
      this.hasValidDependencies(workflow) &&
      this.hasUniqueStepIds(workflow)
    );
  }
}

/**
 * Create a workflow evaluator with optional weights.
 */
export function createWorkflowEvaluator(weights?: Partial<EvaluationWeights>): WorkflowEvaluator {
  return new WorkflowEvaluator(weights);
}
