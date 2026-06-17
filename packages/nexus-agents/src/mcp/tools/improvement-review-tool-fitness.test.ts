/**
 * Tests for the tool-fitness SignalCategory consumer (#3852).
 *
 * Proves:
 * - a low-fitness tool surfaces as a SUGGEST candidate, NEVER a removal;
 * - workspace-scoping prevents cross-workspace mis-flagging (#3852 concern 1);
 * - the 'tool-fitness' SignalCategory is wired into improvement_review;
 * - the never-autonomous-removal invariant is enforced at runtime.
 */

import { describe, it, expect } from 'vitest';

import {
  detectToolFitnessSignals,
  detectDeprecationCandidates,
  detectConsolidationCandidates,
  isHealthyInAnyOtherWorkspace,
  assertNeverAutonomousRemoval,
  loadToolFitnessSignals,
  FITNESS_MIN_SAMPLE,
  LOW_USAGE_MAX_INVOCATIONS,
  POOR_SUCCESS_RATE_MAX,
} from './improvement-review-tool-fitness.js';
import { ToolFitnessLedger, type ToolFitnessStat } from '../../governance/tool-fitness-ledger.js';
import type { ImprovementSignal } from './improvement-review.js';
import { ImprovementReviewInputSchema } from './improvement-review.js';

const WINDOW = '7d';

function stat(overrides: Partial<ToolFitnessStat> & { tool: string }): ToolFitnessStat {
  const invocationCount = overrides.invocationCount ?? 1;
  const successCount = overrides.successCount ?? invocationCount;
  return {
    tool: overrides.tool,
    invocationCount,
    successCount,
    failureCount: invocationCount - successCount,
    successRate:
      overrides.successRate ?? (invocationCount === 0 ? 0 : successCount / invocationCount),
    lastUsedAt: overrides.lastUsedAt ?? '2026-06-15T00:00:00.000Z',
    totalCost: overrides.totalCost,
    workspaces: overrides.workspaces ?? ['(unattributed)'],
  };
}

const NO_WORKSPACE_SCOPE = (): undefined => undefined;

describe('assertNeverAutonomousRemoval — Epic F invariant', () => {
  it('passes a suggest-tier tool-fitness signal through unchanged', () => {
    const s: ImprovementSignal = {
      category: 'tool-fitness',
      signalKey: 'k',
      severity: 'warning',
      title: 't',
      body: 'b',
      evidence: {},
    };
    expect(assertNeverAutonomousRemoval(s)).toBe(s);
  });

  it('THROWS on a critical severity (would escalate toward auto-remediation)', () => {
    expect(() =>
      assertNeverAutonomousRemoval({
        category: 'tool-fitness',
        signalKey: 'k',
        severity: 'critical',
        title: 't',
        body: 'b',
        evidence: {},
      })
    ).toThrow(/never autonomous|suggest-tier/i);
  });

  it('THROWS on a non-tool-fitness category', () => {
    expect(() =>
      assertNeverAutonomousRemoval({
        category: 'bug',
        signalKey: 'k',
        severity: 'warning',
        title: 't',
        body: 'b',
        evidence: {},
      })
    ).toThrow(/tool-fitness/);
  });
});

describe('detectDeprecationCandidates — low usage', () => {
  it('flags a barely-used tool as a SUGGEST candidate, not a removal', () => {
    const signals = detectDeprecationCandidates(
      [stat({ tool: 'lonely_tool', invocationCount: 1, successCount: 1 })],
      NO_WORKSPACE_SCOPE,
      WINDOW
    );
    expect(signals).toHaveLength(1);
    const sig = signals[0]!;
    expect(sig.category).toBe('tool-fitness');
    expect(sig.signalKey).toContain('deprecation-candidate:low-usage:lonely_tool');
    // SUGGEST-TIER: the wording is candidate-framed and never an instruction to remove.
    expect(sig.title.toLowerCase()).toContain('candidate');
    expect(sig.body).toMatch(/NOT an automatic removal/);
    expect(sig.body).toMatch(/NEVER autonomous/);
    // Severity must never be critical (would escalate priority).
    expect(sig.severity).not.toBe('critical');
  });

  it('does not flag a well-used, healthy tool', () => {
    const signals = detectDeprecationCandidates(
      [stat({ tool: 'busy', invocationCount: 100, successCount: 99 })],
      NO_WORKSPACE_SCOPE,
      WINDOW
    );
    expect(signals).toEqual([]);
  });

  it('threshold is honest: exactly LOW_USAGE_MAX_INVOCATIONS still flags, one more does not', () => {
    const at = detectDeprecationCandidates(
      [stat({ tool: 'edge', invocationCount: LOW_USAGE_MAX_INVOCATIONS })],
      NO_WORKSPACE_SCOPE,
      WINDOW
    );
    const over = detectDeprecationCandidates(
      [
        stat({
          tool: 'edge',
          invocationCount: LOW_USAGE_MAX_INVOCATIONS + 1,
          successCount: LOW_USAGE_MAX_INVOCATIONS + 1,
        }),
      ],
      NO_WORKSPACE_SCOPE,
      WINDOW
    );
    expect(at).toHaveLength(1);
    expect(over).toEqual([]);
  });
});

describe('detectDeprecationCandidates — poor reliability + workspace scoping (#3852 concern 1)', () => {
  it('flags a globally-unreliable tool as a suggest candidate', () => {
    const signals = detectDeprecationCandidates(
      [
        stat({
          tool: 'flaky',
          invocationCount: FITNESS_MIN_SAMPLE,
          successCount: Math.floor(FITNESS_MIN_SAMPLE * POOR_SUCCESS_RATE_MAX) - 1,
          workspaces: ['repo-a', 'repo-b'],
        }),
      ],
      // Unhealthy in BOTH workspaces → not context-poisoning, legitimately flag.
      () => stat({ tool: 'flaky', invocationCount: FITNESS_MIN_SAMPLE, successCount: 1 }),
      WINDOW
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]!.signalKey).toContain('poor-success:flaky');
    expect(signals[0]!.severity).toBe('warning');
    expect(signals[0]!.body).toMatch(/NEVER autonomous/);
  });

  it('does NOT flag a tool that fails in one workspace but is healthy in another', () => {
    const poisoned = stat({
      tool: 'workspace_local_fail',
      invocationCount: 2 * FITNESS_MIN_SAMPLE,
      successCount: FITNESS_MIN_SAMPLE, // 50% globally — looks bad
      workspaces: ['healthy-repo', 'broken-repo'],
    });
    const statInWorkspace = (_tool: string, ws: string): ToolFitnessStat | undefined => {
      if (ws === 'healthy-repo') {
        // Perfectly healthy in this workspace, meaningful sample.
        return stat({
          tool: 'workspace_local_fail',
          invocationCount: FITNESS_MIN_SAMPLE,
          successCount: FITNESS_MIN_SAMPLE,
        });
      }
      // broken-repo: all failures (local perms / missing deps).
      return stat({
        tool: 'workspace_local_fail',
        invocationCount: FITNESS_MIN_SAMPLE,
        successCount: 0,
      });
    };
    const signals = detectDeprecationCandidates([poisoned], statInWorkspace, WINDOW);
    expect(signals).toEqual([]); // suppressed — the failure is workspace-local
  });

  it('isHealthyInAnyOtherWorkspace requires >=2 real workspaces', () => {
    const single = stat({
      tool: 't',
      invocationCount: 20,
      successCount: 5,
      workspaces: ['only-repo'],
    });
    expect(
      isHealthyInAnyOtherWorkspace(single, () =>
        stat({ tool: 't', invocationCount: FITNESS_MIN_SAMPLE, successCount: FITNESS_MIN_SAMPLE })
      )
    ).toBe(false);
  });

  it('low-success tools below the sample floor are noise, not flagged', () => {
    const signals = detectDeprecationCandidates(
      [
        stat({
          tool: 'tiny',
          invocationCount: FITNESS_MIN_SAMPLE - 1,
          successCount: 0,
          workspaces: ['a', 'b'],
        }),
      ],
      () => undefined,
      WINDOW
    );
    // invocationCount > LOW_USAGE_MAX but < FITNESS_MIN_SAMPLE → neither branch fires.
    expect(signals).toEqual([]);
  });
});

describe('detectConsolidationCandidates', () => {
  it('flags a rarely-used sibling within a shared prefix family', () => {
    const report = [
      stat({ tool: 'research_discover', invocationCount: 100, successCount: 100 }),
      stat({ tool: 'research_obscure', invocationCount: 2, successCount: 2 }),
    ];
    const signals = detectConsolidationCandidates(report, WINDOW);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.signalKey).toContain('consolidation-candidate:research_obscure');
    expect(signals[0]!.body).toMatch(/NOT an automatic removal/);
    expect(signals[0]!.severity).not.toBe('critical');
  });

  it('does not flag siblings of comparable usage', () => {
    const report = [
      stat({ tool: 'research_a', invocationCount: 100 }),
      stat({ tool: 'research_b', invocationCount: 90 }),
    ];
    expect(detectConsolidationCandidates(report, WINDOW)).toEqual([]);
  });

  it('ignores a family whose busiest member is below the sample floor', () => {
    const report = [
      stat({ tool: 'rare_a', invocationCount: FITNESS_MIN_SAMPLE - 1 }),
      stat({ tool: 'rare_b', invocationCount: 1 }),
    ];
    expect(detectConsolidationCandidates(report, WINDOW)).toEqual([]);
  });

  it('ignores tools with no family prefix', () => {
    const report = [
      stat({ tool: 'orchestrate', invocationCount: 100 }),
      stat({ tool: 'run', invocationCount: 1 }),
    ];
    expect(detectConsolidationCandidates(report, WINDOW)).toEqual([]);
  });
});

describe('detectToolFitnessSignals — every emitted signal honors the invariant', () => {
  it('all signals are tool-fitness category and never critical', () => {
    const report = [
      stat({ tool: 'lonely', invocationCount: 1 }),
      stat({ tool: 'research_big', invocationCount: 100 }),
      stat({ tool: 'research_tiny', invocationCount: 1 }),
    ];
    const signals = detectToolFitnessSignals(report, NO_WORKSPACE_SCOPE, WINDOW);
    expect(signals.length).toBeGreaterThan(0);
    for (const s of signals) {
      expect(s.category).toBe('tool-fitness');
      expect(s.severity).not.toBe('critical');
      // Re-run the guard to prove none would throw.
      expect(() => assertNeverAutonomousRemoval(s)).not.toThrow();
    }
  });
});

describe('loadToolFitnessSignals — live ledger integration (in-memory, no fs)', () => {
  it('surfaces a low-fitness tool from a real ledger as a suggest candidate', () => {
    // Construct an isolated ledger and inject it (no homedir touch).
    const ledger = new ToolFitnessLedger({ filePath: `/tmp/nx-tf-${String(Date.now())}.jsonl` });
    ledger.record({ tool: 'never_used_much', success: true, workspace: 'repo-a' });

    const signals = loadToolFitnessSignals(WINDOW, ledger);
    expect(signals.some((s) => s.signalKey.includes('never_used_much'))).toBe(true);
    expect(signals.every((s) => s.severity !== 'critical')).toBe(true);
  });

  it('fail-soft: a throwing ledger yields no signals', () => {
    const broken = {
      report() {
        throw new Error('disk gone');
      },
      statForInWorkspace() {
        return undefined;
      },
    };
    expect(loadToolFitnessSignals(WINDOW, broken)).toEqual([]);
  });
});

describe("SignalCategory wiring — 'tool-fitness' is part of the union", () => {
  it('the input schema still parses (smoke: the module compiles with the new category)', () => {
    expect(ImprovementReviewInputSchema.safeParse({}).success).toBe(true);
  });

  it('a tool-fitness signal type-checks as an ImprovementSignal', () => {
    const s: ImprovementSignal = {
      category: 'tool-fitness',
      signalKey: 'tool-fitness:deprecation-candidate:low-usage:x',
      severity: 'info',
      title: 't',
      body: 'b',
      evidence: {},
    };
    expect(s.category).toBe('tool-fitness');
  });
});
