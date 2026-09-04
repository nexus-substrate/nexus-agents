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
import type { IContextMemoryBackend } from '../context/memory-backend-types.js';
import type { ITypedMemory, TypedMemoryEntry } from '../context/memory-types.js';
import { AgentStateMachine } from './state-machine.js';
import { transitionToState } from './base-agent-state-helpers.js';
import { setupStateMachine, initializeInfrastructure } from './base-agent-constructor-helpers.js';
import { BaseAgentOptionsSchema } from './agent-schemas.js';
import type { IEventBus } from './collaboration/event-bus-types.js';
import { getGlobalEventBus } from './collaboration/event-bus.js';
import { emitMessageReceived } from './collaboration/message-events.js';
import type { ContextManager } from './context-manager.js';
import type { ContextPruner } from './context-pruner.js';
import type { ResolvedPruningConfig, ContextPruningMetrics } from './base-agent-pruning-init.js';
import {
  type ResolvedMemoryConfig,
  type AgentMemoryState,
  type TaskLearning,
  type ExecutionPattern,
  type ErrorResolution,
  type AgentMemoryError,
} from './base-agent-memory-init.js';
import {
  addContextItem as addContextItemHelper,
  ContentPriority,
} from './base-agent-complete-helpers.js';
import {
  validateAdapter,
  executePreCompletionChecks,
  runModelCompletion,
} from './base-agent-complete-flow.js';
import { transformTaskError } from './base-agent-task-helpers.js';
import {
  setupExecute,
  runTaskWithTimeout,
  handleExecutionFailure as handleExecFailure,
  finalizeSuccessfulExecution as finalizeExec,
  handleExecutionError as handleExecError,
  addToHistory as addToHistoryHelper,
  getHistoryCopy,
} from './base-agent-execute-flow.js';
import type { BaseAgentOptions } from './base-agent-types.js';
import { createInitialPruningMetrics, copyPruningMetrics } from './base-agent-context-helpers.js';
import {
  getMemoryStateCopy,
  flushMemory,
  recordLearningToMemory,
  recordPatternToMemory,
  recordResolutionToMemory,
  findResolution,
  getTaskLearningsByType,
} from './base-agent-memory-accessors.js';
import { persistMemoryOnCleanup } from './base-agent-execution-helpers.js';
import { validateMessage, dispatchMessage } from './base-agent-dispatch.js';
import { performInitialization } from './base-agent-init-helpers.js';
import {
  buildInitializationContext,
  buildMessageHandlerContext,
  buildCompleteFlowContext,
  buildExecuteFlowContext,
  buildTaskMemoryContext,
  type AgentContextState,
} from './base-agent-context-builders.js';

export * from './base-agent-exports.js';

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
  private readonly memoryBackend: IContextMemoryBackend | undefined;
  private readonly typedMemory: ITypedMemory | undefined;
  private readonly memoryConfig: ResolvedMemoryConfig;
  private memoryState: AgentMemoryState | null = null;
  private relevantMemories: readonly TypedMemoryEntry[] = [];
  /**
   * AbortSignal set by `execute()` when the caller passes one. `complete()`
   * forwards it onto `CompletionRequest.signal` so the in-flight model call
   * cancels when the caller's deadline wins a race (#3016/#3040). Set only
   * for the duration of one execute() and cleared in finally — the field is
   * single-task scoped and never crosses tasks.
   */
  private currentExecutionSignal: AbortSignal | undefined = undefined;

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

  /** Builds the context state object for helper functions. */
  private get contextState(): AgentContextState {
    return {
      id: this.id,
      role: this.role,
      capabilities: this.capabilities,
      initialized: this.initialized,
      historyLength: this.history.length,
      adapter: this.adapter,
      logger: this.logger,
      stateMachine: this.stateMachine,
      budgetTracker: this.budgetTracker,
      eventBus: this.eventBus,
      memoryEnabled: this.memoryEnabled,
      memoryBackend: this.memoryBackend,
      typedMemory: this.typedMemory,
      memoryConfig: this.memoryConfig,
      memoryState: this.memoryState,
      contextPruningEnabled: this.contextPruningEnabled,
      contextPruner: this.contextPruner,
      pruningConfig: this.pruningConfig,
      pruningMetrics: this.pruningMetrics,
    };
  }

  async initialize(ctx: AgentContext): Promise<Result<void, AgentError>> {
    const initCtx = buildInitializationContext(this.contextState);
    const result = await performInitialization(initCtx, ctx);
    if (!result.ok) return result;
    this.config = ctx.config;
    this.sharedState = ctx.sharedState ?? {};
    if (result.value.memoryState !== null) this.memoryState = result.value.memoryState;
    if (result.value.relevantMemories.length > 0)
      this.relevantMemories = result.value.relevantMemories;
    this.initialized = true;
    return ok(undefined);
  }

  async execute(
    task: Task,
    options?: { signal?: AbortSignal }
  ): Promise<Result<TaskResult, AgentError>> {
    const execCtx = buildExecuteFlowContext(this.contextState);
    const setup = setupExecute(execCtx, task);
    if (!setup.valid && setup.error !== undefined) return err(setup.error);
    const transitionResult = this.stateMachine.transition('task_assigned', { taskId: task.id });
    if (!transitionResult.ok) return err(transitionResult.error);
    this.budgetTracker.startTask(task.id);
    this.logger.info('Executing task', { taskId: task.id, priority: task.priority });
    const taskMemCtx = buildTaskMemoryContext(this.contextState);
    // Make caller's AbortSignal visible to `complete()` so model calls cancel
    // when the caller's deadline wins (#3016/#3040). Cleared in finally to
    // avoid leaking the signal into a later, unrelated execute() call.
    this.currentExecutionSignal = options?.signal;
    try {
      const result = await runTaskWithTimeout(task, this.id, (t) => this.executeTask(t), {
        externalSignal: options?.signal,
      });
      if (!result.ok) return handleExecFailure(task, result, execCtx);
      this.memoryState = await finalizeExec(
        task,
        result.value,
        setup.startTime,
        execCtx,
        taskMemCtx
      );
      return result;
    } catch (error) {
      const { error: agentError, updatedMemoryState } = handleExecError(
        task,
        error,
        execCtx,
        taskMemCtx
      );
      this.memoryState = updatedMemoryState;
      return err(agentError);
    } finally {
      this.currentExecutionSignal = undefined;
    }
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
      ctx: buildMessageHandlerContext(this.contextState),
      executeTask: (task) => this.execute(task),
    });
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
    const ctx = buildCompleteFlowContext(this.contextState);
    const adapterResult = validateAdapter(ctx);
    if (!adapterResult.ok) return adapterResult;
    const preCheckResult = await executePreCompletionChecks(ctx);
    if (!preCheckResult.ok) return preCheckResult;
    transitionToState({
      stateMachine: this.stateMachine,
      logger: this.logger,
      newState: 'acting',
    });
    // Thread caller's AbortSignal into the model call unless the caller
    // already supplied one on the request (#3016/#3040).
    const requestWithSignal: CompletionRequest =
      request.signal === undefined && this.currentExecutionSignal !== undefined
        ? { ...request, signal: this.currentExecutionSignal }
        : request;
    const result = await runModelCompletion(ctx, adapterResult.value, requestWithSignal);
    transitionToState({
      stateMachine: this.stateMachine,
      logger: this.logger,
      newState: 'thinking',
    });
    return result;
  }

  protected addToHistory(message: Message): void {
    this.history = addToHistoryHelper(this.history, message);
  }
  protected getHistory(): Message[] {
    return getHistoryCopy(this.history);
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
    if (!this.contextPruningEnabled || this.contextManager === undefined) return;
    await addContextItemHelper({
      contextManager: this.contextManager,
      content,
      priority,
      category,
    });
  }

  isContextPruningEnabled(): boolean {
    return this.contextPruningEnabled;
  }
  isMemoryEnabled(): boolean {
    return this.memoryEnabled;
  }
  getMemoryState(): Readonly<AgentMemoryState> | null {
    return getMemoryStateCopy(this.memoryState);
  }
  getRelevantMemories(): readonly TypedMemoryEntry[] {
    return this.relevantMemories;
  }

  async flushMemory(): Promise<Result<void, AgentMemoryError>> {
    return flushMemory({
      memoryEnabled: this.memoryEnabled,
      memoryBackend: this.memoryBackend,
      memoryState: this.memoryState,
      logger: this.logger,
    });
  }

  private get memOpCtx(): { memoryEnabled: boolean; memoryState: AgentMemoryState | null } {
    return { memoryEnabled: this.memoryEnabled, memoryState: this.memoryState };
  }

  protected recordLearning(learning: Omit<TaskLearning, 'id' | 'learnedAt'>): void {
    this.memoryState = recordLearningToMemory(this.memOpCtx, learning);
  }
  protected recordPattern(p: Omit<ExecutionPattern, 'id' | 'lastSeen' | 'occurrences'>): void {
    this.memoryState = recordPatternToMemory(this.memOpCtx, p);
  }
  protected recordResolution(r: Omit<ErrorResolution, 'resolvedAt'>): void {
    this.memoryState = recordResolutionToMemory(this.memOpCtx, r);
  }
  protected findResolutionForError(errorMessage: string): ErrorResolution | undefined {
    return findResolution(this.memOpCtx, errorMessage);
  }
  protected getTaskLearnings(taskType: string): readonly TaskLearning[] {
    return getTaskLearningsByType(this.memOpCtx, taskType);
  }
}
