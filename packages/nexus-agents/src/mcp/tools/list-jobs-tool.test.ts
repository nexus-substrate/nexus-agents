/**
 * Tests for list_jobs MCP tool (#3046 / epic #2631 Stage 5).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ListJobsInputSchema } from './list-jobs-tool.js';
import {
  writeJobPending,
  writeJobComplete,
  writeJobFailed,
  listJobs,
} from '../jobs/job-result-store.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

let tmpDir: string;
const originalDataDir = process.env['NEXUS_DATA_DIR'];

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'nexus-list-jobs-test-'));
  process.env['NEXUS_DATA_DIR'] = tmpDir;
  resetNexusDataDirCache();
});

afterEach(() => {
  if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
  else process.env['NEXUS_DATA_DIR'] = originalDataDir;
  resetNexusDataDirCache();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('ListJobsInputSchema', () => {
  it('accepts empty input (all filters absent)', () => {
    const result = ListJobsInputSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts toolName filter', () => {
    const result = ListJobsInputSchema.safeParse({ toolName: 'orchestrate' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.toolName).toBe('orchestrate');
  });

  it('accepts status filter (all 4 lifecycle states)', () => {
    for (const status of ['pending', 'complete', 'failed', 'cancelled'] as const) {
      const result = ListJobsInputSchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it('rejects unknown status', () => {
    const result = ListJobsInputSchema.safeParse({ status: 'fire-and-forget' });
    expect(result.success).toBe(false);
  });

  it('accepts limit in [1, 200]', () => {
    expect(ListJobsInputSchema.safeParse({ limit: 1 }).success).toBe(true);
    expect(ListJobsInputSchema.safeParse({ limit: 200 }).success).toBe(true);
  });

  it('rejects limit > 200 or < 1', () => {
    expect(ListJobsInputSchema.safeParse({ limit: 201 }).success).toBe(false);
    expect(ListJobsInputSchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});

describe('listJobs (store integration)', () => {
  it('returns empty list when jobs dir does not exist yet', () => {
    expect(listJobs()).toEqual([]);
  });

  it('returns one summary per sidecar file', () => {
    writeJobPending('job-a', 'orchestrate');
    writeJobPending('job-b', 'run_workflow');
    const jobs = listJobs();
    expect(jobs.length).toBe(2);
    expect(jobs.map((j) => j.toolName).sort()).toEqual(['orchestrate', 'run_workflow']);
  });

  it('summaries exclude the full result payload (size discipline)', () => {
    writeJobPending('job-c', 'orchestrate');
    writeJobComplete('job-c', 'orchestrate', { huge: 'x'.repeat(10_000) });
    const jobs = listJobs();
    const c = jobs.find((j) => j.jobId === 'job-c');
    expect(c).toBeDefined();
    // JobSummary shape does NOT include the result field — confirms
    // list_jobs is a discovery surface, not a retrieval one.
    expect((c as unknown as { result?: unknown }).result).toBeUndefined();
  });

  it('sorts newest createdAt first', () => {
    // writeJobPending uses Date.now() — second call lands later than first.
    writeJobPending('job-old', 'orchestrate');
    // Tiny spin to ensure distinct ISO timestamps.
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* spin */
    }
    writeJobPending('job-new', 'run_workflow');
    const jobs = listJobs();
    expect(jobs[0]?.jobId).toBe('job-new');
    expect(jobs[1]?.jobId).toBe('job-old');
  });

  it('preserves status field through the summary', () => {
    writeJobPending('job-pending', 'orchestrate');
    writeJobPending('job-failed', 'run_workflow');
    writeJobFailed('job-failed', 'run_workflow', 'something broke');
    writeJobPending('job-done', 'consensus_vote');
    writeJobComplete('job-done', 'consensus_vote', { ok: true });

    const statuses = new Map(listJobs().map((j) => [j.jobId, j.status]));
    expect(statuses.get('job-pending')).toBe('pending');
    expect(statuses.get('job-failed')).toBe('failed');
    expect(statuses.get('job-done')).toBe('complete');
  });

  it('hasError flag matches failed records', () => {
    writeJobPending('job-x', 'orchestrate');
    writeJobFailed('job-x', 'orchestrate', 'rip');
    writeJobPending('job-y', 'orchestrate');
    writeJobComplete('job-y', 'orchestrate', { ok: true });

    const byId = new Map(listJobs().map((j) => [j.jobId, j]));
    expect(byId.get('job-x')?.hasError).toBe(true);
    expect(byId.get('job-y')?.hasError).toBe(false);
  });

  it('skips non-matching filenames in the jobs dir (defensive)', async () => {
    writeJobPending('job-real', 'orchestrate');
    // Drop a stray file in the jobs dir that doesn't match `result-*.json`.
    const fs = await import('node:fs');
    const path = await import('node:path');
    fs.writeFileSync(path.join(tmpDir, 'jobs', 'README.md'), '# scratch');
    const jobs = listJobs();
    expect(jobs.length).toBe(1);
    expect(jobs[0]?.jobId).toBe('job-real');
  });
});
