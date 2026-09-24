/**
 * Seam test: `run_dev_pipeline`'s `timeoutMs` reaches each stage's deadline
 * (#6736).
 *
 * The chain is tool schema → `buildPipelineOptions` → `runDevPipeline` →
 * `guardDevPipelineStages` → the stage call. `dev-pipeline-deadlines.test.ts`
 * pins the resolved values; this file drives the REAL registered handler and
 * the REAL `runDevPipeline` with a fake vote stage that never settles, so a
 * middle link that drops `timeoutMs` (or the panel-sized default) fails here,
 * and asserts the signal the stage was handed is aborted — not merely that the
 * envelope says "timed out".
 *
 * @module mcp/tools/run-dev-pipeline-timeout-seam.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { DevPipelineStages, VoteResult } from '../../pipeline/dev-pipeline.js';
import { researchContextFromText } from '../../pipeline/research-context.js';
import { resolveClassGuardMs } from '../../config/timeouts.js';

let fakeStages: DevPipelineStages | undefined;

vi.mock('../../pipeline/agent-executor.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../pipeline/agent-executor.js')>()),
  createAgentStages: () => {
    if (fakeStages === undefined) throw new Error('fake stages not installed');
    return fakeStages;
  },
}));

import { registerDevPipelineTool } from './dev-pipeline-tool.js';
import { RateLimiter } from '../middleware/index.js';

type ToolResponse = { content: Array<{ type: 'text'; text: string }> };
type ToolHandler = (args: unknown) => Promise<ToolResponse>;

function captureHandler(): ToolHandler {
  let handler: ToolHandler | undefined;
  registerDevPipelineTool(
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

let voteSignal: AbortSignal | undefined;

/** Stages whose vote never settles: only its deadline can end the run. */
function installStagesWithHungVote(): void {
  voteSignal = undefined;
  fakeStages = {
    research: () => Promise.resolve(researchContextFromText('research notes')),
    plan: () => Promise.resolve('1. do the thing'),
    vote: (_plan, _research, signal) => {
      voteSignal = signal;
      return new Promise<VoteResult>(() => undefined);
    },
    decompose: () => Promise.resolve([]),
    implement: () => Promise.resolve('impl'),
    qaReview: () => Promise.resolve({ verdict: 'pass', feedback: 'ok', issues: [] }),
    securityScan: () => Promise.resolve({ passed: true, verdict: 'pass', feedback: 'ok' }),
  };
}

/** Run a dry run (plan + vote, sync) and return the envelope text and elapsed fake time. */
async function runDryRun(extra: Record<string, unknown>): Promise<{ text: string; ms: number }> {
  const pending = captureHandler()({ task: 'Implement a helper function', dryRun: true, ...extra });
  let settled = false;
  void pending.finally(() => {
    settled = true;
  });
  // Hold the fake clock until the vote is running: the steps before it do real
  // I/O. `performance` is not faked, so this bound is real wall time.
  const waitUntil = performance.now() + 20_000;
  while (voteSignal === undefined && !settled && performance.now() < waitUntil) {
    await new Promise((r) => setImmediate(r));
  }
  if (voteSignal === undefined) throw new Error(`vote stage never started: ${String(settled)}`);
  const step = 5_000;
  let ms = 0;
  for (let i = 0; i < 400 && !settled; i++) {
    await vi.advanceTimersByTimeAsync(step);
    ms += step;
  }
  if (!settled) throw new Error('run_dev_pipeline never settled');
  return { text: (await pending).content[0]!.text, ms };
}

describe('run_dev_pipeline stage deadlines (#6736)', () => {
  beforeEach(() => {
    // setImmediate stays real: the helper yields on it while real I/O runs.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    installStagesWithHungVote();
  });

  afterEach(() => {
    vi.useRealTimers();
    fakeStages = undefined;
  });

  it('fails the vote at the caller-supplied timeoutMs and aborts its signal', async () => {
    const timeoutMs = 30_000;

    const { text, ms } = await runDryRun({ timeoutMs });

    expect(text).toContain(`Dev pipeline vote stage timed out after ${String(timeoutMs)}ms`);
    expect(ms).toBe(timeoutMs);
    expect(voteSignal?.aborted).toBe(true);
    expect((voteSignal?.reason as DOMException).name).toBe('TimeoutError');
  });

  it('bounds the vote by the panel guard when the caller sets no timeoutMs', async () => {
    const panelGuardMs = resolveClassGuardMs('multi-llm-panel');

    const { text } = await runDryRun({});

    expect(text).toContain(`Dev pipeline vote stage timed out after ${String(panelGuardMs)}ms`);
    expect(voteSignal?.aborted).toBe(true);
  });
});
