/**
 * Types, schemas, and test helpers for the orchestrate MCP tool.
 * Extracted from orchestrate.ts for file size compliance (Issue #708).
 *
 * @module mcp/tools/orchestrate-types
 */

import { z } from 'zod';
import type { Result, Task } from '../../core/index.js';
import { ok, AgentError } from '../../core/index.js';
import { clamp } from '../../utils/math-utils.js';
import type { IOrchestrator, OrchestratorType } from '../../core/types/orchestrator.js';
import type { WorkflowPattern } from '../../orchestration/workflow-router-types.js';
import type { IMcpNotifier } from '../mcp-notifier.js';
import type { BaseMcpToolDeps } from './tool-result.js';
import type { ExecutionPlan } from '../../agents/index.js';
import { OrchestratorFactory } from '../../orchestration/orchestrator-factory.js';

// ============================================================================
// Input / Output Schemas
// ============================================================================

export const OrchestrateInputSchema = z.object({
  task: z.string().min(1).max(50000).describe('Task description to orchestrate'),
  context: z.record(z.string(), z.unknown()).optional().describe('Additional context for the task'),
  maxIterations: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe('Maximum iterations for orchestration'),
  timeout: z
    .number()
    .min(1000)
    .max(600000)
    .optional()
    .describe('Timeout in milliseconds for orchestration (default: 300000)'),
});

export type OrchestrateInput = z.infer<typeof OrchestrateInputSchema>;

export const OrchestrateOutputSchema = z.object({
  taskId: z.string().describe('Unique execution ID'),
  analysis: z.object({
    taskId: z.string(),
    complexity: z.number().min(1).max(10),
    taskType: z.string(),
    requirements: z.array(z.string()),
    risks: z.array(z.string()),
    needsDecomposition: z.boolean(),
    approach: z.string(),
    estimatedEffort: z.number(),
  }),
  routing: z
    .object({
      pattern: z.string().describe('Selected workflow pattern'),
      reasoning: z.string().describe('Why this pattern was selected'),
      confidence: z.number().min(0).max(1).describe('Routing confidence'),
      orchestratorType: z.string().describe('Mapped OrchestratorType used'),
    })
    .optional()
    .describe('Workflow routing decision (Issue #846)'),
  result: z.unknown().describe('Final execution result'),
  stepsCompleted: z.number().describe('Number of steps completed'),
  metadata: z.object({
    durationMs: z.number(),
    tokensUsed: z.number(),
    expertsUsed: z.array(z.string()),
    /**
     * Populated only when the outer wall-clock deadline fires before
     * `executeOrchestration` settles. Clients inspect this to distinguish a
     * complete low-depth run from a truncated partial result. See #2104.
     */
    timeoutReason: z.string().optional(),
  }),
});

export type OrchestrateOutput = z.infer<typeof OrchestrateOutputSchema>;

/** Tool input schema for MCP registration (mirrors OrchestrateInputSchema). */
export const ORCHESTRATE_TOOL_SCHEMA = {
  task: z.string().min(1).max(50000).describe('Task description to orchestrate'),
  context: z.record(z.string(), z.unknown()).optional().describe('Additional context for the task'),
  maxIterations: z
    .number()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum iterations for orchestration (default: 10)'),
  timeout: z
    .number()
    .min(1000)
    .max(600000)
    .optional()
    .describe('Timeout in milliseconds for orchestration (default: 300000)'),
};

// ============================================================================
// Dependency Interfaces
// ============================================================================

/**
 * Internal task-executor shape used by the SICA orchestrator wrapping cascade.
 * Not exported on public barrels — consumers should use `IOrchestrator`.
 */
export interface ITechLead {
  execute(
    task: Task
  ): Promise<Result<{ taskId: string; output: unknown; metadata: unknown }, AgentError>>;
}

export interface OrchestrateDeps extends BaseMcpToolDeps {
  /** Pre-configured orchestrator instance (unified interface). */
  orchestrator?: IOrchestrator;
  /** Model adapter for fallback orchestration path (Issue #827) */
  modelAdapter?: import('../../core/index.js').IModelAdapter | undefined;
  /** MCP notifier for client-visible logging (Issue #974) */
  notifier?: IMcpNotifier | undefined;
}

// ============================================================================
// Routing Helpers (Issue #846)
// ============================================================================

/** Routing info included in orchestrate output. */
export interface RoutingInfo {
  readonly pattern: string;
  readonly reasoning: string;
  readonly confidence: number;
  readonly orchestratorType: string;
}

/** Maps WorkflowPattern to OrchestratorType. */
export function mapPatternToOrchestratorType(pattern: WorkflowPattern): OrchestratorType {
  if (pattern === 'puppeteer') return 'puppeteer';
  return 'tech_lead';
}

// ============================================================================
// Error Classes
// ============================================================================

export class OrchestrationError extends AgentError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(message, options);
    this.name = 'OrchestrationError';
  }
}

/** Error when orchestration is unavailable (no model adapter). Issue #554. */
export class OrchestrationUnavailableError extends AgentError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(message, options);
    this.name = 'OrchestrationUnavailableError';
  }
}

// ============================================================================
// Mock Factories (Testing)
// ============================================================================

/**
 * Internal mock task executor used by `createMockOrchestrator`. Not exported.
 */
function createMockTaskExecutor(): ITechLead {
  return {
    execute(task: Task) {
      const complexity = clamp(Math.floor(task.description.length / 50), 1, 10);
      const needsDecomposition = complexity > 5;

      const analysis = {
        taskId: task.id,
        complexity,
        taskType: 'implementation',
        requirements: ['Basic implementation required'],
        risks: [],
        needsDecomposition,
        approach: 'Standard execution',
        estimatedEffort: complexity,
      };

      const output: Partial<ExecutionPlan> = {
        taskId: task.id,
        analysis,
        subtasks: [],
        assignments: [],
        parallelGroups: [],
        estimatedDuration: complexity * 10,
      };

      return Promise.resolve(
        ok({
          taskId: task.id,
          output,
          metadata: {
            durationMs: 100,
            tokensUsed: 0,
            toolsUsed: [],
            model: 'mock-tech-lead',
          },
        })
      );
    },
  };
}

/** Creates a mock orchestrator for testing (Issue #595). */
export function createMockOrchestrator(): IOrchestrator {
  const mockExecutor = createMockTaskExecutor();
  const factory = new OrchestratorFactory({
    techLead: mockExecutor as { execute: (task: unknown) => Promise<Result<unknown, unknown>> },
  });
  return factory.create('tech_lead');
}
