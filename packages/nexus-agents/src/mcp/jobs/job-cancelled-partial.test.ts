/**
 * `attachCancelledPartial` (#6735): the one writer allowed to touch a
 * `cancelled` record, and only to add the votes cast before the cancel.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { attachCancelledPartial } from './job-cancelled-partial.js';
import {
  readJobResult,
  writeJobCancelled,
  writeJobComplete,
  writeJobFailed,
  writeJobPending,
} from './job-result-store.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

const TOOL = 'consensus_vote';
const PANEL_SIZE = 3;
const CAST = [{ role: 'architect', vote: { decision: 'approve' }, source: 'llm' }];

describe('attachCancelledPartial (#6735)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-job-partial-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('adds the partials to a cancelled record and changes nothing else', () => {
    writeJobPending('j1', TOOL);
    writeJobCancelled('j1', TOOL, 'user requested abort');
    const before = readJobResult('j1');

    expect(attachCancelledPartial('j1', TOOL, { partialVotes: CAST, panelSize: PANEL_SIZE })).toBe(
      true
    );

    const after = readJobResult('j1');
    expect(after).toEqual({
      ...before,
      cancelledPartial: { partialVotes: CAST, seatsCast: 1, panelSize: PANEL_SIZE },
    });
    expect(after?.status).toBe('cancelled');
    expect(after).not.toHaveProperty('result');
  });

  it('empty case: no seats cast is recorded as 0 of the panel, not left absent', () => {
    writeJobPending('j2', TOOL);
    writeJobCancelled('j2', TOOL);

    expect(attachCancelledPartial('j2', TOOL, { partialVotes: [], panelSize: PANEL_SIZE })).toBe(
      true
    );

    expect(readJobResult('j2')?.cancelledPartial).toEqual({
      partialVotes: [],
      seatsCast: 0,
      panelSize: PANEL_SIZE,
    });
  });

  it.each([
    [
      'pending',
      (id: string) => {
        writeJobPending(id, TOOL);
      },
    ],
    [
      'complete',
      (id: string) => {
        writeJobPending(id, TOOL);
        writeJobComplete(id, TOOL, { ok: true });
      },
    ],
    [
      'failed',
      (id: string) => {
        writeJobPending(id, TOOL);
        writeJobFailed(id, TOOL, 'boom');
      },
    ],
  ])('does not touch a %s record — it cannot settle a job', (status, seed) => {
    seed('j3');
    const before = readJobResult('j3');

    expect(attachCancelledPartial('j3', TOOL, { partialVotes: CAST, panelSize: PANEL_SIZE })).toBe(
      false
    );

    expect(readJobResult('j3')).toEqual(before);
    expect(readJobResult('j3')?.status).toBe(status);
  });

  it("does not touch another tool's cancelled record", () => {
    writeJobPending('j6', 'orchestrate');
    writeJobCancelled('j6', 'orchestrate');
    const before = readJobResult('j6');

    expect(attachCancelledPartial('j6', TOOL, { partialVotes: CAST, panelSize: PANEL_SIZE })).toBe(
      false
    );

    expect(readJobResult('j6')).toEqual(before);
  });

  it('does nothing for an unknown jobId', () => {
    expect(
      attachCancelledPartial('missing', TOOL, { partialVotes: CAST, panelSize: PANEL_SIZE })
    ).toBe(false);
    expect(readJobResult('missing')).toBeNull();
  });

  it('first write wins: a second attach cannot replace the partials', () => {
    writeJobPending('j4', TOOL);
    writeJobCancelled('j4', TOOL);
    attachCancelledPartial('j4', TOOL, { partialVotes: CAST, panelSize: PANEL_SIZE });

    expect(attachCancelledPartial('j4', TOOL, { partialVotes: [], panelSize: 7 })).toBe(false);

    expect(readJobResult('j4')?.cancelledPartial?.seatsCast).toBe(1);
    expect(readJobResult('j4')?.cancelledPartial?.panelSize).toBe(PANEL_SIZE);
  });

  it('a later complete or failed write leaves the cancelled record and its partials intact', () => {
    writeJobPending('j5', TOOL);
    writeJobCancelled('j5', TOOL);
    attachCancelledPartial('j5', TOOL, { partialVotes: CAST, panelSize: PANEL_SIZE });
    const before = readJobResult('j5');

    writeJobComplete('j5', TOOL, { ok: true, value: { decision: 'approved' } });
    writeJobFailed('j5', TOOL, 'late failure');

    expect(readJobResult('j5')).toEqual(before);
  });
});
