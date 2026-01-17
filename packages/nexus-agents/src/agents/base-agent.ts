/**
 * nexus-agents/agents - BaseAgent
 *
 * Abstract base class implementing the IAgent interface.
 * Provides common functionality for state management, logging,
 * error handling, and model adapter integration.
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
import { AgentStateMachine } from './state-machine.js';
import { mapStatesToEvent } from './state-machine-types.js';
import { TaskSchema, AgentMessageSchema, BaseAgentOptionsSchema } from './agent-schemas.js';
import type { IEventBus } from './collaboration/event-bus-types.js';
import { getGlobalEventBus, createEvent } from './collaboration/event-bus.js';
import { emitMessageReceived } from './collaboration/message-events.js';
import {
  handleTaskMessage,
  handleQueryMessage,
  handleFeedbackMessage,
  handleStatusMessage,
  handleResultMessage,
  type MessageHandlerContext,
} from './base-agent-message-handlers.js';
import { ContentPriority, type ContextManager } from './context-manager.js';
import type { ContextPruner } from './context-pruner.js';
import {
  initializePruningInfrastructure,
  type ResolvedPruningConfig,
  type ContextPruningMetrics,
} from './base-agent-pruning-init.js';
import { executeContextPruning } from './base-agent-complete-helpers.js';
import type { BaseAgentOptions } from './base-agent-types.js';

// Re-export schemas, types, and message handlers for API consumers
export {
  TaskSchema,
  AgentMessageSchema,
  BaseAgentOptionsSchema,
  ContextPrunerAgentConfigSchema,
} from './agent-schemas.js';
export type { ContextPrunerAgentConfig, ContextPruningMetrics } from './base-agent-pruning-init.js';
export type { BaseAgentOptions } from './base-agent-types.js';
export {
  handleTaskMessage,
  handleQueryMessage,
  handleFeedbackMessage,
  handleStatusMessage,
  handleResultMessage,
  type MessageHandlerContext,
} from './base-agent-message-handlers.js';

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
    this.stateMachine = new AgentStateMachine(options.stateMachineOptions);
    this.stateMachine.onStateChange((transition) => {
      this.logger.debug('State transition', {
        from: transition.from,
        to: transition.to,
        event: transition.event,
      });
      const event = createEvent('agent.state_changed', {
        agentId: this.id,
        ...transition,
      });
      this.eventBus.emit(event);
    });

    // Initialize token budget tracker with EMA (Issue #304)
    this.budgetTracker = new TokenBudgetTracker(options.tokenBudget, this.logger);

    // Initialize context pruning infrastructure (Issue #306)
    const pruningInfra = initializePruningInfrastructure({
      logger: this.logger,
      ...(options.contextPruning !== undefined ? { config: options.contextPruning } : {}),
      ...(options.adapter !== undefined ? { adapter: options.adapter } : {}),
    });
    this.pruningConfig = pruningInfra.pruningConfig;
    this.contextPruningEnabled = pruningInfra.contextPruningEnabled;
    this.contextManager = pruningInfra.contextManager;
    this.contextPruner = pruningInfra.contextPruner;
  }

  get state(): AgentState {
    return this.stateMachine.state;
  }

  /**
   * Attempts a state transition using the state machine.
   * Maps legacy state names to state machine events for backward compatibility.
   *
   * @deprecated Use stateMachine.transition() directly for new code
   */
  protected setState(newState: AgentState): void {
    const currentState = this.stateMachine.state;
    if (newState === 'error') {
      this.stateMachine.forceError({ reason: 'setState called with error' });
      return;
    }
    const event = mapStatesToEvent(currentState, newState);
    if (event !== undefined && this.stateMachine.canTransition(event)) {
      const result = this.stateMachine.transition(event);
      if (!result.ok) {
        this.logger.warn('State transition failed', {
          from: currentState,
          to: newState,
          event,
          error: result.error.message,
        });
      }
    } else if (currentState !== newState) {
      this.logger.debug('Unmapped state change (legacy)', { from: currentState, to: newState });
    }
  }

  initialize(ctx: AgentContext): Promise<Result<void, AgentError>> {
    if (this.initialized) {
      return Promise.resolve(
        err(new AgentError('Agent already initialized', { context: { agentId: this.id } }))
      );
    }

    this.logger.info('Initializing agent', {
      modelId: ctx.config.modelId,
      hasTools: ctx.tools !== undefined && ctx.tools.length > 0,
    });

    this.config = ctx.config;
    this.sharedState = ctx.sharedState ?? {};
    this.initialized = true;

    return Promise.resolve(ok(undefined));
  }

  async execute(task: Task): Promise<Result<TaskResult, AgentError>> {
    const validationResult = this.validateTask(task);
    if (!validationResult.ok) {
      return validationResult;
    }

    // Use state machine for availability check (Issue #302)
    if (!this.stateMachine.isAvailable()) {
      return err(
        new AgentError(`Agent is not idle (current state: ${this.stateMachine.state})`, {
          context: { agentId: this.id, currentState: this.stateMachine.state, taskId: task.id },
        })
      );
    }

    const startTime = Date.now();

    // Use validated state transition (Issue #302)
    const transitionResult = this.stateMachine.transition('task_assigned', { taskId: task.id });
    if (!transitionResult.ok) {
      return err(transitionResult.error);
    }

    // Start task-level budget tracking (Issue #304)
    this.budgetTracker.startTask(task.id);

    this.logger.info('Executing task', {
      taskId: task.id,
      priority: task.priority,
      hasConstraints: task.constraints !== undefined,
    });

    try {
      const maxDuration = task.constraints?.maxDuration ?? DEFAULT_MAX_DURATION_MS;
      const result = await this.executeWithTimeout(task, maxDuration);

      if (!result.ok) {
        this.stateMachine.forceError({ taskId: task.id, error: result.error.message });
        this.budgetTracker.endTask(); // End task tracking on failure (Issue #304)
        return result;
      }

      this.finalizeTaskSuccess(task, result.value, startTime);
      return result;
    } catch (error) {
      this.stateMachine.forceError({ taskId: task.id, error: String(error) });
      this.budgetTracker.endTask(); // End task tracking on exception (Issue #304)
      return err(this.transformError(error, task.id));
    }
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

  cleanup(): Promise<void> {
    this.logger.info('Cleaning up agent');
    this.history = [];
    this.sharedState = {};
    this.initialized = false;
    // Reset state machine to idle (Issue #302)
    this.stateMachine.reset();
    return Promise.resolve();
  }

  hasCapability(capability: AgentCapability): boolean {
    return this.capabilities.includes(capability);
  }

  protected abstract executeTask(task: Task): Promise<Result<TaskResult, AgentError>>;
  protected abstract buildPrompt(task: Task): Message[];

  private async executeWithTimeout(
    task: Task,
    maxDurationMs: number
  ): Promise<Result<TaskResult, AgentError>> {
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        resolve(
          err(
            new AgentError(`Task execution timed out after ${String(maxDurationMs)}ms`, {
              context: { taskId: task.id, maxDurationMs },
            })
          )
        );
      }, maxDurationMs);

      this.executeTask(task)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error: unknown) => {
          clearTimeout(timeoutId);
          resolve(err(this.transformError(error, task.id)));
        });
    });
  }

  private validateTask(task: Task): Result<Task, AgentError> {
    const result = TaskSchema.safeParse(task);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      return err(
        new AgentError(`Invalid task: ${issues}`, {
          context: { taskId: task.id, validationErrors: result.error.issues },
        })
      );
    }
    return ok(result.data as Task);
  }

  /** Handles successful task completion: state transitions, budget tracking, and logging. */
  private finalizeTaskSuccess(task: Task, result: TaskResult, startTime: number): void {
    const durationMs = Date.now() - startTime;
    // Complete task - if still in thinking, transition through acting first
    if (this.stateMachine.state === 'thinking') {
      this.stateMachine.transition('plan_completed', { taskId: task.id });
    }
    this.stateMachine.transition('task_completed', { taskId: task.id, durationMs });
    const budgetStats = this.budgetTracker.endTask();
    this.logger.info('Task completed', {
      taskId: task.id,
      durationMs,
      tokensUsed: result.metadata.tokensUsed,
      taskTokensUsed: budgetStats.taskTokensUsed,
      sessionTokensUsed: budgetStats.sessionTokensUsed,
    });
  }

  protected transformError(error: unknown, taskId: string): AgentError {
    if (error instanceof AgentError) return error;
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;
    const opts: { context: Record<string, unknown>; cause?: Error } = {
      context: { agentId: this.id, taskId },
    };
    if (cause !== undefined) opts.cause = cause;
    return new AgentError(`Task execution failed: ${message}`, opts);
  }

  protected async complete(
    request: CompletionRequest
  ): Promise<Result<CompletionResponse, AgentError>> {
    if (this.adapter === undefined) {
      return err(new AgentError('No model adapter configured', { context: { agentId: this.id } }));
    }
    // Check budget before making model call (Issue #304)
    const estimatedTokens = this.budgetTracker.predictNextTokens();
    const budgetCheck = this.budgetTracker.checkBudget(estimatedTokens);
    if (!budgetCheck.allowed) {
      const ctx = {
        agentId: this.id,
        estimatedTokens,
        remainingTaskBudget: budgetCheck.remainingTaskBudget,
        remainingSessionBudget: budgetCheck.remainingSessionBudget,
      };
      const opts: { context: typeof ctx; cause?: Error } = { context: ctx };
      if (budgetCheck.error !== undefined) opts.cause = budgetCheck.error;
      return err(new AgentError('Token budget exceeded', opts));
    }

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

    const result = await this.adapter.complete(request);
    if (!result.ok) {
      return err(
        new AgentError(`Model completion failed: ${result.error.message}`, {
          context: { agentId: this.id },
          cause: result.error,
        })
      );
    }

    // Record actual token usage for EMA tracking (Issue #304)
    this.budgetTracker.recordUsage({
      timestamp: Date.now(),
      inputTokens: result.value.usage.inputTokens,
      outputTokens: result.value.usage.outputTokens,
      totalTokens: result.value.usage.totalTokens,
    });

    // eslint-disable-next-line @typescript-eslint/no-deprecated -- Internal backward compatibility
    this.setState('thinking');
    return ok(result.value);
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

  /**
   * Adds content to the context manager for pruning consideration (Issue #306).
   * Only effective when context pruning is enabled.
   * @param content The content string to add
   * @param priority Optional priority for pruning (default: HISTORY=40)
   * @param category Optional category (default: 'active')
   */
  protected async addContextItem(
    content: string,
    priority?: (typeof ContentPriority)[keyof typeof ContentPriority],
    category?: 'system' | 'task' | 'active'
  ): Promise<void> {
    if (this.contextPruningEnabled && this.contextManager !== undefined) {
      const timestamp = Date.now().toString();
      const randomSuffix = Math.random().toString(36).slice(2, 9);
      await this.contextManager.add({
        id: `ctx-${timestamp}-${randomSuffix}`,
        content,
        priority: priority ?? ContentPriority.HISTORY,
        category: category ?? 'active',
      });
    }
  }

  /**
   * Checks if context pruning is enabled for this agent.
   */
  isContextPruningEnabled(): boolean {
    return this.contextPruningEnabled;
  }
}
