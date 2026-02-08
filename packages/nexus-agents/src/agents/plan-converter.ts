/**
 * nexus-agents/agents - Plan to Workflow Converter
 *
 * Converts Orchestrator ExecutionPlans to WorkflowEngine WorkflowDefinitions.
 * This "crystallizes" dynamic plans into reusable, static workflows.
 *
 * (Source: ARCHITECTURE.md, Plan-to-Workflow Conversion)
 */

import { z } from 'zod';
import type {
  AgentRole,
  WorkflowDefinition,
  WorkflowStep,
  InputDefinition,
} from '../core/index.js';
import type { SubTask, TaskAnalysis, ExpertAssignment } from './tech-lead-types.js';

/**
 * Core execution plan data (without methods).
 * This represents the pure data from Orchestrator analysis.
 */
export interface ExecutionPlanData {
  /** The original task ID this plan was created for */
  taskId: string;
  /** Analysis of the task complexity and requirements */
  analysis: TaskAnalysis;
  /** Decomposed subtasks (empty if task didn't need decomposition) */
  subtasks: SubTask[];
  /** Expert role assignments for each subtask */
  assignments: ExpertAssignment[];
  /** Groups of subtask IDs that can execute in parallel */
  parallelGroups: string[][];
  /** Estimated total duration in milliseconds */
  estimatedDuration: number;
}

/**
 * Options for converting an ExecutionPlan to a WorkflowDefinition.
 */
export interface PlanConversionOptions {
  /** Workflow name (defaults to taskId) */
  name?: string;
  /** Workflow version (defaults to "1.0.0") */
  version?: string;
  /** Additional description */
  description?: string;
  /** Include original analysis as metadata in description */
  includeAnalysis?: boolean;
  /** Default timeout for steps in ms */
  defaultStepTimeout?: number;
  /** Default retry count for steps */
  defaultRetries?: number;
  /** Input definitions to add to workflow */
  inputs?: InputDefinition[];
}

/**
 * Zod schema for PlanConversionOptions.
 */
export const PlanConversionOptionsSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/)
    .optional(),
  description: z.string().max(1000).optional(),
  includeAnalysis: z.boolean().optional(),
  defaultStepTimeout: z.number().int().positive().optional(),
  defaultRetries: z.number().int().min(0).max(10).optional(),
  inputs: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
        description: z.string().optional(),
        required: z.boolean().optional(),
        default: z.unknown().optional(),
      })
    )
    .optional(),
});

const DEFAULT_VERSION = '1.0.0';

/**
 * Generates workflow description from task analysis.
 */
function generateDescription(
  analysis: TaskAnalysis,
  customDescription?: string,
  includeAnalysis?: boolean
): string | undefined {
  const parts: string[] = [];

  if (customDescription !== undefined) {
    parts.push(customDescription);
  }

  if (includeAnalysis === true) {
    parts.push(`Generated from Orchestrator analysis.`);
    parts.push(`Task type: ${analysis.taskType}`);
    parts.push(`Complexity: ${String(analysis.complexity)}/10`);
    parts.push(`Approach: ${analysis.approach}`);
  }

  return parts.length > 0 ? parts.join(' ') : undefined;
}

/**
 * Finds the expert role assigned to a subtask.
 */
function findAssignedRole(
  subtaskId: string,
  assignments: ExpertAssignment[],
  subtask: SubTask
): AgentRole {
  // First check explicit assignments
  const assignment = assignments.find((a) => a.subtaskId === subtaskId);
  if (assignment !== undefined) {
    return assignment.expertRole;
  }

  // Fall back to subtask's assigned role
  if (subtask.assignedRole !== undefined) {
    return subtask.assignedRole;
  }

  // Default to code_expert for unassigned tasks
  return 'code_expert';
}

/**
 * Converts a SubTask to a WorkflowStep.
 */
function subtaskToStep(
  subtask: SubTask,
  assignments: ExpertAssignment[],
  parallelGroups: string[][],
  options?: PlanConversionOptions
): WorkflowStep {
  const agent = findAssignedRole(subtask.id, assignments, subtask);

  // Check if this subtask is in a parallel group
  const isParallel = parallelGroups.some((group) => group.includes(subtask.id) && group.length > 1);

  const step: WorkflowStep = {
    id: subtask.id,
    agent,
    action: subtask.description,
    inputs: {
      expectedOutput: subtask.expectedOutput,
      priority: subtask.priority,
      requiredCapabilities: subtask.requiredCapabilities,
    },
  };

  // Add dependencies if present
  if (subtask.dependencies.length > 0) {
    step.dependsOn = [...subtask.dependencies];
  }

  // Mark as parallel if in a parallel group
  if (isParallel) {
    step.parallel = true;
  }

  // Add optional timeout
  if (options?.defaultStepTimeout !== undefined) {
    step.timeout = options.defaultStepTimeout;
  }

  // Add optional retries
  if (options?.defaultRetries !== undefined) {
    step.retries = options.defaultRetries;
  }

  return step;
}

/**
 * Validates that the generated workflow has valid step references.
 */
function validateStepReferences(steps: WorkflowStep[]): void {
  const stepIds = new Set(steps.map((s) => s.id));

  for (const step of steps) {
    if (step.dependsOn !== undefined) {
      for (const dep of step.dependsOn) {
        if (!stepIds.has(dep)) {
          throw new Error(
            `Step "${step.id}" depends on unknown step "${dep}". ` +
              `Available steps: ${Array.from(stepIds).join(', ')}`
          );
        }
      }
    }
  }
}

/**
 * Validates conversion options against the schema.
 */
function validateOptions(options: PlanConversionOptions): void {
  const validation = PlanConversionOptionsSchema.safeParse(options);
  if (!validation.success) {
    throw new Error(`Invalid conversion options: ${validation.error.message}`);
  }
}

/**
 * Generates workflow steps from plan subtasks or creates a default step.
 */
function generateSteps(plan: ExecutionPlanData, options?: PlanConversionOptions): WorkflowStep[] {
  if (plan.subtasks.length > 0) {
    return plan.subtasks.map((subtask) =>
      subtaskToStep(subtask, plan.assignments, plan.parallelGroups, options)
    );
  }
  return [createDefaultStep(plan)];
}

/**
 * Builds the base workflow definition structure.
 */
function buildBaseWorkflow(
  plan: ExecutionPlanData,
  steps: WorkflowStep[],
  options?: PlanConversionOptions
): WorkflowDefinition {
  return {
    name: options?.name ?? plan.taskId,
    version: options?.version ?? DEFAULT_VERSION,
    inputs: options?.inputs ?? [],
    steps,
  };
}

/**
 * Adds optional description to workflow.
 */
function addDescription(
  workflow: WorkflowDefinition,
  plan: ExecutionPlanData,
  options?: PlanConversionOptions
): void {
  const description = generateDescription(
    plan.analysis,
    options?.description,
    options?.includeAnalysis
  );
  if (description !== undefined) {
    workflow.description = description;
  }
}

/**
 * Adds timeout to workflow based on estimated duration.
 */
function addTimeout(workflow: WorkflowDefinition, estimatedDuration: number): void {
  if (estimatedDuration > 0) {
    // Add 50% buffer to estimated duration
    workflow.timeout = Math.ceil(estimatedDuration * 1.5);
  }
}

/**
 * Creates a single default step when no subtasks are present.
 * This handles the case where Orchestrator didn't decompose the task.
 */
function createDefaultStep(plan: ExecutionPlanData): WorkflowStep {
  // Find the primary expert from assignments, or default to code_expert
  const primaryAssignment = plan.assignments[0];
  const agent: AgentRole = primaryAssignment?.expertRole ?? 'code_expert';

  return {
    id: 'main-task',
    agent,
    action: plan.analysis.approach,
    inputs: {
      taskType: plan.analysis.taskType,
      requirements: plan.analysis.requirements,
    },
  };
}

/**
 * Converts an ExecutionPlan to a WorkflowDefinition.
 *
 * This function "crystallizes" a dynamic Orchestrator plan into a static,
 * reusable workflow definition that can be executed by WorkflowEngine.
 *
 * @param plan - The ExecutionPlan from Orchestrator
 * @param options - Optional conversion configuration
 * @returns A valid WorkflowDefinition
 *
 * @example
 * ```typescript
 * const plan = await techLead.execute(task);
 * const workflow = convertPlanToWorkflow(plan.value.output as ExecutionPlan, {
 *   name: 'code-review-workflow',
 *   version: '1.0.0',
 *   description: 'Automated code review process',
 * });
 * await workflowEngine.execute(workflow, inputs);
 * ```
 */
export function convertPlanToWorkflow(
  plan: ExecutionPlanData,
  options?: PlanConversionOptions
): WorkflowDefinition {
  // Validate options if provided
  if (options !== undefined) {
    validateOptions(options);
  }

  // Generate and validate steps
  const steps = generateSteps(plan, options);
  validateStepReferences(steps);

  // Build workflow with optional fields
  const workflow = buildBaseWorkflow(plan, steps, options);
  addDescription(workflow, plan, options);
  addTimeout(workflow, plan.estimatedDuration);

  return workflow;
}

/**
 * Type-safe interface extension for ExecutionPlanData with conversion capability.
 * This interface extends the base plan data with the conversion method.
 */
export interface ConvertibleExecutionPlan extends ExecutionPlanData {
  /**
   * Convert this execution plan to a reusable WorkflowDefinition.
   * This "crystallizes" the dynamic plan into a static, replayable workflow.
   */
  asWorkflowDefinition(options?: PlanConversionOptions): WorkflowDefinition;
}

/**
 * Wraps an ExecutionPlanData with the asWorkflowDefinition method.
 *
 * @param plan - The ExecutionPlanData to enhance
 * @returns A ConvertibleExecutionPlan with the conversion method attached
 *
 * @example
 * ```typescript
 * const plan = await techLead.execute(task);
 * const convertible = makeConvertible(plan.value.output as ExecutionPlanData);
 * const workflow = convertible.asWorkflowDefinition({ name: 'my-workflow' });
 * ```
 */
export function makeConvertible(plan: ExecutionPlanData): ConvertibleExecutionPlan {
  return {
    ...plan,
    asWorkflowDefinition(options?: PlanConversionOptions): WorkflowDefinition {
      return convertPlanToWorkflow(plan, options);
    },
  };
}

/**
 * Checks if an ExecutionPlanData has the conversion capability.
 */
export function isConvertible(plan: ExecutionPlanData): plan is ConvertibleExecutionPlan {
  return typeof (plan as ConvertibleExecutionPlan).asWorkflowDefinition === 'function';
}
