/**
 * Tests for job-result store (#3042 / epic #2631).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  writeJobPending,
  writeJobComplete,
  writeJobFailed,
  readJobResult,
} from './job-result-store.js';
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
