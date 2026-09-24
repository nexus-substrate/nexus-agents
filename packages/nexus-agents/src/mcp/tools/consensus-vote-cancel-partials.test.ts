/**
 * Seam test: the votes cast before a `cancel_job` reach the cancelled job
 * record, and no decision is computed or recorded from them (#6735).
 *
 * Before #6735 the body's result went to `writeJobComplete` / `writeJobFailed`,
 * both no-ops against a `cancelled` record (#4022), so the seats that had
 * answered were dropped. This file drives the REAL handler, collector and
 * `cancel_job` with fake gateway adapters: one answers at once, the rest park
 * until the signal they were handed aborts.
 *
 * @module mcp/tools/consensus-vote-cancel-partials.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
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
/**
 * The quick-mode contrarian check. With `park` set it waits until the test
 * releases it, so a cancel can land AFTER every seat settled and before the
 * verdict; otherwise it answers at once with no concern.
 */
const contrarian = vi.hoisted(() => ({
  started: 0,
  park: false,
  release: undefined as (() => void) | undefined,
}));
vi.mock('../../pipeline/expert-bridge.js', () => ({
  executeExpert: () => {
    contrarian.started++;
    const answer = {
      success: true,
      text: '{"decision":"approve","confidence":0.9,"reasoning":"no concern"}',
      expertType: 'architecture',
      durationMs: 1,
    };
    if (!contrarian.park) return Promise.resolve(answer);
    return new Promise((resolve) => {
      contrarian.release = () => {
        resolve(answer);
      };
    });
  },
}));

import { registerConsensusVoteTool } from './consensus-vote.js';
import { registerCancelJobTool } from './cancel-job-tool.js';
import { readJobResult, writeJobComplete, writeJobFailed } from '../jobs/job-result-store.js';
import { _resetForTests as resetJobConcurrency, getInFlight } from '../jobs/job-concurrency.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

type Ctx = Pick<HandlerContext, 'logger' | 'sanitization'>;
type Handler = (args: unknown, ctx: Ctx) => Promise<{ content: Array<{ text: string }> }>;

const CTX: Ctx = {
  logger: createLogger({ tool: 'consensus-vote-cancel-partials.test' }),
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
const LEDGER_ENV = 'NEXUS_VOTE_RECORDS_PATH';
/** The one model whose seat answers; every other seat parks. */
const ANSWERING_MODEL = 'claude-fable-5';
const ALL_MODELS = [ANSWERING_MODEL, 'gpt-5.5', 'gemini-3-pro'];
const RATIFIES_PR = { pr: 6749, headSha: '0123456789abcdef0123456789abcdef01234567' };
/** Extra vote args per variant: a plain vote, and a governor-path ratification. */
const VARIANTS: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ['plain', {}],
  ['ratifiesPr', { ratifiesPr: RATIFIES_PR }],
];

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
  /** Signals handed to seats that parked. */
  readonly parked: AbortSignal[];
  /** Count of seats that answered with a vote. */
  answered: number;
}

/**
 * Gateway adapters on models the real registry knows, each on its own lane.
 * `answering` names the models that return an approve vote at once; every
 * other call parks until its signal aborts.
 */
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
                  text: '{"decision":"approve","confidence":0.9,"reasoning":"Partial vote."}',
                },
              ],
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

/** Advance fake time, at most `budgetMs`, until no consensus_vote job holds a slot. */
async function settleWithin(budgetMs: number): Promise<void> {
  const stepMs = 50;
  for (let spent = 0; spent < budgetMs && getInFlight('consensus_vote') > 0; spent += stepMs) {
    await vi.advanceTimersByTimeAsync(stepMs);
  }
}

/** Advance fake time until every non-answering seat is parked in its adapter call. */
async function untilParked(panel: FakePanel, count: number): Promise<void> {
  for (let i = 0; i < 100 && panel.parked.length < count; i++) {
    await vi.advanceTimersByTimeAsync(100);
  }
}

describe('a cancelled consensus_vote records its partial votes, never a decision (#6735)', () => {
  let tmpDir: string;
  let ledgerPath: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-vote-partials-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    ledgerPath = join(tmpDir, 'ledger', 'vote-records.jsonl');
    vi.stubEnv(LEDGER_ENV, ledgerPath);
    resetNexusDataDirCache();
    resetJobConcurrency();
    contrarian.started = 0;
    contrarian.park = false;
    // Stagger and retry backoff are real timers; faking them keeps rows fast.
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

  /** Every message the vote logged, so a row can prove no verdict was computed. */
  let logged: string[];
  /** Logged only when a verdict is computed or the tracker is written. */
  const VERDICT_LOGS = [
    'Consensus vote completed',
    'Consensus vote short-circuited by error policy',
    'Recorded votes to tracker',
  ];

  function handlers(panel: FakePanel): { vote: Handler; cancel: Handler } {
    const deps = { rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never };
    logged = [];
    const record = (message: string): void => {
      logged.push(message);
    };
    const logger = {
      debug: record,
      info: record,
      warn: record,
      error: record,
      child: () => logger,
    } as never;
    return {
      vote: captureHandler((server) => {
        registerConsensusVoteTool(server as never, {
          ...deps,
          logger,
          gatewayAdapters: panel.adapters,
        });
      }),
      cancel: captureHandler((server) => {
        registerCancelJobTool(server as never, deps);
      }),
    };
  }

  async function dispatch(vote: Handler, extra: Record<string, unknown> = {}): Promise<string> {
    const args = { proposal: 'ship the thing', quickMode: true, dispatch: 'async', ...extra };
    const envelope = JSON.parse((await vote(args, CTX)).content[0]!.text) as Record<
      string,
      unknown
    >;
    expect(envelope['status']).toBe('pending');
    return envelope['jobId'] as string;
  }

  it('positive control: the same harness, uncancelled, DOES write the ledger', async () => {
    const panel = makePanel(ALL_MODELS);
    const { vote } = handlers(panel);
    const jobId = await dispatch(vote, { strategy: 'simple_majority' });
    await settleWithin(10_000);

    expect(readJobResult(jobId)?.status).toBe('complete');
    expect(existsSync(ledgerPath)).toBe(true);
    expect(logged).toContain('Recorded votes to tracker');
  });

  it.each(VARIANTS)(
    '%s: cancel after 1 of 3 seats answered records 1 partial vote of 3 and no decision',
    async (_label, extra) => {
      const panel = makePanel([ANSWERING_MODEL]);
      const { vote, cancel } = handlers(panel);
      const jobId = await dispatch(vote, extra);

      await untilParked(panel, QUICK_PANEL_SIZE - 1);
      expect(panel.answered).toBe(1);
      expect(panel.parked).toHaveLength(QUICK_PANEL_SIZE - 1);

      await cancel({ jobId }, CTX);
      await settleWithin(1_000);
      expect(getInFlight('consensus_vote')).toBe(0);

      const record = readJobResult(jobId);
      expect(record?.status).toBe('cancelled');
      expect(record?.cancelledPartial).toMatchObject({
        partialVotes: [{ source: 'llm', vote: { decision: 'approve' } }],
        seatsCast: 1,
        panelSize: QUICK_PANEL_SIZE,
      });
      expect(record?.cancelledPartial?.partialVotes).toHaveLength(1);
      // No decision: no result payload, nothing reached the vote-record ledger,
      // and the engine never tallied the partial panel.
      expect(record).not.toHaveProperty('result');
      expect(existsSync(ledgerPath)).toBe(false);
      expect(logged.filter((m) => VERDICT_LOGS.includes(m))).toEqual([]);
    }
  );

  it('a cancel after every seat settled, during the contrarian check, still records no decision', async () => {
    const panel = makePanel(ALL_MODELS);
    const { vote, cancel } = handlers(panel);
    contrarian.park = true;
    // simple_majority: skips the higher_order posterior escalation, so the
    // quick panel's approval goes straight to the contrarian check.
    const jobId = await dispatch(vote, { strategy: 'simple_majority' });
    for (let i = 0; i < 100 && contrarian.started === 0; i++) {
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(panel.answered).toBe(QUICK_PANEL_SIZE);
    expect(contrarian.started).toBe(1);

    await cancel({ jobId }, CTX);
    contrarian.release?.();
    await settleWithin(1_000);
    expect(getInFlight('consensus_vote')).toBe(0);

    const record = readJobResult(jobId);
    expect(record?.status).toBe('cancelled');
    expect(record?.cancelledPartial?.seatsCast).toBe(QUICK_PANEL_SIZE);
    expect(record?.cancelledPartial?.panelSize).toBe(QUICK_PANEL_SIZE);
    expect(record).not.toHaveProperty('result');
    expect(existsSync(ledgerPath)).toBe(false);
    // Stopped before the tracker, not only before the ledger.
    expect(logged).not.toContain('Recorded votes to tracker');
  });

  it('empty case: cancel before any seat answers records 0 of 3, not an absent field', async () => {
    const panel = makePanel([]);
    const { vote, cancel } = handlers(panel);
    const jobId = await dispatch(vote);

    await cancel({ jobId }, CTX);
    // A seat not yet launched is dropped after its 2 s stagger delay.
    await settleWithin(5_000);
    expect(getInFlight('consensus_vote')).toBe(0);
    expect(panel.answered).toBe(0);

    const record = readJobResult(jobId);
    expect(record?.status).toBe('cancelled');
    expect(record?.cancelledPartial).toEqual({
      partialVotes: [],
      seatsCast: 0,
      panelSize: QUICK_PANEL_SIZE,
    });
    expect(record).not.toHaveProperty('result');
    expect(existsSync(ledgerPath)).toBe(false);
    expect(logged.filter((m) => VERDICT_LOGS.includes(m))).toEqual([]);
  });

  it('a later complete or failed write cannot overwrite the cancelled record or its partials', async () => {
    const panel = makePanel([ANSWERING_MODEL]);
    const { vote, cancel } = handlers(panel);
    const jobId = await dispatch(vote);
    await untilParked(panel, QUICK_PANEL_SIZE - 1);
    await cancel({ jobId }, CTX);
    await settleWithin(1_000);
    const before = readJobResult(jobId);
    expect(before?.cancelledPartial?.seatsCast).toBe(1);

    writeJobComplete(jobId, 'consensus_vote', { ok: true, value: { decision: 'approved' } });
    writeJobFailed(jobId, 'consensus_vote', 'late failure');

    expect(readJobResult(jobId)).toEqual(before);
  });
  describe('a cancel during the ledger-lock wait appends nothing', () => {
    /** Hold the ledger lock as a live process on this host would, so the vote waits. */
    function holdLedgerLock(): string {
      const lockPath = `${ledgerPath}.lock`;
      mkdirSync(join(tmpDir, 'ledger'), { recursive: true });
      writeFileSync(lockPath, `${hostname()}:${String(process.pid)}:deadbeef`);
      return lockPath;
    }

    /** Run a full, all-approve vote up to the point where it waits on the held lock. */
    async function voteParkedOnLock(extra: Record<string, unknown>): Promise<{
      jobId: string;
      cancel: Handler;
      lockPath: string;
    }> {
      const lockPath = holdLedgerLock();
      const panel = makePanel(ALL_MODELS);
      const { vote, cancel } = handlers(panel);
      const jobId = await dispatch(vote, { strategy: 'simple_majority', ...extra });
      for (let i = 0; i < 100 && contrarian.started === 0; i++) {
        await vi.advanceTimersByTimeAsync(100);
      }
      await vi.advanceTimersByTimeAsync(500);
      expect(panel.answered).toBe(QUICK_PANEL_SIZE);
      expect(getInFlight('consensus_vote')).toBe(1);
      expect(existsSync(ledgerPath)).toBe(false);
      return { jobId, cancel, lockPath };
    }

    it.each(VARIANTS)(
      '%s: positive control — releasing the lock without a cancel appends the record',
      async (_label, extra) => {
        const { jobId, lockPath } = await voteParkedOnLock(extra);

        unlinkSync(lockPath);
        await settleWithin(2_000);

        expect(readJobResult(jobId)?.status).toBe('complete');
        expect(existsSync(ledgerPath)).toBe(true);
      }
    );

    it.each(VARIANTS)(
      '%s: cancel during the wait leaves the ledger unwritten and the job cancelled',
      async (_label, extra) => {
        const { jobId, cancel, lockPath } = await voteParkedOnLock(extra);

        await cancel({ jobId }, CTX);
        unlinkSync(lockPath);
        await settleWithin(2_000);
        expect(getInFlight('consensus_vote')).toBe(0);

        expect(existsSync(ledgerPath)).toBe(false);
        const record = readJobResult(jobId);
        expect(record?.status).toBe('cancelled');
        expect(record).not.toHaveProperty('result');
        expect(record?.cancelledPartial).toMatchObject({
          seatsCast: QUICK_PANEL_SIZE,
          panelSize: QUICK_PANEL_SIZE,
        });
      }
    );
  });
});
