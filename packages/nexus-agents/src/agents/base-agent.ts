/**
 * Abstract base class implementing IAgent with state management, logging, and model integration.
 * Memory backend integration (Issue #348) is implemented here with lifecycle methods.
 */
/* eslint-disable max-lines -- Memory integration requires additional methods */
import type {
  Result,
  IAgent,
  IModelAdapter,
  ILogger,
  Task,
  TaskResult,
  AgentMessage,
  AgentResponse,
  AgentContext,
  AgentConfig,
  AgentState,
  AgentRole,
  AgentCapability,
  CompletionRequest,
  CompletionResponse,
  Message,
} from '../core/index.js';
import { ok, err, AgentError, createLogger } from '../core/index.js';
import { TokenBudgetTracker, type ITokenBudgetTracker } from '../context/token-budget-tracker.js';
import type { IMemoryBackend } from '../context/memory-backend-types.js';
import type { ITypedMemory, TypedMemoryEntry } from '../context/memory-types.js';
import { AgentStateMachine } from './state-machine.js';
import { performLegacyStateTransition } from './base-agent-state-helpers.js';
import { setupStateMachine, initializeInfrastructure } from './base-agent-constructor-helpers.js';
import { AgentMessageSchema, BaseAgentOptionsSchema } from './agent-schemas.js';
import type { IEventBus } from './collaboration/event-bus-types.js';
import { getGlobalEventBus } from './collaboration/event-bus.js';
import { emitMessageReceived } from './collaboration/message-events.js';
import {
  handleTaskMessage,
  handleQueryMessage,
  handleFeedbackMessage,
  handleStatusMessage,
  handleResultMessage,
  type MessageHandlerContext,
} from './base-agent-message-handlers.js';
import type { ContextManager } from './context-manager.js';
import type { ContextPruner } from './context-pruner.js';
import {
  type ResolvedPruningConfig,
  type ContextPruningMetrics,
} from './base-agent-pruning-init.js';
import {
  persistMemoryState,
  loadMemoryState,
  loadRelevantTypedMemories,
  recordTaskLearning,
  recordExecutionPattern,
  recordErrorResolution,
  findErrorResolution,
  getLearningsByType,
  getTopPatterns,
  categorizeTaskByKeywords,
  MemoryPersistenceMode,
  type ResolvedMemoryConfig,
  type AgentMemoryState,
  type TaskLearning,
  type ExecutionPattern,
  type ErrorResolution,
  type AgentMemoryError,
} from './base-agent-memory-init.js';
import {
  executeContextPruning,
  checkBudgetBeforeComplete,
  executeModelCompletion,
  addContextItem as addContextItemHelper,
  ContentPriority,
} from './base-agent-complete-helpers.js';
import {
  validateTask,
  checkAgentAvailability,
  executeWithTimeout,
  transformTaskError,
  finalizeTaskSuccess,
  handleTaskFailure,
} from './base-agent-task-helpers.js';
import type { BaseAgentOptions } from './base-agent-types.js';

// Re-export schemas, types, and message handlers for API consumers
export * from './base-agent-exports.js';

const DEFAULT_MAX_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const MAX_HISTORY_ITEMS = 100;

/** Abstract base class for all agents. Subclasses must implement executeTask and buildPrompt. */
export abstract class BaseAgent implements IAgent {
  readonly id: string;
  readonly role: AgentRole;
  readonly capabilities: readonly AgentCapability[];

  /** State machine for validated state transitions (Issue #302) */
  protected readonly stateMachine: AgentStateMachine;
  /** Token budget tracker for EMA-based usage tracking (Issue #304) */
  protected readonly budgetTracker: ITokenBudgetTracker;
  protected adapter: IModelAdapter | undefined;
  protected readonly logger: ILogger;
  protected config: AgentConfig | undefined;
  protected sharedState: Record<string, unknown> = {};
  protected history: Message[] = [];
  protected readonly systemPrompt: string | undefined;
  protected readonly temperature: number;
  protected readonly maxTokens: number;
  protected readonly eventBus: IEventBus;
  protected readonly emitMessageEvents: boolean;
  private initialized = false;

  /** Context pruning infrastructure (Issue #306) */
  private readonly contextPruningEnabled: boolean;
  private readonly contextManager: ContextManager | undefined;
  private readonly contextPruner: ContextPruner | undefined;
  private readonly pruningConfig: ResolvedPruningConfig;
  private pruningMetrics: ContextPruningMetrics = {
    pruningRounds: 0,
    totalTokensPruned: 0,
    lastPruningTokens: 0,
    lastPruningItemsRemoved: 0,
    lastPruningTargetReached: false,
  };

  /** Memory backend infrastructure (Issue #348) */
  private readonly memoryEnabled: boolean;
  private readonly memoryBackend: IMemoryBackend | undefined;
  private readonly typedMemory: ITypedMemory | undefined;
  private readonly memoryConfig: ResolvedMemoryConfig;
  private memoryState: AgentMemoryState | null = null;
  private relevantMemories: readonly TypedMemoryEntry[] = [];

  constructor(options: BaseAgentOptions) {
    const validation = BaseAgentOptionsSchema.safeParse(options);
    if (!validation.success) {
      const issues = validation.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      throw new AgentError(`Invalid agent options: ${issues}`, {
        context: { options, validationErrors: validation.error.issues },
      });
    }

    this.id = options.id;
    this.role = options.role;
    this.capabilities = options.capabilities;
    this.adapter = options.adapter;
    this.systemPrompt = options.systemPrompt;
    this.temperature = options.temperature ?? 0.3;
    this.maxTokens = options.maxTokens ?? 4096;
    this.logger = options.logger ?? createLogger({ agent: this.id, role: this.role });
    this.eventBus = options.eventBus ?? getGlobalEventBus();
    this.emitMessageEvents = options.emitMessageEvents ?? true;

    // Initialize state machine with validated transitions (Issue #302)
    this.stateMachine = setupStateMachine({
      agentId: this.id,
      logger: this.logger,
      eventBus: this.eventBus,
      options: options.stateMachineOptions,
    });

    // Initialize token budget tracker with EMA (Issue #304)
    this.budgetTracker = new TokenBudgetTracker(options.tokenBudget, this.logger);

    // Initialize context pruning and memory infrastructure (Issue #306, #348)
    const infra = initializeInfrastructure({
      agentId: this.id,
      role: this.role,
      logger: this.logger,
      adapter: options.adapter,
      pruningConfig: options.contextPruning,
      memoryConfig: options.memory,
    });

    this.pruningConfig = infra.pruning.pruningConfig;
    this.contextPruningEnabled = infra.pruning.contextPruningEnabled;
    this.contextManager = infra.pruning.contextManager;
    this.contextPruner = infra.pruning.contextPruner;
    this.memoryConfig = infra.memory.config;
    this.memoryEnabled = infra.memory.memoryEnabled;
    this.memoryBackend = infra.memory.config.backend;
    this.typedMemory = infra.memory.config.typedMemory;
    this.memoryState = infra.memory.state;
  }

  get state(): AgentState {
    return this.stateMachine.state;
  }

  /** @deprecated Use stateMachine.transition() directly for new code */
  protected setState(newState: AgentState): void {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Intentional legacy support
    performLegacyStateTransition({
      stateMachine: this.stateMachine,
      logger: this.logger,
      newState,
    });
  }

  async initialize(ctx: AgentContext): Promise<Result<void, AgentError>> {
    if (this.initialized) {
      return err(new AgentError('Agent already initialized', { context: { agentId: this.id } }));
    }

    this.logger.info('Initializing agent', {
      modelId: ctx.config.modelId,
      hasTools: ctx.tools !== undefined && ctx.tools.length > 0,
      memoryEnabled: this.memoryEnabled,
    });

    this.config = ctx.config;
    this.sharedState = ctx.sharedState ?? {};

    // Load memory state if enabled (Issue #348)
    if (this.memoryEnabled && this.memoryConfig.autoLoadOnInit) {
      await this.loadMemoryOnInit();
    }

    this.initialized = true;
    return ok(undefined);
  }

  /** Loads memory state and relevant memories on initialization (Issue #348). */
  private async loadMemoryOnInit(): Promise<void> {
    // Load persisted memory state from backend
    if (this.memoryBackend !== undefined) {
      const stateResult = await loadMemoryState(
        this.memoryBackend,
        this.id,
        this.role,
        this.logger
      );
      if (stateResult.ok) {
        this.memoryState = stateResult.value;
      }
    }

    // Load relevant typed memories
    if (this.typedMemory !== undefined) {
      const memoriesResult = await loadRelevantTypedMemories(
        this.typedMemory,
        this.role,
        this.memoryConfig.maxInitialLoadEntries,
        this.logger
      );
      if (memoriesResult.ok) {
        this.relevantMemories = memoriesResult.value;
      }
    }
  }

  async execute(task: Task): Promise<Result<TaskResult, AgentError>> {
    const validationResult = validateTask(task);
    if (!validationResult.ok) return validationResult;

    const availabilityCheck = checkAgentAvailability({
      agentId: this.id,
      taskId: task.id,
      stateMachine: this.stateMachine,
    });
    if (!availabilityCheck.ok) return availabilityCheck;

    const startTime = Date.now();
    const transitionResult = this.stateMachine.transition('task_assigned', { taskId: task.id });
    if (!transitionResult.ok) return err(transitionResult.error);

    this.budgetTracker.startTask(task.id);
    this.logger.info('Executing task', { taskId: task.id, priority: task.priority });

    try {
      const result = await this.runTaskWithTimeout(task);
      if (!result.ok) return this.handleExecutionFailure(task, result);

      await this.finalizeSuccessfulExecution(task, result.value, startTime);
      return result;
    } catch (error) {
      return this.handleExecutionError(task, error);
    }
  }

  /** Runs the task execution with timeout protection. */
  private async runTaskWithTimeout(task: Task): Promise<Result<TaskResult, AgentError>> {
    const maxDuration = task.constraints?.maxDuration ?? DEFAULT_MAX_DURATION_MS;
    return executeWithTimeout({
      task,
      maxDurationMs: maxDuration,
      executeTask: (t) => this.executeTask(t),
      transformError: (error, taskId) => transformTaskError(error, this.id, taskId),
    });
  }

  /** Handles failed task result (not exception). */
  private handleExecutionFailure(
    task: Task,
    result: Result<TaskResult, AgentError>
  ): Result<TaskResult, AgentError> {
    if (!result.ok) {
      this.stateMachine.forceError({ taskId: task.id, error: result.error.message });
      this.budgetTracker.endTask();
    }
    return result;
  }

  /** Finalizes successful task execution. */
  private async finalizeSuccessfulExecution(
    task: Task,
    result: TaskResult,
    startTime: number
  ): Promise<void> {
    finalizeTaskSuccess({
      task,
      result,
      startTime,
      stateMachine: this.stateMachine,
      budgetTracker: this.budgetTracker,
      logger: this.logger,
    });

    if (
      this.memoryEnabled &&
      this.memoryConfig.persistenceMode === MemoryPersistenceMode.ON_TASK_COMPLETE
    ) {
      await this.persistMemoryAfterTask(task, result, startTime);
    }
  }

  /** Handles task execution error (exception). */
  private handleExecutionError(task: Task, error: unknown): Result<TaskResult, AgentError> {
    this.recordFailedTaskInMemory(error);
    const agentError = handleTaskFailure({
      task,
      error,
      agentId: this.id,
      stateMachine: this.stateMachine,
      budgetTracker: this.budgetTracker,
    });
    return err(agentError);
  }

  /** Records a failed task error in memory for future reference (Issue #348). */
  private recordFailedTaskInMemory(error: unknown): void {
    if (!this.memoryEnabled || this.memoryState === null) return;
    this.memoryState = recordErrorResolution(this.memoryState, {
      errorPattern: String(error).slice(0, 200),
      resolution: 'Task execution failed - no resolution found',
      successful: false,
    });
  }

  /** Persists memory state after successful task completion (Issue #348). */
  private async persistMemoryAfterTask(
    task: Task,
    _result: TaskResult,
    startTime: number
  ): Promise<void> {
    if (this.memoryState === null) return;

    const durationMs = Date.now() - startTime;
    // Task completed without error means success (Result<TaskResult, AgentError> was ok)
    const successRate = 1.0;

    // Record execution pattern
    const taskType = this.categorizeTaskType(task);
    this.memoryState = recordExecutionPattern(this.memoryState, {
      pattern: taskType,
      successRate,
    });

    // Persist to backend if available
    if (this.memoryBackend !== undefined) {
      await persistMemoryState(this.memoryBackend, this.memoryState, this.logger);
    }

    this.logger.debug('Memory persisted after task completion', {
      taskId: task.id,
      durationMs,
    });
  }

  /** Categorizes a task into a type string for pattern tracking. */
  private categorizeTaskType(task: Task): string {
    const desc = task.description.toLowerCase();
    return categorizeTaskByKeywords(desc);
  }

  async handleMessage(msg: AgentMessage): Promise<Result<AgentResponse, AgentError>> {
    const validation = AgentMessageSchema.safeParse(msg);
    if (!validation.success) {
      const issues = validation.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return err(
        new AgentError(`Invalid message: ${issues}`, {
          context: { messageId: msg.id, validationErrors: validation.error.issues },
        })
      );
    }

    this.logger.debug('Handling message', { messageId: msg.id, from: msg.from, type: msg.type });

    // Emit message.received event for observability (Issue #223)
    if (this.emitMessageEvents) {
      emitMessageReceived(this.eventBus, { message: msg, by: this.id });
    }

    const ctx = this.getMessageHandlerContext();
    switch (msg.type) {
      case 'task':
        return handleTaskMessage(msg, (task) => this.execute(task)) as Promise<
          Result<AgentResponse, AgentError>
        >;
      case 'query':
        return handleQueryMessage(msg, ctx) as Promise<Result<AgentResponse, AgentError>>;
      case 'feedback':
        return handleFeedbackMessage(msg, ctx) as Promise<Result<AgentResponse, AgentError>>;
      case 'status':
        return handleStatusMessage(msg, ctx) as Promise<Result<AgentResponse, AgentError>>;
      case 'result':
        return handleResultMessage(msg, ctx) as Promise<Result<AgentResponse, AgentError>>;
      default:
        return err(
          new AgentError(`Unknown message type: ${String(msg.type)}`, {
            context: { messageId: msg.id, type: msg.type },
          })
        );
    }
  }

  /** Creates the context object needed by message handlers. */
  private getMessageHandlerContext(): MessageHandlerContext {
    return {
      id: this.id,
      role: this.role,
      state: this.stateMachine.state,
      capabilities: this.capabilities,
      initialized: this.initialized,
      historyLength: this.history.length,
      logger: this.logger,
    };
  }

  async cleanup(): Promise<void> {
    this.logger.info('Cleaning up agent', { memoryEnabled: this.memoryEnabled });

    // Persist memory state before cleanup if enabled (Issue #348)
    if (
      this.memoryEnabled &&
      this.memoryBackend !== undefined &&
      this.memoryState !== null &&
      this.memoryConfig.persistenceMode !== MemoryPersistenceMode.NONE
    ) {
      await persistMemoryState(this.memoryBackend, this.memoryState, this.logger);
      this.logger.debug('Memory state persisted during cleanup');
    }

    this.history = [];
    this.sharedState = {};
    this.initialized = false;
    this.relevantMemories = [];
    // Reset state machine to idle (Issue #302)
    this.stateMachine.reset();
  }

  hasCapability(capability: AgentCapability): boolean {
    return this.capabilities.includes(capability);
  }

  protected abstract executeTask(task: Task): Promise<Result<TaskResult, AgentError>>;
  protected abstract buildPrompt(task: Task): Message[];

  /** Transforms an unknown error into an AgentError. */
  protected transformError(error: unknown, taskId: string): AgentError {
    return transformTaskError(error, this.id, taskId);
  }

  protected async complete(
    request: CompletionRequest
  ): Promise<Result<CompletionResponse, AgentError>> {
    if (this.adapter === undefined) {
      return err(new AgentError('No model adapter configured', { context: { agentId: this.id } }));
    }

    // Check budget before making model call (Issue #304)
    const budgetResult = checkBudgetBeforeComplete({
      agentId: this.id,
      budgetTracker: this.budgetTracker,
    });
    if (!budgetResult.ok) return budgetResult;

    // Context pruning before model call (Issue #306)
    if (this.contextPruningEnabled && this.contextPruner !== undefined) {
      await executeContextPruning({
        agentId: this.id,
        contextPruner: this.contextPruner,
        pruningConfig: this.pruningConfig,
        pruningMetrics: this.pruningMetrics,
        eventBus: this.eventBus,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Internal backward compatibility
    this.setState('acting');

    const result = await executeModelCompletion({
      agentId: this.id,
      adapter: this.adapter,
      request,
      budgetTracker: this.budgetTracker,
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Internal backward compatibility
    this.setState('thinking');
    return result;
  }

  protected addToHistory(message: Message): void {
    this.history.push(message);
    if (this.history.length > MAX_HISTORY_ITEMS) {
      this.history = this.history.slice(-MAX_HISTORY_ITEMS);
    }
  }

  protected getHistory(): Message[] {
    return [...this.history];
  }

  protected clearHistory(): void {
    this.history = [];
  }

  /**
   * Gets the current pruning metrics for observability (Issue #306).
   * Returns metrics even if pruning is disabled (all zeros).
   */
  getPruningMetrics(): Readonly<ContextPruningMetrics> {
    return { ...this.pruningMetrics };
  }

  /** Adds content to the context manager for pruning consideration (Issue #306). */
  protected async addContextItem(
    content: string,
    priority?: (typeof ContentPriority)[keyof typeof ContentPriority],
    category?: 'system' | 'task' | 'active'
  ): Promise<void> {
    if (this.contextPruningEnabled && this.contextManager !== undefined) {
      await addContextItemHelper({
        contextManager: this.contextManager,
        content,
        priority,
        category,
      });
    }
  }

  /**
   * Checks if context pruning is enabled for this agent.
   */
  isContextPruningEnabled(): boolean {
    return this.contextPruningEnabled;
  }

  // ============================================================================
  // Memory Backend Integration (Issue #348)
  // ============================================================================

  /**
   * Checks if memory integration is enabled for this agent.
   */
  isMemoryEnabled(): boolean {
    return this.memoryEnabled;
  }

  /**
   * Gets the current memory state for observability (Issue #348).
   * Returns null if memory is disabled or not initialized.
   */
  getMemoryState(): Readonly<AgentMemoryState> | null {
    return this.memoryState !== null ? { ...this.memoryState } : null;
  }

  /**
   * Gets relevant typed memories loaded for this agent's role.
   * Returns an empty array if typed memory is not configured.
   */
  getRelevantMemories(): readonly TypedMemoryEntry[] {
    return this.relevantMemories;
  }

  /**
   * Manually persists the current memory state (Issue #348).
   * Use when persistence mode is set to MANUAL.
   */
  async flushMemory(): Promise<Result<void, AgentMemoryError>> {
    if (!this.memoryEnabled) {
      return ok(undefined);
    }

    if (this.memoryBackend === undefined || this.memoryState === null) {
      return ok(undefined);
    }

    return persistMemoryState(this.memoryBackend, this.memoryState, this.logger);
  }

  /**
   * Records a task learning in the agent's memory (Issue #348).
   * Use to capture insights from task execution.
   */
  protected recordLearning(learning: Omit<TaskLearning, 'id' | 'learnedAt'>): void {
    if (!this.memoryEnabled || this.memoryState === null) return;
    this.memoryState = recordTaskLearning(this.memoryState, learning);
  }

  /**
   * Records an execution pattern in the agent's memory (Issue #348).
   */
  protected recordPattern(
    pattern: Omit<ExecutionPattern, 'id' | 'lastSeen' | 'occurrences'>
  ): void {
    if (!this.memoryEnabled || this.memoryState === null) return;
    this.memoryState = recordExecutionPattern(this.memoryState, pattern);
  }

  /**
   * Records an error resolution in the agent's memory (Issue #348).
   */
  protected recordResolution(resolution: Omit<ErrorResolution, 'resolvedAt'>): void {
    if (!this.memoryEnabled || this.memoryState === null) return;
    this.memoryState = recordErrorResolution(this.memoryState, resolution);
  }

  /**
   * Finds a resolution for a given error from memory (Issue #348).
   */
  protected findResolutionForError(errorMessage: string): ErrorResolution | undefined {
    if (!this.memoryEnabled || this.memoryState === null) return undefined;
    return findErrorResolution(this.memoryState, errorMessage);
  }

  /**
   * Gets task learnings filtered by task type (Issue #348).
   */
  protected getTaskLearnings(taskType: string): readonly TaskLearning[] {
    if (!this.memoryEnabled || this.memoryState === null) return [];
    return getLearningsByType(this.memoryState, taskType);
  }

  /**
   * Gets the top execution patterns by success rate (Issue #348).
   */
  protected getTopExecutionPatterns(limit: number = 10): readonly ExecutionPattern[] {
    if (!this.memoryEnabled || this.memoryState === null) return [];
    return getTopPatterns(this.memoryState, limit);
  }
}
