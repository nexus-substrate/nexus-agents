/**
 * `checkSecurityScan` forwards its abort signal and stops on it (#6747).
 *
 * @module pipeline/security-gate-abort.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../security/osv-lookup.js', () => ({ queryOsvBatch: vi.fn() }));
vi.mock('../mcp/tools/security-scan.js', () => ({ executeSecurityScan: vi.fn() }));

import { checkSecurityScan } from './security-gate.js';
import { executeSecurityScan } from '../mcp/tools/security-scan.js';
import { queryOsvBatch } from '../security/osv-lookup.js';
import { AbortError } from '../adapters/abort-utils.js';

const CLEAN_SCAN = { scanner: 'semgrep', totalFindings: 0, findings: [], errors: [] };

let project: string;

beforeEach(() => {
  vi.mocked(executeSecurityScan).mockReset();
  vi.mocked(queryOsvBatch).mockReset();
  vi.mocked(queryOsvBatch).mockResolvedValue([]);
  project = mkdtempSync(join(tmpdir(), 'nexus-secgate-abort-'));
  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify({ dependencies: { lodash: '^4.17.20' } })
  );
  return () => {
    rmSync(project, { recursive: true, force: true });
  };
});

describe('checkSecurityScan and the abort signal (#6747)', () => {
  it('hands the signal to the scanner and to the OSV lookups', async () => {
    vi.mocked(executeSecurityScan).mockResolvedValue(CLEAN_SCAN);
    const signal = new AbortController().signal;

    await checkSecurityScan(project)(signal);

    expect(vi.mocked(executeSecurityScan).mock.calls[0]?.[1]).toBe(signal);
    expect(vi.mocked(queryOsvBatch).mock.calls[0]?.[2]).toBe(signal);
  });

  it('does not start the OSV lookups once the signal fired during the scan', async () => {
    const controller = new AbortController();
    vi.mocked(executeSecurityScan).mockImplementation(() => {
      controller.abort('cancel_job');
      return Promise.resolve({ error: 'Scan failed: semgrep aborted' });
    });

    await expect(checkSecurityScan(project)(controller.signal)).rejects.toBeInstanceOf(AbortError);
    expect(queryOsvBatch).not.toHaveBeenCalled();
  });

  it('rejects rather than reporting a verdict when the signal fired during the OSV lookups', async () => {
    const controller = new AbortController();
    vi.mocked(executeSecurityScan).mockResolvedValue(CLEAN_SCAN);
    vi.mocked(queryOsvBatch).mockImplementation(() => {
      controller.abort('cancel_job');
      return Promise.resolve([]);
    });

    await expect(checkSecurityScan(project)(controller.signal)).rejects.toBeInstanceOf(AbortError);
  });
});
