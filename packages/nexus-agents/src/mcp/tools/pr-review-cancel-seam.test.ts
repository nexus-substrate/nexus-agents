/**
 * Seam test for `cancel_job` against an in-flight `pr_review` panel (#5393).
 *
 * The chain has four links — runner arity → tool → `collectRealVotes` →
 * launcher — and the two middle ones are the trap: mutating either leaves the
 * tests at both ends green (the launcher's own cancel tests pass, and the
 * runner's `signalAccepted` record follows its arity). So this file drives the
 * REAL registered handler through the REAL vote collector with fake gateway
 * adapters that count `complete` calls, cancels through the REAL `cancel_job`
 * handler once the first seat is in flight, and asserts that the remaining
 * seats never call an adapter.
 *
 * Asserting only that the job status became `cancelled` would pass against
 * code that cancels the bookkeeping and keeps spending — which is exactly what
 * `pr_review` did before this test.
 *
 * @module mcp/tools/pr-review-cancel-seam.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IModelAdapter } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type { HandlerContext } from '../middleware/secure-handler.js';

vi.mock('../../cli-adapters/factory.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../cli-adapters/factory.js')>()),
  getAvailableClis: () => Promise.resolve([]),
}));
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  getToolTimeout: () => 900_000,
}));
vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler: (fn: unknown) => fn,
}));

import { registerPrReviewTool, PR_REVIEW_ROLES } from './pr-review-tool.js';
import { registerCancelJobTool } from './cancel-job-tool.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency, getInFlight } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

type Ctx = Pick<HandlerContext, 'logger' | 'sanitization'>;
type Handler = (args: unknown, ctx: Ctx) => Promise<{ content: Array<{ text: string }> }>;

const CTX: Ctx = {
  logger: createLogger({ tool: 'pr-review-cancel-seam.test' }),
  sanitization: {
    wasModified: false,
    commentsRemoved: 0,
    fieldsModified: 0,
    tagsRemoved: 0,
    rawFieldHashes: {},
    rawFieldBytes: {},
  },
};

const MINIMAL_DIFF =
  'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-a\n+b\n';

const APPROVE_JSON = JSON.stringify({
  decision: 'approve',
  reasoning: 'This is a good proposal that meets all requirements',
  confidence: 0.9,
});

function captureHandler(
  register: (server: { registerTool: (n: string, s: unknown, cb: Handler) => void }) => void
): Handler {
  let handler: Handler | undefined;
  register({
    registerTool: (_name, _schema, cb) => {
      handler = cb;
    },
  });
  if (handler === undefined) throw new Error('handler not registered');
  return handler;
}

/**
 * A gateway adapter on a model the REAL registry knows, whose `complete`
 * counts calls and parks the FIRST call until the test releases it — the
 * window in which `cancel_job` lands "mid-fan-out".
 */
function makeCountingAdapter(): {
  adapter: IModelAdapter;
  calls: () => number;
  firstCallStarted: Promise<void>;
  releaseFirstCall: () => void;
} {
  let count = 0;
  let started: () => void = () => undefined;
  let release: () => void = () => undefined;
  const firstCallStarted = new Promise<void>((r) => {
    started = r;
  });
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const adapter = {
    modelId: 'claude-fable-5',
    providerId: 'gateway-fake',
    complete: async () => {
      count += 1;
      if (count === 1) {
        started();
        await gate;
      }
      return {
        ok: true,
        value: {
          content: [{ type: 'text', text: APPROVE_JSON }],
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          stopReason: 'end_turn',
          model: 'claude-fable-5',
        },
      };
    },
  } as unknown as IModelAdapter;
  return { adapter, calls: () => count, firstCallStarted, releaseFirstCall: release };
}

/** Advance fake time until the pr_review slot is released (the body settled). */
async function settle(): Promise<void> {
  for (let i = 0; i < 400 && getInFlight('pr_review') > 0; i++) {
    await vi.advanceTimersByTimeAsync(100);
  }
  if (getInFlight('pr_review') > 0) throw new Error('pr_review job never settled');
}

describe('cancel_job interrupts an in-flight pr_review panel (#5393)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-pr-cancel-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    // The panel's stagger (2s/seat) and errored-seat backoff (3s) are real
    // timers; faking them keeps the row fast without touching the production
    // delays. `nextTick`/microtasks stay real so the fan-out itself runs.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetJobConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('makes no further adapter call after the cancel lands — the remaining seats never run', async () => {
    const fake = makeCountingAdapter();
    const review = captureHandler((server) => {
      registerPrReviewTool(server as never, {
        rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
        gatewayAdapters: [fake.adapter],
      });
    });
    const cancel = captureHandler((server) => {
      registerCancelJobTool(server as never, {
        rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
      });
    });

    const env = JSON.parse(
      (await review({ prTitle: 'x', prDiff: MINIMAL_DIFF, dispatch: 'async' }, CTX)).content[0]!
        .text
    ) as Record<string, unknown>;
    expect(env['status']).toBe('pending');
    const jobId = env['jobId'] as string;

    // The record must say cancellation is actionable BEFORE it is attempted:
    // `signalAccepted` is arity-derived, so this is the runner taking the signal.
    expect(readJobResult(jobId)?.signalAccepted).toBe(true);

    // Mid-fan-out: the first seat is inside its adapter call.
    await fake.firstCallStarted;
    expect(fake.calls()).toBe(1);

    const cancelled = JSON.parse((await cancel({ jobId }, CTX)).content[0]!.text) as Record<
      string,
      unknown
    >;
    expect(cancelled['outcome']).toBe('cancelled');
    expect(cancelled['message']).toContain('AbortSignal was fired');

    fake.releaseFirstCall();
    await settle();

    // The acceptance criterion: the OTHER seats made no adapter call. Without
    // the signal reaching the collector, every remaining seat runs after its
    // stagger and this reads PR_REVIEW_ROLES.length.
    expect(fake.calls()).toBe(1);
    expect(PR_REVIEW_ROLES.length).toBeGreaterThan(1);
    // The durable record keeps the cancellation (terminal writers no-op, #4022).
    expect(readJobResult(jobId)?.status).toBe('cancelled');
  });

  it('runs every seat when nothing cancels — the empty case', async () => {
    const fake = makeCountingAdapter();
    fake.releaseFirstCall();
    const review = captureHandler((server) => {
      registerPrReviewTool(server as never, {
        rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
        gatewayAdapters: [fake.adapter],
      });
    });

    const env = JSON.parse(
      (await review({ prTitle: 'x', prDiff: MINIMAL_DIFF, dispatch: 'async' }, CTX)).content[0]!
        .text
    ) as Record<string, unknown>;
    const jobId = env['jobId'] as string;
    await settle();

    expect(fake.calls()).toBe(PR_REVIEW_ROLES.length);
    expect(readJobResult(jobId)?.status).toBe('complete');
  });
});
