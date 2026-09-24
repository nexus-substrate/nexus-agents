/**
 * Tests for job-result store (#3042 / epic #2631).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  statSync,
} from 'node:fs';
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
  pruneJobRecords,
  pruneJobRecordsIfDue,
  toJobSummary,
  heartbeatJob,
  JOB_RECORD_RETENTION_MS,
  _setCandidatePathsResolverForTests,
  JobFailureDetailSchema,
  type JobFailureDetail,
  type JobResult,
} from './job-result-store.js';
import { VERSION } from '../../version.js';
import { resetNexusDataDirCache, nexusDataPath } from '../../config/nexus-data-dir.js';
import { FAKE_ANTHROPIC_KEY } from '../../testing/test-secrets.js';
import { REDACTED_KEY_PLACEHOLDER } from '../../security/output-sanitizer.js';

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

  describe('failureDetail and write-path redaction (#4375)', () => {
    it('JobFailureDetailSchema parses valid detail and strips excess fields', () => {
      const parsed = JobFailureDetailSchema.parse({
        adapter: 'claude',
        transport: 'subprocess',
        category: 'rate_limited',
        rawBody: 'should be stripped',
        prompt: 'should not leak',
      });
      expect(parsed).toEqual({
        adapter: 'claude',
        transport: 'subprocess',
        category: 'rate_limited',
      });
      expect((parsed as Record<string, unknown>)['rawBody']).toBeUndefined();
      expect((parsed as Record<string, unknown>)['prompt']).toBeUndefined();
    });

    it('JobFailureDetailSchema accepts capacity_exhausted (#4373)', () => {
      const parsed = JobFailureDetailSchema.parse({
        adapter: 'codex',
        transport: 'subprocess',
        category: 'capacity_exhausted',
      });
      expect(parsed.category).toBe('capacity_exhausted');
    });

    it('JobFailureDetailSchema rejects empty strings', () => {
      expect(() =>
        JobFailureDetailSchema.parse({
          adapter: '',
          transport: 'subprocess',
          category: 'rate_limit',
        })
      ).toThrow();
      expect(() =>
        JobFailureDetailSchema.parse({ adapter: 'claude', transport: '', category: 'rate_limit' })
      ).toThrow();
      expect(() =>
        JobFailureDetailSchema.parse({ adapter: 'claude', transport: 'subprocess', category: '' })
      ).toThrow();
    });

    it('persists structured failureDetail for an ordinary adapter failure', () => {
      const jobId = 'job-fail-detail-1';
      writeJobPending(jobId, 'orchestrate');
      const detail: JobFailureDetail = {
        adapter: 'claude',
        transport: 'subprocess',
        category: 'rate_limited',
      };
      writeJobFailed(jobId, 'orchestrate', 'Process exited with code 1', undefined, detail);

      const record = readJobResult(jobId);
      expect(record?.status).toBe('failed');
      expect(record?.failureDetail).toEqual({
        adapter: 'claude',
        transport: 'subprocess',
        category: 'rate_limited',
      });
    });

    it('asserts provider error body containing credential and prompt fragment does NOT reach job record (#4375)', () => {
      const jobId = 'job-redact-on-write';
      writeJobPending(jobId, 'orchestrate');

      const providerBody = JSON.stringify({
        error: {
          message: `Request failed with key ${FAKE_ANTHROPIC_KEY}`,
          prompt: 'Generate confidential source code for project Apollo',
          system_prompt: 'System prompt instructions',
        },
      });
      const rawErrorMessage = `Upstream API failure: 429 Too Many Requests: ${providerBody}`;

      writeJobFailed(jobId, 'orchestrate', rawErrorMessage, undefined, {
        adapter: 'anthropic',
        transport: 'subprocess',
        category: 'rate_limit',
      });

      // Read raw file from disk directly to verify disk representation
      const filePath = nexusDataPath('jobs', `result-${jobId}.json`);
      const fileContent = readFileSync(filePath, 'utf8');

      // Assert neither credential nor prompt fragment reached disk
      expect(fileContent).not.toContain(FAKE_ANTHROPIC_KEY);
      expect(fileContent).not.toContain('Generate confidential source code for project Apollo');
      expect(fileContent).not.toContain('System prompt instructions');
      expect(fileContent).toContain(REDACTED_KEY_PLACEHOLDER);

      // Verify readJobResult parses the sanitized record
      const record = readJobResult(jobId);
      expect(record?.status).toBe('failed');
      expect(record?.error).not.toContain(FAKE_ANTHROPIC_KEY);
      expect(record?.error).not.toContain('Generate confidential source code');
      expect(record?.failureDetail).toEqual({
        adapter: 'anthropic',
        transport: 'subprocess',
        category: 'rate_limit',
      });
    });

    it('sanitizes credentials and prompt fragments in writeJobCancelled reason', () => {
      const jobId = 'job-cancel-redact';
      writeJobPending(jobId, 'orchestrate');
      const rawReason = `Cancelled due to token leak ${FAKE_ANTHROPIC_KEY} and prompt={"prompt":"secret"}`;
      writeJobCancelled(jobId, 'orchestrate', rawReason);

      const filePath = nexusDataPath('jobs', `result-${jobId}.json`);
      const fileContent = readFileSync(filePath, 'utf8');

      expect(fileContent).not.toContain(FAKE_ANTHROPIC_KEY);
      expect(fileContent).not.toContain('secret');
      expect(fileContent).toContain(REDACTED_KEY_PLACEHOLDER);
    });

    it('sanitizes string leaves of a writeJobComplete result on disk', () => {
      const jobId = 'job-complete-redact';
      writeJobPending(jobId, 'orchestrate');
      writeJobComplete(jobId, 'orchestrate', {
        summary: `worker echoed ${FAKE_ANTHROPIC_KEY}`,
        steps: [{ output: `clone https://bot:TESTFAKE-pass@git.example.com/r` }],
      });

      const fileContent = readFileSync(nexusDataPath('jobs', `result-${jobId}.json`), 'utf8');
      expect(fileContent).not.toContain(FAKE_ANTHROPIC_KEY);
      expect(fileContent).not.toContain('TESTFAKE-pass');

      const record = readJobResult(jobId);
      expect(record?.status).toBe('complete');
      expect(record?.result).toEqual({
        summary: `worker echoed ${REDACTED_KEY_PLACEHOLDER}`,
        steps: [{ output: `clone https://${REDACTED_KEY_PLACEHOLDER}@git.example.com/r` }],
      });
    });

    it('leaves the structure and non-string values of a complete result intact', () => {
      const jobId = 'job-complete-shape';
      writeJobPending(jobId, 'orchestrate');
      const at = new Date('2026-01-02T03:04:05.000Z');
      writeJobComplete(jobId, 'orchestrate', {
        count: 42,
        ok: true,
        missing: null,
        nested: { list: [1, 'two', { three: false }], empty: [] },
        at,
      });
      expect(readJobResult(jobId)?.result).toEqual({
        count: 42,
        ok: true,
        missing: null,
        nested: { list: [1, 'two', { three: false }], empty: [] },
        at: '2026-01-02T03:04:05.000Z',
      });
    });
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

describe('isAbandonedJob (#4976, anchored on the resolved guard since #6224)', () => {
  // `runAsJob` writes the pending record then backgrounds the body. If the
  // process dies mid-body no terminal writer runs, and `writeJobPending`
  // refuses to overwrite — so the record stays `pending` forever and a poller
  // waits on work that no longer exists.
  const GUARD_MS = 3_600_000;
  const OVERRIDE_ENV = 'NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS';
  const originalOverride = process.env[OVERRIDE_ENV];

  beforeEach(() => {
    delete process.env['NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS'];
  });

  afterEach(() => {
    if (originalOverride === undefined) delete process.env['NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS'];
    else process.env[OVERRIDE_ENV] = originalOverride;
  });

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

  it('with no override, the boundary is the declared 3,600,000 ms guard plus the write slack', () => {
    // The slack is smaller than a minute, so the two rows above still hold;
    // this pins the exact edge so a change to the slack is a visible change.
    const now = Date.parse('2026-08-25T12:00:00.000Z');
    // `ABANDONED_TERMINAL_WRITE_SLACK_MS` in the store — pinned here as a
    // literal so a change to it is a visible change to this test.
    const SLACK_MS = 30_000;
    const edge = GUARD_MS + SLACK_MS;
    expect(isAbandonedJob(pendingRecord(new Date(now - edge).toISOString()), now)).toBe(false);
    expect(isAbandonedJob(pendingRecord(new Date(now - edge - 1).toISOString()), now)).toBe(true);
  });

  it('follows the operator override the guard itself runs under (#6224)', () => {
    // Since #6159 `runAsJob` guards the body with the RESOLVED class guard,
    // which `NEXUS_TIMEOUT_CLASS_ASYNC_JOB_BODY_MS` may raise to 7,200,000 ms.
    // Anchoring on the declared 3,600,000 ms base reported a job 61 minutes
    // into a live 2-hour body as abandoned while its guard had 59 minutes left.
    process.env[OVERRIDE_ENV] = '7200000';
    const now = Date.parse('2026-08-25T12:00:00.000Z');

    expect(isAbandonedJob(pendingRecord(new Date(now - 4_000_000).toISOString()), now)).toBe(false);
    expect(isAbandonedJob(pendingRecord(new Date(now - 7_300_000).toISOString()), now)).toBe(true);
  });

  it('re-resolves the guard on every read rather than caching it across env changes', () => {
    const now = Date.parse('2026-08-25T12:00:00.000Z');
    const record = pendingRecord(new Date(now - 4_000_000).toISOString());

    expect(isAbandonedJob(record, now)).toBe(true);
    process.env[OVERRIDE_ENV] = '7200000';
    expect(isAbandonedJob(record, now)).toBe(false);
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
    process.env[OVERRIDE_ENV] = '7200000';
    expect(isAbandonedJob(pendingRecord('not-a-date'), Date.now())).toBe(false);
  });
});

describe('pruneJobRecords (#6224, #4976 gap 2)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];
  const NOW = Date.parse('2026-09-14T12:00:00.000Z');
  const RETENTION_MS = 7 * 24 * 3_600_000;
  const GUARD_MS = 3_600_000;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-jobs-prune-test-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const jobsDir = (): string => nexusDataPath('jobs');
  const pathOf = (jobId: string): string => join(jobsDir(), `result-${jobId}.json`);

  function seed(record: JobResult): void {
    mkdirSync(jobsDir(), { recursive: true });
    writeFileSync(pathOf(record.jobId), JSON.stringify(record));
  }

  function at(msAgo: number): string {
    return new Date(NOW - msAgo).toISOString();
  }

  function terminal(
    jobId: string,
    status: 'complete' | 'failed' | 'cancelled',
    completedMsAgo: number
  ): JobResult {
    return {
      v: 1,
      jobId,
      toolName: 't',
      status,
      createdAt: at(completedMsAgo + 1_000),
      completedAt: at(completedMsAgo),
      ...(status === 'complete' ? { result: { ok: true } } : { error: 'boom' }),
    };
  }

  function pending(jobId: string, createdMsAgo: number): JobResult {
    return { v: 1, jobId, toolName: 't', status: 'pending', createdAt: at(createdMsAgo) };
  }

  /** An idempotency index entry (`key-*.json`) pointing at `jobId`. */
  function seedKey(name: string, jobId: string, createdMsAgo: number): string {
    mkdirSync(jobsDir(), { recursive: true });
    const path = join(jobsDir(), `key-${name}.json`);
    writeFileSync(
      path,
      JSON.stringify({
        v: 1,
        tool: 't',
        key: name,
        inputsHash: 'a'.repeat(64),
        jobId,
        createdAt: at(createdMsAgo),
      })
    );
    return path;
  }

  const ZERO = { deleted: 0, markedAbandoned: 0, kept: 0, unreadable: 0, deletedKeys: 0 };

  it('names the empty case: an absent or empty jobs dir prunes nothing and counts zero', () => {
    expect(existsSync(jobsDir())).toBe(false);
    expect(pruneJobRecords({ nowMs: NOW, retentionMs: RETENTION_MS })).toEqual(ZERO);

    mkdirSync(jobsDir(), { recursive: true });
    expect(pruneJobRecords({ nowMs: NOW, retentionMs: RETENTION_MS })).toEqual(ZERO);
  });

  it('drops an idempotency key entry past the window whose record is gone, in the same sweep', () => {
    // Before retention a key always replayed a record that existed. Deleting
    // the record without the key would replay a jobId `get_job_result` cannot
    // find, and the caller could never re-dispatch under that key.
    seed(terminal('old-complete', 'complete', RETENTION_MS + 1));
    const dangling = seedKey('dangling', 'old-complete', RETENTION_MS + 1);
    const alreadyGone = seedKey('already-gone', 'never-written', RETENTION_MS + 1);
    seed(terminal('fresh', 'complete', 0));
    const live = seedKey('live', 'fresh', 0);
    // Record still present (pending inside the window): the key stays with it.
    seed(pending('pending-young', 60_000));
    const youngKey = seedKey('young', 'pending-young', RETENTION_MS + 1);
    // Younger than the window: kept even though its record is missing — it may
    // be mid-dispatch (the key is registered right after the pending write).
    const recentDangling = seedKey('recent-dangling', 'not-yet', 1_000);

    const counts = pruneJobRecords({ nowMs: NOW, retentionMs: RETENTION_MS });

    expect(counts).toEqual({ ...ZERO, deleted: 1, kept: 2, deletedKeys: 2 });
    expect(existsSync(dangling)).toBe(false);
    expect(existsSync(alreadyGone)).toBe(false);
    expect(existsSync(live)).toBe(true);
    expect(existsSync(youngKey)).toBe(true);
    expect(existsSync(recentDangling)).toBe(true);
  });

  it('counts an unreadable key entry and leaves it in place', () => {
    mkdirSync(jobsDir(), { recursive: true });
    const corrupt = join(jobsDir(), 'key-corrupt.json');
    writeFileSync(corrupt, '{not json');

    const counts = pruneJobRecords({ nowMs: NOW, retentionMs: RETENTION_MS });

    expect(counts).toEqual({ ...ZERO, unreadable: 1 });
    expect(existsSync(corrupt)).toBe(true);
  });

  it('deletes terminal records whose completedAt is older than the window and keeps the rest', () => {
    seed(terminal('old-complete', 'complete', RETENTION_MS + 1));
    seed(terminal('old-failed', 'failed', RETENTION_MS + 1));
    seed(terminal('old-cancelled', 'cancelled', RETENTION_MS + 1));
    seed(terminal('fresh-complete', 'complete', RETENTION_MS - 1));
    seed(terminal('edge-complete', 'complete', RETENTION_MS));

    const counts = pruneJobRecords({ nowMs: NOW, retentionMs: RETENTION_MS });

    expect(counts).toEqual({
      deleted: 3,
      markedAbandoned: 0,
      kept: 2,
      unreadable: 0,
      deletedKeys: 0,
    });
    expect(existsSync(pathOf('old-complete'))).toBe(false);
    expect(existsSync(pathOf('old-failed'))).toBe(false);
    expect(existsSync(pathOf('old-cancelled'))).toBe(false);
    expect(existsSync(pathOf('fresh-complete'))).toBe(true);
    // Exactly at the window is kept: "older than", not "at least as old as".
    expect(existsSync(pathOf('edge-complete'))).toBe(true);
  });

  it('falls back to createdAt when a terminal record carries no completedAt', () => {
    const { completedAt: _dropped, ...noCompletedAt } = terminal('legacy', 'complete', 0);
    seed({ ...noCompletedAt, createdAt: at(RETENTION_MS + 1) });
    const { completedAt: _dropped2, ...noCompletedAtFresh } = terminal(
      'legacy-fresh',
      'complete',
      0
    );
    seed({ ...noCompletedAtFresh, createdAt: at(RETENTION_MS - 1) });

    const counts = pruneJobRecords({ nowMs: NOW, retentionMs: RETENTION_MS });

    expect(counts).toEqual({
      deleted: 1,
      markedAbandoned: 0,
      kept: 1,
      unreadable: 0,
      deletedKeys: 0,
    });
    expect(existsSync(pathOf('legacy'))).toBe(false);
    expect(existsSync(pathOf('legacy-fresh'))).toBe(true);
  });

  it('marks a pending record that is abandoned AND older than the window as failed, keeping the evidence', () => {
    seed({ ...pending('gone', RETENTION_MS + 1), signalAccepted: true, producerVersion: '8.50.0' });

    const counts = pruneJobRecords({ nowMs: NOW, retentionMs: RETENTION_MS });

    expect(counts).toEqual({
      deleted: 0,
      markedAbandoned: 1,
      kept: 0,
      unreadable: 0,
      deletedKeys: 0,
    });
    const rewritten = readJobResult('gone');
    expect(rewritten?.status).toBe('failed');
    expect(rewritten?.errorKind).toBe('abandoned');
    expect(rewritten?.error).toContain('abandoned');
    expect(rewritten?.error).toContain('8.50.0');
    // The original evidence travels with the rewrite.
    expect(rewritten?.createdAt).toBe(at(RETENTION_MS + 1));
    expect(rewritten?.signalAccepted).toBe(true);
    expect(rewritten?.completedAt).toBe(new Date(NOW).toISOString());
    expect(rewritten?.producerVersion).toBe(VERSION);
    expect(statSync(pathOf('gone')).mode & 0o777).toBe(0o600);
  });

  it('never deletes a pending record, however old', () => {
    // Deleting would erase the only evidence that the dispatch happened. The
    // abandoned mark is a rewrite, never a removal.
    seed(pending('ancient', RETENTION_MS * 52));

    const counts = pruneJobRecords({ nowMs: NOW, retentionMs: RETENTION_MS });

    expect(counts.deleted).toBe(0);
    expect(counts.markedAbandoned).toBe(1);
    expect(existsSync(pathOf('ancient'))).toBe(true);
  });

  it('leaves a pending record alone while it is inside the window, even when abandoned', () => {
    // Older than the guard (so `get_job_result` reports it abandoned) but
    // younger than the window: reported, not written back — the existing rule.
    seed(pending('recent-abandoned', GUARD_MS * 2));
    seed(pending('live', GUARD_MS / 2));

    const counts = pruneJobRecords({ nowMs: NOW, retentionMs: RETENTION_MS });

    expect(counts).toEqual({
      deleted: 0,
      markedAbandoned: 0,
      kept: 2,
      unreadable: 0,
      deletedKeys: 0,
    });
    expect(readJobResult('recent-abandoned')?.status).toBe('pending');
    expect(readJobResult('live')?.status).toBe('pending');
  });

  it('leaves a pending record alone when the window has passed but the guard has not', () => {
    // Both conditions are real: a short window on its own must not mark a job
    // that may still be running under its guard.
    seed(pending('still-running', GUARD_MS / 2));

    const counts = pruneJobRecords({ nowMs: NOW, retentionMs: 1_000 });

    expect(counts).toEqual({
      deleted: 0,
      markedAbandoned: 0,
      kept: 1,
      unreadable: 0,
      deletedKeys: 0,
    });
    expect(readJobResult('still-running')?.status).toBe('pending');
  });

  it('counts unreadable files and leaves them in place, never deleting them', () => {
    mkdirSync(jobsDir(), { recursive: true });
    writeFileSync(pathOf('corrupt'), '{not json');
    writeFileSync(pathOf('future'), JSON.stringify({ v: 2, jobId: 'future' }));
    writeFileSync(join(jobsDir(), 'notes.txt'), 'not a record');
    seed(terminal('old-complete', 'complete', RETENTION_MS + 1));

    const counts = pruneJobRecords({ nowMs: NOW, retentionMs: RETENTION_MS });

    expect(counts).toEqual({
      deleted: 1,
      markedAbandoned: 0,
      kept: 0,
      unreadable: 2,
      deletedKeys: 0,
    });
    expect(existsSync(pathOf('corrupt'))).toBe(true);
    expect(existsSync(pathOf('future'))).toBe(true);
    expect(existsSync(join(jobsDir(), 'notes.txt'))).toBe(true);
  });

  it('with dryRun, reports the same counts and changes nothing on disk', () => {
    seed(terminal('old-complete', 'complete', RETENTION_MS + 1));
    seed(pending('gone', RETENTION_MS + 1));
    seed(terminal('fresh', 'complete', 0));

    const counts = pruneJobRecords({ nowMs: NOW, retentionMs: RETENTION_MS, dryRun: true });

    expect(counts).toEqual({
      deleted: 1,
      markedAbandoned: 1,
      kept: 1,
      unreadable: 0,
      deletedKeys: 0,
    });
    expect(readJobResult('old-complete')?.status).toBe('complete');
    expect(readJobResult('gone')?.status).toBe('pending');
  });

  it('the default window is seven days', () => {
    expect(JOB_RECORD_RETENTION_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('throws when the jobs path exists but cannot be enumerated', () => {
    // A directory that will not open is not an empty directory; reporting
    // zeros there would be the vacuous verdict the Mission section names.
    writeFileSync(jobsDir(), 'not a directory');
    expect(() => pruneJobRecords({ nowMs: NOW, retentionMs: RETENTION_MS })).toThrow();
  });

  describe('pruneJobRecordsIfDue — one sweep per process per hour', () => {
    // The throttle is keyed by jobs directory, and every test here gets a fresh
    // one, so the first call in a test is always the first sweep of that dir.
    const SWEEP_INTERVAL_MS = 3_600_000;

    it('sweeps on the first call and not again until the interval has elapsed', () => {
      seed(terminal('first', 'complete', RETENTION_MS + 1));
      expect(pruneJobRecordsIfDue(NOW)?.deleted).toBe(1);
      expect(existsSync(pathOf('first'))).toBe(false);

      seed(terminal('second', 'complete', RETENTION_MS + 1));
      expect(pruneJobRecordsIfDue(NOW + SWEEP_INTERVAL_MS - 1)).toBeNull();
      expect(existsSync(pathOf('second'))).toBe(true);

      expect(pruneJobRecordsIfDue(NOW + SWEEP_INTERVAL_MS)?.deleted).toBe(1);
      expect(existsSync(pathOf('second'))).toBe(false);
    });

    it('the throttle is per jobs directory, so a second data dir gets its own first sweep', () => {
      seed(terminal('first', 'complete', RETENTION_MS + 1));
      expect(pruneJobRecordsIfDue(NOW)?.deleted).toBe(1);

      const otherDir = mkdtempSync(join(tmpdir(), 'nexus-jobs-prune-other-'));
      try {
        process.env['NEXUS_DATA_DIR'] = otherDir;
        resetNexusDataDirCache();
        seed(terminal('other', 'complete', RETENTION_MS + 1));
        expect(pruneJobRecordsIfDue(NOW + 1)?.deleted).toBe(1);
      } finally {
        rmSync(otherDir, { recursive: true, force: true });
      }
    });

    it('a sweep that throws does not escape, and the next call still waits for the interval', () => {
      // The jobs path is a FILE, so readdirSync throws (ENOTDIR).
      writeFileSync(jobsDir(), 'not a directory');
      expect(pruneJobRecordsIfDue(NOW)).toBeNull();
      rmSync(jobsDir());
      seed(terminal('after-failure', 'complete', RETENTION_MS + 1));
      expect(pruneJobRecordsIfDue(NOW + 1)).toBeNull();
      expect(existsSync(pathOf('after-failure'))).toBe(true);
    });
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

describe('heartbeatJob — the heartbeat stamp (#6162)', () => {
  // `runAsJob` hands the job body a `progress()` callback; each call stamps
  // `lastProgressAt` on the PENDING record so a poller can tell slow from
  // stuck. A terminal record is never touched: a heartbeat that lands after a
  // cancel or after the guard would otherwise resurrect a settled job.
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-jobs-progress-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stamps lastProgressAt on a pending record and keeps every other field', () => {
    writeJobPending('hb-pending', 'orchestrate', true, '9.9.9-fixture');
    const before = readJobResult('hb-pending');

    heartbeatJob('hb-pending', '2026-09-16T12:34:56.000Z');

    const after = readJobResult('hb-pending');
    expect(after?.lastProgressAt).toBe('2026-09-16T12:34:56.000Z');
    expect(after).toEqual({ ...before, lastProgressAt: '2026-09-16T12:34:56.000Z' });
  });

  it('a later stamp replaces the earlier one', () => {
    writeJobPending('hb-twice', 'orchestrate');
    heartbeatJob('hb-twice', '2026-09-16T12:00:00.000Z');
    heartbeatJob('hb-twice', '2026-09-16T12:05:00.000Z');
    expect(readJobResult('hb-twice')?.lastProgressAt).toBe('2026-09-16T12:05:00.000Z');
  });

  it('is a no-op on a terminal record — a late heartbeat cannot resurrect a settled job', () => {
    writeJobPending('hb-cancelled', 'orchestrate');
    writeJobCancelled('hb-cancelled', 'orchestrate', 'operator cancelled');
    const settled = readJobResult('hb-cancelled');

    heartbeatJob('hb-cancelled', '2026-09-16T12:34:56.000Z');

    expect(readJobResult('hb-cancelled')).toEqual(settled);
    expect(readJobResult('hb-cancelled')).not.toHaveProperty('lastProgressAt');
  });

  it('is a no-op for an unknown jobId — it stamps a record, it never creates one', () => {
    heartbeatJob('hb-missing', '2026-09-16T12:34:56.000Z');
    expect(readJobResult('hb-missing')).toBeNull();
    expect(existsSync(nexusDataPath('jobs', 'result-hb-missing.json'))).toBe(false);
  });

  it('the terminal writers carry the stamp — a settled record still says when the body last moved', () => {
    const settlers: ReadonlyArray<readonly [string, () => void]> = [
      [
        'hb-done',
        () => {
          writeJobComplete('hb-done', 'orchestrate', { ok: true });
        },
      ],
      [
        'hb-failed',
        () => {
          writeJobFailed('hb-failed', 'orchestrate', 'wedged (no progress)');
        },
      ],
      [
        'hb-gone',
        () => {
          writeJobCancelled('hb-gone', 'orchestrate', 'stop');
        },
      ],
    ];
    for (const [jobId, settle] of settlers) {
      writeJobPending(jobId, 'orchestrate');
      heartbeatJob(jobId, '2026-09-16T12:34:56.000Z');
      settle();
      expect(readJobResult(jobId)?.lastProgressAt).toBe('2026-09-16T12:34:56.000Z');
    }
    // And a record that never heartbeat settles without the field.
    writeJobPending('hb-never', 'orchestrate');
    writeJobComplete('hb-never', 'orchestrate', { ok: true });
    expect(readJobResult('hb-never')).not.toHaveProperty('lastProgressAt');
  });

  it('toJobSummary carries lastProgressAt when present and omits it when absent', () => {
    writeJobPending('hb-summary', 'orchestrate');
    const silent = readJobResult('hb-summary');
    if (silent === null) throw new Error('record missing');
    expect(toJobSummary(silent)).not.toHaveProperty('lastProgressAt');

    heartbeatJob('hb-summary', '2026-09-16T12:34:56.000Z');
    const beating = readJobResult('hb-summary');
    if (beating === null) throw new Error('record missing');
    expect(toJobSummary(beating).lastProgressAt).toBe('2026-09-16T12:34:56.000Z');
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

describe('cross-data-directory split resolution (#5472)', () => {
  let primaryDir: string;
  let sharedDir: string;
  let primaryJobsDir: string;
  let sharedJobsDir: string;

  beforeEach(() => {
    primaryDir = mkdtempSync(join(tmpdir(), 'nexus-primary-split-'));
    sharedDir = mkdtempSync(join(tmpdir(), 'nexus-shared-split-'));
    primaryJobsDir = join(primaryDir, 'jobs');
    sharedJobsDir = join(sharedDir, 'jobs');
    mkdirSync(primaryJobsDir, { recursive: true });
    mkdirSync(sharedJobsDir, { recursive: true });

    _setCandidatePathsResolverForTests((jobId) => [
      join(primaryJobsDir, `result-${jobId}.json`),
      join(sharedJobsDir, `result-${jobId}.json`),
    ]);
  });

  afterEach(() => {
    _setCandidatePathsResolverForTests(undefined);
    rmSync(primaryDir, { recursive: true, force: true });
    rmSync(sharedDir, { recursive: true, force: true });
  });

  it('writeJobComplete syncs to alternate candidate file when pending existed in shared dir', () => {
    const jobId = 'split-job-1';
    const sharedPath = join(sharedJobsDir, `result-${jobId}.json`);
    const primaryPath = join(primaryJobsDir, `result-${jobId}.json`);

    // Simulate dispatch writing pending in shared directory before workspace activation
    const pendingRecord: JobResult = {
      v: 1,
      jobId,
      toolName: 'consensus_vote',
      status: 'pending',
      createdAt: '2026-09-04T19:28:32.000Z',
      producerVersion: '8.81.0',
    };
    writeFileSync(sharedPath, JSON.stringify(pendingRecord, null, 2));

    // Now write complete from the process where primary is repo-local
    writeJobComplete(jobId, 'consensus_vote', { verdict: 'approved' }, '8.81.0');

    // Both files now have complete status
    expect(existsSync(primaryPath)).toBe(true);
    expect(existsSync(sharedPath)).toBe(true);

    const primaryParsed = JSON.parse(readFileSync(primaryPath, 'utf8')) as JobResult;
    const sharedParsed = JSON.parse(readFileSync(sharedPath, 'utf8')) as JobResult;
    expect(primaryParsed.status).toBe('complete');
    expect(sharedParsed.status).toBe('complete');
    expect(primaryParsed.result).toEqual({ verdict: 'approved' });
    expect(sharedParsed.result).toEqual({ verdict: 'approved' });
    expect(primaryParsed.createdAt).toBe('2026-09-04T19:28:32.000Z');
    expect(sharedParsed.createdAt).toBe('2026-09-04T19:28:32.000Z');

    // readJobResult returns complete
    const read = readJobResult(jobId);
    expect(read?.status).toBe('complete');
    expect(read?.result).toEqual({ verdict: 'approved' });
  });

  it('readJobResult prefers terminal record over stale pending across candidate paths', () => {
    const jobId = 'split-job-2';
    const sharedPath = join(sharedJobsDir, `result-${jobId}.json`);
    const primaryPath = join(primaryJobsDir, `result-${jobId}.json`);

    // Primary has stale pending (e.g. from an earlier dispatch)
    const pendingRecord: JobResult = {
      v: 1,
      jobId,
      toolName: 'consensus_vote',
      status: 'pending',
      createdAt: '2026-09-04T19:28:32.000Z',
      lastProgressAt: '2026-09-04T19:35:00.000Z',
    };
    writeFileSync(primaryPath, JSON.stringify(pendingRecord, null, 2));

    // Alternate candidate has complete
    const completeRecord: JobResult = {
      v: 1,
      jobId,
      toolName: 'consensus_vote',
      status: 'complete',
      createdAt: '2026-09-04T19:28:32.000Z',
      completedAt: '2026-09-04T19:32:14.000Z',
      result: { verdict: 'approved' },
    };
    writeFileSync(sharedPath, JSON.stringify(completeRecord, null, 2));

    const read = readJobResult(jobId);
    expect(read?.status).toBe('complete');
    expect(read?.completedAt).toBe('2026-09-04T19:32:14.000Z');
    expect(read?.lastProgressAt).toBe('2026-09-04T19:35:00.000Z');
  });

  it('preserves cancellation when one candidate is cancelled and other is complete', () => {
    const jobId = 'split-job-3';
    const sharedPath = join(sharedJobsDir, `result-${jobId}.json`);
    const primaryPath = join(primaryJobsDir, `result-${jobId}.json`);

    const cancelledRecord: JobResult = {
      v: 1,
      jobId,
      toolName: 'orchestrate',
      status: 'cancelled',
      createdAt: '2026-09-04T19:00:00.000Z',
      completedAt: '2026-09-04T19:02:00.000Z',
      error: 'operator cancelled',
    };
    const completeRecord: JobResult = {
      v: 1,
      jobId,
      toolName: 'orchestrate',
      status: 'complete',
      createdAt: '2026-09-04T19:00:00.000Z',
      completedAt: '2026-09-04T19:05:00.000Z',
    };
    writeFileSync(primaryPath, JSON.stringify(completeRecord, null, 2));
    writeFileSync(sharedPath, JSON.stringify(cancelledRecord, null, 2));

    const read = readJobResult(jobId);
    expect(read?.status).toBe('cancelled');
    expect(read?.error).toBe('operator cancelled');
  });

  it('heartbeatJob updates both candidate paths when pending exists in both', () => {
    const jobId = 'split-job-4';
    const sharedPath = join(sharedJobsDir, `result-${jobId}.json`);
    const primaryPath = join(primaryJobsDir, `result-${jobId}.json`);

    const pendingRecord: JobResult = {
      v: 1,
      jobId,
      toolName: 'orchestrate',
      status: 'pending',
      createdAt: '2026-09-04T19:00:00.000Z',
    };
    writeFileSync(primaryPath, JSON.stringify(pendingRecord, null, 2));
    writeFileSync(sharedPath, JSON.stringify(pendingRecord, null, 2));

    heartbeatJob(jobId, '2026-09-04T19:05:00.000Z');

    const primaryRead = JSON.parse(readFileSync(primaryPath, 'utf8')) as JobResult;
    const sharedRead = JSON.parse(readFileSync(sharedPath, 'utf8')) as JobResult;
    expect(primaryRead.lastProgressAt).toBe('2026-09-04T19:05:00.000Z');
    expect(sharedRead.lastProgressAt).toBe('2026-09-04T19:05:00.000Z');
  });

  it('writeJobFailed syncs to existing alternate candidate path', () => {
    const jobId = 'split-job-5';
    const sharedPath = join(sharedJobsDir, `result-${jobId}.json`);
    const primaryPath = join(primaryJobsDir, `result-${jobId}.json`);

    const pendingRecord: JobResult = {
      v: 1,
      jobId,
      toolName: 'orchestrate',
      status: 'pending',
      createdAt: '2026-09-04T19:00:00.000Z',
    };
    writeFileSync(sharedPath, JSON.stringify(pendingRecord, null, 2));

    writeJobFailed(jobId, 'orchestrate', 'fatal error');

    const primaryRead = JSON.parse(readFileSync(primaryPath, 'utf8')) as JobResult;
    const sharedRead = JSON.parse(readFileSync(sharedPath, 'utf8')) as JobResult;
    expect(primaryRead.status).toBe('failed');
    expect(sharedRead.status).toBe('failed');
    expect(primaryRead.error).toBe('fatal error');
    expect(sharedRead.error).toBe('fatal error');
  });

  it('writeJobCancelled syncs to existing alternate candidate path', () => {
    const jobId = 'split-job-6';
    const sharedPath = join(sharedJobsDir, `result-${jobId}.json`);
    const primaryPath = join(primaryJobsDir, `result-${jobId}.json`);

    const pendingRecord: JobResult = {
      v: 1,
      jobId,
      toolName: 'orchestrate',
      status: 'pending',
      createdAt: '2026-09-04T19:00:00.000Z',
    };
    writeFileSync(sharedPath, JSON.stringify(pendingRecord, null, 2));

    writeJobCancelled(jobId, 'orchestrate', 'user requested abort');

    const primaryRead = JSON.parse(readFileSync(primaryPath, 'utf8')) as JobResult;
    const sharedRead = JSON.parse(readFileSync(sharedPath, 'utf8')) as JobResult;
    expect(primaryRead.status).toBe('cancelled');
    expect(sharedRead.status).toBe('cancelled');
    expect(primaryRead.error).toBe('user requested abort');
    expect(sharedRead.error).toBe('user requested abort');
  });
});
