/**
 * nexus-agents/agents/resilience - Recovery Strategies
 *
 * Implements archetype-specific recovery strategies for agent failures.
 * Each strategy provides instructions and mechanisms to recover from
 * the corresponding failure archetype.
 */

import type { ILogger, Task, Message } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type {
  FailureArchetype,
  DetectedFailure,
  RecoveryStrategy,
  RecoveryResult,
  RecoveryAction,
} from './failure-types.js';
import { DEFAULT_RECOVERY_STRATEGIES } from './failure-types.js';

/** Configuration for recovery manager. */
export interface RecoveryManagerConfig {
  readonly strategies: Record<FailureArchetype, RecoveryStrategy>;
  readonly globalMaxRetries: number;
  readonly escalationThreshold: number;
}

/** Default recovery manager configuration. */
export const DEFAULT_RECOVERY_CONFIG: RecoveryManagerConfig = {
  strategies: DEFAULT_RECOVERY_STRATEGIES,
  globalMaxRetries: 5,
  escalationThreshold: 3,
};

/** Context provided to recovery handlers. */
export interface RecoveryContext {
  readonly task: Task;
  readonly messages: readonly Message[];
  readonly failure: DetectedFailure;
  readonly attemptNumber: number;
}

/** Result of generating recovery instructions. */
export interface RecoveryInstructions {
  readonly systemPromptAddition: string;
  readonly taskModification?: Partial<Task>;
  readonly contextReset: boolean;
  readonly additionalConstraints: readonly string[];
}

/**
 * Manages recovery from detected failures using archetype-specific strategies.
 */
export class RecoveryManager {
  private readonly config: RecoveryManagerConfig;
  private readonly logger: ILogger;
  private readonly attemptCounts: Map<string, number> = new Map();

  constructor(config: Partial<RecoveryManagerConfig> = {}, logger?: ILogger) {
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config };
    this.logger = logger ?? createLogger({ component: 'RecoveryManager' });
  }

  /**
   * Determines the recovery action for a detected failure.
   */
  getRecoveryAction(failure: DetectedFailure): RecoveryAction {
    const strategy = this.config.strategies[failure.archetype];
    const attemptKey = this.getAttemptKey(failure);
    const attempts = this.attemptCounts.get(attemptKey) ?? 0;

    if (attempts >= this.config.escalationThreshold) {
      this.logger.warn('Escalation threshold reached', {
        archetype: failure.archetype,
        attempts,
      });
      return 'escalate';
    }

    if (attempts >= strategy.maxRetries) {
      return 'abort';
    }

    return strategy.action;
  }

  /**
   * Generates recovery instructions for a failure.
   */
  generateRecoveryInstructions(context: RecoveryContext): RecoveryInstructions {
    const strategy = this.config.strategies[context.failure.archetype];
    const handler = this.getHandler(context.failure.archetype);

    this.incrementAttemptCount(context.failure);

    this.logger.info('Generating recovery instructions', {
      archetype: context.failure.archetype,
      action: strategy.action,
      attempt: context.attemptNumber,
    });

    return handler(context, strategy);
  }

  /**
   * Records the result of a recovery attempt.
   */
  recordRecoveryAttempt(failure: DetectedFailure, result: RecoveryResult): void {
    this.logger.info('Recovery attempt recorded', {
      archetype: failure.archetype,
      success: result.success,
      action: result.action,
      attempt: result.attemptNumber,
      durationMs: result.durationMs,
    });

    if (result.success) {
      this.resetAttemptCount(failure);
    }
  }

  /**
   * Resets the attempt count for a failure archetype.
   */
  resetAttemptCount(failure: DetectedFailure): void {
    const key = this.getAttemptKey(failure);
    this.attemptCounts.delete(key);
  }

  /**
   * Checks if recovery should be attempted.
   */
  shouldAttemptRecovery(failure: DetectedFailure): boolean {
    const strategy = this.config.strategies[failure.archetype];
    const attempts = this.attemptCounts.get(this.getAttemptKey(failure)) ?? 0;
    return attempts < strategy.maxRetries && attempts < this.config.globalMaxRetries;
  }

  /** Gets the handler for a specific archetype. */
  private getHandler(
    archetype: FailureArchetype
  ): (ctx: RecoveryContext, strategy: RecoveryStrategy) => RecoveryInstructions {
    const handlers: Record<
      FailureArchetype,
      (ctx: RecoveryContext, strategy: RecoveryStrategy) => RecoveryInstructions
    > = {
      premature_action: this.handlePrematureAction.bind(this),
      over_helpfulness: this.handleOverHelpfulness.bind(this),
      context_pollution: this.handleContextPollution.bind(this),
      fragile_execution: this.handleFragileExecution.bind(this),
    };
    return handlers[archetype];
  }

  /** Handles premature action recovery. */
  private handlePrematureAction(
    ctx: RecoveryContext,
    strategy: RecoveryStrategy
  ): RecoveryInstructions {
    return {
      systemPromptAddition: `
RECOVERY MODE: Premature Action Detected (Attempt ${String(ctx.attemptNumber)})

${strategy.instructions}

REQUIRED STEPS:
1. Before ANY action, explicitly inspect available schemas/tools
2. Document what you discovered from inspection
3. Only then proceed with the action based on verified information
4. If unsure, ask for clarification instead of guessing

INDICATORS FOUND: ${ctx.failure.indicators.join('; ')}
`,
      contextReset: false,
      additionalConstraints: [
        'Must call schema inspection tools before data modification',
        'Document inspection results before acting',
        'Never assume schema structure without verification',
      ],
    };
  }

  /** Handles over-helpfulness recovery. */
  private handleOverHelpfulness(
    ctx: RecoveryContext,
    strategy: RecoveryStrategy
  ): RecoveryInstructions {
    return {
      systemPromptAddition: `
RECOVERY MODE: Over-Helpfulness Detected (Attempt ${String(ctx.attemptNumber)})

${strategy.instructions}

REQUIRED STEPS:
1. If a required entity is not found, STOP and report the issue
2. Never substitute placeholder values for missing required data
3. Explicitly ask for missing information rather than guessing
4. Document exactly what was requested vs what was found

INDICATORS FOUND: ${ctx.failure.indicators.join('; ')}
`,
      contextReset: false,
      additionalConstraints: [
        'Report missing entities instead of substituting',
        'Require explicit confirmation for any substitution',
        'Never use placeholder values without user approval',
      ],
    };
  }

  /** Handles context pollution recovery. */
  private handleContextPollution(
    _ctx: RecoveryContext,
    strategy: RecoveryStrategy
  ): RecoveryInstructions {
    return {
      systemPromptAddition: `
RECOVERY MODE: Context Pollution Detected

${strategy.instructions}

REQUIRED STEPS:
1. Focus ONLY on the current task description
2. Ignore historical context that contradicts current requirements
3. If context seems contradictory, ask for clarification
4. State your understanding of the task before proceeding
`,
      contextReset: true,
      additionalConstraints: [
        'Prioritize current task over historical context',
        'Explicitly state task understanding before acting',
        'Request clarification on contradictory information',
      ],
    };
  }

  /** Handles fragile execution recovery. */
  private handleFragileExecution(
    ctx: RecoveryContext,
    strategy: RecoveryStrategy
  ): RecoveryInstructions {
    return {
      systemPromptAddition: `
RECOVERY MODE: Fragile Execution Detected (Attempt ${String(ctx.attemptNumber)})

${strategy.instructions}

REQUIRED STEPS:
1. Validate tool call parameters BEFORE execution
2. Use explicit, well-formed JSON for all tool inputs
3. If a tool fails, analyze the error before retrying
4. Limit retries - if something fails 3 times, report and stop

INDICATORS FOUND: ${ctx.failure.indicators.join('; ')}
`,
      contextReset: false,
      additionalConstraints: [
        'Validate all tool parameters against expected schema',
        'Maximum 3 retries per tool call',
        'Report persistent failures instead of infinite retry',
        'Use explicit JSON formatting for tool inputs',
      ],
    };
  }

  /** Gets the attempt key for tracking. */
  private getAttemptKey(failure: DetectedFailure): string {
    return `${failure.archetype}-${String(failure.timestamp)}`;
  }

  /** Increments the attempt count. */
  private incrementAttemptCount(failure: DetectedFailure): void {
    const key = this.getAttemptKey(failure);
    this.attemptCounts.set(key, (this.attemptCounts.get(key) ?? 0) + 1);
  }
}

/**
 * Creates a recovery manager with the specified configuration.
 */
export function createRecoveryManager(
  config?: Partial<RecoveryManagerConfig>,
  logger?: ILogger
): RecoveryManager {
  return new RecoveryManager(config, logger);
}

/** Options for building a recovery result. */
export interface RecoveryResultOptions {
  readonly action: RecoveryAction;
  readonly attemptNumber: number;
  readonly success: boolean;
  readonly durationMs: number;
  readonly message: string;
  readonly newContext?: Record<string, unknown>;
}

/**
 * Builds a RecoveryResult from execution data.
 */
export function buildRecoveryResult(options: RecoveryResultOptions): RecoveryResult {
  const result: RecoveryResult = {
    success: options.success,
    action: options.action,
    attemptNumber: options.attemptNumber,
    durationMs: options.durationMs,
    message: options.message,
  };

  if (options.newContext !== undefined) {
    return { ...result, newContext: options.newContext };
  }

  return result;
}
