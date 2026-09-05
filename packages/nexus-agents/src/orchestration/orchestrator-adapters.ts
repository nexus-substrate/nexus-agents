/**
 * nexus-agents/orchestration - Orchestrator Adapters
 *
 * Adapters wrapping Orchestrator, PuppeteerOrchestrator, WorkflowEngine
 * to implement the unified IOrchestrator interface.
 *
 * @module orchestration/orchestrator-adapters
 * @see docs/adr/0002-orchestrator-interface.md
 */

import type { Result } from '../core/result.js';
import { ok, err } from '../core/result.js';
import { getTimeProvider, createLogger } from '../core/index.js';
import type { ILogger } from '../core/index.js';
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
import { CliNameSchema } from '../config/model-capabilities-types.js';
import type { CliNameLiteral } from '../config/model-capabilities-types.js';
// Shared utilities per ADR-0013
import { generateHyphenId } from '../utils/id-utils.js';

/**
 * Narrow shape of an agent that the OrchestratorAdapter (and the factory
 * config that wires one in) needs. Narrows the input to `Task` so the
 * concrete `Orchestrator` instance can be passed without an `as unknown
 * as` cast (#2944). Keeps the `Result` payload+error wide because the
 * adapter is intentionally resilient to non-`AgentError` failures
 * (see orchestrator-adapters.test.ts "fails with non-Error" coverage).
 */
export interface OrchestratorAgentLike {
  execute(task: Task): Promise<Result<unknown, unknown>>;
}

// Use shared utility for ID generation
function generateId(prefix: string): string {
  return generateHyphenId(prefix, 6);
}

interface ExecutionAttribution {
  readonly executedCli?: CliNameLiteral;
  readonly executedCliSource: 'executed' | 'unknown';
}

/** Reads the measured CLI identity carried by an agent result. */
function getExecutionAttribution(output: unknown): ExecutionAttribution {
  if (typeof output !== 'object' || output === null) return { executedCliSource: 'unknown' };
  const metadata = (output as Record<string, unknown>)['metadata'];
  if (typeof metadata !== 'object' || metadata === null) return { executedCliSource: 'unknown' };
  const fields = metadata as Record<string, unknown>;
  const parsedCli = CliNameSchema.safeParse(fields['executedCli']);
  if (!parsedCli.success || fields['executedCliSource'] !== 'executed') {
    return { executedCliSource: 'unknown' };
  }
  return { executedCli: parsedCli.data, executedCliSource: 'executed' };
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
    // `OrchestratorAgentLike.execute` returns `Result<unknown, unknown>` — no
    // usage metadata reaches this seam, so there is nothing to count. Say so
    // rather than reporting a zero that reads as a measurement (#4829).
    tokensUsed: 0,
    tokensMeasured: false,
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
    // Every step is unmeasured (see createStep), so the total is too (#4829).
    totalTokensUsed: 0,
    tokensMeasured: steps.every((s) => s.tokensMeasured !== false),
    agentsUsed: steps.map((s) => s.agentId),
    executedCliSource: 'unknown',
  };
}

/** Maximum history entries retained per adapter to prevent unbounded memory growth. */
const MAX_HISTORY = 100;
/** Maximum completed/cancelled executions retained in the status map. */
const MAX_EXECUTIONS = 200;

/** Trims an array to keep only the last N entries. */
function trimArray(arr: unknown[], max: number): void {
  if (arr.length > max) {
    arr.splice(0, arr.length - max);
  }
}

/** Evicts completed/cancelled entries from an executions map when over limit. */
function evictCompletedExecutions(map: Map<string, ExecutionStatus>, max: number): void {
  if (map.size <= max) return;
  for (const [id, status] of map) {
    if (status.state === 'completed' || status.state === 'cancelled') {
      map.delete(id);
    }
    if (map.size <= max) return;
  }
}

const COMPLETED_STATUS: ExecutionStatus = {
  state: 'completed',
  result: { executionId: '', workflowName: '', stepResults: [], output: {}, totalDurationMs: 0 },
};

/**
 * Orchestrator adapter implementing IOrchestrator.
 * Wraps the core Orchestrator agent for task decomposition and delegation.
 * (Issue #663: Enhanced error logging — errors were previously swallowed silently)
 * (Issue #759: Renamed from TechLeadAdapter to OrchestratorAdapter)
 */
export class OrchestratorAdapter implements IOrchestrator {
  readonly id = generateId('orchestrator');
  readonly type: OrchestratorType = 'orchestrator';
  private readonly executions = new Map<string, ExecutionStatus>();
  private readonly history: OrchestratorResult[] = [];
  private readonly logger: ILogger;
  private agent: OrchestratorAgentLike | null = null;

  constructor(logger?: ILogger) {
    this.logger = logger ?? createLogger({ component: 'OrchestratorAdapter' });
  }

  setOrchestrator(agent: OrchestratorAgentLike): void {
    this.agent = agent;
  }

  async execute(
    definition: OrchestratorDefinition,
    _inputs: Record<string, unknown>,
    _options?: OrchestratorExecuteOptions
  ): Promise<Result<OrchestratorResult, OrchestratorError>> {
    if (definition.type !== 'task') {
      return err(
        new OrchestratorError('Orchestrator only supports task definitions', 'INVALID_DEFINITION')
      );
    }
    const execId = generateId('exec'),
      start = getTimeProvider().now();
    this.executions.set(execId, { state: 'running', currentStep: 'executing', progress: 0 });

    const agentResult = await this.runOrchestrator(definition.task);
    if (!agentResult.ok) {
      this.executions.set(execId, COMPLETED_STATUS);
      return err(agentResult.error);
    }

    const output = agentResult.value;
    const step = createStep(
      'orchestrator',
      'Execute task',
      output,
      getTimeProvider().now() - start
    );
    const result = {
      ...createResult(execId, 'orchestrator', [step], output, getTimeProvider().now() - start),
      ...getExecutionAttribution(output),
    };

    this.executions.set(execId, COMPLETED_STATUS);
    this.history.push(result);
    trimArray(this.history, MAX_HISTORY);
    evictCompletedExecutions(this.executions, MAX_EXECUTIONS);
    return ok(result);
  }

  private async runOrchestrator(task: Task): Promise<Result<unknown, OrchestratorError>> {
    if (this.agent === null) {
      this.logger.warn('Orchestrator agent not wired — returning empty result');
      return ok({});
    }
    const r = await this.agent.execute(task);
    if (!r.ok) {
      const errorMsg = r.error instanceof Error ? r.error.message : String(r.error);
      this.logger.error('Orchestrator execution failed', undefined, {
        taskId: task.id,
        error: errorMsg,
      });
      return err(
        new OrchestratorError(`Orchestrator execution failed: ${errorMsg}`, 'AGENT_ERROR')
      );
    }
    return ok(r.value);
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
    trimArray(this.history, MAX_HISTORY);
    evictCompletedExecutions(this.executions, MAX_EXECUTIONS);
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
    trimArray(this.history, MAX_HISTORY);
    evictCompletedExecutions(this.executions, MAX_EXECUTIONS);
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
