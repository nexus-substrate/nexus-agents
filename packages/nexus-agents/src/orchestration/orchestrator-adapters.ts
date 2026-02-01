/**
 * nexus-agents/orchestration - Orchestrator Adapters
 *
 * Adapters wrapping TechLead, PuppeteerOrchestrator, WorkflowEngine
 * to implement the unified IOrchestrator interface.
 *
 * @module orchestration/orchestrator-adapters
 * @see docs/adr/0002-orchestrator-interface.md
 */

import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { getTimeProvider } from '../core/index.js';
import type { Task, ExecutionStatus } from '../core/types/index.js';
import type {
  IOrchestrator,
  OrchestratorType,
  OrchestratorDefinition,
  OrchestratorExecuteOptions,
  OrchestratorResult,
  OrchestratorStep,
} from '../core/types/orchestrator.js';
import { OrchestratorError } from '../core/types/orchestrator.js';
// Shared utilities per ADR-0013
import { generateHyphenId } from '../utils/id-utils.js';

// Use shared utility for ID generation
function generateId(prefix: string): string {
  return generateHyphenId(prefix, 6);
}

function createStep(
  id: string,
  action: string,
  output: unknown,
  durationMs: number
): OrchestratorStep {
  return {
    id,
    agentId: id,
    role: 'custom',
    action,
    output,
    durationMs,
    tokensUsed: 0,
    status: 'success',
    error: undefined,
  };
}

function createResult(
  execId: string,
  type: OrchestratorType,
  steps: OrchestratorStep[],
  output: unknown,
  durationMs: number
): OrchestratorResult {
  return {
    executionId: execId,
    orchestratorType: type,
    steps,
    output,
    totalDurationMs: durationMs,
    totalTokensUsed: 0,
    agentsUsed: steps.map((s) => s.agentId),
  };
}

const COMPLETED_STATUS: ExecutionStatus = {
  state: 'completed',
  result: { executionId: '', workflowName: '', stepResults: [], output: {}, totalDurationMs: 0 },
};

/**
 * TechLead adapter implementing IOrchestrator.
 */
export class TechLeadAdapter implements IOrchestrator {
  readonly id = generateId('tech-lead');
  readonly type: OrchestratorType = 'tech_lead';
  private readonly executions = new Map<string, ExecutionStatus>();
  private readonly history: OrchestratorResult[] = [];
  private techLead: { execute: (task: Task) => Promise<Result<unknown, unknown>> } | null = null;

  setTechLead(tl: { execute: (task: Task) => Promise<Result<unknown, unknown>> }): void {
    this.techLead = tl;
  }

  async execute(
    definition: OrchestratorDefinition,
    inputs: Record<string, unknown>,
    _options?: OrchestratorExecuteOptions
  ): Promise<Result<OrchestratorResult, OrchestratorError>> {
    if (definition.type !== 'task') {
      return err(
        new OrchestratorError('TechLead only supports task definitions', 'INVALID_DEFINITION')
      );
    }
    const execId = generateId('exec'),
      start = getTimeProvider().now();
    this.executions.set(execId, { state: 'running', currentStep: 'executing', progress: 0 });

    const output = this.techLead !== null ? await this.runTechLead(definition.task) : inputs;
    const step = createStep('tech-lead', 'Execute task', output, getTimeProvider().now() - start);
    const result = createResult(
      execId,
      'tech_lead',
      [step],
      output,
      getTimeProvider().now() - start
    );

    this.executions.set(execId, COMPLETED_STATUS);
    this.history.push(result);
    return ok(result);
  }

  private async runTechLead(task: Task): Promise<unknown> {
    if (this.techLead === null) return {};
    const r = await this.techLead.execute(task);
    return r.ok ? r.value : {};
  }

  getStatus(execId: string): ExecutionStatus {
    return this.executions.get(execId) ?? { state: 'pending' };
  }
  cancel(execId: string, _reason?: string): Promise<Result<void, OrchestratorError>> {
    if (!this.executions.has(execId))
      return Promise.resolve(err(new OrchestratorError('Not found', 'CANCELLED')));
    this.executions.set(execId, {
      state: 'cancelled',
      cancelledAt: getTimeProvider().nowIso(),
    });
    return Promise.resolve(ok(undefined));
  }
  getHistory(limit = 10): OrchestratorResult[] {
    return this.history.slice(-limit);
  }
}

/**
 * Puppeteer adapter implementing IOrchestrator.
 */
export class PuppeteerAdapter implements IOrchestrator {
  readonly id = generateId('puppeteer');
  readonly type: OrchestratorType = 'puppeteer';
  private readonly executions = new Map<string, ExecutionStatus>();
  private readonly history: OrchestratorResult[] = [];
  private puppeteer: { execute: (task: unknown) => Promise<Result<unknown, unknown>> } | null =
    null;

  setPuppeteer(pp: { execute: (task: unknown) => Promise<Result<unknown, unknown>> }): void {
    this.puppeteer = pp;
  }

  async execute(
    definition: OrchestratorDefinition,
    inputs: Record<string, unknown>,
    _options?: OrchestratorExecuteOptions
  ): Promise<Result<OrchestratorResult, OrchestratorError>> {
    if (definition.type !== 'policy') {
      return err(
        new OrchestratorError('Puppeteer requires policy definitions', 'INVALID_DEFINITION')
      );
    }
    const execId = generateId('exec'),
      start = getTimeProvider().now();
    this.executions.set(execId, { state: 'running', currentStep: 'executing', progress: 0 });

    const output =
      this.puppeteer !== null
        ? await this.runPuppeteer(definition)
        : { ...inputs, ...definition.initialState };
    const step = createStep(
      'puppeteer',
      `Policy: ${definition.policyId}`,
      output,
      getTimeProvider().now() - start
    );
    const result = createResult(
      execId,
      'puppeteer',
      [step],
      output,
      getTimeProvider().now() - start
    );

    this.executions.set(execId, COMPLETED_STATUS);
    this.history.push(result);
    return ok(result);
  }

  private async runPuppeteer(def: {
    policyId: string;
    initialState: Record<string, unknown>;
  }): Promise<unknown> {
    if (this.puppeteer === null) return {};
    const r = await this.puppeteer.execute({ id: def.policyId, ...def.initialState });
    return r.ok ? r.value : {};
  }

  getStatus(execId: string): ExecutionStatus {
    return this.executions.get(execId) ?? { state: 'pending' };
  }
  cancel(execId: string, _reason?: string): Promise<Result<void, OrchestratorError>> {
    if (!this.executions.has(execId))
      return Promise.resolve(err(new OrchestratorError('Not found', 'CANCELLED')));
    this.executions.set(execId, {
      state: 'cancelled',
      cancelledAt: getTimeProvider().nowIso(),
    });
    return Promise.resolve(ok(undefined));
  }
  getHistory(limit = 10): OrchestratorResult[] {
    return this.history.slice(-limit);
  }
}

/**
 * Workflow adapter implementing IOrchestrator.
 */
export class WorkflowAdapter implements IOrchestrator {
  readonly id = generateId('workflow');
  readonly type: OrchestratorType = 'workflow';
  private readonly executions = new Map<string, ExecutionStatus>();
  private readonly history: OrchestratorResult[] = [];
  private engine: {
    loadTemplate: (p: string) => Promise<Result<unknown, unknown>>;
    execute: (w: unknown, i: Record<string, unknown>) => Promise<Result<unknown, unknown>>;
  } | null = null;

  setWorkflowEngine(we: typeof this.engine): void {
    this.engine = we;
  }

  async execute(
    definition: OrchestratorDefinition,
    inputs: Record<string, unknown>,
    _options?: OrchestratorExecuteOptions
  ): Promise<Result<OrchestratorResult, OrchestratorError>> {
    if (definition.type !== 'workflow') {
      return err(
        new OrchestratorError('WorkflowEngine requires workflow definitions', 'INVALID_DEFINITION')
      );
    }
    const execId = generateId('exec'),
      start = getTimeProvider().now();
    this.executions.set(execId, { state: 'running', currentStep: 'executing', progress: 0 });

    const output =
      this.engine !== null ? await this.runWorkflow(definition.templatePath, inputs) : inputs;
    const step = createStep(
      'workflow',
      `Template: ${definition.templatePath}`,
      output,
      getTimeProvider().now() - start
    );
    const result = createResult(
      execId,
      'workflow',
      [step],
      output,
      getTimeProvider().now() - start
    );

    this.executions.set(execId, COMPLETED_STATUS);
    this.history.push(result);
    return ok(result);
  }

  private async runWorkflow(path: string, inputs: Record<string, unknown>): Promise<unknown> {
    if (this.engine === null) return {};
    const load = await this.engine.loadTemplate(path);
    if (!load.ok) return {};
    const exec = await this.engine.execute(load.value, inputs);
    return exec.ok ? exec.value : {};
  }

  getStatus(execId: string): ExecutionStatus {
    return this.executions.get(execId) ?? { state: 'pending' };
  }
  cancel(execId: string, _reason?: string): Promise<Result<void, OrchestratorError>> {
    if (!this.executions.has(execId))
      return Promise.resolve(err(new OrchestratorError('Not found', 'CANCELLED')));
    this.executions.set(execId, {
      state: 'cancelled',
      cancelledAt: getTimeProvider().nowIso(),
    });
    return Promise.resolve(ok(undefined));
  }
  getHistory(limit = 10): OrchestratorResult[] {
    return this.history.slice(-limit);
  }
}

export type { IOrchestrator, OrchestratorType, OrchestratorResult };
