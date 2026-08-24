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

/** Default resolved configuration values. */
const DEFAULT_RESOLVED_CONFIG: ResolvedConfig = {
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  maxConcurrency: DEFAULT_MAX_CONCURRENCY,
  templatePaths: [],
  contextManagerConfig: undefined,
  defaultBudget: DEFAULT_BUDGET,
};

/**
 * Resolve workflow engine configuration with defaults.
 *
 * @param config - Optional user-provided configuration
 * @returns Fully resolved configuration with all defaults applied
 */
export function resolveConfig(config?: WorkflowEngineConfig): ResolvedConfig {
  if (config === undefined) {
    return { ...DEFAULT_RESOLVED_CONFIG };
  }
  return {
    ...DEFAULT_RESOLVED_CONFIG,
    ...config,
    templatePaths: config.templatePaths ?? [],
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
 * Re-exported from core for backward compatibility.
 */
export { getErrorMessage as extractErrorMessage } from '../core/index.js';
