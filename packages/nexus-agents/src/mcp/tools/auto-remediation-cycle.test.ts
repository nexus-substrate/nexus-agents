/**
 * Tests for the auto-remediation cycle entry point (#3671).
 * Off-by-default short-circuit; audit drives the full path on injected signals/deps.
 */

import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { runAutoRemediationCycle } from './auto-remediation-cycle.js';
import { buildAutoRemediationDeps } from './auto-remediation-deps.js';
import {
  createRemediationSoakSink,
  getRemediationSoakFile,
  _resetRemediationSoakSinkForTests,
} from './improvement-remediation-shadow.js';
import type { ImprovementSignal } from './improvement-review.js';
import { createCodePrSoakSink, readCodePrGuardsGreenSoak } from './codepr-soak-store.js';
import type { CodePrPlan, PlannedPrDescriptor } from './codepr-orchestrator.js';
import type { RemediationPlan } from './improvement-remediation-capability.js';

// The cycle's DEFAULT durable soak sink resolves under NEXUS_DATA_DIR (#3932).
// Pin it to a throwaway temp dir for the whole suite so audit-mode cycles that
// do NOT inject a soakSink (the cases below that omit it) accumulate synthetic
// signal evidence in isolation — never in the operator's real
// ~/.nexus-agents/learning/remediation-soak.jsonl, which the readiness gate reads.
let dataDir: string;
let prevDataDir: string | undefined;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'cycle-datadir-'));
  prevDataDir = process.env['NEXUS_DATA_DIR'];
  process.env['NEXUS_DATA_DIR'] = dataDir;
  _resetRemediationSoakSinkForTests(); // drop any cached singleton so the temp dir wins
});

afterEach(() => {
  if (prevDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
  else process.env['NEXUS_DATA_DIR'] = prevDataDir;
  _resetRemediationSoakSinkForTests();
  rmSync(dataDir, { recursive: true, force: true });
});

function signal(over: Partial<ImprovementSignal> = {}): ImprovementSignal {
  return {
    category: 'routing',
    signalKey: 'routing:cli-floor:codex:docs',
    severity: 'warning',
    title: 'routing: codex 30% on docs',
    body: 'floor breach',
    evidence: {},
    ...over,
  };
}

describe('runAutoRemediationCycle', () => {
  it('off mode is a complete no-op — never collects signals', async () => {
    const collectSignals = vi.fn(async () => Promise.resolve([signal()]));
    const r = await runAutoRemediationCycle({ mode: 'off' }, { collectSignals });
    expect(r.mode).toBe('off');
    expect(collectSignals).not.toHaveBeenCalled();
  });

  // #3932 regression guard: the durable soak file MUST honor NEXUS_DATA_DIR so a
  // test can never silently write synthetic records into the operator's real
  // ~/.nexus-agents/learning/remediation-soak.jsonl (the readiness gate's input).
  describe('soak path isolation (#3932 regression guard)', () => {
    it('getRemediationSoakFile resolves under NEXUS_DATA_DIR, not the home dir', () => {
      const file = getRemediationSoakFile();
      expect(file.startsWith(dataDir)).toBe(true);
      expect(file).toContain(join('learning', 'remediation-soak.jsonl'));
      expect(file.startsWith(join(homedir(), '.nexus-agents'))).toBe(false);
    });

    it('an audit cycle with NO injected soakSink writes only under the temp data dir', async () => {
      const homeSoak = join(homedir(), '.nexus-agents', 'learning', 'remediation-soak.jsonl');
      const homeExistedBefore = existsSync(homeSoak);
      const deps = buildAutoRemediationDeps({
        voteRunner: async () => Promise.resolve({ approved: true, approvalPercentage: 100 }),
      });

      await runAutoRemediationCycle(
        { mode: 'audit' },
        { collectSignals: async () => Promise.resolve([signal({ signalKey: 'a' })]), deps }
      );

      // The default sink resolved under the temp data dir and wrote there.
      expect(existsSync(getRemediationSoakFile())).toBe(true);
      // The real home-dir file's existence is unchanged by this test.
      expect(existsSync(homeSoak)).toBe(homeExistedBefore);
    });
  });

  it('audit mode collects signals and runs the path (zero writes)', async () => {
    const collectSignals = vi.fn(async () => Promise.resolve([signal()]));
    const deps = buildAutoRemediationDeps({
      voteRunner: async () => Promise.resolve({ approved: true, approvalPercentage: 100 }),
    });
    const r = await runAutoRemediationCycle({ mode: 'audit' }, { collectSignals, deps });
    expect(collectSignals).toHaveBeenCalledTimes(1);
    expect(r.mode).toBe('audit');
    expect(r.plans).toHaveLength(1); // research+vote ran
    expect(r.remediated).toEqual([]); // audit writes nothing
  });

  it('forwards every collected signal to the run', async () => {
    const signals = [signal({ signalKey: 'a' }), signal({ signalKey: 'b' })];
    const deps = buildAutoRemediationDeps({
      voteRunner: async () => Promise.resolve({ approved: true, approvalPercentage: 100 }),
    });
    const r = await runAutoRemediationCycle(
      { mode: 'audit' },
      { collectSignals: async () => Promise.resolve(signals), deps }
    );
    expect(r.considered).toBe(2);
  });

  describe('durable soak evidence (#3762)', () => {
    let dir: string;
    afterEach(() => {
      if (dir) rmSync(dir, { recursive: true, force: true });
    });

    it('audit cycle writes one durable soak record per signal', async () => {
      dir = mkdtempSync(join(tmpdir(), 'cycle-soak-'));
      const soakSink = createRemediationSoakSink(join(dir, 'soak.jsonl'));
      const signals = [signal({ signalKey: 'a' }), signal({ signalKey: 'b' })];
      const deps = buildAutoRemediationDeps({
        voteRunner: async () => Promise.resolve({ approved: true, approvalPercentage: 100 }),
      });

      await runAutoRemediationCycle(
        { mode: 'audit' },
        { collectSignals: async () => Promise.resolve(signals), deps, soakSink }
      );

      const persisted = soakSink.getRecords();
      expect(persisted).toHaveLength(2);
      expect(persisted.map((r) => r.signalKey).sort()).toEqual(['a', 'b']);
      // Each record carries the vote verdict + plan step count from the run.
      for (const r of persisted) {
        expect(r.voteOutcome).toEqual({ approved: true, approvalPercentage: 100 });
        expect(r.planStepCount).toBeGreaterThan(0);
        expect(r.category).toBe('routing');
      }
    });

    it('captures a rejected vote verdict durably', async () => {
      dir = mkdtempSync(join(tmpdir(), 'cycle-soak-rej-'));
      const soakSink = createRemediationSoakSink(join(dir, 'soak.jsonl'));
      const deps = buildAutoRemediationDeps({
        voteRunner: async () => Promise.resolve({ approved: false, approvalPercentage: 33 }),
      });

      await runAutoRemediationCycle(
        { mode: 'audit' },
        {
          collectSignals: async () => Promise.resolve([signal({ signalKey: 'x' })]),
          deps,
          soakSink,
        }
      );

      const rec = soakSink.getRecords()[0];
      expect(rec?.voteOutcome?.approved).toBe(false);
      expect(rec?.voteOutcome?.approvalPercentage).toBe(33);
    });
  });

  // #3670 Stage 2.5 — the dry-run code-PR guards-green soak consumer.
  describe('code-PR dry-run soak (#3670 Stage 2.5)', () => {
    const okPlan: PlannedPrDescriptor = {
      branchName: 'auto/codepr/x',
      title: 't',
      files: [{ path: 'src/x.ts', addedLines: 1, removedLines: 0 }],
      filesTouched: 1,
      linesTouched: 1,
      diffHash: 'h',
    };

    function codeSignal(over: Partial<ImprovementSignal> = {}): ImprovementSignal {
      // category 'bug' → the plan builder emits a code-touching 'fix-bug' + 'add-test' step.
      // Use a NON-security key/title (no security keyword) so it admits as a normal
      // (non-p0) remediation that reaches a plan in audit mode.
      return signal({
        category: 'bug',
        signalKey: 'bug:render-glitch:ui',
        title: 'render glitch in the dashboard',
        body: 'pixels misaligned',
        ...over,
      });
    }

    it('audit-mode code-touching remediation runs planCodePrRun dry-run and increments green soak', async () => {
      const soakDir = mkdtempSync(join(tmpdir(), 'codepr-soak-'));
      try {
        const sink = createCodePrSoakSink(join(soakDir, 'codepr.jsonl'));
        const planRun = vi.fn((): CodePrPlan => ({ ok: true, plan: okPlan, auditRecorded: true }));
        const deps = buildAutoRemediationDeps({
          voteRunner: async () => Promise.resolve({ approved: true, approvalPercentage: 100 }),
        });

        await runAutoRemediationCycle(
          { mode: 'audit' },
          {
            collectSignals: async () => Promise.resolve([codeSignal()]),
            deps,
            codePrSoak: { sink, planRun },
          }
        );

        expect(planRun).toHaveBeenCalledTimes(1);
        expect(sink.getRecords()).toHaveLength(1);
        expect(sink.getRecords()[0]?.green).toBe(true);
        // The recorded count is the consecutiveGreenDryRuns evidence.
        expect(readCodePrGuardsGreenSoak(sink)).toBe(1);
      } finally {
        rmSync(soakDir, { recursive: true, force: true });
      }
    });

    it('a guard-denied dry-run records a denial (does NOT increment the green streak)', async () => {
      const soakDir = mkdtempSync(join(tmpdir(), 'codepr-soak-denied-'));
      try {
        const sink = createCodePrSoakSink(join(soakDir, 'codepr.jsonl'));
        const planRun = vi.fn(
          (): CodePrPlan => ({ ok: false, reason: 'sensitive_path', detail: 'x', auditRecorded: true })
        );
        const deps = buildAutoRemediationDeps({
          voteRunner: async () => Promise.resolve({ approved: true, approvalPercentage: 100 }),
        });

        await runAutoRemediationCycle(
          { mode: 'audit' },
          {
            collectSignals: async () => Promise.resolve([codeSignal()]),
            deps,
            codePrSoak: { sink, planRun },
          }
        );

        expect(sink.getRecords()[0]?.green).toBe(false);
        expect(readCodePrGuardsGreenSoak(sink)).toBe(0); // denial → consecutive-green is 0
      } finally {
        rmSync(soakDir, { recursive: true, force: true });
      }
    });

    it('BEST-EFFORT: a soak that throws does NOT break the cycle', async () => {
      const runCodePrSoakThrows = (_plan: RemediationPlan): void => {
        throw new Error('soak blew up');
      };
      const deps = buildAutoRemediationDeps({
        voteRunner: async () => Promise.resolve({ approved: true, approvalPercentage: 100 }),
      });

      const r = await runAutoRemediationCycle(
        { mode: 'audit' },
        {
          collectSignals: async () => Promise.resolve([codeSignal()]),
          deps,
          runCodePrSoak: runCodePrSoakThrows,
        }
      );

      // The cycle still completed normally — the soak failure was swallowed.
      expect(r.mode).toBe('audit');
      expect(r.plans).toHaveLength(1);
      expect(r.remediated).toEqual([]);
    });

    it('off mode does NOT run the soak', async () => {
      const runSoak = vi.fn();
      await runAutoRemediationCycle(
        { mode: 'off' },
        { collectSignals: async () => Promise.resolve([codeSignal()]), runCodePrSoak: runSoak }
      );
      expect(runSoak).not.toHaveBeenCalled();
    });

    it('enforce mode does NOT run the soak (soak is audit-only)', async () => {
      const runSoak = vi.fn();
      // Enforce aborts fail-closed (not ready / no lease) before any plan, but even
      // if it produced a plan, the cycle only wires onPlanProduced on the audit branch.
      const deps = buildAutoRemediationDeps({
        voteRunner: async () => Promise.resolve({ approved: true, approvalPercentage: 100 }),
      });
      await runAutoRemediationCycle(
        { mode: 'enforce' },
        { collectSignals: async () => Promise.resolve([codeSignal()]), deps, runCodePrSoak: runSoak }
      );
      expect(runSoak).not.toHaveBeenCalled();
    });
  });
});
