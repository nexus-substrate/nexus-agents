/**
 * Tests for `get_job_result`'s abandoned-job disclosure (#4976).
 *
 * @module mcp/tools/get-job-result-tool.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerGetJobResultTool } from './get-job-result-tool.js';
import { writeJobPending, writeJobComplete } from '../jobs/job-result-store.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
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
