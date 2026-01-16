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
import { TaskSchema, AgentMessageSchema, BaseAgentOptionsSchema } from './agent-schemas.js';
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

// Re-export schemas for convenience
export { TaskSchema, AgentMessageSchema, BaseAgentOptionsSchema } from './agent-schemas.js';

// Re-export message handlers for backward compatibility
export {
  handleTaskMessage,
  handleQueryMessage,
  handleFeedbackMessage,
  handleStatusMessage,
  handleResultMessage,
  type MessageHandlerContext,
} from './base-agent-message-handlers.js';

/**
 * Options for creating a BaseAgent.
 */
export interface BaseAgentOptions {
  /** Unique agent identifier */
  id: string;
  /** Agent role */
  role: AgentRole;
  /** Agent capabilities */
  capabilities: readonly AgentCapability[];
  /** Model adapter for LLM interactions */
  adapter?: IModelAdapter;
  /** Custom logger instance */
  logger?: ILogger;
  /** System prompt for the agent */
  systemPrompt?: string;
  /** Default temperature for completions */
  temperature?: number;
  /** Maximum tokens for responses */
  maxTokens?: number;
  /** Event bus for message observability (uses global bus if not provided) */
  eventBus?: IEventBus;
  /** Whether to emit events for message handling (default: true) */
  emitMessageEvents?: boolean;
}

const DEFAULT_MAX_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const MAX_HISTORY_ITEMS = 100;

/** Abstract base class for all agents. Subclasses must implement executeTask and buildPrompt. */
export abstract class BaseAgent implements IAgent {
  readonly id: string;
  readonly role: AgentRole;
  readonly capabilities: readonly AgentCapability[];

  private _state: AgentState = 'idle';
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
  }

  get state(): AgentState {
    return this._state;
  }

  protected setState(newState: AgentState): void {
    const previousState = this._state;
    this._state = newState;
    this.logger.debug('State transition', { from: previousState, to: newState });
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

    if (this._state !== 'idle') {
      return err(
        new AgentError(`Agent is not idle (current state: ${this._state})`, {
          context: { agentId: this.id, currentState: this._state, taskId: task.id },
        })
      );
    }

    const startTime = Date.now();
    this.setState('thinking');

    this.logger.info('Executing task', {
      taskId: task.id,
      priority: task.priority,
      hasConstraints: task.constraints !== undefined,
    });

    try {
      const maxDuration = task.constraints?.maxDuration ?? DEFAULT_MAX_DURATION_MS;
      const result = await this.executeWithTimeout(task, maxDuration);

      if (!result.ok) {
        this.setState('error');
        return result;
      }

      const durationMs = Date.now() - startTime;
      this.setState('idle');

      this.logger.info('Task completed', {
        taskId: task.id,
        durationMs,
        tokensUsed: result.value.metadata.tokensUsed,
      });

      return result;
    } catch (error) {
      this.setState('error');
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
      state: this._state,
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
    this.setState('idle');
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

  protected transformError(error: unknown, taskId: string): AgentError {
    if (error instanceof AgentError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : undefined;

    const options: { context: Record<string, unknown>; cause?: Error } = {
      context: { agentId: this.id, taskId },
    };
    if (cause !== undefined) {
      options.cause = cause;
    }
    return new AgentError(`Task execution failed: ${message}`, options);
  }

  protected async complete(
    request: CompletionRequest
  ): Promise<Result<CompletionResponse, AgentError>> {
    if (this.adapter === undefined) {
      return err(new AgentError('No model adapter configured', { context: { agentId: this.id } }));
    }

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
}
