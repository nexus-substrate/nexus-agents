/**
 * Tests for the shared async-job dispatcher `runAsJob` (#3729 / epic #2631).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runAsJob, runJobInBackground } from './run-as-job.js';
import { readJobResult, writeJobPending, writeJobCancelled } from './job-result-store.js';
import { abortJob } from './job-abort-registry.js';
import { registerIdempotentJob, resolveIdempotency } from './job-idempotency.js';
import { _resetForTests as resetConcurrency, getInFlight, getJobCap } from './job-concurrency.js';
import { resetNexusDataDirCache, nexusDataPath } from '../../config/nexus-data-dir.js';

interface DummyInput {
  readonly task: string;
}

/** Parse the JSON payload out of a ToolResult text envelope. */
function parseEnvelope(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>;
}

describe('runAsJob', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-runasjob-test-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    resetConcurrency();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns a pending envelope with the minted jobId', () => {
    const result = runAsJob<DummyInput, { ok: true }>({
      toolName: 'orchestrate',
      input: { task: 'x' },
      freshJobId: () => 'job-fixed-1',
      run: () => new Promise(() => {}), // never resolves — keep it pending
    });
    const env = parseEnvelope(result);
    expect(env['status']).toBe('pending');
    expect(env['jobId']).toBe('job-fixed-1');
    expect(env['pollTool']).toBe('get_job_result');
  });

  it('writes a pending job record + acquires a concurrency slot on dispatch', () => {
    runAsJob<DummyInput, { ok: true }>({
      toolName: 'orchestrate',
      input: { task: 'x' },
      freshJobId: () => 'job-fixed-2',
      run: () => new Promise(() => {}),
    });
    expect(readJobResult('job-fixed-2')?.status).toBe('pending');
    expect(getInFlight('orchestrate')).toBe(1);
  });

  // #4972: `cancel_job` writes `cancelled` whether or not the tool can act on
  // the signal — `cancel-job-tool.ts` is explicit that an ignoring tool "still
  // runs to completion… but its record stays `cancelled`". None of the ten
  // adopters accepts the signal today, so every cancelled record claims more
  // than is known. The record now says which case it is.
  it('records signalAccepted:false when the run callback does not take the signal', () => {
    runAsJob<DummyInput, { ok: true }>({
      toolName: 'orchestrate',
      input: { task: 'x' },
      freshJobId: () => 'job-sig-none',
      // Two parameters — the shape every current adopter uses.
      run: (_jobId, _input) => new Promise(() => {}),
    });

    expect(readJobResult('job-sig-none')?.signalAccepted).toBe(false);
  });

  it('records signalAccepted:true when it does', () => {
    // The pair: hardcoding false would be indistinguishable from today's state
    // and would stay wrong as tools adopt the signal.
    runAsJob<DummyInput, { ok: true }>({
      toolName: 'orchestrate',
      input: { task: 'x' },
      freshJobId: () => 'job-sig-yes',
      run: (_jobId, _input, _signal) => new Promise(() => {}),
    });

    expect(readJobResult('job-sig-yes')?.signalAccepted).toBe(true);
  });

  it('returns a busy envelope when the per-tool cap is full', () => {
    const cap = getJobCap('consensus_vote'); // 2 by default
    for (let i = 0; i < cap; i++) {
      runAsJob<DummyInput, { ok: true }>({
        toolName: 'consensus_vote',
        input: { task: `x${String(i)}` },
        freshJobId: () => `job-cap-${String(i)}`,
        run: () => new Promise(() => {}),
      });
    }
    const result = runAsJob<DummyInput, { ok: true }>({
      toolName: 'consensus_vote',
      input: { task: 'overflow' },
      freshJobId: () => 'job-cap-overflow',
      run: () => new Promise(() => {}),
    });
    const env = parseEnvelope(result);
    expect(env['status']).toBe('busy');
    expect(typeof env['retryAfterMs']).toBe('number');
    // Overflow dispatch must NOT have written a pending record.
    expect(readJobResult('job-cap-overflow')).toBeNull();
  });

  it('records complete with the run result + releases the slot', async () => {
    const params = {
      toolName: 'orchestrate',
      input: { task: 'ok' } as DummyInput,
      freshJobId: () => 'job-complete-1',
      run: () => Promise.resolve({ value: 42 }),
    };
    // Dispatch acquires the slot + writes pending; drive the background run
    // deterministically rather than racing the detached promise.
    runAsJob<DummyInput, { value: number }>({ ...params, run: () => new Promise(() => {}) });
    await runJobInBackground('job-complete-1', params);
    const record = readJobResult('job-complete-1');
    expect(record?.status).toBe('complete');
    expect(record?.result).toEqual({ value: 42 });
    expect(getInFlight('orchestrate')).toBe(0);
  });

  it('records failed with the error message + releases the slot', async () => {
    const params = {
      toolName: 'orchestrate',
      input: { task: 'boom' } as DummyInput,
      freshJobId: () => 'job-fail-1',
      run: () => Promise.reject(new Error('kaboom')),
    };
    runAsJob<DummyInput, never>({ ...params, run: () => new Promise(() => {}) });
    await runJobInBackground('job-fail-1', params);
    const record = readJobResult('job-fail-1');
    expect(record?.status).toBe('failed');
    expect(record?.error).toBe('kaboom');
    expect(getInFlight('orchestrate')).toBe(0);
  });

  it('returns a replay envelope when an idempotency key matches a prior dispatch', () => {
    const input: DummyInput = { task: 'idem' };
    // Pre-seed an index entry as a prior dispatch would.
    const resolved = resolveIdempotency('orchestrate', 'k1', input);
    expect(resolved.kind).toBe('fresh');
    if (resolved.kind === 'fresh') {
      registerIdempotentJob({
        tool: 'orchestrate',
        idempotencyKey: 'k1',
        inputs: input,
        jobId: resolved.jobId,
      });
      const result = runAsJob<DummyInput, { ok: true }>({
        toolName: 'orchestrate',
        input,
        idempotencyKey: 'k1',
        freshJobId: () => 'should-not-be-used',
        run: () => new Promise(() => {}),
      });
      const env = parseEnvelope(result);
      expect(env['status']).toBe('replay');
      expect(env['jobId']).toBe(resolved.jobId);
      // Replay must NOT acquire a slot.
      expect(getInFlight('orchestrate')).toBe(0);
    }
  });

  it('returns a collision error envelope when a key is reused with different inputs', () => {
    const first: DummyInput = { task: 'first' };
    const resolved = resolveIdempotency('orchestrate', 'k2', first);
    if (resolved.kind === 'fresh') {
      registerIdempotentJob({
        tool: 'orchestrate',
        idempotencyKey: 'k2',
        inputs: first,
        jobId: resolved.jobId,
      });
    }
    const result = runAsJob<DummyInput, { ok: true }>({
      toolName: 'orchestrate',
      input: { task: 'DIFFERENT' },
      idempotencyKey: 'k2',
      freshJobId: () => 'unused',
      run: () => new Promise(() => {}),
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Idempotency key already used');
    expect(getInFlight('orchestrate')).toBe(0);
    expect(nexusDataPath('jobs')).toContain(tmpDir);
  });

  // ==========================================================================
  // async-job-body runaway-guard (#3734)
  // ==========================================================================

  describe('async-job-body runaway-guard (#3734)', () => {
    afterEach(() => {
      delete process.env['NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS'];
      vi.useRealTimers();
    });

    it('does NOT apply a request timeout to the backgrounded body — pending returns immediately', () => {
      // The dispatch returns synchronously while the body runs forever; no
      // request timeout governs the body (that is the whole point of async mode).
      const result = runAsJob<DummyInput, { ok: true }>({
        toolName: 'orchestrate',
        input: { task: 'long' },
        freshJobId: () => 'job-async-body-1',
        run: () => new Promise(() => {}), // never resolves
      });
      const env = parseEnvelope(result);
      expect(env['status']).toBe('pending');
      // The job is still pending (not failed) right after dispatch.
      expect(readJobResult('job-async-body-1')?.status).toBe('pending');
    });

    it('fires the internal async-body guard → writeJobFailed("runaway guard exceeded") + releases', async () => {
      // Shrink the async-job-body guard so the test is fast; use fake timers to
      // drive it deterministically.
      process.env['NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS'] = '1000';
      vi.useFakeTimers();
      const warn = vi.fn();
      const logger = {
        warn,
        error: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
      } as unknown as import('../../core/index.js').ILogger;
      const params = {
        toolName: 'orchestrate',
        input: { task: 'wedged' } as DummyInput,
        freshJobId: () => 'job-runaway-1',
        run: () => new Promise<{ ok: true }>(() => {}), // never resolves → guard wins
        logger,
      };
      // Dispatch acquires the slot + writes pending.
      runAsJob<DummyInput, { ok: true }>({ ...params, run: () => new Promise(() => {}) });
      // Drive the background runner; advance past the (clamped) guard window.
      const bg = runJobInBackground('job-runaway-1', params);
      await vi.advanceTimersByTimeAsync(1_500);
      await bg;
      const record = readJobResult('job-runaway-1');
      expect(record?.status).toBe('failed');
      expect(record?.error).toBe('runaway guard exceeded');
      // TELEMETRY: a near-timeout WARN must fire (at 0.5) BEFORE the guard.
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('approaching runaway guard'),
        expect.objectContaining({ jobId: 'job-runaway-1' })
      );
      // The finally must still release the slot even on guard expiry.
      expect(getInFlight('orchestrate')).toBe(0);
    });
  });

  // ==========================================================================
  // fail-closed default (#4363, increment 2 of the #4351 Option C decision)
  // ==========================================================================

  // `writeJobComplete` fired on ANY resolved value, so a callback that resolved
  // a failure-shaped payload recorded `complete`: a caller polling
  // `get_job_result` saw success and never looked inside. Increment 1 (#4362)
  // normalized the two known offenders; this makes the chokepoint itself refuse
  // the shape, so the next caller cannot reintroduce it by omission.
  describe('fail-closed default (#4363)', () => {
    /** Dispatch + drive one background run deterministically. */
    async function runJob(
      jobId: string,
      result: unknown,
      extra: Record<string, unknown> = {}
    ): Promise<ReturnType<typeof readJobResult>> {
      const params = {
        toolName: 'orchestrate',
        input: { task: 't' } as DummyInput,
        freshJobId: () => jobId,
        run: () => Promise.resolve(result),
        ...extra,
      };
      runAsJob<DummyInput, unknown>({ ...params, run: () => new Promise(() => {}) });
      await runJobInBackground(jobId, params);
      return readJobResult(jobId);
    }

    it('refuses to record an isError ToolResult as complete', async () => {
      const record = await runJob('job-fc-iserror', {
        isError: true,
        content: [{ type: 'text', text: 'adapter unauthorized' }],
      });

      expect(record?.status).toBe('failed');
    });

    it('refuses to record an { ok: false } result as complete', async () => {
      expect((await runJob('job-fc-ok', { ok: false, error: 'no quorum' }))?.status).toBe('failed');
    });

    it('refuses to record a { success: false } result as complete', async () => {
      expect((await runJob('job-fc-success', { success: false }))?.status).toBe('failed');
    });

    it('names the key that tripped, so the record is debuggable', async () => {
      const record = await runJob('job-fc-why', { ok: false, error: 'no quorum' });

      expect(record?.error).toContain('ok');
      // …and carries the payload's own message rather than a bare "failed".
      expect(record?.error).toContain('no quorum');
    });

    it('records an ordinary success as complete', async () => {
      const record = await runJob('job-fc-happy', { value: 42 });

      expect(record?.status).toBe('complete');
      expect(record?.result).toEqual({ value: 42 });
    });

    // The false-positive class the #4351 panel made binding: fail-closed must
    // not become fail-wrong. These payloads all describe work that SUCCEEDED.
    describe('does not misread success payloads as failures', () => {
      it('a rejected consensus verdict is a successful job', async () => {
        const record = await runJob('job-fc-verdict', {
          ok: true,
          value: { decision: 'rejected', approvalPercentage: 28 },
        });

        expect(record?.status).toBe('complete');
      });

      it('a nested success:false carried as DATA is a successful job', async () => {
        // A pipeline summary listing a stage it recovered from. Only root keys
        // are checked — never a deep scan.
        const record = await runJob('job-fc-nested', {
          success: true,
          stages: [
            { id: 'plan', success: true },
            { id: 'research', success: false, recovered: true },
          ],
        });

        expect(record?.status).toBe('complete');
      });

      it('a root isError:false is a successful job', async () => {
        expect((await runJob('job-fc-noterror', { isError: false }))?.status).toBe('complete');
      });

      it('a non-object payload is a successful job', async () => {
        expect((await runJob('job-fc-scalar', 'plain text result'))?.status).toBe('complete');
      });

      it('a null payload is a successful job', async () => {
        expect((await runJob('job-fc-null', null))?.status).toBe('complete');
      });
    });

    describe('opt-out is explicit and observable', () => {
      it('records complete when the caller opted out with a stated reason', async () => {
        const record = await runJob(
          'job-fc-optout',
          { ok: false, error: 'partial vote set after cancel' },
          { allowFailureShapedResult: 'partial results are the point of this tool' }
        );

        expect(record?.status).toBe('complete');
      });

      it('logs the opt-out when it actually suppresses a detection', async () => {
        // In a governance substrate an opted-out caller is a policy decision and
        // has to appear in the audit trail, not vanish into a silent kwarg.
        const warn = vi.fn();
        const logger = {
          warn,
          error: vi.fn(),
          info: vi.fn(),
          debug: vi.fn(),
        } as unknown as import('../../core/index.js').ILogger;

        await runJob(
          'job-fc-optout-logged',
          { ok: false },
          { allowFailureShapedResult: 'documented reason', logger }
        );

        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining('failure-shaped'),
          expect.objectContaining({
            jobId: 'job-fc-optout-logged',
            reason: 'documented reason',
          })
        );
      });

      it('does not log an opt-out that never had anything to suppress', async () => {
        const warn = vi.fn();
        const logger = {
          warn,
          error: vi.fn(),
          info: vi.fn(),
          debug: vi.fn(),
        } as unknown as import('../../core/index.js').ILogger;

        await runJob(
          'job-fc-optout-quiet',
          { value: 1 },
          { allowFailureShapedResult: 'documented reason', logger }
        );

        expect(warn).not.toHaveBeenCalled();
      });
    });
  });
});

describe('runAsJob — cancellation aborts in-flight work (#4086)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-runasjob-abort-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    resetConcurrency();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetConcurrency();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('a signal-respecting job stops when cancelled, and the cancellation is preserved', async () => {
    const jobId = 'job-abort-1';
    writeJobPending(jobId, 'orchestrate');
    let sawAbort = false;
    const bg = runJobInBackground<DummyInput, { ok: true }, never>(jobId, {
      toolName: 'orchestrate',
      input: { task: 'x' },
      freshJobId: () => jobId,
      // Respects the signal: never resolves on its own, rejects when aborted.
      run: (_id, _input, signal) =>
        new Promise<{ ok: true }>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            sawAbort = true;
            reject(new Error('aborted by signal'));
          });
        }),
    });

    // Simulate cancel_job: write the durable cancelled record FIRST, then abort.
    writeJobCancelled(jobId, 'orchestrate', 'user cancel');
    expect(abortJob(jobId, 'user cancel')).toBe(true);
    await bg;

    expect(sawAbort).toBe(true); // the work actually observed the abort
    // The terminal writer (writeJobFailed on the abort rejection) must NOT have
    // overwritten the cancellation (#4022 guard).
    expect(readJobResult(jobId)?.status).toBe('cancelled');
    // Slot released.
    expect(getInFlight('orchestrate')).toBe(0);
  });

  it('a job that IGNORES the signal still completes, but its cancelled record wins', async () => {
    const jobId = 'job-abort-2';
    writeJobPending(jobId, 'orchestrate');
    const bg = runJobInBackground<DummyInput, { ok: true }, never>(jobId, {
      toolName: 'orchestrate',
      input: { task: 'x' },
      freshJobId: () => jobId,
      run: () => Promise.resolve({ ok: true }), // ignores the signal, resolves immediately
    });

    writeJobCancelled(jobId, 'orchestrate', 'user cancel');
    await bg;

    // writeJobComplete ran but no-ops against the cancelled record (#4022).
    expect(readJobResult(jobId)?.status).toBe('cancelled');
  });
});
