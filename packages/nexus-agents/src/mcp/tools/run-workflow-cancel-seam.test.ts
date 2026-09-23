/**
 * Seam test: `cancel_job` stops an in-flight async `run_workflow` (#6305).
 *
 * The chain is runner arity → tool `run:` closure → `handleRunWorkflow` →
 * `WorkflowEngine.execute({ signal })` → the execution's abort controller,
 * read by the engine's phase gate and the parallel executor's per-step
 * dispatch. The runner's `signalAccepted` record follows the closure's arity
 * alone, so it stays green if a middle link drops the signal. This file drives
 * the REAL registered handler, the REAL workflow engine and step executor and
 * the REAL `cancel_job` handler, with a fake expert that counts calls, and
 * asserts that no step runs after the cancel lands — not merely that the
 * record says `cancelled`.
 *
 * @module mcp/tools/run-workflow-cancel-seam.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Task, WorkflowDefinition } from '../../core/index.js';
import { ok } from '../../core/index.js';
import type { Expert } from '../../agents/index.js';
import type { IExpertFactory } from '../../workflows/step-executor.js';
import { createRealWorkflowEngine } from '../../workflows/workflow-engine-factory.js';

vi.mock('./tool-memory.js', () => ({
  getToolMemory: () => ({
    recordTask: vi.fn(),
    recordLearning: vi.fn(),
    recordError: vi.fn(),
    runPromotionPipeline: vi.fn().mockResolvedValue(undefined),
  }),
}));

import { registerRunWorkflowTool } from './run-workflow.js';
import { registerCancelJobTool } from './cancel-job-tool.js';
import { RateLimiter } from '../middleware/index.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency, getInFlight } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

type ToolResponse = { content: Array<{ type: 'text'; text: string }> };
type ToolHandler = (args: unknown) => Promise<ToolResponse>;

function captureHandler(register: (server: McpServer) => void): ToolHandler {
  let handler: ToolHandler | undefined;
  register({
    registerTool(_name: string, _config: unknown, cb: ToolHandler): void {
      handler = cb;
    },
  } as unknown as McpServer);
  if (handler === undefined) throw new Error('handler not registered');
  return handler;
}

const rateLimiter = (): RateLimiter =>
  new RateLimiter({ capacity: 1000, refillRate: 1000, refillIntervalMs: 1000 });

/** Three steps chained by `dependsOn`, so each is its own phase. */
const workflow: WorkflowDefinition = {
  name: 'cancel-seam',
  version: '1.0.0',
  inputs: [],
  steps: [
    { id: 'first', agent: 'code_expert', action: 'analyze', inputs: {} },
    { id: 'second', agent: 'code_expert', action: 'review', inputs: {}, dependsOn: ['first'] },
    { id: 'third', agent: 'code_expert', action: 'report', inputs: {}, dependsOn: ['second'] },
  ],
};

const stepCalls: string[] = [];

/**
 * An expert factory whose experts record every call. The `first` step parks
 * until the test releases it: the window in which the cancel lands mid-run.
 */
function countingExperts(): {
  factory: IExpertFactory;
  firstStarted: Promise<void>;
  release: () => void;
} {
  let started: () => void = () => undefined;
  let release: () => void = () => undefined;
  const firstStarted = new Promise<void>((r) => {
    started = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const factory: IExpertFactory = {
    createForRole: () =>
      ok({
        execute: async (task: Task) => {
          const stepId = String(task.context?.metadata?.['stepId']);
          stepCalls.push(stepId);
          if (stepId === 'first') {
            started();
            await gate;
          }
          return ok({
            taskId: task.id,
            output: `${stepId} done`,
            metadata: { durationMs: 1, tokensUsed: 1, toolsUsed: [], model: 'fake' },
          });
        },
      } as unknown as Expert),
  };
  return { factory, firstStarted, release };
}

function registerWorkflow(factory: IExpertFactory): ToolHandler {
  const engine = createRealWorkflowEngine({
    expertFactory: factory,
    builtInTemplates: new Map([[workflow.name, workflow]]),
  });
  return captureHandler((s) => {
    registerRunWorkflowTool(s, {
      workflowEngine: engine,
      resolveExecutionEngine: () => engine,
      rateLimiter: rateLimiter(),
    });
  });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 500 && getInFlight('run_workflow') > 0; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  if (getInFlight('run_workflow') > 0) throw new Error('run_workflow job never settled');
}

describe('cancel_job interrupts an in-flight run_workflow (#6305)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-rw-cancel-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    stepCalls.length = 0;
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('runs no step after the cancel lands', async () => {
    const fake = countingExperts();
    const run = registerWorkflow(fake.factory);
    const cancel = captureHandler((s) => {
      registerCancelJobTool(s, { rateLimiter: rateLimiter() });
    });

    const env = JSON.parse(
      (await run({ template: workflow.name, inputs: {}, dispatch: 'async' })).content[0]!.text
    ) as Record<string, unknown>;
    expect(env['status']).toBe('pending');
    const jobId = env['jobId'] as string;
    // The runner takes the signal; the rest of this test proves something reads it.
    expect(readJobResult(jobId)?.signalAccepted).toBe(true);

    await fake.firstStarted;
    expect(stepCalls).toEqual(['first']);

    const cancelled = JSON.parse((await cancel({ jobId })).content[0]!.text) as Record<
      string,
      unknown
    >;
    expect(cancelled['outcome']).toBe('cancelled');

    fake.release();
    await settle();

    // Without the gate, `second` and `third` both run after `first` returns.
    expect(stepCalls).toEqual(['first']);
    expect(readJobResult(jobId)?.status).toBe('cancelled');
  });

  it('runs every step when nothing cancels — the empty case', async () => {
    const fake = countingExperts();
    fake.release();
    const run = registerWorkflow(fake.factory);

    const env = JSON.parse(
      (await run({ template: workflow.name, inputs: {}, dispatch: 'async' })).content[0]!.text
    ) as Record<string, unknown>;
    const jobId = env['jobId'] as string;
    await settle();

    expect(stepCalls).toEqual(['first', 'second', 'third']);
    expect(readJobResult(jobId)?.status).toBe('complete');
  });
});
