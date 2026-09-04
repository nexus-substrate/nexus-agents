/**
 * Puppeteer Orchestrator
 *
 * Main orchestrator implementing Puppeteer-style learned orchestration.
 * Coordinates multiple "puppet" agents through a centralized policy.
 *
 * Features:
 * - Non-blocking agent lifecycle management via Promise-based API
 * - Event-driven coordination with CollaborationEventBus integration
 * - Emergent pattern detection (compaction, cyclicality)
 *
 * @module agents/orchestration/puppeteer-orchestrator
 * (Source: Issue #335, arXiv:2505.19591)
 */

import { ok, err } from '../../core/result.js';
import type { Result } from '../../core/result.js';
import type { IAgent, Task } from '../../core/index.js';
import { getErrorMessage, getTimeProvider } from '../../core/index.js';

import type { ICollaborationEventBus } from '../collaboration/event-bus-types.js';
import type {
  PuppeteerConfig,
  PuppeteerExecuteOptions,
  PuppeteerResult,
  PuppeteerState,
  PuppeteerStepResult,
} from './puppeteer-types.js';
import { DEFAULT_PUPPETEER_CONFIG } from './puppeteer-types.js';
import type { IPolicyEngine } from './policy-types.js';
import type { IStateManager } from './state-manager.js';
import type { IPatternTracker } from './pattern-tracker.js';
import { createStateManager } from './state-manager.js';
import { createPatternTracker } from './pattern-tracker.js';
import { generateSessionId, buildPuppeteerResult } from './puppeteer-helpers.js';
import {
  emitPuppeteerStarted,
  emitPuppeteerStepCompleted,
  emitPuppeteerCompleted,
  emitPuppeteerError,
} from './puppeteer-events.js';
import { executeStep, StepExecutionError } from './puppeteer-step-execution.js';
import { shouldTerminate, determineTerminationReason } from './puppeteer-termination.js';
import { ExperienceBuffer } from './experience-buffer.js';
import {
  processOrchestrationForLearning,
  supportsLearning,
  DEFAULT_LEARNING_CONFIG,
} from './learning-integration.js';
import type { LearningIntegrationConfig } from './learning-integration.js';
import { PuppeteerError } from './puppeteer-error.js';
import { createPolicyForMode } from './puppeteer-policy-factory.js';

// Re-export PuppeteerError for backward compatibility
export { PuppeteerError } from './puppeteer-error.js';

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
  readonly eventBus?: ICollaborationEventBus;
  /** Registry of available agents */
  readonly agents?: readonly IAgent[];
  /** Learning system configuration (Issue #154) */
  readonly learningConfig?: LearningIntegrationConfig;
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
  private readonly eventBus: ICollaborationEventBus | undefined;
  private readonly agents: Map<string, IAgent>;
  private readonly experienceBuffer: ExperienceBuffer | null;
  private readonly learningConfig: LearningIntegrationConfig;

  private cancelled = false;
  private cancelReason: string | undefined = undefined;

  // AbortSignal cleanup state (Issue #401 - prevent listener leaks)
  private abortSignal: AbortSignal | undefined = undefined;
  private abortHandler: (() => void) | undefined = undefined;

  constructor(options: PuppeteerOrchestratorOptions = {}) {
    this.config = { ...DEFAULT_PUPPETEER_CONFIG, ...options.config };
    // Use explicitly provided policy engine, or create one based on policyMode (#385)
    this.policyEngine = options.policyEngine ?? createPolicyForMode(this.config.policyMode);
    this.stateManager =
      options.stateManager ?? createStateManager({ costPer1KTokens: this.config.costPer1KTokens });
    this.patternTracker = options.patternTracker ?? createPatternTracker();
    this.eventBus = options.eventBus ?? undefined;
    this.agents = new Map();

    // Learning system initialization (Issue #154)
    this.learningConfig = options.learningConfig ?? DEFAULT_LEARNING_CONFIG;
    this.experienceBuffer = this.learningConfig.enableLearning
      ? new ExperienceBuffer({ maxCapacity: this.learningConfig.bufferCapacity })
      : null;

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
    const startTime = getTimeProvider().now();
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
  // Private: State Management
  // ===========================================================================

  private resetState(): void {
    this.cancelled = false;
    this.cancelReason = undefined;
    // Clean up any lingering abort handler from previous execution
    this.cleanupAbortSignal();
  }

  private setupAbortSignal(signal: AbortSignal | undefined): void {
    if (signal) {
      // Store references for cleanup (Issue #401)
      this.abortSignal = signal;
      this.abortHandler = () => {
        this.cancel('AbortSignal triggered');
      };
      signal.addEventListener('abort', this.abortHandler);
    }
  }

  /**
   * Clean up abort signal listener to prevent memory leaks.
   * Called after execution completes (success or error).
   * @see Issue #401
   */
  private cleanupAbortSignal(): void {
    if (this.abortSignal && this.abortHandler) {
      this.abortSignal.removeEventListener('abort', this.abortHandler);
    }
    this.abortSignal = undefined;
    this.abortHandler = undefined;
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

  // ===========================================================================
  // Private: Execution Flow
  // ===========================================================================

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
        return this.buildErrorResult(trajectory, 'error', sessionId, startTime);
      }
      state = loopResult.value;
      return this.completeExecution(state, trajectory, sessionId, startTime);
    } catch (error) {
      const puppeteerError = this.wrapError(error);
      this.emitError(sessionId, puppeteerError);
      return this.buildErrorResult(trajectory, 'error', sessionId, startTime);
    }
  }

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

    const terminationCtx = { config: this.config, cancelled: this.cancelled };
    const stepCtx = { policyEngine: this.policyEngine, stateManager: this.stateManager };

    while (!shouldTerminate(terminationCtx, state, trajectory, startTime)) {
      // Update cancellation state for termination context
      terminationCtx.cancelled = this.cancelled;

      const stepResult = await executeStep(stepCtx, state, agentIds, agentMap, task);

      if (!stepResult.ok) {
        this.emitError(sessionId, PuppeteerError.fromStepError(stepResult.error));
        return err(PuppeteerError.fromStepError(stepResult.error));
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
    const terminationCtx = { config: this.config, cancelled: this.cancelled };
    const reason = determineTerminationReason(terminationCtx, state, trajectory, startTime);

    const emergentPatterns = this.config.trackEmergentPatterns
      ? this.patternTracker.analyze(trajectory)
      : { hubAgents: [], cycles: [], graphDensity: 0, cyclicalityScore: 0 };

    const result = buildPuppeteerResult(trajectory, emergentPatterns, reason, {
      sessionId,
      startTime,
      costPer1KTokens: this.config.costPer1KTokens,
    });

    // Trigger learning integration (Issue #154)
    if (this.experienceBuffer !== null && supportsLearning(this.policyEngine)) {
      void processOrchestrationForLearning(result, this.experienceBuffer, this.policyEngine);
    }

    this.emitCompleted(sessionId, result);

    // Clean up abort signal listener (Issue #401)
    this.cleanupAbortSignal();

    return ok(result);
  }

  // ===========================================================================
  // Private: Error Handling
  // ===========================================================================

  private wrapError(error: unknown): PuppeteerError {
    if (error instanceof PuppeteerError) return error;
    if (error instanceof StepExecutionError) return PuppeteerError.fromStepError(error);
    const message = getErrorMessage(error);
    return new PuppeteerError(message, 'UNKNOWN_ERROR');
  }

  private buildErrorResult(
    trajectory: readonly PuppeteerStepResult[],
    reason: 'error',
    sessionId: string,
    startTime: number
  ): Result<PuppeteerResult, PuppeteerError> {
    const emergentPatterns = this.config.trackEmergentPatterns
      ? this.patternTracker.analyze(trajectory)
      : { hubAgents: [], cycles: [], graphDensity: 0, cyclicalityScore: 0 };

    const result = buildPuppeteerResult(trajectory, emergentPatterns, reason, {
      sessionId,
      startTime,
      costPer1KTokens: this.config.costPer1KTokens,
    });

    // Clean up abort signal listener (Issue #401)
    this.cleanupAbortSignal();

    return ok(result);
  }

  // ===========================================================================
  // Private: Event Emission
  // ===========================================================================

  private emitStart(sessionId: string, task: Task): void {
    if (this.eventBus) emitPuppeteerStarted(this.eventBus, sessionId, task);
  }

  private emitStepCompleted(sessionId: string, step: PuppeteerStepResult): void {
    if (this.eventBus) emitPuppeteerStepCompleted(this.eventBus, sessionId, step);
  }

  private emitCompleted(sessionId: string, result: PuppeteerResult): void {
    if (this.eventBus) emitPuppeteerCompleted(this.eventBus, sessionId, result);
  }

  private emitError(sessionId: string, error: PuppeteerError): void {
    if (this.eventBus) emitPuppeteerError(this.eventBus, sessionId, error);
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
