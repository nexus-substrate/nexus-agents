/**
 * Tests for the persistent capability-gap ledger (#4645).
 *
 * @module core/task-analysis/capability-gap-ledger-persistence.test
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { CAPABILITY_GAP_TYPES } from './capability-gap-detector.js';
import type { CapabilityGapReport } from './capability-gap-detector.js';
import { createPersistentCapabilityGapLedger } from './capability-gap-ledger-persistence.js';

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop();
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  }
});

function scratchFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'gap-ledger-'));
  created.push(dir);
  return join(dir, 'gaps.jsonl');
}

const report = (name: string): CapabilityGapReport =>
  ({
    gaps: [{ type: 'tool', name, suggestion: 'stub' }],
    availableTools: [],
    availableExperts: [],
  }) as unknown as CapabilityGapReport;

describe('createPersistentCapabilityGapLedger', () => {
  it('survives a restart — the whole point', () => {
    const filePath = scratchFile();

    const first = createPersistentCapabilityGapLedger({ filePath });
    first.record(report('tree_sitter_python'), { goal: 'parse a service' });
    expect(first.size()).toBe(1);

    // A second ledger over the same file is a new process, as far as this is
    // concerned. Frequency that resets on restart is what made the in-memory
    // ledger unable to answer its consumer's question.
    const second = createPersistentCapabilityGapLedger({ filePath });
    expect(second.size()).toBe(1);
    expect(second.summarize()[0]?.name).toBe('tree_sitter_python');
  });

  it('accumulates frequency across sessions', () => {
    const filePath = scratchFile();
    for (let i = 0; i < 3; i += 1) {
      createPersistentCapabilityGapLedger({ filePath }).record(report('tree_sitter_python'), {});
    }
    const summary = createPersistentCapabilityGapLedger({ filePath }).summarize();
    expect(summary[0]?.count).toBe(3);
  });

  it('reports an absent file as empty, not as an error', () => {
    const ledger = createPersistentCapabilityGapLedger({ filePath: scratchFile() });
    expect(ledger.size()).toBe(0);
    expect(ledger.summarize()).toEqual([]);
    expect(ledger.loadReport().malformedLines).toBe(0);
    expect(ledger.loadReport().fileExisted).toBe(false);
  });

  it('distinguishes an absent file from an empty one', () => {
    // Both summarize to nothing; only one of them means "nothing was ever
    // written". Collapsing them hides a ledger pointed at the wrong path.
    const filePath = scratchFile();
    writeFileSync(filePath, '', 'utf-8');
    expect(createPersistentCapabilityGapLedger({ filePath }).loadReport().fileExisted).toBe(true);
  });

  it('counts malformed lines instead of silently dropping them', () => {
    // A silent skip under-reports frequency, which is the failure this ledger
    // exists to avoid. Surface it so a corrupt file cannot read as low demand.
    const filePath = scratchFile();
    writeFileSync(filePath, '{"not":"a gap entry"}\nnot json at all\n', 'utf-8');

    const ledger = createPersistentCapabilityGapLedger({ filePath });
    expect(ledger.size()).toBe(0);
    expect(ledger.loadReport().malformedLines).toBe(2);
  });

  it('keeps good lines when one line is corrupt', () => {
    const filePath = scratchFile();
    createPersistentCapabilityGapLedger({ filePath }).record(report('good'), {});
    writeFileSync(filePath, `${readFileSync(filePath, 'utf-8')}garbage\n`, 'utf-8');

    const ledger = createPersistentCapabilityGapLedger({ filePath });
    expect(ledger.size()).toBe(1);
    expect(ledger.loadReport().malformedLines).toBe(1);
  });

  it('drops entries older than the retention window', () => {
    const filePath = scratchFile();
    const old = new Date(Date.UTC(2020, 0, 1)).toISOString();
    writeFileSync(
      filePath,
      `${JSON.stringify({ type: 'tool', name: 'ancient', suggestion: 's', timestamp: old })}\n`,
      'utf-8'
    );

    const ledger = createPersistentCapabilityGapLedger({ filePath, retentionDays: 30 });
    expect(ledger.size()).toBe(0);
    expect(ledger.loadReport().expiredEntries).toBe(1);
  });

  it('records nothing for a report with no gaps', () => {
    // The empty case, named: a clean run must write no line at all, or the
    // file fills with non-events and frequency becomes meaningless.
    const filePath = scratchFile();
    const ledger = createPersistentCapabilityGapLedger({ filePath });
    ledger.record(
      { gaps: [], availableTools: [], availableExperts: [] } as unknown as CapabilityGapReport,
      {}
    );
    expect(ledger.size()).toBe(0);
    expect(ledger.loadReport().fileExisted).toBe(false);
  });
});

describe('every declared gap type survives a round trip (#4651)', () => {
  // The regression that motivated this: the validator hardcoded 'tool' |
  // 'expert', so persisted tool_refusal entries loaded as malformed and the
  // producer's output vanished between processes. Unit tests missed it because
  // the persistence tests used 'tool' and the producer tests used an in-memory
  // ledger — neither crossed the seam. Iterating CAPABILITY_GAP_TYPES makes a
  // newly added type fail here instead of silently disappearing on disk.
  it.each([...CAPABILITY_GAP_TYPES])('round-trips a %s gap', (type) => {
    const filePath = scratchFile();
    createPersistentCapabilityGapLedger({ filePath }).record(
      {
        available: { tools: [], experts: [] },
        gaps: [{ type, name: `x:${type}`, suggestion: 's' }],
        allSatisfied: false,
      },
      {}
    );

    const reloaded = createPersistentCapabilityGapLedger({ filePath });
    expect(reloaded.loadReport().malformedLines).toBe(0);
    expect(reloaded.summarize()[0]?.type).toBe(type);
  });
});

// ============================================================================
// The load report must distinguish "cannot read" from "written and empty"
// ============================================================================

describe('GapLedgerLoadReport completeness', () => {
  const dirs: string[] = [];
  function scratch(): string {
    const dir = mkdtempSync(join(tmpdir(), 'gap-ledger-report-'));
    dirs.push(dir);
    return join(dir, 'capability-gaps.jsonl');
  }
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('flags a file that exists and could not be read', () => {
    // The module's docstring claimed "cannot read" stayed distinguishable from
    // "nothing there" while both produced `fileExisted: true, loaded: 0,
    // malformedLines: 0, expiredEntries: 0`. A DIRECTORY at the ledger path
    // exists and cannot be read as a file — the same shape as an EACCES after
    // an ownership change.
    const filePath = scratch();
    mkdirSync(filePath, { recursive: true });

    const report = createPersistentCapabilityGapLedger({ filePath }).loadReport();

    expect(report.fileExisted).toBe(true);
    expect(report.readFailed).toBe(true);
    expect(report.loaded).toBe(0);
  });

  it('does not flag a readable empty file as a read failure', () => {
    // The pair, and the case the flag has to stay apart from: an empty ledger
    // is a real measurement of zero demand.
    const filePath = scratch();
    writeFileSync(filePath, '', 'utf-8');

    const report = createPersistentCapabilityGapLedger({ filePath }).loadReport();

    expect(report.fileExisted).toBe(true);
    expect(report.readFailed).toBe(false);
    expect(report.loaded).toBe(0);
  });

  it('reports zero capped entries for a ledger under the cap', () => {
    // `loaded` counts what survived the cap, so without this field a ledger at
    // the ceiling reports the same number every load however much was written
    // past it (#5785).
    const filePath = scratch();
    writeFileSync(
      filePath,
      `${JSON.stringify({ name: 'g', type: CAPABILITY_GAP_TYPES[0], suggestion: 's', timestamp: new Date().toISOString() })}\n`,
      'utf-8'
    );

    expect(createPersistentCapabilityGapLedger({ filePath }).loadReport().cappedEntries).toBe(0);
  });

  it('counts the entries the cap dropped', () => {
    const filePath = scratch();
    const now = new Date().toISOString();
    const lines = Array.from({ length: 5003 }, (_, i) =>
      JSON.stringify({
        name: `g${String(i)}`,
        type: CAPABILITY_GAP_TYPES[0],
        suggestion: 's',
        timestamp: now,
      })
    ).join('\n');
    writeFileSync(filePath, `${lines}\n`, 'utf-8');

    const report = createPersistentCapabilityGapLedger({ filePath }).loadReport();

    expect(report.loaded).toBe(5000);
    expect(report.cappedEntries).toBe(3);
  });
});
