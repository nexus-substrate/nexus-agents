/**
 * Tests for the shared async-job dispatcher `runAsJob` (#3729 / epic #2631).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runAsJob, runJobInBackground } from './run-as-job.js';
import { readJobResult } from './job-result-store.js';
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
});
