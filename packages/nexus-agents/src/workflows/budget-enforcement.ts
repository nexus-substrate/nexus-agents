/**
 * nexus-agents/workflows - Budget Enforcement
 *
 * Helper module for context budget enforcement during workflow execution.
 * Integrates with BudgetCircuitBreaker for actual enforcement.
 *
 * (Updated: Issue #349 - Implement budget enforcement circuit breaker)
 */

import type { Result, ILogger, ContextBudget } from '../core/index.js';
import { ok, err, getTimeProvider } from '../core/index.js';
import { ContextManager } from '../agents/context-manager.js';
import type { WorkflowStep } from './workflow-types.js';
import {
  BudgetCircuitBreaker,
  BudgetCircuitError,
  type BudgetCircuitBreakerConfig,
  type BudgetEnforcementResult,
  type IBudgetCircuitBreaker,
} from './budget-circuit-breaker.js';

// Re-export circuit breaker types for convenience
export {
  BudgetCircuitBreaker,
  BudgetCircuitError,
  BudgetCircuitErrorCode,
  BudgetCircuitBreakerConfigSchema,
  DEFAULT_BUDGET_CIRCUIT_CONFIG,
  createBudgetCircuitBreaker,
  checkBudgetResult,
  allocateStepBudgetResult,
  type BudgetCircuitState,
  type BudgetCircuitBreakerConfig,
  type BudgetCircuitSnapshot,
  type BudgetCircuitStateChangeEvent,
  type BudgetCircuitStateChangeListener,
  type BudgetEnforcementResult,
  type BudgetUsageSnapshot,
  type IBudgetCircuitBreaker,
  type StepBudgetAllocation,
} from './budget-circuit-breaker.js';

/**
 * Budget enforcement event logged during execution.
 */
export interface BudgetEnforcementEvent {
  /** Timestamp of the event */
  timestamp: number;
  /** Step ID where budget was applied */
  stepId: string;
  /** Budget that was applied */
  budget: ContextBudget;
  /** Whether this was a step override or workflow default */
  source: 'step' | 'workflow' | 'engine';
  /** Context stats before step execution */
  statsBefore?: {
    totalTokens: number;
    availableTokens: number;
    usagePercentage: number;
  };
  /** Enforcement result from circuit breaker */
  enforcementResult?: BudgetEnforcementResult;
  /** Whether the step was blocked */
  blocked?: boolean;
}

/**
 * Configuration for budget enforcement.
 */
export interface BudgetEnforcementConfig {
  /** Default budget from engine config */
  engineDefaultBudget: ContextBudget;
  /** Workflow's default budget (if any) */
  workflowDefaultBudget?: ContextBudget;
  /** Logger for budget events */
  logger: ILogger;
  /** Circuit breaker configuration */
  circuitBreakerConfig?: Partial<BudgetCircuitBreakerConfig>;
}

/**
 * Apply budget enforcement for a step and log the event.
 * This is the legacy logging-only function maintained for backward compatibility.
 */
export function applyBudgetEnforcement(
  step: WorkflowStep,
  contextManager: ContextManager | undefined,
  budgetEvents: BudgetEnforcementEvent[],
  config: BudgetEnforcementConfig
): void {
  // Skip if no context manager
  if (contextManager === undefined) {
    return;
  }

  // Determine the effective budget for this step
  const { budget, source } = resolveStepBudget(step, config);

  // Get current context stats before step execution
  const stats = contextManager.getStats();
  const statsBefore = {
    totalTokens: stats.totalTokens,
    availableTokens: stats.availableTokens,
    usagePercentage: stats.usagePercentage,
  };

  // Log the budget enforcement event
  const event: BudgetEnforcementEvent = {
    timestamp: getTimeProvider().now(),
    stepId: step.id,
    budget,
    source,
    statsBefore,
  };
  budgetEvents.push(event);

  config.logger.debug('Budget enforcement applied for step', {
    stepId: step.id,
    source,
    budget,
    currentUsage: Math.round(statsBefore.usagePercentage * 100),
  });
}

/**
 * Options for enforcing budget on a step.
 */
export interface EnforceBudgetOptions {
  step: WorkflowStep;
  contextManager: ContextManager | undefined;
  circuitBreaker: IBudgetCircuitBreaker;
  budgetEvents: BudgetEnforcementEvent[];
  config: BudgetEnforcementConfig;
  estimatedTokens: number;
}

/**
 * Enforce budget for a step using circuit breaker pattern.
 * Returns Result type for proper error handling.
 */
export function enforceBudgetForStep(
  options: EnforceBudgetOptions
): Result<BudgetEnforcementResult, BudgetCircuitError> {
  const { step, contextManager, circuitBreaker, budgetEvents, config, estimatedTokens } = options;

  // Skip if no context manager - allow execution
  if (contextManager === undefined) {
    return ok(createSkippedResult());
  }

  const { budget, source } = resolveStepBudget(step, config);
  const stats = contextManager.getStats();
  const statsBefore = {
    totalTokens: stats.totalTokens,
    availableTokens: stats.availableTokens,
    usagePercentage: stats.usagePercentage,
  };

  // Check budget via circuit breaker
  const enforcementResult = circuitBreaker.checkBudget(estimatedTokens);

  // Log the event regardless of outcome
  const event: BudgetEnforcementEvent = {
    timestamp: getTimeProvider().now(),
    stepId: step.id,
    budget,
    source,
    statsBefore,
    enforcementResult,
    blocked: !enforcementResult.allowed,
  };
  budgetEvents.push(event);

  // Log appropriate message based on result
  logEnforcementResult(config.logger, step.id, enforcementResult, statsBefore.usagePercentage);

  if (!enforcementResult.allowed) {
    return err(
      new BudgetCircuitError(enforcementResult.reason, {
        budgetErrorCode: 'BUDGET_EXCEEDED',
        circuitState: enforcementResult.circuitState,
        usage: enforcementResult.usage,
      })
    );
  }

  return ok(enforcementResult);
}

/**
 * Create a circuit breaker for workflow execution.
 */
export function createWorkflowCircuitBreaker(
  contextManager: ContextManager | undefined,
  config: BudgetEnforcementConfig
): BudgetCircuitBreaker | undefined {
  if (contextManager === undefined) {
    return undefined;
  }

  const stats = contextManager.getStats();
  const maxTokens = Math.round(stats.availableTokens + stats.totalTokens);
  const cbConfig = config.circuitBreakerConfig;

  return new BudgetCircuitBreaker(maxTokens, cbConfig, config.logger);
}

/**
 * Resolve the effective budget for a step.
 * Priority: step override > workflow default > engine default
 */
export function resolveStepBudget(
  step: WorkflowStep,
  config: BudgetEnforcementConfig
): { budget: ContextBudget; source: 'step' | 'workflow' | 'engine' } {
  // Check for step-specific budget override
  if (step.contextBudget !== undefined) {
    const baseBudget = config.workflowDefaultBudget ?? config.engineDefaultBudget;
    const mergedBudget: ContextBudget = {
      system: step.contextBudget.system ?? baseBudget.system,
      task: step.contextBudget.task ?? baseBudget.task,
      active: step.contextBudget.active ?? baseBudget.active,
      reserved: step.contextBudget.reserved ?? baseBudget.reserved,
    };
    return { budget: mergedBudget, source: 'step' };
  }

  // Use workflow default if available
  if (config.workflowDefaultBudget !== undefined) {
    return { budget: config.workflowDefaultBudget, source: 'workflow' };
  }

  // Fall back to engine default
  return { budget: config.engineDefaultBudget, source: 'engine' };
}

/**
 * Get a copy of budget events for an execution.
 */
export function copyBudgetEvents(events: BudgetEnforcementEvent[]): BudgetEnforcementEvent[] {
  return [...events];
}

// ============================================================================
// Private Helpers
// ============================================================================

function createSkippedResult(): BudgetEnforcementResult {
  return {
    allowed: true,
    reason: 'No context manager - enforcement skipped',
    usage: {
      currentTokens: 0,
      maxTokens: 0,
      usagePercent: 0,
      availableTokens: 0,
      timestamp: getTimeProvider().now(),
    },
    circuitState: 'closed',
  };
}

function logEnforcementResult(
  logger: ILogger,
  stepId: string,
  result: BudgetEnforcementResult,
  currentUsagePercent: number
): void {
  const usagePercent = Math.round(currentUsagePercent * 100);

  if (!result.allowed) {
    logger.warn('Budget enforcement blocked step', {
      stepId,
      reason: result.reason,
      circuitState: result.circuitState,
      currentUsage: usagePercent,
      budgetUsage: Math.round(result.usage.usagePercent * 100),
    });
    return;
  }

  if (result.warning !== undefined) {
    logger.warn('Budget enforcement warning', {
      stepId,
      warning: result.warning,
      currentUsage: usagePercent,
    });
    return;
  }

  logger.debug('Budget enforcement passed for step', {
    stepId,
    currentUsage: usagePercent,
    allocatedTokens: result.allocatedTokens,
  });
}
