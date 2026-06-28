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
  /**
   * Async-mode dispatch (#3042, Stage 1 of epic #2631). Default `sync` —
   * backward-compat invariant; existing callers see no behavior change.
   * `async` returns `{ status: 'pending', jobId }` immediately; caller
   * polls `get_job_result(jobId)` for the structured payload. Sidesteps
   * the MCP-SDK 60s client-request timeout that was killing long
   * orchestrations (#2631 evidence: 28.6% timeout-shaped errors on
   * `run_workflow` at the gate-firing measurement).
   *
   * Kept optional (no `.default()`) so the inferred type doesn't force
   * `mode: 'sync'` on every existing call site / test fixture. The
   * handler treats `undefined` as `'sync'`.
   */
  mode: z
    .enum(['sync', 'async'])
    .optional()
    .describe('Dispatch mode (default: sync). Use "async" for long-running orchestrations.'),
  /**
   * Idempotency key for async-mode replay-safety (#3042 Stage 1c / epic
   * #2631). When set: identical (key, inputs) returns the existing job;
   * same key with different inputs fails closed with
   * `idempotency_key_collision`. Without a key, every call gets a fresh
   * jobId (existing behavior). Sync mode ignores this — sync calls are
   * synchronous by definition and the caller can dedupe themselves.
   */
  idempotencyKey: z
    .string()
    .min(1)
    .max(256)
    .optional()
    .describe(
      'Replay-safe key for async-mode dispatch (#3042 Stage 1c). Same (key, inputs) returns existing jobId; same key + different inputs fails closed.'
    ),
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
  /**
   * Aggregate status of worker dispatch when subtasks were dispatched
   * (#2619 bug 1). `success` = all workers returned; `partial` = some
   * workers errored or timed out; `failed` = every dispatched worker
   * errored. Absent when worker dispatch did not run (no decomposition
   * or feature disabled). When `failed`, the tool result is also
   * surfaced as an MCP error (`isError: true`) so callers that only
   * check the outer status see the failure.
   */
  workerDispatchStatus: z.enum(['success', 'partial', 'failed']).optional(),
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
  mode: z
    .enum(['sync', 'async'])
    .optional()
    .describe(
      'Dispatch mode (default: sync). "async" returns { jobId } immediately; poll via get_job_result.'
    ),
  idempotencyKey: z
    .string()
    .min(1)
    .max(256)
    .optional()
    .describe(
      'Replay-safe key for async-mode dispatch (#3042 Stage 1c). Same (key, inputs) returns existing jobId.'
    ),
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
  /**
   * Durable, hash-chained audit logger (#4097). When present, ClawGuard
   * AUDIT-mode violations during the orchestrator's nested tool calls are
   * persisted to the shared store. Absent on the pure-CLI path → no trail.
   */
  auditLogger?: import('../../audit/audit-types.js').IAuditLogger;
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
  return 'orchestrator';
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
  // Cast no longer needed (#2944) — factory `techLead` is now
  // `OrchestratorAgentLike`, which `ITechLead` satisfies by covariance.
  const factory = new OrchestratorFactory({ techLead: mockExecutor });
  return factory.create('orchestrator');
}
