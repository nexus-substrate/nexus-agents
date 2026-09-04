/**
 * Tests for job-result store (#3042 / epic #2631).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  writeJobPending,
  writeJobComplete,
  writeJobFailed,
  writeJobCancelled,
  readJobResult,
  isAbandonedJob,
  isMeasuredBuildVersion,
  type JobResult,
} from './job-result-store.js';
import { VERSION } from '../../version.js';
import { resetNexusDataDirCache, nexusDataPath } from '../../config/nexus-data-dir.js';

describe('job-result-store', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-jobs-test-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('sidecar file permissions (#3753 defense-in-depth)', () => {
    const mode600 = (jobId: string): number =>
      statSync(nexusDataPath('jobs', `result-${jobId}.json`)).mode & 0o777;

    it('writes each terminal record with 0600 mode', () => {
      writeJobComplete('mode-complete', 'orchestrate', { ok: true });
      writeJobFailed('mode-failed', 'orchestrate', 'boom');
      writeJobCancelled('mode-cancelled', 'orchestrate', 'stop');
      expect(mode600('mode-complete')).toBe(0o600);
      expect(mode600('mode-failed')).toBe(0o600);
      expect(mode600('mode-cancelled')).toBe(0o600);
    });

    it('writeJobPending creates the file 0600', () => {
      writeJobPending('mode-pending', 'orchestrate');
      expect(mode600('mode-pending')).toBe(0o600);
    });

    it('a complete that OVERWRITES a pending stays 0600', () => {
      writeJobPending('mode-overwrite', 'orchestrate');
      writeJobComplete('mode-overwrite', 'orchestrate', { ok: true });
      expect(mode600('mode-overwrite')).toBe(0o600);
    });
  });

  it('writeJobPending creates a pending record', () => {
    writeJobPending('job-test-1', 'orchestrate');
    const record = readJobResult('job-test-1');
    expect(record).not.toBeNull();
    expect(record?.status).toBe('pending');
    expect(record?.jobId).toBe('job-test-1');
    expect(record?.toolName).toBe('orchestrate');
    expect(record?.v).toBe(1);
    expect(record?.createdAt).toBeDefined();
    expect(record?.completedAt).toBeUndefined();
    expect(record?.result).toBeUndefined();
  });

  it('writeJobComplete replaces pending with complete + result', () => {
    writeJobPending('job-test-2', 'orchestrate');
    const payload = { foo: 'bar', count: 42 };
    writeJobComplete('job-test-2', 'orchestrate', payload);
    const record = readJobResult('job-test-2');
    expect(record?.status).toBe('complete');
    expect(record?.result).toEqual(payload);
    expect(record?.completedAt).toBeDefined();
    expect(record?.error).toBeUndefined();
  });

  it('writeJobComplete preserves createdAt from the pending record', () => {
    writeJobPending('job-test-3', 'orchestrate');
    const pendingCreated = readJobResult('job-test-3')?.createdAt;
    // Advance time observably — small sleep is enough since ISO timestamps
    // are millisecond-resolution.
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* spin briefly so the next ISO timestamp differs */
    }
    writeJobComplete('job-test-3', 'orchestrate', { ok: true });
    const completed = readJobResult('job-test-3');
    expect(completed?.createdAt).toBe(pendingCreated);
  });

  it('writeJobFailed sets error + clears result', () => {
    writeJobPending('job-test-4', 'orchestrate');
    writeJobFailed('job-test-4', 'orchestrate', 'something broke');
    const record = readJobResult('job-test-4');
    expect(record?.status).toBe('failed');
    expect(record?.error).toBe('something broke');
    expect(record?.result).toBeUndefined();
    expect(record?.completedAt).toBeDefined();
  });

  it('readJobResult returns null for unknown jobId', () => {
    expect(readJobResult('does-not-exist')).toBeNull();
  });

  // #4017: complete/fail-after-cancel must NOT rewrite a cancellation. A
  // runAsJob-dispatched job's work keeps running after cancel_job (no abort
  // wiring), so the terminal writers must preserve the `cancelled` record.
  it('writeJobComplete is a NO-OP once the job is cancelled (#4017)', () => {
    writeJobPending('job-cancel-complete', 'run');
    writeJobCancelled('job-cancel-complete', 'run', 'user cancelled');
    writeJobComplete('job-cancel-complete', 'run', { ok: true });
    const record = readJobResult('job-cancel-complete');
    expect(record?.status).toBe('cancelled');
    expect(record?.result).toBeUndefined();
    expect(record?.error).toBe('user cancelled');
  });

  it('writeJobFailed is a NO-OP once the job is cancelled (#4017)', () => {
    writeJobPending('job-cancel-fail', 'run');
    writeJobCancelled('job-cancel-fail', 'run', 'user cancelled');
    writeJobFailed('job-cancel-fail', 'run', 'late failure');
    const record = readJobResult('job-cancel-fail');
    expect(record?.status).toBe('cancelled');
    expect(record?.error).toBe('user cancelled');
  });

  it('writeJobPending is idempotent — re-call does not overwrite a completed record', () => {
    writeJobPending('job-test-5', 'orchestrate');
    writeJobComplete('job-test-5', 'orchestrate', { done: true });
    // Second pending write must not regress the record back to pending.
    writeJobPending('job-test-5', 'orchestrate');
    const record = readJobResult('job-test-5');
    expect(record?.status).toBe('complete');
    expect(record?.result).toEqual({ done: true });
  });

  it('readJobResult handles a future-schema record gracefully (returns null, not throw)', () => {
    writeJobPending('job-test-6', 'orchestrate');
    // Manually corrupt the file with a future version number — readJobResult
    // should treat schema-mismatch as "not found" so a polling client doesn't
    // crash when reading records written by a newer nexus-agents process.
    const path = nexusDataPath('jobs', 'result-job-test-6.json');
    writeFileSync(path, JSON.stringify({ v: 99, jobId: 'job-test-6', what: 'is this' }));
    expect(readJobResult('job-test-6')).toBeNull();
  });

  it('readJobResult handles a corrupt-JSON record gracefully', () => {
    writeJobPending('job-test-7', 'orchestrate');
    const path = nexusDataPath('jobs', 'result-job-test-7.json');
    writeFileSync(path, '{not valid json');
    expect(readJobResult('job-test-7')).toBeNull();
  });
});

// =============================================================================
// A pending record that outlived the guard is abandoned (#4976)
// =============================================================================

describe('isAbandonedJob (#4976)', () => {
  // `runAsJob` writes the pending record then backgrounds the body. If the
  // process dies mid-body no terminal writer runs, and `writeJobPending`
  // refuses to overwrite — so the record stays `pending` forever and a poller
  // waits on work that no longer exists.
  const GUARD_MS = 3_600_000;

  function pendingRecord(createdAt: string): JobResult {
    return { v: 1, jobId: 'j', toolName: 't', status: 'pending', createdAt };
  }

  it('is false for a pending job still inside the guard window', () => {
    const now = Date.parse('2026-08-25T12:00:00.000Z');
    const record = pendingRecord(new Date(now - GUARD_MS + 60_000).toISOString());

    expect(isAbandonedJob(record, now)).toBe(false);
  });

  it('is true once it has outlived the guard', () => {
    // The anchor is objective: a live job cannot still be pending past the
    // runaway guard, because the guard would have recorded it `failed`.
    const now = Date.parse('2026-08-25T12:00:00.000Z');
    const record = pendingRecord(new Date(now - GUARD_MS - 60_000).toISOString());

    expect(isAbandonedJob(record, now)).toBe(true);
  });

  it('never calls a settled record abandoned, however old', () => {
    // The pair. A `complete` record from last year is history, not a stuck
    // job — flagging it would make the field meaningless.
    const now = Date.parse('2026-08-25T12:00:00.000Z');
    const old = new Date(now - GUARD_MS * 1000).toISOString();

    for (const status of ['complete', 'failed', 'cancelled'] as const) {
      expect(isAbandonedJob({ ...pendingRecord(old), status }, now)).toBe(false);
    }
  });

  it('does not guess when the timestamp is unparseable', () => {
    // An unreadable `createdAt` is an unknown age; treating it as abandoned
    // would kill a job that may well be running. Documented rather than
    // pinned: NaN comparisons are false, so this holds with or without an
    // explicit guard and no mutation can distinguish the two.
    expect(isAbandonedJob(pendingRecord('not-a-date'), Date.now())).toBe(false);
  });
});

describe('producerVersion (#5008)', () => {
  // `get_job_result` is a wrapped tool, so its `_meta` build stamp names the
  // READER's build. After a mid-session global install the reader and the
  // process that ran the job differ — the record itself has to say who wrote it.
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];
  // Deliberately NOT `VERSION`: writing and reading the same literal would let
  // an identity bug (stamp from the wrong source, or not at all) pass.
  const FIXTURE_VERSION = '9.9.9-fixture';

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-jobs-version-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('every writer stamps the version it was given, and it round-trips', () => {
    writeJobPending('pv-pending', 'orchestrate', undefined, FIXTURE_VERSION);
    writeJobComplete('pv-complete', 'orchestrate', { ok: true }, FIXTURE_VERSION);
    writeJobFailed('pv-failed', 'orchestrate', 'boom', FIXTURE_VERSION);
    writeJobCancelled('pv-cancelled', 'orchestrate', 'stop', FIXTURE_VERSION);

    for (const jobId of ['pv-pending', 'pv-complete', 'pv-failed', 'pv-cancelled']) {
      expect(readJobResult(jobId)?.producerVersion, jobId).toBe(FIXTURE_VERSION);
    }
    expect(FIXTURE_VERSION).not.toBe(VERSION);
  });

  it('defaults to the running server VERSION when no version is supplied', () => {
    writeJobPending('pv-default-pending', 'orchestrate');
    writeJobComplete('pv-default-complete', 'orchestrate', { ok: true });
    writeJobFailed('pv-default-failed', 'orchestrate', 'boom');
    writeJobCancelled('pv-default-cancelled', 'orchestrate');

    for (const jobId of [
      'pv-default-pending',
      'pv-default-complete',
      'pv-default-failed',
      'pv-default-cancelled',
    ]) {
      expect(readJobResult(jobId)?.producerVersion, jobId).toBe(VERSION);
    }
  });

  it('a terminal write re-stamps with the terminal writer, not the pending writer', () => {
    // Same process in practice, but the record must describe the write that
    // produced it, not inherit a stale stamp through `existing`.
    writeJobPending('pv-restamp', 'orchestrate', undefined, '1.0.0-old');
    writeJobComplete('pv-restamp', 'orchestrate', { ok: true }, FIXTURE_VERSION);
    expect(readJobResult('pv-restamp')?.producerVersion).toBe(FIXTURE_VERSION);
  });

  it('a legacy v1 record without the field still parses (absence = pre-field producer)', () => {
    const legacy = {
      v: 1,
      jobId: 'pv-legacy',
      toolName: 'orchestrate',
      status: 'complete',
      createdAt: '2026-08-01T00:00:00.000Z',
      completedAt: '2026-08-01T00:01:00.000Z',
      result: { ok: true },
    };
    mkdirSync(join(tmpDir, 'jobs'), { recursive: true });
    writeFileSync(join(tmpDir, 'jobs', 'result-pv-legacy.json'), JSON.stringify(legacy));

    const record = readJobResult('pv-legacy');
    expect(record).not.toBeNull();
    expect(record?.status).toBe('complete');
    expect(record?.producerVersion).toBeUndefined();
    expect(isMeasuredBuildVersion(record?.producerVersion)).toBe(false);
  });
});

describe('isMeasuredBuildVersion (#5008)', () => {
  it("treats 'dev' as UNMEASURED — it is what VERSION reads without the build-time define", () => {
    // Two local builds at different commits both report 'dev'; calling that a
    // match would be exactly the misreport the record exists to prevent.
    expect(isMeasuredBuildVersion('dev')).toBe(false);
  });

  it('treats an absent or empty value as unmeasured', () => {
    expect(isMeasuredBuildVersion(undefined)).toBe(false);
    expect(isMeasuredBuildVersion('')).toBe(false);
  });

  it('treats a real version string as measured', () => {
    expect(isMeasuredBuildVersion('4.3.1')).toBe(true);
    expect(isMeasuredBuildVersion('9.9.9-fixture')).toBe(true);
  });
});
