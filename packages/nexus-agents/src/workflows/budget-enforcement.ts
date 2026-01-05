/**
 * nexus-agents/workflows - Budget Enforcement
 *
 * Helper module for context budget enforcement during workflow execution.
 */

import type { ILogger, ContextBudget } from '../core/index.js';
import { ContextManager } from '../agents/context-manager.js';
import type { WorkflowStep } from './workflow-engine.js';

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
}

/**
 * Apply budget enforcement for a step and log the event.
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
    timestamp: Date.now(),
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
 * Resolve the effective budget for a step.
 * Priority: step override > workflow default > engine default
 */
export function resolveStepBudget(
  step: WorkflowStep,
  config: BudgetEnforcementConfig
): { budget: ContextBudget; source: 'step' | 'workflow' | 'engine' } {
  // Check for step-specific budget override
  if (step.contextBudget !== undefined) {
    // Merge step budget with workflow/engine defaults
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
