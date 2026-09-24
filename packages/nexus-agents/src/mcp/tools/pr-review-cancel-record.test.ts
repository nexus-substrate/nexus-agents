/**
 * Seam test: a cancelled async `pr_review` writes NO governor-review record and
 * attaches the seats it had collected to the cancelled job, with no verdict
 * (#6750, the pr_review sibling of #6735).
 *
 * Before #6750 the body ran on after `cancel_job`: it aggregated whatever seats
 * had answered into a verdict and appended it to `pr-review-records.jsonl`,
 * which the governor-review gate reads as review evidence. This file drives the
 * REAL handler, vote collector, record producer and store with fake gateway
 * adapters: the answering model returns at once, every other seat parks until
 * the signal it was handed aborts.
 *
 * @module mcp/tools/pr-review-cancel-record.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  getToolTimeout: () => 900_000,
}));
vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler: (fn: unknown) => fn,
}));
/**
 * The cost rollup runs after the post-seat cancel check and before the record
 * write, with no `await` between them. `onRollup` lets a row cancel in exactly
 * that window, so only the check INSIDE the persist step can stop the write.
 */
const rollup = vi.hoisted(() => ({
  calls: 0,
  onRollup: undefined as (() => void) | undefined,
}));
vi.mock('./decision-cost-recording.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./decision-cost-recording.js')>();
  return {
    ...actual,
    recordDecisionCost: (...args: Parameters<typeof actual.recordDecisionCost>) => {
      rollup.calls++;
      rollup.onRollup?.();
      return actual.recordDecisionCost(...args);
    },
  };
});

import { registerPrReviewTool, PR_REVIEW_ROLES } from './pr-review-tool.js';
import { registerCancelJobTool } from './cancel-job-tool.js';
import { readJobResult, writeJobCancelled } from '../jobs/job-result-store.js';
import { abortJob } from '../jobs/job-abort-registry.js';
import { _resetForTests as resetJobConcurrency, getInFlight } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import { PR_REVIEW_RECORDS_PATH_ENV } from '../../audit/pr-review-record-store.js';

type Ctx = Pick<HandlerContext, 'logger' | 'sanitization'>;
type Handler = (args: unknown, ctx: Ctx) => Promise<{ content: Array<{ text: string }> }>;

const MINIMAL_DIFF =
  'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-a\n+b\n';

const CTX: Ctx = {
  logger: createLogger({ tool: 'pr-review-cancel-record.test' }),
  sanitization: {
    wasModified: false,
    commentsRemoved: 0,
    fieldsModified: 0,
    tagsRemoved: 0,
    rawFieldHashes: { prDiff: 'a'.repeat(64) },
    rawFieldBytes: { prDiff: MINIMAL_DIFF.length },
  },
};

const ANSWERING_MODEL = 'claude-fable-5';
const ALL_MODELS = [ANSWERING_MODEL, 'gpt-5.5', 'gemini-3-pro'];
const REVIEW_ARGS = {
  prTitle: 'x',
  prDiff: MINIMAL_DIFF,
  prNumber: 6750,
  baseSha: '0123456789abcdef0123456789abcdef01234567',
  dispatch: 'async',
};

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

interface FakePanel {
  readonly adapters: IModelAdapter[];
  readonly parked: AbortSignal[];
  answered: number;
}

/** Models in `answering` approve at once; every other call parks until its signal aborts. */
function makePanel(answering: readonly string[]): FakePanel {
  const panel: FakePanel = { adapters: [], parked: [], answered: 0 };
  for (const modelId of ALL_MODELS) {
    panel.adapters.push({
      modelId,
      providerId: `gateway-fake-${modelId}`,
      complete: (request: CompletionRequest) => {
        if (answering.includes(modelId)) {
          panel.answered++;
          return Promise.resolve({
            ok: true,
            value: {
              content: [
                {
                  type: 'text' as const,
                  text: '{"decision":"approve","confidence":0.9,"reasoning":"Looks correct to me."}',
                },
              ],
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
              model: modelId,
              stopReason: 'end_turn',
            },
          });
        }
        const signal = request.signal;
        if (signal === undefined) return new Promise(() => undefined);
        panel.parked.push(signal);
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
    } as unknown as IModelAdapter);
  }
  return panel;
}

async function settleWithin(budgetMs: number): Promise<void> {
  const stepMs = 50;
  for (let spent = 0; spent < budgetMs && getInFlight('pr_review') > 0; spent += stepMs) {
    await vi.advanceTimersByTimeAsync(stepMs);
  }
  if (getInFlight('pr_review') > 0) throw new Error('pr_review job never settled');
}

async function untilParked(panel: FakePanel, count: number): Promise<void> {
  for (let i = 0; i < 200 && panel.parked.length < count; i++) {
    await vi.advanceTimersByTimeAsync(100);
  }
  if (panel.parked.length < count)
    throw new Error(
      `only ${String(panel.parked.length)} parked, ${String(panel.answered)} answered`
    );
}

describe('a cancelled pr_review writes no review record and attaches its partial seats (#6750)', () => {
  let tmpDir: string;
  let recordsPath: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-pr-cancel-record-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    recordsPath = join(tmpDir, 'governance', 'pr-review-records.jsonl');
    vi.stubEnv(PR_REVIEW_RECORDS_PATH_ENV, recordsPath);
    resetNexusDataDirCache();
    resetJobConcurrency();
    rollup.calls = 0;
    rollup.onRollup = undefined;
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

  function handlers(panel: FakePanel): { review: Handler; cancel: Handler } {
    const deps = { rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never };
    return {
      review: captureHandler((server) => {
        registerPrReviewTool(server as never, { ...deps, gatewayAdapters: panel.adapters });
      }),
      cancel: captureHandler((server) => {
        registerCancelJobTool(server as never, deps);
      }),
    };
  }

  async function dispatch(review: Handler): Promise<string> {
    const env = JSON.parse((await review(REVIEW_ARGS, CTX)).content[0]!.text) as Record<
      string,
      unknown
    >;
    expect(env['status']).toBe('pending');
    return env['jobId'] as string;
  }

  function recordLines(): string[] {
    if (!existsSync(recordsPath)) return [];
    return readFileSync(recordsPath, 'utf8')
      .split('\n')
      .filter((l) => l.trim() !== '');
  }

  it('positive control: the same harness, uncancelled, DOES write the review record', async () => {
    const panel = makePanel(ALL_MODELS);
    const { review } = handlers(panel);
    const jobId = await dispatch(review);
    await settleWithin(60_000);

    expect(readJobResult(jobId)?.status).toBe('complete');
    const lines = recordLines();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ prNumber: 6750, verdict: 'approve' });
    expect(readJobResult(jobId)?.cancelledPartial).toBeUndefined();
  });

  it('a cancel after 1 of N seats answered writes no record; the job reads cancelled with the partials', async () => {
    const panel = makePanel([ANSWERING_MODEL]);
    const { review, cancel } = handlers(panel);
    const jobId = await dispatch(review);
    // Each non-answering lane has a seat parked inside its adapter call; the
    // seat queued behind a parked lane never launches.
    await untilParked(panel, ALL_MODELS.length - 1);
    const answeredBeforeCancel = panel.answered;
    expect(answeredBeforeCancel).toBeGreaterThan(0);
    expect(answeredBeforeCancel).toBeLessThan(PR_REVIEW_ROLES.length);

    const cancelled = JSON.parse((await cancel({ jobId }, CTX)).content[0]!.text) as Record<
      string,
      unknown
    >;
    expect(cancelled['outcome']).toBe('cancelled');
    await settleWithin(60_000);

    expect(recordLines()).toEqual([]);
    // The post-seat check stops the body before any aggregation or rollup.
    expect(rollup.calls).toBe(0);
    const record = readJobResult(jobId);
    expect(record?.status).toBe('cancelled');
    expect(record?.result).toBeUndefined();
    expect(record?.cancelledPartial).toMatchObject({
      seatsCast: answeredBeforeCancel,
      panelSize: PR_REVIEW_ROLES.length,
    });
    // The partials are raw seats, never a verdict.
    expect(JSON.stringify(record?.cancelledPartial)).not.toContain('"verdict"');
    expect(JSON.stringify(record?.cancelledPartial)).not.toContain('"summary"');
  });

  it('a cancel that lands after the seats settled, just before the record write, writes nothing', async () => {
    const panel = makePanel(ALL_MODELS);
    const { review } = handlers(panel);
    let jobId = '';
    // Cancel exactly as `cancel_job` does (write `cancelled`, then abort),
    // synchronously, inside the window between the post-seat check and the write.
    rollup.onRollup = () => {
      writeJobCancelled(jobId, 'pr_review');
      abortJob(jobId);
    };
    jobId = await dispatch(review);
    await settleWithin(60_000);

    expect(rollup.calls).toBe(1);
    expect(recordLines()).toEqual([]);
    const record = readJobResult(jobId);
    expect(record?.status).toBe('cancelled');
    expect(record?.result).toBeUndefined();
    expect(record?.cancelledPartial).toMatchObject({
      seatsCast: PR_REVIEW_ROLES.length,
      panelSize: PR_REVIEW_ROLES.length,
    });
  });
});
