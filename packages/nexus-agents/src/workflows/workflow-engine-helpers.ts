/**
 * Workflow Engine Helpers - Pure helper functions and types for WorkflowEngine.
 *
 * This module contains constants, types, and pure functions extracted from
 * workflow-engine.ts to keep the main file under 400 lines.
 */

import type { ILogger, ContextBudget, StepResult } from '../core/index.js';
import type { ContextManagerConfig } from '../agents/context-manager.js';
import { DEFAULT_BUDGET } from '../agents/context-manager.js';
import type { ContextManager } from '../agents/context-manager.js';
import type { BudgetEnforcementEvent } from './budget-enforcement.js';
import type { WorkflowStep } from './workflow-types.js';

// ============================================================================
// Constants
// ============================================================================

/** Default timeout for workflow execution (5 minutes). */
export const DEFAULT_TIMEOUT_MS = 300000;

/** Default maximum concurrent step execution. */
export const DEFAULT_MAX_CONCURRENCY = 5;

/** Maximum number of tracked executions before cleanup. */
export const MAX_TRACKED_EXECUTIONS = 1000;

// ============================================================================
// Configuration Types
// ============================================================================

/** Configuration for workflow engine. */
export interface WorkflowEngineConfig {
  defaultTimeoutMs?: number;
  maxConcurrency?: number;
  templatePaths?: string[];
  contextManagerConfig?: Omit<ContextManagerConfig, 'budget'>;
  defaultBudget?: ContextBudget;
  logger?: ILogger;
}

/** Internal config type with resolved optional fields. */
export interface ResolvedConfig {
  defaultTimeoutMs: number;
  maxConcurrency: number;
  templatePaths: string[];
  contextManagerConfig: Omit<ContextManagerConfig, 'budget'> | undefined;
  defaultBudget: ContextBudget;
}

// ============================================================================
// Execution Types
// ============================================================================

/** Execution plan with phases. */
export interface ExecutionPlan {
  phases: ExecutionPhase[];
}

/** Single execution phase (all steps run concurrently). */
export interface ExecutionPhase {
  steps: WorkflowStep[];
}

/** Execution context for workflow. */
export interface ExecutionContext {
  workflowId: string;
  executionId: string;
  inputs: Record<string, unknown>;
  stepResults: Map<string, StepResult>;
  variables: Map<string, unknown>;
  abortController: AbortController;
  contextManager: ContextManager | undefined;
  budgetEvents: BudgetEnforcementEvent[];
}

/** Options for phase execution. */
export interface ExecutionOptions {
  maxConcurrency: number;
  failFast: boolean;
  timeoutMs?: number;
}

// ============================================================================
// Pure Helper Functions
// ============================================================================

/**
 * Resolve workflow engine configuration with defaults.
 *
 * @param config - Optional user-provided configuration
 * @returns Fully resolved configuration with all defaults applied
 */
export function resolveConfig(config?: WorkflowEngineConfig): ResolvedConfig {
  return {
    defaultTimeoutMs: config?.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxConcurrency: config?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
    templatePaths: config?.templatePaths ?? [],
    contextManagerConfig: config?.contextManagerConfig,
    defaultBudget: config?.defaultBudget ?? DEFAULT_BUDGET,
  };
}

/**
 * Build final output from step results.
 * Returns the output of the last successful step, or null if no steps succeeded.
 *
 * @param stepResults - Array of step results from workflow execution
 * @returns The output from the last successful step, or null
 */
export function buildFinalOutput(stepResults: StepResult[]): unknown {
  const successfulSteps = stepResults.filter((r) => r.status === 'success');
  return successfulSteps.length === 0
    ? null
    : (successfulSteps[successfulSteps.length - 1]?.output ?? null);
}

/**
 * Extract error message from unknown error type.
 *
 * @param error - Unknown error value
 * @returns Error message string
 */
export function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
