/**
 * Puppeteer Step Execution
 *
 * Handles individual step execution within the orchestration loop.
 * Extracted from puppeteer-orchestrator.ts for modularity.
 *
 * @module agents/orchestration/puppeteer-step-execution
 */

import { ok, err } from '../../core/result.js';
import type { Result } from '../../core/result.js';
import type { IAgent, Task } from '../../core/index.js';
import type {
  PuppeteerState,
  PuppeteerStepResult,
  PuppeteerTerminationReason,
} from './puppeteer-types.js';
import type { IPolicyEngine } from './policy-types.js';
import type { IStateManager } from './state-manager.js';
import {
  buildAgentStepOutput,
  buildAgentTask,
  buildStepResult,
  detectTaskCompletion,
  detectConvergence,
} from './puppeteer-helpers.js';
import type { BuildStepResultOptions } from './puppeteer-helpers.js';

// =============================================================================
// Error Type
// =============================================================================

/**
 * Error class for step execution failures.
 */
export class StepExecutionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'StepExecutionError';
    Object.setPrototypeOf(this, StepExecutionError.prototype);
  }
}

// =============================================================================
// Step Execution Context
// =============================================================================

/**
 * Context required for step execution.
 */
export interface StepExecutionContext {
  readonly policyEngine: IPolicyEngine;
  readonly stateManager: IStateManager;
}

// =============================================================================
// Step Execution Functions
// =============================================================================

/**
 * Execute a single orchestration step.
 */
export async function executeStep(
  context: StepExecutionContext,
  state: PuppeteerState,
  agentIds: readonly string[],
  agentMap: Map<string, IAgent>,
  originalTask: Task
): Promise<Result<PuppeteerStepResult, StepExecutionError>> {
  const { policyEngine, stateManager } = context;

  // Compute agent selection distribution
  const distributionResult = await policyEngine.computeDistribution(state, agentIds);
  if (!distributionResult.ok) {
    return err(new StepExecutionError(distributionResult.error.message, 'POLICY_ERROR'));
  }

  const distribution = distributionResult.value;

  // Sample agent from distribution
  const selectedAgentId = policyEngine.sampleAgent(distribution);
  const agent = agentMap.get(selectedAgentId);

  if (!agent) {
    return err(new StepExecutionError(`Agent not found: ${selectedAgentId}`, 'AGENT_NOT_FOUND'));
  }

  // Extract context for this agent
  const agentContext = stateManager.extractAgentContext(state, selectedAgentId);

  // Build task for agent
  const agentTask = buildAgentTask(originalTask, state, agentContext);

  // Execute agent
  const previousProgress = state.metadata.progress;
  const agentResult = await agent.execute(agentTask);

  if (!agentResult.ok) {
    return err(
      new StepExecutionError(
        `Agent execution failed: ${agentResult.error.message}`,
        'AGENT_EXECUTION_ERROR'
      )
    );
  }

  // Build agent output
  const agentOutput = buildAgentStepOutput(state.step, selectedAgentId, agentResult.value);

  // Update state
  const newState = stateManager.updateState(state, agentOutput);

  // Check for termination conditions
  const { shouldTerminate, reason } = checkStepTermination(agentOutput, newState);

  // Build step result options
  const stepOptions: BuildStepResultOptions = {
    selectedAgent: selectedAgentId,
    distribution,
    agentOutput,
    newState,
    previousProgress,
    shouldTerminate,
  };

  // Only add terminationReason if defined (exactOptionalPropertyTypes compliance)
  const stepResult =
    reason !== undefined
      ? buildStepResult({ ...stepOptions, terminationReason: reason })
      : buildStepResult(stepOptions);

  return ok(stepResult);
}

/**
 * Check if the current step should trigger termination.
 */
export function checkStepTermination(
  output: { output: unknown },
  state: PuppeteerState
): { shouldTerminate: boolean; reason?: PuppeteerTerminationReason } {
  // Check for explicit task completion signal
  if (
    detectTaskCompletion(
      output as {
        output: unknown;
        step: number;
        agentId: string;
        durationMs: number;
        tokensUsed: number;
        model: string;
      }
    )
  ) {
    return { shouldTerminate: true, reason: 'task_complete' };
  }

  // Check for convergence
  if (detectConvergence(state.agentOutputs)) {
    return { shouldTerminate: true, reason: 'convergence' };
  }

  return { shouldTerminate: false };
}
