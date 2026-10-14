/** Failed job diagnostics retain canonical tool messages without changing verdicts (#7402). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import { FAKE_ANTHROPIC_KEY } from '../../testing/test-secrets.js';
import { ERROR_ENVELOPE_META_KEY } from '../error-envelope.js';
import { toolStructuredError } from '../tools/tool-result.js';
import { _resetForTests as resetConcurrency, tryAcquire } from './job-concurrency.js';
import { readJobResult, writeJobPending } from './job-result-store.js';
import { runJobInBackground } from './run-as-job.js';

const JOB_ID = 'job-canonical-diagnostic';
const GENERIC_ERROR = "Job result reported failure via 'isError'";

/** Drive real settlement and disk persistence without a detached-promise race. */
async function settle(result: unknown): Promise<ReturnType<typeof readJobResult>> {
  expect(tryAcquire('run_pipeline')).toBe(true);
  writeJobPending(JOB_ID, 'run_pipeline');
  await runJobInBackground(JOB_ID, {
    toolName: 'run_pipeline',
    input: {},
    freshJobId: () => JOB_ID,
    run: () => Promise.resolve(result),
  });
  return readJobResult(JOB_ID);
}

describe('canonical error envelope to stored failed job (#7402)', () => {
  let dataDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'nexus-job-diagnostic-'));
    process.env['NEXUS_DATA_DIR'] = dataDir;
    resetNexusDataDirCache();
    resetConcurrency();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetConcurrency();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('preserves the canonical business diagnostic after root failure classification', async () => {
    const record = await settle(
      toolStructuredError({
        errorCategory: 'business',
        message: 'Analyze stage: repository not found',
      })
    );
    expect(record?.status).toBe('failed');
    expect(record?.error).toBe(`${GENERIC_ERROR}: Analyze stage: repository not found`);
    expect(record?.result).toBeUndefined();
    expect(record?.failureDetail).toBeUndefined();
  });

  it.each([
    { error: 'root error', message: 'root message', expected: 'root error' },
    { message: 'root message', expected: 'root message' },
    { error: 42, message: 'root message', expected: 'root message' },
    { error: '', message: 'root message', expected: '' },
  ])('retains root error/message precedence ($expected)', async ({ expected, ...root }) => {
    const result = toolStructuredError({
      errorCategory: 'business',
      message: 'envelope diagnostic',
    });
    const record = await settle({ ...result, ...root });
    expect(record?.status).toBe('failed');
    expect(record?.error).toBe(`${GENERIC_ERROR}: ${expected}`);
  });

  it('does not classify unrelated error-looking success data as failure', async () => {
    const result = {
      success: true,
      data: toolStructuredError({ errorCategory: 'business', message: 'recovered stage' }),
      content: [{ type: 'text', text: '{"isError":true,"message":"data only"}' }],
    };
    const record = await settle(result);
    expect(record?.status).toBe('complete');
    expect(record?.result).toEqual(result);
    expect(record?.error).toBeUndefined();
  });

  it('does not treat canonical metadata alone as a failure verdict', async () => {
    const result = {
      ...toolStructuredError({ errorCategory: 'business', message: 'data only' }),
      isError: false,
    };
    const record = await settle(result);
    expect(record?.status).toBe('complete');
    expect(record?.result).toEqual(result);
  });

  it('names the root failure when no canonical diagnostic exists', async () => {
    const record = await settle({ isError: true });
    expect(record?.status).toBe('failed');
    expect(record?.error).toBe(GENERIC_ERROR);
  });

  it.each([
    null,
    { message: 'unvalidated diagnostic' },
    { errorCategory: 'unknown', isRetryable: false, message: 'invalid category' },
    { errorCategory: 'business', isRetryable: false, message: '' },
    { errorCategory: 'business', isRetryable: false, message: 'x'.repeat(2001) },
  ])('ignores malformed canonical envelopes (%j)', async (envelope) => {
    const record = await settle({
      isError: true,
      _meta: { [ERROR_ENVELOPE_META_KEY]: envelope },
      content: [{ type: 'text', text: 'untrusted display content is not a fallback' }],
    });
    expect(record?.status).toBe('failed');
    expect(record?.error).toBe(GENERIC_ERROR);
  });

  it('retains structured adapter details alongside the canonical message', async () => {
    const record = await settle(
      toolStructuredError({
        errorCategory: 'transient',
        message: 'Adapter capacity exhausted',
        detail: { adapter: 'claude', transport: 'subprocess', category: 'CAPACITY_EXHAUSTED' },
      })
    );
    expect(record?.status).toBe('failed');
    expect(record?.error).toBe(`${GENERIC_ERROR}: Adapter capacity exhausted`);
    expect(record?.failureDetail).toEqual({
      adapter: 'claude',
      transport: 'subprocess',
      category: 'capacity_exhausted',
    });
  });

  it('redacts canonical messages through the existing job write path', async () => {
    const record = await settle(
      toolStructuredError({
        errorCategory: 'business',
        message: `Analyze failed: ${FAKE_ANTHROPIC_KEY}; password=FAKE_PASSWORD_NOTREAL`,
      })
    );
    expect(record?.status).toBe('failed');
    expect(record?.error).toContain('Analyze failed:');
    expect(record?.error).toContain('[REDACTED');
    expect(record?.error).not.toContain(FAKE_ANTHROPIC_KEY);
    expect(record?.error).not.toContain('FAKE_PASSWORD_NOTREAL');
  });

  it('accepts the canonical 2000-character bound without reading other content', async () => {
    const message = 'x'.repeat(2000);
    const record = await settle(toolStructuredError({ errorCategory: 'business', message }));
    expect(record?.status).toBe('failed');
    expect(record?.error).toBe(`${GENERIC_ERROR}: ${message}`);
  });
});
