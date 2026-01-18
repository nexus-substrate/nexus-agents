/**
 * Workflow Engine Types - Interface definitions for WorkflowEngine.
 *
 * This module contains dependency interfaces and internal tracking types
 * extracted from workflow-engine.ts to keep files under 400 lines.
 */

import type { Result, ILogger } from '../core/index.js';
import type { WorkflowDefinition, StepResult, ExecutionStatus } from '../core/index.js';
import type { ParseError } from '../core/index.js';
import type { WorkflowError } from '../core/index.js';
import type { ContextManager } from '../agents/context-manager.js';
import type {
  ExecutionPlan,
  ExecutionContext,
  ExecutionOptions,
} from './workflow-engine-helpers.js';
import type { WorkflowStep } from './workflow-types.js';

/** Dependencies for workflow engine. */
export interface WorkflowEngineDeps {
  parseWorkflow: (
    content: string,
    format: 'yaml' | 'json'
  ) => Result<WorkflowDefinition, ParseError>;
  loadWorkflowFile: (path: string) => Promise<Result<WorkflowDefinition, ParseError>>;
  createExecutionPlan: (workflow: WorkflowDefinition) => Result<ExecutionPlan, WorkflowError>;
  executePhase: (
    steps: WorkflowStep[],
    context: ExecutionContext,
    options: ExecutionOptions
  ) => Promise<Result<StepResult[], WorkflowError>>;
  getBuiltInTemplates: () => Map<string, WorkflowDefinition>;
}

/** Active workflow execution tracking. */
export interface ActiveExecution {
  executionId: string;
  workflowName: string;
  status: ExecutionStatus;
  context: ExecutionContext;
  startTime: number;
}

/** Logger for workflow engine operations. */
export type WorkflowEngineLogger = ILogger;

/** Context manager instance type. */
export type WorkflowContextManager = ContextManager;
