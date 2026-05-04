/**
 * nexus-agents/core - Orchestrator Types
 *
 * Unified interface for orchestration strategies.
 * Per System Mandate Loop I - Single canonical path for orchestration.
 *
 * Implementations:
 * - TechLead: LLM-based task decomposition and expert selection
 * - PuppeteerOrchestrator: Policy-based step execution with learning
 * - WorkflowEngine: Static template-based workflow execution
 *
 * @see docs/adr/0002-orchestrator-interface.md for decision rationale
 */

import type { Result } from '../result.js';
import type { IAgent, Task, AgentRole } from './agent.js';
import type { ExecutionStatus } from './workflow.js';

/**
 * Orchestration strategy type.
 */
export type OrchestratorType = 'orchestrator' | 'puppeteer' | 'workflow' | 'custom';

/**
 * Orchestrator execution options.
 */
export interface OrchestratorExecuteOptions {
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Maximum execution time in ms */
  timeout?: number;
  /** Maximum number of steps/iterations */
  maxSteps?: number;
  /** Token budget for LLM calls */
  tokenBudget?: number;
  /** Callback for progress updates */
  onProgress?: (status: ExecutionStatus) => void;
  /** Additional metadata passed to orchestrator */
  metadata?: Record<string, unknown>;
}

/**
 * Orchestrator definition - the input that defines what to orchestrate.
 * This is a discriminated union to support different orchestration styles.
 */
export type OrchestratorDefinition =
  | { type: 'task'; task: Task }
  | { type: 'workflow'; templatePath: string }
  | { type: 'policy'; policyId: string; initialState: Record<string, unknown> };

/**
 * Step in an orchestration execution.
 */
export interface OrchestratorStep {
  /** Step identifier */
  id: string;
  /** Agent that executed the step */
  agentId: string;
  /** Agent role */
  role: AgentRole;
  /** Step action/description */
  action: string;
  /** Step output */
  output: unknown;
  /** Duration in ms */
  durationMs: number;
  /** Tokens used in this step */
  tokensUsed: number;
  /** Status */
  status: 'success' | 'failed' | 'skipped';
  /** Error if failed */
  error: string | undefined;
}

/**
 * Result of orchestration execution.
 */
export interface OrchestratorResult {
  /** Unique execution ID */
  executionId: string;
  /** Orchestrator type that executed */
  orchestratorType: OrchestratorType;
  /** Steps executed */
  steps: OrchestratorStep[];
  /** Final aggregated output */
  output: unknown;
  /** Total execution time in ms */
  totalDurationMs: number;
  /** Total tokens consumed */
  totalTokensUsed: number;
  /** Agents involved */
  agentsUsed: string[];
}

/**
 * Orchestrator error with context.
 */
export class OrchestratorError extends Error {
  override readonly name = 'OrchestratorError' as const;
  readonly code: OrchestratorErrorCode;
  readonly step: string | undefined;
  override readonly cause: Error | undefined;

  constructor(
    message: string,
    code: OrchestratorErrorCode,
    options?: { step?: string; cause?: Error }
  ) {
    super(message);
    this.code = code;
    this.step = options?.step;
    this.cause = options?.cause;
  }
}

/**
 * Error codes for orchestrator failures.
 */
export type OrchestratorErrorCode =
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'STEP_FAILED'
  | 'AGENT_ERROR'
  | 'BUDGET_EXCEEDED'
  | 'INVALID_DEFINITION'
  | 'NO_AGENTS_AVAILABLE'
  | 'POLICY_VIOLATION';

/**
 * Unified orchestrator interface.
 *
 * This interface provides a canonical path for all orchestration
 * in the system, regardless of the underlying strategy.
 *
 * @example
 * ```typescript
 * const orchestrator: IOrchestrator = factory.create('orchestrator');
 *
 * const result = await orchestrator.execute(
 *   { type: 'task', task: myTask },
 *   { timeout: 30000 }
 * );
 *
 * if (result.ok) {
 *   console.log('Output:', result.value.output);
 * }
 * ```
 */
export interface IOrchestrator {
  /** Unique orchestrator instance ID */
  readonly id: string;

  /** Orchestrator type */
  readonly type: OrchestratorType;

  /**
   * Execute an orchestration.
   *
   * @param definition - What to orchestrate (task, workflow, or policy)
   * @param inputs - Input values for the orchestration
   * @param options - Execution options (timeout, budget, callbacks)
   * @returns Result with OrchestratorResult or OrchestratorError
   */
  execute(
    definition: OrchestratorDefinition,
    inputs: Record<string, unknown>,
    options?: OrchestratorExecuteOptions
  ): Promise<Result<OrchestratorResult, OrchestratorError>>;

  /**
   * Get status of an execution.
   *
   * @param executionId - Execution ID to check
   * @returns Current execution status
   */
  getStatus(executionId: string): ExecutionStatus;

  /**
   * Cancel a running execution.
   *
   * @param executionId - Execution ID to cancel
   * @param reason - Optional cancellation reason
   * @returns Result with void or OrchestratorError
   */
  cancel(executionId: string, reason?: string): Promise<Result<void, OrchestratorError>>;

  /**
   * Register an agent with this orchestrator.
   * Optional - not all orchestrators manage agent pools.
   *
   * @param agent - Agent to register
   */
  registerAgent?(agent: IAgent): void;

  /**
   * Unregister an agent.
   * Optional - not all orchestrators manage agent pools.
   *
   * @param agentId - Agent ID to unregister
   */
  unregisterAgent?(agentId: string): void;

  /**
   * List registered agents.
   * Optional - not all orchestrators manage agent pools.
   *
   * @returns Array of registered agent IDs and roles
   */
  listAgents?(): Array<{ id: string; role: AgentRole }>;

  /**
   * Get execution history.
   * Optional - for orchestrators that track history.
   *
   * @param limit - Maximum number of executions to return
   * @returns Array of past execution results
   */
  getHistory?(limit?: number): OrchestratorResult[];
}

/**
 * Factory for creating orchestrators.
 */
export interface IOrchestratorFactory {
  /**
   * Create an orchestrator instance.
   *
   * @param type - Orchestrator type
   * @param config - Optional configuration
   * @returns New orchestrator instance
   */
  create(type: OrchestratorType, config?: Record<string, unknown>): IOrchestrator;

  /**
   * List available orchestrator types.
   */
  listTypes(): OrchestratorType[];
}
