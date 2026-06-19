/**
 * Tests for the durable code-PR guards-green-soak store (#3670 Stage 2.5).
 *
 * The point: the store persists green/denied dry-run data points via the shared
 * JsonlStore (round-trips from disk), and the read surface reports the CONSECUTIVE
 * trailing-green count — the `consecutiveGreenDryRuns` evidence the enable
 * double-gate consumes — so a denial RESETS the streak, matching readiness semantics.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createCodePrSoakSink,
  countTrailingGreen,
  readCodePrGuardsGreenSoak,
  greenCodePrSoakRecord,
  deniedCodePrSoakRecord,
  type CodePrSoakRecord,
} from './codepr-soak-store.js';
import {
  evaluateCodePrEnableReadiness,
  type CodePrEnableReadinessEvidence,
} from './codepr-enable-readiness.js';

let dir: string;
let filePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'codepr-soak-store-'));
  filePath = join(dir, 'learning', 'codepr-guards-soak.jsonl');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function green(over: Partial<CodePrSoakRecord> = {}): CodePrSoakRecord {
  return {
    timestamp: '2026-06-08T00:00:00.000Z',
    runId: 'codepr-soak-abc',
    signalKey: 'routing:cli-floor:codex:docs',
    green: true,
    filesTouched: 1,
    ...over,
  };
}

function denied(over: Partial<CodePrSoakRecord> = {}): CodePrSoakRecord {
  return {
    timestamp: '2026-06-08T00:00:00.000Z',
    runId: 'codepr-soak-abc',
    signalKey: 'bug:crash:auth',
    green: false,
    denialReason: 'sensitive_path',
    filesTouched: 0,
    ...over,
  };
}

describe('durable code-PR soak sink', () => {
  it('round-trips records from disk preserving order', () => {
    const sink = createCodePrSoakSink(filePath);
    sink.record(green({ signalKey: 's0' }));
    sink.record(denied({ signalKey: 's1' }));
    sink.record(green({ signalKey: 's2' }));
    expect(sink.getRecords()).toHaveLength(3);

    const reopened = createCodePrSoakSink(filePath);
    expect(reopened.getRecords().map((r) => r.signalKey)).toEqual(['s0', 's1', 's2']);
    expect(reopened.getRecords()[1]?.green).toBe(false);
    expect(reopened.getRecords()[1]?.denialReason).toBe('sensitive_path');
  });

  it('bounds retention to the last N records', () => {
    const sink = createCodePrSoakSink(filePath, 4);
    for (let i = 0; i < 7; i++) sink.record(green({ signalKey: `s${String(i)}` }));
    expect(sink.getRecords()).toHaveLength(4);
    expect(sink.getRecords().map((r) => r.signalKey)).toEqual(['s3', 's4', 's5', 's6']);
  });
});

describe('countTrailingGreen — consecutive-green semantics', () => {
  it('counts the trailing run of green records', () => {
    expect(countTrailingGreen([green(), green(), green()])).toBe(3);
  });

  it('returns 0 when the most-recent record is a denial', () => {
    expect(countTrailingGreen([green(), green(), denied()])).toBe(0);
  });

  it('resets the streak at the last denial (only the trailing greens count)', () => {
    // green, green, DENIED, green, green → trailing run is 2 (the denial forfeits the prior 2)
    expect(countTrailingGreen([green(), green(), denied(), green(), green()])).toBe(2);
  });

  it('is 0 for an empty soak', () => {
    expect(countTrailingGreen([])).toBe(0);
  });
});

describe('builders', () => {
  it('greenCodePrSoakRecord marks green with the file count and no denial reason', () => {
    const r = greenCodePrSoakRecord({ runId: 'r1', signalKey: 'k', filesTouched: 3 });
    expect(r.green).toBe(true);
    expect(r.filesTouched).toBe(3);
    expect(r.denialReason).toBeUndefined();
  });

  it('deniedCodePrSoakRecord marks not-green with the reason and zero files', () => {
    const r = deniedCodePrSoakRecord({ runId: 'r1', signalKey: 'k', denialReason: 'secret_detected' });
    expect(r.green).toBe(false);
    expect(r.denialReason).toBe('secret_detected');
    expect(r.filesTouched).toBe(0);
  });
});

describe('the recorded count flows into evaluateCodePrEnableReadiness', () => {
  it('readCodePrGuardsGreenSoak feeds consecutiveGreenDryRuns evidence', () => {
    const sink = createCodePrSoakSink(filePath);
    for (let i = 0; i < 50; i++) sink.record(green({ signalKey: `s${String(i)}` }));

    const consecutiveGreenDryRuns = readCodePrGuardsGreenSoak(sink);
    expect(consecutiveGreenDryRuns).toBe(50);

    // Feed it as the gate's evidence — the guards-green-soak criterion is now met
    // (the gate still fails-closed on the other halves: vote ref + owner).
    const evidence: CodePrEnableReadinessEvidence = {
      flagEnabled: true,
      enableVoteRef: 'vote-123',
      consecutiveGreenDryRuns,
      owner: 'williamzujkowski',
    };
    const verdict = evaluateCodePrEnableReadiness(evidence);
    expect(verdict.criteria.find((c) => c.name === 'guards-green-soak')?.met).toBe(true);
    expect(verdict.ready).toBe(true);
  });

  it('a denial mid-soak drops the count below the bar, blocking the gate', () => {
    const sink = createCodePrSoakSink(filePath);
    for (let i = 0; i < 49; i++) sink.record(green({ signalKey: `s${String(i)}` }));
    sink.record(denied({ signalKey: 'oops' })); // resets the streak to 0
    sink.record(green({ signalKey: 'after' }));

    expect(readCodePrGuardsGreenSoak(sink)).toBe(1); // only the trailing green
    const verdict = evaluateCodePrEnableReadiness({
      flagEnabled: true,
      enableVoteRef: 'vote-123',
      consecutiveGreenDryRuns: readCodePrGuardsGreenSoak(sink),
      owner: 'williamzujkowski',
    });
    expect(verdict.criteria.find((c) => c.name === 'guards-green-soak')?.met).toBe(false);
    expect(verdict.blockers).toContain('guards-green-soak');
    expect(verdict.ready).toBe(false);
  });
});
