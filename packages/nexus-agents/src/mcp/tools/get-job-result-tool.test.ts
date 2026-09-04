/**
 * Tests for `get_job_result`'s abandoned-job disclosure (#4976).
 *
 * @module mcp/tools/get-job-result-tool.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerGetJobResultTool } from './get-job-result-tool.js';
import { writeJobPending, writeJobComplete } from '../jobs/job-result-store.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import { initTaskState, updateStage, appendResult } from '../../context/structured-task-state.js';
import { RateLimiter } from '../middleware/rate-limiter.js';

type SdkCallback = (args: unknown) => Promise<{ content: readonly { text: string }[] }>;

/**
 * Drives the callback the tool actually registers, through the secure-handler
 * and timeout wrappers it really runs behind — not an exported inner function.
 * A response shape asserted anywhere short of here is not the one a caller
 * receives.
 */
async function envelope(jobId: string): Promise<Record<string, unknown>> {
  let registered: SdkCallback | undefined;
  const server = {
    registerTool: (_name: string, _config: unknown, callback: SdkCallback): void => {
      registered = callback;
    },
  };
  // A real limiter, generously sized: the point is to exercise the wrappers,
  // not to be throttled by them.
  registerGetJobResultTool(server as never, {
    rateLimiter: new RateLimiter({ capacity: 100, refillRate: 100 }),
  });
  if (registered === undefined) throw new Error('get_job_result registered no callback');
  const result = await registered({ jobId });
  return JSON.parse(result.content[0]?.text ?? '{}') as Record<string, unknown>;
}

describe('get_job_result abandoned disclosure (#4976)', () => {
  // The record is durable; the work is a detached in-process promise. A crash
  // mid-body leaves `pending` forever — `writeJobPending` refuses to overwrite
  // — so a poller waits on work that no longer exists. Before this, the
  // response said `pending` and nothing else.
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-gjr-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not flag a freshly dispatched job', () => {
    writeJobPending('job-fresh', 'orchestrate');

    return envelope('job-fresh').then((body) => {
      expect(body['found']).toBe(true);
      expect(body).not.toHaveProperty('abandoned');
    });
  });

  it('does not flag a settled job', () => {
    // The pair that matters most: a `complete` record must never be called
    // abandoned however old it is, or the field becomes noise.
    writeJobComplete('job-done', 'orchestrate', { ok: true });

    return envelope('job-done').then((body) => {
      expect(body).not.toHaveProperty('abandoned');
    });
  });

  it('tells the poller to stop waiting once the guard has elapsed', async () => {
    // Seam test. `isAbandonedJob` is unit-tested; whether the registered tool
    // surfaces it is a separate question, and the join is where six other
    // defects hid today.
    writeJobPending('job-stale', 'orchestrate');
    const stale = new Date(Date.now() - 3_600_000 - 60_000).toISOString();
    const path = join(tmpDir, 'jobs', 'result-job-stale.json');
    const { readFileSync, writeFileSync } = await import('node:fs');
    const record = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    writeFileSync(path, JSON.stringify({ ...record, createdAt: stale }));

    const body = await envelope('job-stale');

    expect(body['abandoned']).toBe(true);
    expect(String(body['errorMessage'])).toMatch(/dispatch again|no longer|gone/i);
  });
});

describe('get_job_result producer-version disclosure (#5008)', () => {
  // The tool's own `_meta['nexus-agents/build']` names the READER's build.
  // After a mid-session install that is not the build that ran the job, so
  // the response has to carry the record's own stamp — and say whether that
  // stamp measures anything.
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];
  const FIXTURE_VERSION = '9.9.9-fixture';

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-gjr-version-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('surfaces the recorded producerVersion and marks a real version measured', async () => {
    writeJobComplete('job-pv-real', 'orchestrate', { ok: true }, FIXTURE_VERSION);

    const body = await envelope('job-pv-real');
    const record = body['record'] as Record<string, unknown>;

    expect(record['producerVersion']).toBe(FIXTURE_VERSION);
    expect(body['producerVersionMeasured']).toBe(true);
    expect(body['producerVersionSource']).toBe('sidecar');
  });

  it('names the task-state source, whose synthesized record never carries a version', async () => {
    // Under NEXUS_JOB_RESULT_SOURCE=task_state the record is adapted from the
    // task-state log, which has no producer version. Reporting only
    // `measured: false` would read as "pre-field record" — a third meaning
    // for absence. The source disambiguates.
    const originalSource = process.env['NEXUS_JOB_RESULT_SOURCE'];
    process.env['NEXUS_JOB_RESULT_SOURCE'] = 'task_state';
    try {
      initTaskState({
        taskId: 'orch-pv-ts',
        stage: 'planning',
        decisions: [],
        blockers: [],
        position: { currentStep: 'init' },
        updatedAt: '2026-05-01T00:00:00Z',
      });
      updateStage('orch-pv-ts', 'complete', '2026-05-01T00:05:00Z');
      appendResult('orch-pv-ts', { ok: true }, '2026-05-01T00:05:01Z');

      const body = await envelope('orch-pv-ts');
      const record = body['record'] as Record<string, unknown>;

      expect(body['found']).toBe(true);
      expect(body['producerVersionSource']).toBe('task_state');
      expect(body['producerVersionMeasured']).toBe(false);
      expect(record).not.toHaveProperty('producerVersion');
    } finally {
      if (originalSource === undefined) delete process.env['NEXUS_JOB_RESULT_SOURCE'];
      else process.env['NEXUS_JOB_RESULT_SOURCE'] = originalSource;
    }
  });

  it("marks a 'dev' producer unmeasured — two local builds both read 'dev'", async () => {
    writeJobComplete('job-pv-dev', 'orchestrate', { ok: true }, 'dev');

    const body = await envelope('job-pv-dev');
    const record = body['record'] as Record<string, unknown>;

    expect(record['producerVersion']).toBe('dev');
    expect(body['producerVersionMeasured']).toBe(false);
  });

  it('marks a legacy record (no field) unmeasured rather than defaulting a value', async () => {
    const legacy = {
      v: 1,
      jobId: 'job-pv-legacy',
      toolName: 'orchestrate',
      status: 'complete',
      createdAt: '2026-08-01T00:00:00.000Z',
      completedAt: '2026-08-01T00:01:00.000Z',
      result: { ok: true },
    };
    mkdirSync(join(tmpDir, 'jobs'), { recursive: true });
    writeFileSync(join(tmpDir, 'jobs', 'result-job-pv-legacy.json'), JSON.stringify(legacy));

    const body = await envelope('job-pv-legacy');
    const record = body['record'] as Record<string, unknown>;

    expect(body['found']).toBe(true);
    expect(record).not.toHaveProperty('producerVersion');
    expect(body['producerVersionMeasured']).toBe(false);
  });

  it('does not claim a measurement for an unknown jobId', async () => {
    const body = await envelope('job-pv-missing');
    expect(body['found']).toBe(false);
    expect(body).not.toHaveProperty('producerVersionMeasured');
    expect(body).not.toHaveProperty('producerVersionSource');
  });
});
