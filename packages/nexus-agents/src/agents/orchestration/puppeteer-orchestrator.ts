/**
 * Puppeteer Orchestrator
 *
 * Main orchestrator implementing Puppeteer-style learned orchestration.
 * Coordinates multiple "puppet" agents through a centralized policy.
 *
 * Features:
 * - Non-blocking agent lifecycle management via Promise-based API
 * - Event-driven coordination with EventBus integration
 * - Emergent pattern detection (compaction, cyclicality)
 *
 * @module agents/orchestration/puppeteer-orchestrator
 * (Source: Issue #335, arXiv:2505.19591)
 */

import { ok, err } from '../../core/result.js';
import type { Result } from '../../core/result.js';
import type { IAgent, Task } from '../../core/index.js';
import type { IEventBus } from '../collaboration/event-bus-types.js';
import type {
  PuppeteerConfig,
  PuppeteerExecuteOptions,
  PuppeteerResult,
  PuppeteerState,
  PuppeteerStepResult,
  PuppeteerTerminationReason,
} from './puppeteer-types.js';
import { DEFAULT_PUPPETEER_CONFIG } from './puppeteer-types.js';
import type { IPolicyEngine } from './policy-types.js';
import type { IStateManager } from './state-manager.js';
import type { IPatternTracker } from './pattern-tracker.js';
import { createStateManager } from './state-manager.js';
import { createRuleBasedPolicy } from './rule-based-policy.js';
import { createPatternTracker } from './pattern-tracker.js';
import {
  generateSessionId,
  buildAgentStepOutput,
  buildAgentTask,
  buildStepResult,
  buildPuppeteerResult,
  detectTaskCompletion,
  detectConvergence,
} from './puppeteer-helpers.js';
import type { BuildStepResultOptions } from './puppeteer-helpers.js';
import {
  emitPuppeteerStarted,
  emitPuppeteerStepCompleted,
  emitPuppeteerCompleted,
  emitPuppeteerError,
} from './puppeteer-events.js';

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error class for orchestration failures.
 */
export class PuppeteerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PuppeteerError';
    Object.setPrototypeOf(this, PuppeteerError.prototype);
  }
}

// =============================================================================
// Orchestrator Options
// =============================================================================

/**
 * Options for creating PuppeteerOrchestrator.
 */
export interface PuppeteerOrchestratorOptions {
  /** Configuration for the orchestrator */
  readonly config?: PuppeteerConfig;
  /** Optional custom policy engine */
  readonly policyEngine?: IPolicyEngine;
  /** Optional custom state manager */
  readonly stateManager?: IStateManager;
  /** Optional custom pattern tracker */
  readonly patternTracker?: IPatternTracker;
  /** Optional event bus for observability */
  readonly eventBus?: IEventBus;
  /** Registry of available agents */
  readonly agents?: readonly IAgent[];
}

// =============================================================================
// Puppeteer Orchestrator
// =============================================================================

/**
 * Puppeteer-style orchestrator for multi-agent coordination.
 */
export class PuppeteerOrchestrator {
  private readonly config: Required<PuppeteerConfig>;
  private readonly policyEngine: IPolicyEngine;
  private readonly stateManager: IStateManager;
  private readonly patternTracker: IPatternTracker;
  private readonly eventBus: IEventBus | undefined;
  private readonly agents: Map<string, IAgent>;

  private cancelled = false;
  private cancelReason: string | undefined = undefined;

  constructor(options: PuppeteerOrchestratorOptions = {}) {
    this.config = { ...DEFAULT_PUPPETEER_CONFIG, ...options.config };
    this.policyEngine = options.policyEngine ?? createRuleBasedPolicy();
    this.stateManager = options.stateManager ?? createStateManager();
    this.patternTracker = options.patternTracker ?? createPatternTracker();
    this.eventBus = options.eventBus ?? undefined;
    this.agents = new Map();

    if (options.agents) {
      for (const agent of options.agents) {
        this.agents.set(agent.id, agent);
      }
    }
  }

  /**
   * Execute a task using Puppeteer orchestration.
   * Returns a Promise that resolves when orchestration completes.
   */
  async execute(
    options: PuppeteerExecuteOptions
  ): Promise<Result<PuppeteerResult, PuppeteerError>> {
    this.resetState();

    const sessionId = generateSessionId();
    const startTime = Date.now();
    const { task, initialContext, signal } = options;

    this.setupAbortSignal(signal);

    const setupResult = this.setupAgents(options);
    if (!setupResult.ok) return setupResult;
    const { agentIds, agentMap } = setupResult.value;

    this.emitStart(sessionId, task);

    const state = this.stateManager.createInitialState(task, sessionId, initialContext);
    const trajectory: PuppeteerStepResult[] = [];

    return this.runAndComplete({
      state,
      trajectory,
      agentIds,
      agentMap,
      task,
      sessionId,
      startTime,
    });
  }

  private resetState(): void {
    this.cancelled = false;
    this.cancelReason = undefined;
  }

  private setupAgents(
    options: PuppeteerExecuteOptions
  ): Result<{ agentIds: string[]; agentMap: Map<string, IAgent> }, PuppeteerError> {
    const availableAgents = options.agents ?? [...this.agents.values()];
    if (availableAgents.length === 0) {
      return err(new PuppeteerError('No agents available', 'NO_AGENTS'));
    }

    const agentIds = availableAgents.map((a) => a.id);
    const agentMap = new Map(availableAgents.map((a) => [a.id, a]));
    return ok({ agentIds, agentMap });
  }

  private async runAndComplete(ctx: {
    state: PuppeteerState;
    trajectory: PuppeteerStepResult[];
    agentIds: string[];
    agentMap: Map<string, IAgent>;
    task: Task;
    sessionId: string;
    startTime: number;
  }): Promise<Result<PuppeteerResult, PuppeteerError>> {
    const { trajectory, agentIds, agentMap, task, sessionId, startTime } = ctx;
    let state = ctx.state;

    try {
      const loopResult = await this.runOrchestrationLoop({
        initialState: state,
        trajectory,
        agentIds,
        agentMap,
        task,
        sessionId,
        startTime,
      });
      if (!loopResult.ok) {
        return this.buildErrorResult(
          trajectory,
          'error',
          sessionId,
          startTime,
          loopResult.error.message
        );
      }
      state = loopResult.value;
      return this.completeExecution(state, trajectory, sessionId, startTime);
    } catch (error) {
      const puppeteerError = this.wrapError(error);
      this.emitError(sessionId, puppeteerError);
      return this.buildErrorResult(
        trajectory,
        'error',
        sessionId,
        startTime,
        puppeteerError.message
      );
    }
  }

  private setupAbortSignal(signal: AbortSignal | undefined): void {
    if (signal) {
      signal.addEventListener('abort', () => {
        this.cancel('AbortSignal triggered');
      });
    }
  }

  /**
   * Context for orchestration loop execution.
   */
  private async runOrchestrationLoop(ctx: {
    initialState: PuppeteerState;
    trajectory: PuppeteerStepResult[];
    agentIds: readonly string[];
    agentMap: Map<string, IAgent>;
    task: Task;
    sessionId: string;
    startTime: number;
  }): Promise<Result<PuppeteerState, PuppeteerError>> {
    const { trajectory, agentIds, agentMap, task, sessionId, startTime } = ctx;
    let state = ctx.initialState;

    while (!this.shouldTerminate(state, trajectory, startTime)) {
      const stepResult = await this.executeStep(state, agentIds, agentMap, task);

      if (!stepResult.ok) {
        this.emitError(sessionId, stepResult.error);
        return err(stepResult.error);
      }

      trajectory.push(stepResult.value);
      state = stepResult.value.newState;
      this.emitStepCompleted(sessionId, stepResult.value);

      if (stepResult.value.shouldTerminate) break;
    }

    return ok(state);
  }

  private completeExecution(
    state: PuppeteerState,
    trajectory: readonly PuppeteerStepResult[],
    sessionId: string,
    startTime: number
  ): Result<PuppeteerResult, PuppeteerError> {
    const terminationReason = this.determineTerminationReason(state, trajectory, startTime);
    const emergentPatterns = this.config.trackEmergentPatterns
      ? this.patternTracker.analyze(trajectory)
      : { hubAgents: [], cycles: [], graphDensity: 0, cyclicalityScore: 0 };

    const result = buildPuppeteerResult(
      trajectory,
      emergentPatterns,
      terminationReason,
      sessionId,
      startTime
    );
    this.emitCompleted(sessionId, result);
    return ok(result);
  }

  /**
   * Cancel ongoing orchestration.
   */
  cancel(reason?: string): void {
    this.cancelled = true;
    this.cancelReason = reason ?? 'Cancelled by user';
  }

  /**
   * Register an agent for orchestration.
   */
  registerAgent(agent: IAgent): void {
    this.agents.set(agent.id, agent);
  }

  /**
   * Unregister an agent.
   */
  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  /**
   * Get list of registered agent IDs.
   */
  getRegisteredAgents(): string[] {
    return [...this.agents.keys()];
  }

  // ===========================================================================
  // Private: Step Execution
  // ===========================================================================

  private async executeStep(
    state: PuppeteerState,
    agentIds: readonly string[],
    agentMap: Map<string, IAgent>,
    originalTask: Task
  ): Promise<Result<PuppeteerStepResult, PuppeteerError>> {
    // Compute agent selection distribution
    const distributionResult = await this.policyEngine.computeDistribution(state, agentIds);
    if (!distributionResult.ok) {
      return err(new PuppeteerError(distributionResult.error.message, 'POLICY_ERROR'));
    }

    const distribution = distributionResult.value;

    // Sample agent from distribution
    const selectedAgentId = this.policyEngine.sampleAgent(distribution);
    const agent = agentMap.get(selectedAgentId);

    if (!agent) {
      return err(new PuppeteerError(`Agent not found: ${selectedAgentId}`, 'AGENT_NOT_FOUND'));
    }

    // Extract context for this agent
    const agentContext = this.stateManager.extractAgentContext(state, selectedAgentId);

    // Build task for agent
    const agentTask = buildAgentTask(originalTask, state, agentContext);

    // Execute agent
    const previousProgress = state.metadata.progress;
    const agentResult = await agent.execute(agentTask);

    if (!agentResult.ok) {
      return err(
        new PuppeteerError(
          `Agent execution failed: ${agentResult.error.message}`,
          'AGENT_EXECUTION_ERROR'
        )
      );
    }

    // Build agent output
    const agentOutput = buildAgentStepOutput(state.step, selectedAgentId, agentResult.value);

    // Update state
    const newState = this.stateManager.updateState(state, agentOutput);

    // Check for termination conditions
    const { shouldTerminate, reason } = this.checkStepTermination(agentOutput, newState);

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

  // ===========================================================================
  // Private: Termination Logic
  // ===========================================================================

  private shouldTerminate(
    state: PuppeteerState,
    trajectory: readonly PuppeteerStepResult[],
    startTime: number
  ): boolean {
    if (this.cancelled) return true;
    if (state.step >= this.config.maxSteps) return true;
    if (Date.now() - startTime >= this.config.timeoutMs) return true;
    if (state.metadata.totalCost >= this.config.maxCostBudget) return true;
    return false;
  }

  private checkStepTermination(
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

  private determineTerminationReason(
    state: PuppeteerState,
    trajectory: readonly PuppeteerStepResult[],
    startTime: number
  ): PuppeteerTerminationReason {
    if (this.cancelled) return 'cancelled';

    const lastStep = trajectory[trajectory.length - 1];
    if (lastStep?.terminationReason) return lastStep.terminationReason;

    if (state.step >= this.config.maxSteps) return 'max_steps';
    if (Date.now() - startTime >= this.config.timeoutMs) return 'timeout';

    return 'max_steps';
  }

  // ===========================================================================
  // Private: Error Handling
  // ===========================================================================

  private wrapError(error: unknown): PuppeteerError {
    if (error instanceof PuppeteerError) return error;
    const message = error instanceof Error ? error.message : String(error);
    return new PuppeteerError(message, 'UNKNOWN_ERROR');
  }

  private buildErrorResult(
    trajectory: readonly PuppeteerStepResult[],
    reason: PuppeteerTerminationReason,
    sessionId: string,
    startTime: number,
    _errorMessage: string
  ): Result<PuppeteerResult, PuppeteerError> {
    const emergentPatterns = this.config.trackEmergentPatterns
      ? this.patternTracker.analyze(trajectory)
      : { hubAgents: [], cycles: [], graphDensity: 0, cyclicalityScore: 0 };

    const result = buildPuppeteerResult(trajectory, emergentPatterns, reason, sessionId, startTime);
    return ok(result);
  }

  // ===========================================================================
  // Private: Event Emission
  // ===========================================================================

  private emitStart(sessionId: string, task: Task): void {
    if (this.eventBus) {
      emitPuppeteerStarted(this.eventBus, sessionId, task);
    }
  }

  private emitStepCompleted(sessionId: string, step: PuppeteerStepResult): void {
    if (this.eventBus) {
      emitPuppeteerStepCompleted(this.eventBus, sessionId, step);
    }
  }

  private emitCompleted(sessionId: string, result: PuppeteerResult): void {
    if (this.eventBus) {
      emitPuppeteerCompleted(this.eventBus, sessionId, result);
    }
  }

  private emitError(sessionId: string, error: PuppeteerError): void {
    if (this.eventBus) {
      emitPuppeteerError(this.eventBus, sessionId, error);
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a Puppeteer orchestrator.
 */
export function createPuppeteerOrchestrator(
  options?: PuppeteerOrchestratorOptions
): PuppeteerOrchestrator {
  return new PuppeteerOrchestrator(options);
}
