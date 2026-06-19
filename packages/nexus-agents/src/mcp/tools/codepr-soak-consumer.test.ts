/**
 * Tests for the AUDIT-mode dry-run code-PR soak consumer (#3670 Stage 2.5).
 *
 * The point: a code-touching plan drives planCodePrRun in DRY-RUN over a derived
 * change set and records a green/denied soak data point; a non-code plan is a
 * no-op; the step is BEST-EFFORT (a thrown planRun is swallowed, no exception
 * propagates); and NO push / PR-open surface is imported.
 */

import { readFileSync } from 'node:fs';

import { describe, it, expect, vi } from 'vitest';

import {
  runCodePrSoak,
  planTouchesCode,
  deriveProposedChanges,
} from './codepr-soak-consumer.js';
import type { IRecordingCodePrSoakSink } from './codepr-soak-store.js';
import type { RemediationPlan } from './improvement-remediation-capability.js';
import type { CodePrPlan, PlannedPrDescriptor } from './codepr-orchestrator.js';

function plan(over: Partial<RemediationPlan> = {}): RemediationPlan {
  return {
    signalKey: 'bug:crash:auth',
    category: 'bug',
    summary: 'fix the crash',
    steps: [
      { kind: 'investigate', description: 'diagnose' },
      { kind: 'fix-bug', description: 'apply the fix' },
      { kind: 'add-test', description: 'add a regression test' },
    ],
    ...over,
  };
}

const okPlan: PlannedPrDescriptor = {
  branchName: 'auto/codepr/x',
  title: 't',
  files: [{ path: 'src/x.ts', addedLines: 1, removedLines: 0 }],
  filesTouched: 2,
  linesTouched: 2,
  diffHash: 'h',
};

/** An in-memory soak sink (no disk). */
function memSink(): IRecordingCodePrSoakSink {
  const records: Parameters<IRecordingCodePrSoakSink['record']>[0][] = [];
  return {
    record: (r) => {
      records.push(r);
    },
    getRecords: () => records,
  };
}

describe('planTouchesCode / deriveProposedChanges', () => {
  it('investigate-only plan does not touch code', () => {
    expect(planTouchesCode(plan({ steps: [{ kind: 'investigate', description: 'd' }] }))).toBe(false);
  });

  it('a plan with a code-touching step touches code', () => {
    expect(planTouchesCode(plan())).toBe(true);
  });

  it('derives one change per code-touching step, using targetPath when present', () => {
    const p = plan({
      steps: [
        { kind: 'investigate', description: 'd' },
        { kind: 'fix-bug', description: 'd', targetPath: 'src/auth/login.ts' },
        { kind: 'add-test', description: 'd' }, // no targetPath → synthesized
      ],
    });
    const changes = deriveProposedChanges(p);
    expect(changes).toHaveLength(2);
    expect(changes.map((c) => c.relPath)).toContain('src/auth/login.ts');
    // The synthesized path is under src/ (a non-sensitive location).
    expect(changes.every((c) => c.relPath.startsWith('src/'))).toBe(true);
  });

  it('investigate-only plan derives no changes', () => {
    expect(deriveProposedChanges(plan({ steps: [{ kind: 'investigate', description: 'd' }] }))).toEqual(
      []
    );
  });
});

describe('runCodePrSoak', () => {
  it('green dry-run plan → records a green data point', () => {
    const sink = memSink();
    const planRun = vi.fn(
      (): CodePrPlan => ({ ok: true, plan: okPlan, auditRecorded: true })
    );
    runCodePrSoak(plan(), { sink, planRun });

    expect(planRun).toHaveBeenCalledTimes(1);
    expect(sink.getRecords()).toHaveLength(1);
    expect(sink.getRecords()[0]?.green).toBe(true);
    expect(sink.getRecords()[0]?.filesTouched).toBe(2);
  });

  it('guard-denied dry-run plan → records a denied data point (streak reset)', () => {
    const sink = memSink();
    const planRun = vi.fn(
      (): CodePrPlan => ({ ok: false, reason: 'sensitive_path', detail: 'x', auditRecorded: true })
    );
    runCodePrSoak(plan(), { sink, planRun });

    expect(sink.getRecords()).toHaveLength(1);
    expect(sink.getRecords()[0]?.green).toBe(false);
    expect(sink.getRecords()[0]?.denialReason).toBe('sensitive_path');
  });

  it('non-code plan is a no-op — planRun is never called, nothing recorded', () => {
    const sink = memSink();
    const planRun = vi.fn((): CodePrPlan => ({ ok: true, plan: okPlan, auditRecorded: true }));
    runCodePrSoak(plan({ steps: [{ kind: 'investigate', description: 'd' }] }), { sink, planRun });

    expect(planRun).not.toHaveBeenCalled();
    expect(sink.getRecords()).toHaveLength(0);
  });

  it('BEST-EFFORT: a thrown planRun is swallowed — no exception propagates, nothing recorded', () => {
    const sink = memSink();
    const planRun = vi.fn((): CodePrPlan => {
      throw new Error('boom');
    });
    expect(() => {
      runCodePrSoak(plan(), { sink, planRun });
    }).not.toThrow();
    expect(sink.getRecords()).toHaveLength(0);
  });

  it('BEST-EFFORT: a throwing sink does not propagate', () => {
    const throwingSink: IRecordingCodePrSoakSink = {
      record: () => {
        throw new Error('disk full');
      },
      getRecords: () => [],
    };
    const planRun = vi.fn((): CodePrPlan => ({ ok: true, plan: okPlan, auditRecorded: true }));
    expect(() => {
      runCodePrSoak(plan(), { sink: throwingSink, planRun });
    }).not.toThrow();
  });
});

describe('no push / PR-open surface', () => {
  it('the consumer source imports NO push/PR-open/network surface', () => {
    const src = readFileSync(new URL('./codepr-soak-consumer.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/gh\s+pr\s+create|pulls|createPullRequest|octokit|@octokit/i);
    expect(src).not.toMatch(/\bfetch\b|node:https?|axios|undici/);
    expect(src).not.toMatch(/['"`]push['"`]/);
  });
});
