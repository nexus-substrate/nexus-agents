/**
 * Seam test for `cancel_job` against an in-flight async `consensus_vote`
 * (#6729).
 *
 * #5393 threaded the job signal as far as the vote LAUNCHER, which stopped
 * starting seats but let seats already inside their adapter call run to
 * completion. On a live panel that meant three `claude -p` voters kept working
 * 90–120 s after the cancel, and — because `runAsJob` releases the concurrency
 * slot only when the body settles — the cancelled job held its slot, so the
 * next vote came back `busy`.
 *
 * This file drives the REAL registered handler through the REAL collector and
 * the REAL `cancel_job` handler, with fake gateway adapters that park every
 * call until the signal they were handed aborts. So the job can only settle —
 * and the slot can only free — if the cancel reaches each seat's adapter call.
 *
 * @module mcp/tools/consensus-vote-cancel-seam.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompletionRequest, IModelAdapter } from '../../core/index.js';
import { createLogger } from '../../core/index.js';
import type { HandlerContext } from '../middleware/secure-handler.js';

vi.mock('../../cli-adapters/factory.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../cli-adapters/factory.js')>()),
  getAvailableClis: () => Promise.resolve([]),
}));
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallback: (fn: unknown) => fn,
  toSdkCallbackWithTimeoutCheck: (fn: unknown) => fn,
  getToolTimeout: () => 900_000,
}));
vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler: (fn: unknown) => fn,
}));

import { registerConsensusVoteTool } from './consensus-vote.js';
import { registerCancelJobTool } from './cancel-job-tool.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency, getInFlight } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import { isTimeoutAbortReason } from '../../adapters/abort-utils.js';

type Ctx = Pick<HandlerContext, 'logger' | 'sanitization'>;
type Handler = (args: unknown, ctx: Ctx) => Promise<{ content: Array<{ text: string }> }>;

const CTX: Ctx = {
  logger: createLogger({ tool: 'consensus-vote-cancel-seam.test' }),
  sanitization: {
    wasModified: false,
    commentsRemoved: 0,
    fieldsModified: 0,
    tagsRemoved: 0,
    rawFieldHashes: {},
    rawFieldBytes: {},
  },
};

/** quickMode's panel size: architect, security, scope_steward. */
const QUICK_PANEL_SIZE = 3;
const CAP_ENV = 'NEXUS_JOB_MAX_CONCURRENT_CONSENSUS_VOTE';

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
 * Gateway adapters on models the real registry knows, each on its own lane
 * (distinct `providerId`) so all three seats are in flight at once. Every
 * call parks until the signal it was handed aborts; it never answers alone.
 */
function makeParkedAdapters(): { adapters: IModelAdapter[]; signals: AbortSignal[] } {
  const signals: AbortSignal[] = [];
  const models = ['claude-fable-5', 'gpt-5.5', 'gemini-3-pro'];
  const adapters = models.map(
    (modelId) =>
      ({
        modelId,
        providerId: `gateway-fake-${modelId}`,
        complete: (request: CompletionRequest) => {
          const signal = request.signal;
          if (signal === undefined) return new Promise(() => undefined);
          signals.push(signal);
          return new Promise((resolve) => {
            signal.addEventListener(
              'abort',
              () => {
                resolve({ ok: false, error: { message: `aborted: ${String(signal.reason)}` } });
              },
              { once: true }
            );
          });
        },
      }) as unknown as IModelAdapter
  );
  return { adapters, signals };
}

/** Advance fake time, at most `budgetMs`, until no consensus_vote job holds a slot. */
async function settleWithin(budgetMs: number): Promise<void> {
  const stepMs = 50;
  for (let spent = 0; spent < budgetMs && getInFlight('consensus_vote') > 0; spent += stepMs) {
    await vi.advanceTimersByTimeAsync(stepMs);
  }
}

describe('cancel_job aborts in-flight consensus_vote seats (#6729)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-vote-cancel-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    // Cap 1: a slot the cancelled job still held would make the next vote busy.
    vi.stubEnv(CAP_ENV, '1');
    resetNexusDataDirCache();
    resetJobConcurrency();
    // The stagger (2 s/seat) and errored-seat backoff (3 s) are real timers;
    // faking them keeps the row fast. `AbortSignal.timeout` is not faked, and
    // the per-seat deadline is far beyond this test, so only a cancel can end
    // a parked seat.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    vi.unstubAllEnvs();
    resetNexusDataDirCache();
    resetJobConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('aborts every seat in flight, settles promptly and frees the slot for the next vote', async () => {
    const fake = makeParkedAdapters();
    const vote = captureHandler((server) => {
      registerConsensusVoteTool(server as never, {
        rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
        gatewayAdapters: fake.adapters,
      });
    });
    const cancel = captureHandler((server) => {
      registerCancelJobTool(server as never, {
        rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never,
      });
    });
    const dispatch = async (): Promise<Record<string, unknown>> =>
      JSON.parse(
        (await vote({ proposal: 'ship the thing', quickMode: true, dispatch: 'async' }, CTX))
          .content[0]!.text
      ) as Record<string, unknown>;

    const first = await dispatch();
    expect(first['status']).toBe('pending');
    const jobId = first['jobId'] as string;

    // Mid-vote: every seat is inside its adapter call.
    for (let i = 0; i < 100 && fake.signals.length < QUICK_PANEL_SIZE; i++) {
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(fake.signals).toHaveLength(QUICK_PANEL_SIZE);
    expect(fake.signals.every((s) => !s.aborted)).toBe(true);

    const cancelled = JSON.parse((await cancel({ jobId }, CTX)).content[0]!.text) as Record<
      string,
      unknown
    >;
    expect(cancelled['outcome']).toBe('cancelled');

    // The cancel reached each seat's adapter call, as a cancel — not a timeout.
    expect(fake.signals.every((s) => s.aborted)).toBe(true);
    expect(fake.signals.some((s) => isTimeoutAbortReason(s.reason))).toBe(false);

    // Settles promptly: well inside the 3 s errored-seat backoff, so a
    // cancelled panel is not relaunched for a retry pass either.
    await settleWithin(1_000);
    expect(getInFlight('consensus_vote')).toBe(0);
    expect(readJobResult(jobId)?.status).toBe('cancelled');
    // No seat was relaunched after the cancel.
    expect(fake.signals).toHaveLength(QUICK_PANEL_SIZE);

    // The next vote gets the slot rather than `busy`.
    const next = await dispatch();
    expect(next['status']).toBe('pending');
    await cancel({ jobId: next['jobId'] }, CTX);
    await settleWithin(10_000);
  });
});
