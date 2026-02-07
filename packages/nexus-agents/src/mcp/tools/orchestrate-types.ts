/**
 * Types, schemas, and test helpers for the orchestrate MCP tool.
 * Extracted from orchestrate.ts for file size compliance (Issue #708).
 *
 * @module mcp/tools/orchestrate-types
 */

import { z } from 'zod';
import type { Result, ILogger, Task } from '../../core/index.js';
import { ok, AgentError } from '../../core/index.js';
import { clamp } from '../../utils/math-utils.js';
import type { IOrchestrator, OrchestratorType } from '../../core/types/orchestrator.js';
import type { WorkflowPattern } from '../../orchestration/workflow-router-types.js';
import type { RateLimiter } from '../middleware/rate-limiter.js';
import type { SecurityConfig } from '../../config/schemas.js';
import type { ExecutionPlan, Expert } from '../../agents/index.js';
import { OrchestratorFactory } from '../../orchestration/orchestrator-factory.js';

// ============================================================================
// Input / Output Schemas
// ============================================================================

export const OrchestrateInputSchema = z.object({
  task: z.string().min(1).describe('Task description to orchestrate'),
  context: z.record(z.unknown()).optional().describe('Additional context for the task'),
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
    .describe('Timeout in milliseconds for orchestration (default: 120000)'),
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
  }),
});

export type OrchestrateOutput = z.infer<typeof OrchestrateOutputSchema>;

/** Tool input schema for MCP registration (mirrors OrchestrateInputSchema). */
export const ORCHESTRATE_TOOL_SCHEMA = {
  task: z.string().min(1).describe('Task description to orchestrate'),
  context: z.record(z.unknown()).optional().describe('Additional context for the task'),
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
    .describe('Timeout in milliseconds for orchestration (default: 120000)'),
};

// ============================================================================
// Dependency Interfaces
// ============================================================================

/**
 * @deprecated Use IOrchestrator from core/types/orchestrator.js instead.
 * Will be removed in v3.0. (Issue #595)
 */
export interface ITechLead {
  execute(
    task: Task
  ): Promise<Result<{ taskId: string; output: unknown; metadata: unknown }, AgentError>>;
}

/**
 * @deprecated Not used with unified orchestrator pattern.
 * Will be removed in v3.0. (Issue #595)
 */
export interface IExpertFactory {
  createBuiltIn(type: string): Result<Expert, AgentError>;
}

export interface OrchestrateDeps {
  /** Pre-configured orchestrator instance (unified interface). */
  orchestrator?: IOrchestrator;
  /** @deprecated Use orchestrator instead. Will be removed in v3.0. */
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Intentional: deprecated API for backwards compat
  techLead?: ITechLead;
  /** @deprecated Not used with unified orchestrator pattern. Will be removed in v3.0. */
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Intentional: deprecated API for backwards compat
  expertFactory?: IExpertFactory;
  logger?: ILogger;
  rateLimiter: RateLimiter;
  security?: SecurityConfig | undefined;
  /** Model adapter for fallback orchestration path (Issue #827) */
  modelAdapter?: import('../../core/index.js').IModelAdapter;
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
 * @deprecated Use createMockOrchestrator instead. Will be removed in v3.0.
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Deprecated export for backwards compatibility
export function createMockTechLead(): ITechLead {
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
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Using deprecated for backwards compat
  const mockTechLead = createMockTechLead();
  const factory = new OrchestratorFactory({
    techLead: mockTechLead as { execute: (task: unknown) => Promise<Result<unknown, unknown>> },
  });
  return factory.create('tech_lead');
}
