/**
 * nexus-agents/orchestration - Orchestrator Factory
 *
 * Factory for creating IOrchestrator instances.
 * Provides a unified entry point for all orchestration strategies.
 *
 * Per ADR-0002: Unified Interface + Adapters pattern.
 *
 * @module orchestration/orchestrator-factory
 * @see docs/adr/0002-orchestrator-interface.md
 */

import { randomUUID } from 'node:crypto';
import type { Result, IModelAdapter } from '../core/index.js';
import {
  ok,
  err,
  createLogger,
  getTimeProvider,
  getErrorMessage,
  type ILogger,
} from '../core/index.js';
import type {
  IOrchestrator,
  IOrchestratorFactory,
  OrchestratorType,
  OrchestratorDefinition,
  OrchestratorExecuteOptions,
  OrchestratorResult,
  OrchestratorStep,
} from '../core/types/orchestrator.js';
import { OrchestratorError } from '../core/types/orchestrator.js';
import type { ExecutionStatus, IWorkflowEngine, WorkflowResult } from '../core/index.js';
import {
  createProductionWorkflowEngine,
  type WorkflowEngineFactoryConfig,
} from '../workflows/workflow-engine-factory.js';
import { TechLeadAdapter, PuppeteerAdapter } from './orchestrator-adapters.js';

// ============================================================================
// Workflow Orchestrator Adapter
// ============================================================================

/**
 * Configuration for WorkflowOrchestratorAdapter.
 */
export interface WorkflowAdapterConfig extends WorkflowEngineFactoryConfig {
  /** Custom logger */
  logger?: ILogger;
}

/**
 * Adapter that wraps IWorkflowEngine with IOrchestrator interface.
 *
 * This adapter bridges the workflow-specific interface to the canonical
 * orchestrator interface, enabling workflow-based orchestration through
 * the unified IOrchestrator contract.
 */
export class WorkflowOrchestratorAdapter implements IOrchestrator {
  readonly id: string;
  readonly type: OrchestratorType = 'workflow';

  private readonly engine: IWorkflowEngine;
  private readonly logger: ILogger;
  private readonly executions = new Map<string, ExecutionStatus>();
  private readonly history: OrchestratorResult[] = [];

  constructor(engine: IWorkflowEngine, logger?: ILogger) {
    this.id = `workflow-${randomUUID().slice(0, 8)}`;
    this.engine = engine;
    this.logger = logger ?? createLogger({ component: 'WorkflowOrchestratorAdapter' });
  }

  async execute(
    definition: OrchestratorDefinition,
    inputs: Record<string, unknown>,
    _options?: OrchestratorExecuteOptions
  ): Promise<Result<OrchestratorResult, OrchestratorError>> {
    if (definition.type !== 'workflow') {
      return err(
        new OrchestratorError(
          `WorkflowOrchestratorAdapter only supports workflow definitions, got: ${definition.type}`,
          'INVALID_DEFINITION'
        )
      );
    }

    const executionId = randomUUID();
    const startTime = getTimeProvider().now();
    this.setRunning(executionId);

    try {
      return await this.executeWorkflow(definition.templatePath, inputs, executionId, startTime);
    } catch (error) {
      const message = getErrorMessage(error);
      this.setFailed(executionId, message);
      return err(new OrchestratorError(`Unexpected error: ${message}`, 'STEP_FAILED'));
    }
  }

  private setRunning(executionId: string): void {
    this.executions.set(executionId, { state: 'running', currentStep: 'loading', progress: 0 });
  }

  private setFailed(executionId: string, error: string): void {
    this.executions.set(executionId, { state: 'failed', error });
  }

  private async executeWorkflow(
    templatePath: string,
    inputs: Record<string, unknown>,
    executionId: string,
    startTime: number
  ): Promise<Result<OrchestratorResult, OrchestratorError>> {
    // Load workflow template
    const loadResult = await this.engine.loadTemplate(templatePath);
    if (!loadResult.ok) {
      this.setFailed(executionId, loadResult.error.message);
      return err(
        new OrchestratorError(
          `Failed to load workflow template: ${loadResult.error.message}`,
          'INVALID_DEFINITION'
        )
      );
    }

    const workflow = loadResult.value;
    this.logger.info('Loaded workflow', { name: workflow.name, stepCount: workflow.steps.length });

    // Execute workflow
    const executeResult = await this.engine.execute(workflow, inputs);
    if (!executeResult.ok) {
      this.setFailed(executionId, executeResult.error.message);
      return err(
        new OrchestratorError(
          `Workflow execution failed: ${executeResult.error.message}`,
          'STEP_FAILED'
        )
      );
    }

    // Convert and store result
    const orchestratorResult = this.convertWorkflowResult(
      executionId,
      executeResult.value,
      startTime
    );
    this.executions.set(executionId, { state: 'completed', result: executeResult.value });
    this.addToHistory(orchestratorResult);

    return ok(orchestratorResult);
  }

  private addToHistory(result: OrchestratorResult): void {
    this.history.push(result);
    if (this.history.length > 100) {
      this.history.shift();
    }
  }

  getStatus(executionId: string): ExecutionStatus {
    return this.executions.get(executionId) ?? { state: 'pending' };
  }

  async cancel(executionId: string, reason?: string): Promise<Result<void, OrchestratorError>> {
    const status = this.executions.get(executionId);
    if (status === undefined) {
      return err(
        new OrchestratorError(`Execution not found: ${executionId}`, 'INVALID_DEFINITION')
      );
    }

    if (status.state !== 'running') {
      return err(
        new OrchestratorError(
          `Cannot cancel execution in state: ${status.state}`,
          'INVALID_DEFINITION'
        )
      );
    }

    const cancelResult = await this.engine.cancel(executionId);
    if (!cancelResult.ok) {
      return err(
        new OrchestratorError(`Failed to cancel: ${cancelResult.error.message}`, 'CANCELLED')
      );
    }

    this.executions.set(executionId, {
      state: 'cancelled',
      cancelledAt: getTimeProvider().nowIso(),
    });

    this.logger.info('Cancelled execution', { executionId, reason });
    return ok(undefined);
  }

  getHistory(limit?: number): OrchestratorResult[] {
    const count = limit ?? 10;
    return this.history.slice(-count);
  }

  private convertWorkflowResult(
    executionId: string,
    result: WorkflowResult,
    startTime: number
  ): OrchestratorResult {
    const steps: OrchestratorStep[] = result.stepResults.map((sr) => ({
      id: sr.stepId,
      agentId: `workflow-step-${sr.stepId}`,
      role: 'custom' as const,
      action: sr.stepId,
      output: sr.output,
      durationMs: sr.durationMs,
      tokensUsed: 0, // Workflow steps don't track tokens directly
      status: sr.status,
      error: sr.error,
    }));

    return {
      executionId,
      orchestratorType: 'workflow',
      steps,
      output: result.output,
      totalDurationMs: getTimeProvider().now() - startTime,
      totalTokensUsed: 0,
      agentsUsed: steps.map((s) => s.agentId),
    };
  }
}

// ============================================================================
// Orchestrator Factory
// ============================================================================

/**
 * Configuration for OrchestratorFactory.
 * (Enhanced per ADR-0014 - Orchestrator Interface Unification)
 */
export interface OrchestratorFactoryConfig {
  /** Logger instance */
  logger?: ILogger;
  /** Model adapter for agent-based orchestrators */
  modelAdapter?: IModelAdapter;
  /** Workflow engine config */
  workflowConfig?: WorkflowEngineFactoryConfig;
  /** Pre-created TechLead instance for tech_lead orchestrator */
  techLead?: { execute: (task: unknown) => Promise<Result<unknown, unknown>> };
  /** Pre-created PuppeteerOrchestrator instance */
  puppeteerOrchestrator?: { execute: (task: unknown) => Promise<Result<unknown, unknown>> };
}

/**
 * Factory for creating IOrchestrator instances.
 *
 * Provides a unified entry point for all orchestration strategies:
 * - workflow: Static template-based execution
 * - tech_lead: LLM-based task decomposition (TechLeadAdapter)
 * - puppeteer: Policy-based step execution (PuppeteerAdapter)
 *
 * @example
 * ```typescript
 * const factory = await createOrchestratorFactory();
 * const orchestrator = factory.create('workflow');
 *
 * const result = await orchestrator.execute(
 *   { type: 'workflow', templatePath: './templates/code-review.yaml' },
 *   { url: 'https://github.com/...' }
 * );
 * ```
 */
export class OrchestratorFactory implements IOrchestratorFactory {
  private readonly logger: ILogger;
  private readonly workflowEngine: IWorkflowEngine | undefined;
  private readonly config: OrchestratorFactoryConfig;

  constructor(config: OrchestratorFactoryConfig, workflowEngine?: IWorkflowEngine) {
    this.config = config;
    this.logger = config.logger ?? createLogger({ component: 'OrchestratorFactory' });
    this.workflowEngine = workflowEngine;
  }

  create(type: OrchestratorType, _config?: Record<string, unknown>): IOrchestrator {
    this.logger.info('Creating orchestrator', { type });

    switch (type) {
      case 'workflow':
        if (this.workflowEngine === undefined) {
          throw new OrchestratorError(
            'WorkflowEngine not initialized. Use createOrchestratorFactory() for async initialization.',
            'NO_AGENTS_AVAILABLE'
          );
        }
        return new WorkflowOrchestratorAdapter(this.workflowEngine, this.logger);

      case 'tech_lead': {
        const adapter = new TechLeadAdapter(this.logger);
        // Wire TechLead instance if provided (ADR-0014)
        if (this.config.techLead !== undefined) {
          adapter.setTechLead(this.config.techLead);
          this.logger.debug('TechLead instance wired to adapter');
        }
        return adapter;
      }

      case 'puppeteer': {
        const adapter = new PuppeteerAdapter();
        // Wire PuppeteerOrchestrator instance if provided (ADR-0014)
        if (this.config.puppeteerOrchestrator !== undefined) {
          adapter.setPuppeteer(this.config.puppeteerOrchestrator);
          this.logger.debug('PuppeteerOrchestrator instance wired to adapter');
        }
        return adapter;
      }

      case 'custom':
        throw new OrchestratorError(
          'Custom orchestrators must be created directly, not via factory.',
          'INVALID_DEFINITION'
        );

      default: {
        const exhaustive: never = type;
        throw new OrchestratorError(
          `Unknown orchestrator type: ${String(exhaustive)}`,
          'INVALID_DEFINITION'
        );
      }
    }
  }

  listTypes(): OrchestratorType[] {
    // All three canonical orchestrator types are now available
    // per ADR-0002 Phase 2 implementation
    return ['workflow', 'tech_lead', 'puppeteer'];
  }
}

/**
 * Creates an OrchestratorFactory with async initialization.
 *
 * This is the recommended way to create an OrchestratorFactory as it
 * properly initializes all async dependencies like the WorkflowEngine.
 *
 * @param config - Factory configuration
 * @returns Promise resolving to initialized OrchestratorFactory
 *
 * @example
 * ```typescript
 * const factory = await createOrchestratorFactory();
 * const types = factory.listTypes(); // ['workflow']
 *
 * const orchestrator = factory.create('workflow');
 * const result = await orchestrator.execute(...);
 * ```
 */
export async function createOrchestratorFactory(
  config?: OrchestratorFactoryConfig
): Promise<IOrchestratorFactory> {
  const logger = config?.logger ?? createLogger({ component: 'OrchestratorFactory' });

  logger.info('Initializing OrchestratorFactory');

  // Initialize workflow engine
  let workflowEngine: IWorkflowEngine | undefined;
  try {
    const workflowConfig: WorkflowEngineFactoryConfig = {
      ...config?.workflowConfig,
      logger,
    };
    if (config?.modelAdapter !== undefined) {
      workflowConfig.modelAdapter = config.modelAdapter;
    }
    workflowEngine = await createProductionWorkflowEngine(workflowConfig);
    logger.info('WorkflowEngine initialized');
  } catch (error) {
    const message = getErrorMessage(error);
    logger.warn('WorkflowEngine initialization failed, workflow orchestration unavailable', {
      error: message,
    });
  }

  return new OrchestratorFactory(config ?? {}, workflowEngine);
}
