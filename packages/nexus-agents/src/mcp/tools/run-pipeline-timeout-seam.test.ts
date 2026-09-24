/**
 * Seam test: `run_pipeline`'s `timeoutMs` reaches the vote node's deadline
 * (#6730).
 *
 * The chain is tool schema → `executePipelineBody` → `runAdaptiveOrchestrator`
 * → `runGraphPipeline` → `compilePipelineGraph` → the graph executor's
 * per-node `withTimeout`. `pipeline-graph.test.ts` pins the compiled deadline
 * values; this file drives the REAL registered handler, orchestrator and graph
 * executor with a fake vote stage that takes longer than the old 120 s graph
 * default, so a middle link that drops `timeoutMs` (or the panel-sized default)
 * fails here.
 *
 * @module mcp/tools/run-pipeline-timeout-seam.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DevPipelineStages } from '../../pipeline/dev-pipeline.js';
import { researchContextFromText } from '../../pipeline/research-context.js';
import { GRAPH_TIMEOUTS } from '../../config/timeouts.js';

/** Longer than the 120 s graph default, well inside the panel-sized default. */
const SLOW_VOTE_MS = GRAPH_TIMEOUTS.defaultMs + 30_000;

let fakeStages: DevPipelineStages | undefined;

vi.mock('../../pipeline/agent-executor.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../pipeline/agent-executor.js')>()),
  createAgentStages: () => {
    if (fakeStages === undefined) throw new Error('fake stages not installed');
    return fakeStages;
  },
}));

import { registerPipelineTool } from './pipeline-tool.js';
import { RateLimiter } from '../middleware/index.js';

type ToolResponse = { content: Array<{ type: 'text'; text: string }> };
type ToolHandler = (args: unknown) => Promise<ToolResponse>;

function captureHandler(): ToolHandler {
  let handler: ToolHandler | undefined;
  registerPipelineTool(
    {
      registerTool(_name: string, _config: unknown, cb: ToolHandler): void {
        handler = cb;
      },
    } as never,
    {
      rateLimiter: new RateLimiter({ capacity: 1000, refillRate: 1000, refillIntervalMs: 1000 }),
    }
  );
  if (handler === undefined) throw new Error('handler not registered');
  return handler;
}

let voteStarted = false;

function installStagesWithSlowVote(): void {
  voteStarted = false;
  fakeStages = {
    research: () => Promise.resolve(researchContextFromText('research notes')),
    plan: () => Promise.resolve('1. do the thing'),
    vote: () =>
      new Promise((resolve) => {
        voteStarted = true;
        setTimeout(() => {
          resolve({ kind: 'approved', approvalPercentage: 100 } as never);
        }, SLOW_VOTE_MS);
      }),
    decompose: () => Promise.resolve([] as never),
    implement: () => Promise.resolve('impl'),
    qaReview: () => Promise.resolve({ verdict: 'pass', feedback: 'ok', issues: [] } as never),
    securityScan: () => Promise.resolve({ passed: true, verdict: 'pass', feedback: 'ok' } as const),
  };
}

async function runDryRun(extra: Record<string, unknown>): Promise<string> {
  const pending = captureHandler()({
    task: 'Implement a helper function',
    dryRun: true,
    ...extra,
  });
  let settled = false;
  void pending.finally(() => {
    settled = true;
  });
  // Hold the fake clock until the vote is running: the stages before it do
  // real I/O, and advancing the clock under them would time THEM out instead.
  // `performance` is not faked, so this bound is real wall time.
  const waitUntil = performance.now() + 20_000;
  while (!voteStarted && !settled && performance.now() < waitUntil) {
    await new Promise((r) => setImmediate(r));
  }
  if (!voteStarted) throw new Error(`vote stage never started: ${String(settled)}`);
  for (let i = 0; i < 200 && !settled; i++) await vi.advanceTimersByTimeAsync(5_000);
  if (!settled) throw new Error('run_pipeline never settled');
  return (await pending).content[0]!.text;
}

describe('run_pipeline stage deadlines (#6730)', () => {
  beforeEach(() => {
    // setImmediate stays real: the helper yields on it while real I/O runs.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    installStagesWithSlowVote();
  });

  afterEach(() => {
    vi.useRealTimers();
    fakeStages = undefined;
  });

  it('lets a vote slower than the graph default finish under default settings', async () => {
    const text = await runDryRun({});

    expect(text).not.toContain('timed out');
    expect(JSON.parse(text)).toMatchObject({ success: true });
  });

  it('runs the vote under the caller-supplied timeoutMs', async () => {
    const timeoutMs = 30_000;

    const text = await runDryRun({ timeoutMs });

    expect(text).toContain(`vote: Node timed out after ${String(timeoutMs)}ms`);
  });
});
