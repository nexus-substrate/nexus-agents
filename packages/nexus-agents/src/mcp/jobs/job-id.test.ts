/**
 * Job-id format validation at the tool schemas and the path builders.
 */

import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isValidJobId } from './job-id.js';
import { candidateJobResultPaths } from './job-result-candidates.js';
import { readJobResult, writeJobPending } from './job-result-store.js';
import { GetJobResultInputSchema } from '../tools/get-job-result-tool.js';
import { CancelJobInputSchema } from '../tools/cancel-job-tool.js';

/** Shapes produced by every mint site (see job-id.ts). */
const MINTED = [
  `rp-${randomUUID()}`,
  `dp-${randomUUID()}`,
  `sc-${randomUUID()}`,
  `rn-${randomUUID()}`,
  `gw-${randomUUID()}`,
  `pr-${randomUUID()}`,
  `es-${randomUUID()}`,
  `job-vote-${randomUUID()}`,
  `job-rw-${randomUUID()}`,
  'job-run_dev_pipeline-0123456789abcdef',
  randomUUID(),
  'tsk_mfz1k2x3_ab12cd',
  'my-session_01',
];

const REJECTED: readonly [string, string][] = [
  ['relative traversal', '../x'],
  ['absolute path', '/abs'],
  ['NUL byte', 'job\u0000id'],
  ['empty string', ''],
  ['dot segment', 'a.b'],
  ['backslash', 'a\\b'],
  ['over the length bound', 'a'.repeat(129)],
];

describe('isValidJobId', () => {
  it.each(MINTED)('accepts minted id %s', (id) => {
    expect(isValidJobId(id)).toBe(true);
  });

  it.each(REJECTED)('rejects %s', (_label, id) => {
    expect(isValidJobId(id)).toBe(false);
  });
});

describe('tool schemas validate the job id', () => {
  it.each(REJECTED)('get_job_result and cancel_job reject %s', (_label, id) => {
    expect(GetJobResultInputSchema.safeParse({ jobId: id }).success).toBe(false);
    expect(CancelJobInputSchema.safeParse({ jobId: id }).success).toBe(false);
  });

  it('accepts a valid id', () => {
    const id = `job-vote-${randomUUID()}`;
    expect(GetJobResultInputSchema.safeParse({ jobId: id }).success).toBe(true);
    expect(CancelJobInputSchema.safeParse({ jobId: id }).success).toBe(true);
  });
});

describe('path builders validate the job id (defence in depth)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'job-id-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
  });

  it.each(REJECTED)('builds no candidate path for %s', (_label, id) => {
    expect(candidateJobResultPaths(id)).toEqual([]);
    expect(readJobResult(id)).toBeNull();
  });

  it.each(REJECTED)('refuses to write a record for %s', (_label, id) => {
    expect(() => {
      writeJobPending(id, 'orchestrate');
    }).toThrow(/Invalid jobId/);
  });

  it('builds a path and writes a record for a valid id', () => {
    const id = `rn-${randomUUID()}`;
    const [primary] = candidateJobResultPaths(id);
    expect(primary).toBe(join(tmpDir, 'jobs', `result-${id}.json`));
    writeJobPending(id, 'run');
    expect(readJobResult(id)?.status).toBe('pending');
    expect(readdirSync(join(tmpDir, 'jobs'))).toContain(`result-${id}.json`);
  });
});
