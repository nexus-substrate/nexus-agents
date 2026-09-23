/**
 * nexus-agents/core - Workflow Types
 *
 * Interface for workflow execution engine.
 */

import type { Result } from '../result.js';
import type { WorkflowError } from '../errors.js';
import type { AgentRole } from './agent.js';

/**
 * Budget allocation for context categories.
 */
export interface ContextBudget {
  /** System instructions and project context (default: 15%) */
  system: number;
  /** Current task description and requirements (default: 20%) */
  task: number;
  /** Active working content (default: 50%) */
  active: number;
  /** Reserved for response generation (default: 15%) */
  reserved: number;
}

/**
 * Partial context budget for step-level overrides.
 */
export type PartialContextBudget = Partial<ContextBudget>;

/**
 * Workflow input definition.
 */
export interface InputDefinition {
  /** Input name */
  name: string;
  /** Input type */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** Description */
  description?: string;
  /** Whether required */
  required?: boolean;
  /** Default value */
  default?: unknown;
}

/**
 * Single step in a workflow.
 */
export interface WorkflowStep {
  /** Unique step identifier */
  id: string;
  /** Agent role to execute this step */
  agent: AgentRole;
  /** Action to perform */
  action: string;
  /** Inputs for the step */
  inputs: Record<string, unknown>;
  /** Step dependencies (wait for these to complete) */
  dependsOn?: string[];
  /** Execute in parallel with dependencies */
  parallel?: boolean;
  /** Number of retry attempts */
  retries?: number;
  /** Timeout in ms */
  timeout?: number;
  /** Condition for execution */
  condition?: string;
  /** Step-specific context budget override (merges with workflow default) */
  contextBudget?: PartialContextBudget;
}

/**
 * Workflow definition (loaded from template).
 */
export interface WorkflowDefinition {
  /** Workflow name */
  name: string;
  /** Version */
  version: string;
  /** Description */
  description?: string;
  /** Input definitions */
  inputs: InputDefinition[];
  /** Workflow steps */
  steps: WorkflowStep[];
  /** Global timeout in ms */
  timeout?: number;
  /** Default context budget for workflow steps (individual steps can override) */
  defaultBudget?: ContextBudget;
}

/**
 * Result of step execution.
 */
export interface StepResult {
  /** Step ID */
  stepId: string;
  /** Step output */
  output: unknown;
  /** Duration in ms */
  durationMs: number;
  /** Status */
  status: 'success' | 'failed' | 'skipped';
  /** Error message if failed */
  error?: string;
  /**
   * Real tokens consumed by this step (#4673).
   *
   * `undefined` means the step reported no usage — a step that ran no model,
   * or an adapter that returned none. It does NOT mean zero. That distinction
   * matters for budgets specifically: silently treating unmeasured as zero
   * under-counts spend, which is the dangerous direction for a cap.
   */
  tokensUsed?: number;
}

/**
 * Result of workflow execution.
 */
export interface WorkflowResult {
  /** Execution ID */
  executionId: string;
  /** Workflow name */
  workflowName: string;
  /** Step results */
  stepResults: StepResult[];
  /** Final output */
  output: unknown;
  /** Total duration in ms */
  totalDurationMs: number;
  /** Token-budget outcome (#4754). Present only when the run had a ceiling. */
  budget?: WorkflowBudgetOutcome;
}

/**
 * What a workflow run's token ceiling measured (#4754).
 *
 * `status` is a verdict about the ledger, not only about the spend:
 * - `exhausted` — reported spend crossed the ceiling (a real measurement even
 *   when some steps were unmeasured: the lower bound already exceeds it).
 * - `unmeasured` — at least one executed step reported no token usage, or no
 *   step reported any (the empty case, zero steps, included), so `spentTokens`
 *   is a LOWER BOUND and "within budget" cannot be claimed.
 * - `within_budget` — every executed step reported usage and the sum stayed
 *   under the ceiling.
 */
export interface WorkflowBudgetOutcome {
  status: 'within_budget' | 'exhausted' | 'unmeasured';
  /** The token ceiling the run was held to. */
  ceilingTokens: number;
  /**
   * Sum of reported step usage; a lower bound when `unmeasuredSteps > 0`.
   * A retried step reports only its successful attempt's tokens, so retries
   * are under-counted too (bounded in practice: `DEFAULT_RETRIES` is 0).
   */
  spentTokens: number;
  /** Settled steps with known usage (a `skipped` step with none counts as zero). */
  measuredSteps: number;
  /** Executed steps that reported none — not counted as zero. */
  unmeasuredSteps: number;
  /** Steps never dispatched because the ceiling was already reached. */
  skippedStepIds: string[];
}

/**
 * Workflow execution status.
 */
export type ExecutionStatus =
  | { state: 'pending' }
  | { state: 'running'; currentStep: string; progress: number }
  | { state: 'completed'; result: WorkflowResult }
  | { state: 'failed'; error: string; failedStep?: string }
  | { state: 'cancelled'; cancelledAt: string };

/**
 * Workflow template metadata.
 */
export interface WorkflowTemplate {
  /** Template name */
  name: string;
  /** Version */
  version: string;
  /** Description */
  description?: string;
  /** File path */
  path: string;
  /** Category */
  category?: string;
}

/**
 * Parse error for workflow templates.
 */
export class ParseError extends Error {
  readonly line: number | undefined;
  readonly column: number | undefined;

  constructor(message: string, options?: { line?: number; column?: number }) {
    super(message);
    this.name = 'ParseError';
    this.line = options?.line;
    this.column = options?.column;
  }
}

/**
 * Workflow engine interface.
 */
export interface IWorkflowEngine {
  /**
   * Load workflow template from file.
   * @param path - Path to template file
   * @returns Result with WorkflowDefinition or ParseError
   */
  loadTemplate(path: string): Promise<Result<WorkflowDefinition, ParseError>>;

  /**
   * Execute a workflow with inputs.
   * @param workflow - Workflow definition
   * @param inputs - Input values
   * @param options - Optional execution overrides. `phaseTimeoutMs` (#3017)
   *   overrides the per-phase execution timeout for this run only — wins
   *   over both `workflow.timeout` (set in the template YAML) and the
   *   engine's `defaultTimeoutMs`. `onPhaseComplete` (#6162) is called after
   *   each phase settles — the async-job liveness heartbeat for `run_workflow`.
   *   `budget` (#4754) caps the run's total reported token spend: it is checked
   *   before each phase and before each step is dispatched. Steps already in
   *   flight when the ceiling is crossed run to completion — a cap stops new
   *   spend, it cannot recall spend already committed. `signal` (#6305)
   *   cancels the run: a step not yet dispatched is skipped and the run fails
   *   with `Workflow cancelled` at the next phase boundary; a step already
   *   running is not interrupted. `run_workflow` threads `cancel_job`'s signal
   *   here.
   * @returns Result with WorkflowResult or WorkflowError
   */
  execute(
    workflow: WorkflowDefinition,
    inputs: Record<string, unknown>,
    options?: {
      phaseTimeoutMs?: number;
      onPhaseComplete?: () => void;
      budget?: { readonly maxTokens: number };
      signal?: AbortSignal;
    }
  ): Promise<Result<WorkflowResult, WorkflowError>>;

  /**
   * Get execution status.
   * @param executionId - Execution ID to check
   * @returns Current execution status
   */
  getStatus(executionId: string): ExecutionStatus;

  /**
   * Cancel a running workflow.
   * @param executionId - Execution ID to cancel
   * @returns Result with void or WorkflowError
   */
  cancel(executionId: string): Promise<Result<void, WorkflowError>>;

  /**
   * List available workflow templates.
   * @returns Array of available templates
   */
  listTemplates(): Promise<WorkflowTemplate[]>;

  /**
   * Get a built-in or registered template definition by name.
   * @param name - Template name (e.g., 'code-review')
   * @returns The workflow definition, or undefined if not found
   */
  getTemplateByName(name: string): Promise<WorkflowDefinition | undefined>;
}
