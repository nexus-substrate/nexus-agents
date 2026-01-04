/**
 * nexus-agents/workflows - Workflow Types
 *
 * Zod schemas for runtime validation of workflow definitions.
 * These schemas validate YAML/JSON workflow templates at parse time.
 */

import { z } from 'zod';

/**
 * Input types supported in workflow definitions.
 */
export const InputTypeSchema = z.enum(['string', 'number', 'boolean', 'object', 'array']);

export type InputType = z.infer<typeof InputTypeSchema>;

/**
 * Schema for workflow input definitions.
 * Inputs are parameters that must be provided when executing a workflow.
 */
export const InputDefinitionSchema = z
  .object({
    /** Input parameter name */
    name: z
      .string()
      .min(1, 'Input name is required')
      .regex(
        /^[a-zA-Z_][a-zA-Z0-9_]*$/,
        'Input name must be a valid identifier (letters, numbers, underscores, starting with letter or underscore)'
      ),
    /** Input data type */
    type: InputTypeSchema,
    /** Human-readable description */
    description: z.string().optional(),
    /** Whether this input is required */
    required: z.boolean().default(true),
    /** Default value if not provided */
    default: z.unknown().optional(),
  })
  .strict();

export type InputDefinitionInput = z.input<typeof InputDefinitionSchema>;
export type InputDefinitionOutput = z.output<typeof InputDefinitionSchema>;

/**
 * Agent roles that can execute workflow steps.
 */
export const AgentRoleSchema = z.enum([
  'tech_lead',
  'code_expert',
  'architecture_expert',
  'security_expert',
  'documentation_expert',
  'testing_expert',
  'custom',
]);

export type AgentRoleType = z.infer<typeof AgentRoleSchema>;

/**
 * Schema for a single workflow step.
 * Steps are the atomic units of work in a workflow.
 */
export const WorkflowStepSchema = z
  .object({
    /** Unique identifier for this step (must be unique within workflow) */
    id: z
      .string()
      .min(1, 'Step ID is required')
      .regex(
        /^[a-zA-Z_][a-zA-Z0-9_-]*$/,
        'Step ID must be a valid identifier (letters, numbers, underscores, hyphens)'
      ),
    /** Agent role to execute this step */
    agent: AgentRoleSchema,
    /** Action/task to perform */
    action: z.string().min(1, 'Action is required'),
    /** Input parameters for this step */
    inputs: z.record(z.string(), z.unknown()).default({}),
    /** Step IDs that must complete before this step runs */
    dependsOn: z.array(z.string()).optional(),
    /** Whether this step can run in parallel with its dependencies */
    parallel: z.boolean().optional(),
    /** Number of retry attempts on failure */
    retries: z.number().int().min(0).max(10).optional(),
    /** Timeout in milliseconds */
    timeout: z.number().int().positive().optional(),
    /** Condition expression for conditional execution */
    condition: z.string().optional(),
  })
  .strict();

export type WorkflowStepInput = z.input<typeof WorkflowStepSchema>;
export type WorkflowStepOutput = z.output<typeof WorkflowStepSchema>;

/**
 * Semantic version pattern for workflow versions.
 */
const VERSION_REGEX = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;

/**
 * Schema for a complete workflow definition.
 * This is the top-level structure of a workflow template file.
 */
export const WorkflowDefinitionSchema = z
  .object({
    /** Workflow name */
    name: z
      .string()
      .min(1, 'Workflow name is required')
      .max(100, 'Workflow name must be at most 100 characters'),
    /** Semantic version string */
    version: z
      .string()
      .regex(VERSION_REGEX, 'Version must be valid semver (e.g., 1.0.0, 1.0.0-beta.1)'),
    /** Human-readable description */
    description: z.string().max(1000).optional(),
    /** Input parameter definitions */
    inputs: z.array(InputDefinitionSchema).default([]),
    /** Workflow steps to execute */
    steps: z.array(WorkflowStepSchema).min(1, 'Workflow must have at least one step'),
    /** Global timeout in milliseconds */
    timeout: z.number().int().positive().optional(),
  })
  .strict();

export type WorkflowDefinitionInput = z.input<typeof WorkflowDefinitionSchema>;
export type WorkflowDefinitionOutput = z.output<typeof WorkflowDefinitionSchema>;

/**
 * Validation result with detailed error information.
 */
export interface ValidationIssue {
  /** Path to the problematic field */
  path: (string | number)[];
  /** Error message */
  message: string;
  /** Error code from Zod */
  code: string;
}

/**
 * Formats Zod errors into ValidationIssue array.
 * @param error - Zod error object
 * @returns Array of validation issues
 */
export function formatZodErrors(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path,
    message: issue.message,
    code: issue.code,
  }));
}
