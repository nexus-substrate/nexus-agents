/**
 * Abstract base class implementing IAgent with state management, logging, and model integration.
 * Memory backend integration (Issue #348) is implemented here with lifecycle methods.
 *
 * @module agents/base-agent
 */
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
import { BaseAgentOptionsSchema } from './agent-schemas.js';
import type { IEventBus } from './collaboration/event-bus-types.js';
import { getGlobalEventBus } from './collaboration/event-bus.js';
import { emitMessageReceived } from './collaboration/message-events.js';
import type { MessageHandlerContext } from './base-agent-message-handlers.js';
import type { ContextManager } from './context-manager.js';
import type { ContextPruner } from './context-pruner.js';
import type { ResolvedPruningConfig, ContextPruningMetrics } from './base-agent-pruning-init.js';
import {
  loadMemoryState,
  loadRelevantTypedMemories,
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
import { createInitialPruningMetrics, copyPruningMetrics } from './base-agent-context-helpers.js';
import {
  flushMemoryState,
  copyMemoryState,
  doRecordLearning,
  doRecordPattern,
  doRecordResolution,
  doFindResolution,
  doGetLearnings,
  doGetTopPatterns,
} from './base-agent-memory-ops.js';
import {
  recordFailedTaskError,
  persistMemoryAfterTask,
  persistMemoryOnCleanup,
} from './base-agent-execution-helpers.js';
import { validateMessage, dispatchMessage } from './base-agent-dispatch.js';

export * from './base-agent-exports.js';

const DEFAULT_MAX_DURATION_MS = 5 * 60 * 1000;
const MAX_HISTORY_ITEMS = 100;

/** Abstract base class for all agents. Subclasses must implement executeTask and buildPrompt. */
export abstract class BaseAgent implements IAgent {
  readonly id: string;
  readonly role: AgentRole;
  readonly capabilities: readonly AgentCapability[];
  protected readonly stateMachine: AgentStateMachine;
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
  private readonly contextPruningEnabled: boolean;
  private readonly contextManager: ContextManager | undefined;
  private readonly contextPruner: ContextPruner | undefined;
  private readonly pruningConfig: ResolvedPruningConfig;
  private pruningMetrics: ContextPruningMetrics;
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
        .map((i) => `${i.path.join('.')}: ${i.message}`)
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
    this.stateMachine = setupStateMachine({
      agentId: this.id,
      logger: this.logger,
      eventBus: this.eventBus,
      options: options.stateMachineOptions,
    });
    this.budgetTracker = new TokenBudgetTracker(options.tokenBudget, this.logger);
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
    this.pruningMetrics = createInitialPruningMetrics();
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
    if (this.memoryEnabled && this.memoryConfig.autoLoadOnInit) await this.loadMemoryOnInit();
    this.initialized = true;
    return ok(undefined);
  }

  private async loadMemoryOnInit(): Promise<void> {
    if (this.memoryBackend !== undefined) {
      const stateResult = await loadMemoryState(
        this.memoryBackend,
        this.id,
        this.role,
        this.logger
      );
      if (stateResult.ok) this.memoryState = stateResult.value;
    }
    if (this.typedMemory !== undefined) {
      const memoriesResult = await loadRelevantTypedMemories(
        this.typedMemory,
        this.role,
        this.memoryConfig.maxInitialLoadEntries,
        this.logger
      );
      if (memoriesResult.ok) this.relevantMemories = memoriesResult.value;
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

  private async runTaskWithTimeout(task: Task): Promise<Result<TaskResult, AgentError>> {
    const maxDuration = task.constraints?.maxDuration ?? DEFAULT_MAX_DURATION_MS;
    return executeWithTimeout({
      task,
      maxDurationMs: maxDuration,
      executeTask: (t) => this.executeTask(t),
      transformError: (error, taskId) => transformTaskError(error, this.id, taskId),
    });
  }

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
      this.memoryState = await persistMemoryAfterTask({
        memoryEnabled: this.memoryEnabled,
        memoryBackend: this.memoryBackend,
        memoryState: this.memoryState,
        persistenceMode: this.memoryConfig.persistenceMode,
        task,
        startTime,
        logger: this.logger,
      });
    }
  }

  private handleExecutionError(task: Task, error: unknown): Result<TaskResult, AgentError> {
    this.memoryState = recordFailedTaskError({
      memoryEnabled: this.memoryEnabled,
      memoryState: this.memoryState,
      error,
    });
    return err(
      handleTaskFailure({
        task,
        error,
        agentId: this.id,
        stateMachine: this.stateMachine,
        budgetTracker: this.budgetTracker,
      })
    );
  }

  async handleMessage(msg: AgentMessage): Promise<Result<AgentResponse, AgentError>> {
    const validationResult = validateMessage({ msg });
    if (!validationResult.valid && validationResult.error !== undefined)
      return err(validationResult.error);
    if (!validationResult.valid)
      return err(new AgentError('Message validation failed', { context: { messageId: msg.id } }));
    this.logger.debug('Handling message', { messageId: msg.id, from: msg.from, type: msg.type });
    if (this.emitMessageEvents) emitMessageReceived(this.eventBus, { message: msg, by: this.id });
    return dispatchMessage({
      msg,
      ctx: this.getMessageHandlerContext(),
      executeTask: (task) => this.execute(task),
    });
  }

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
    await persistMemoryOnCleanup({
      memoryEnabled: this.memoryEnabled,
      memoryBackend: this.memoryBackend,
      memoryState: this.memoryState,
      persistenceMode: this.memoryConfig.persistenceMode,
      logger: this.logger,
    });
    this.history = [];
    this.sharedState = {};
    this.initialized = false;
    this.relevantMemories = [];
    this.stateMachine.reset();
  }

  hasCapability(capability: AgentCapability): boolean {
    return this.capabilities.includes(capability);
  }

  protected abstract executeTask(task: Task): Promise<Result<TaskResult, AgentError>>;
  protected abstract buildPrompt(task: Task): Message[];

  protected transformError(error: unknown, taskId: string): AgentError {
    return transformTaskError(error, this.id, taskId);
  }

  protected async complete(
    request: CompletionRequest
  ): Promise<Result<CompletionResponse, AgentError>> {
    if (this.adapter === undefined)
      return err(new AgentError('No model adapter configured', { context: { agentId: this.id } }));
    const budgetResult = checkBudgetBeforeComplete({
      agentId: this.id,
      budgetTracker: this.budgetTracker,
    });
    if (!budgetResult.ok) return budgetResult;
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
    if (this.history.length > MAX_HISTORY_ITEMS)
      this.history = this.history.slice(-MAX_HISTORY_ITEMS);
  }

  protected getHistory(): Message[] {
    return [...this.history];
  }
  protected clearHistory(): void {
    this.history = [];
  }
  getPruningMetrics(): Readonly<ContextPruningMetrics> {
    return copyPruningMetrics(this.pruningMetrics);
  }

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

  isContextPruningEnabled(): boolean {
    return this.contextPruningEnabled;
  }
  isMemoryEnabled(): boolean {
    return this.memoryEnabled;
  }
  getMemoryState(): Readonly<AgentMemoryState> | null {
    return copyMemoryState(this.memoryState);
  }
  getRelevantMemories(): readonly TypedMemoryEntry[] {
    return this.relevantMemories;
  }

  async flushMemory(): Promise<Result<void, AgentMemoryError>> {
    return flushMemoryState({
      memoryEnabled: this.memoryEnabled,
      memoryBackend: this.memoryBackend,
      memoryState: this.memoryState,
      logger: this.logger,
    });
  }

  private get memoryCtx(): { memoryEnabled: boolean; memoryState: AgentMemoryState | null } {
    return { memoryEnabled: this.memoryEnabled, memoryState: this.memoryState };
  }

  protected recordLearning(learning: Omit<TaskLearning, 'id' | 'learnedAt'>): void {
    this.memoryState = doRecordLearning(this.memoryCtx, learning);
  }

  protected recordPattern(
    pattern: Omit<ExecutionPattern, 'id' | 'lastSeen' | 'occurrences'>
  ): void {
    this.memoryState = doRecordPattern(this.memoryCtx, pattern);
  }

  protected recordResolution(resolution: Omit<ErrorResolution, 'resolvedAt'>): void {
    this.memoryState = doRecordResolution(this.memoryCtx, resolution);
  }

  protected findResolutionForError(errorMessage: string): ErrorResolution | undefined {
    return doFindResolution(this.memoryCtx, errorMessage);
  }

  protected getTaskLearnings(taskType: string): readonly TaskLearning[] {
    return doGetLearnings(this.memoryCtx, taskType);
  }

  protected getTopExecutionPatterns(limit: number = 10): readonly ExecutionPattern[] {
    return doGetTopPatterns(this.memoryCtx, limit);
  }
}
