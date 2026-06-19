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
  locallyFailingWorkspaces,
  assertNeverAutonomousRemoval,
  loadToolFitnessSignals,
  FITNESS_MIN_SAMPLE,
  LOW_USAGE_MAX_INVOCATIONS,
  POOR_SUCCESS_RATE_MAX,
} from './improvement-review-tool-fitness.js';
import {
  consolidationConfidence,
  isNeverDeprecate,
  DEFAULT_NEVER_DEPRECATE_PATTERNS,
} from './improvement-review-tool-fitness-heuristics.js';
import {
  NEVER_DEPRECATE_TOOLS,
  TOOL_ORTHOGONALITY_GROUPS,
  isDeclaredNeverDeprecate,
  declaredOrthogonalityGroup,
} from './tool-manifest.js';
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

  it('does NOT raise a GLOBAL deprecation when a tool fails in one workspace but is healthy in another', () => {
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
          workspaces: ['healthy-repo'],
        });
      }
      // broken-repo: all failures (local perms / missing deps).
      return stat({
        tool: 'workspace_local_fail',
        invocationCount: FITNESS_MIN_SAMPLE,
        successCount: 0,
        workspaces: ['broken-repo'],
      });
    };
    const signals = detectDeprecationCandidates([poisoned], statInWorkspace, WINDOW);
    // #3902 item 3: global deprecation is suppressed, but the localized failure is
    // NOT fully silenced — a workspace-scoped signal still surfaces the misconfig.
    expect(signals.every((s) => !s.signalKey.includes('deprecation-candidate'))).toBe(true);
    expect(signals.some((s) => s.signalKey.includes('localized-failure'))).toBe(true);
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

// ============================================================================
// #3902 item 1 — prefix is only a WEAK hint; orthogonal siblings not flagged
// ============================================================================

describe('consolidationConfidence (#3902 item 1) — shared prefix ≠ substitutable', () => {
  it('returns "none" for orthogonal action verbs (git_init vs git_commit)', () => {
    const init = stat({ tool: 'git_init', invocationCount: 2 });
    const commit = stat({ tool: 'git_commit', invocationCount: 100 });
    expect(consolidationConfidence(init, commit)).toBe('none');
  });

  it('returns "none" for db_read vs db_drop_table (read vs destroy)', () => {
    const read = stat({ tool: 'db_read', invocationCount: 2 });
    const drop = stat({ tool: 'db_drop_table', invocationCount: 100 });
    expect(consolidationConfidence(read, drop)).toBe('none');
  });

  it('returns "low" (never high) when verbs are not clearly opposed', () => {
    const a = stat({ tool: 'research_discover', invocationCount: 2 });
    const b = stat({ tool: 'research_synthesize', invocationCount: 100 });
    expect(consolidationConfidence(a, b)).toBe('low');
  });
});

describe('detectConsolidationCandidates (#3902 item 1)', () => {
  it('does NOT flag a rare orthogonal sibling for folding into a busy one on prefix alone', () => {
    const report = [
      stat({ tool: 'git_commit', invocationCount: 100, successCount: 100 }),
      stat({ tool: 'git_init', invocationCount: 1, successCount: 1 }),
    ];
    // git_init must NOT be surfaced — it shares a prefix but is orthogonal to git_commit.
    expect(detectConsolidationCandidates(report, WINDOW)).toEqual([]);
  });

  it('surviving prefix-only matches are surfaced as LOW-CONFIDENCE candidates', () => {
    const report = [
      stat({ tool: 'research_discover', invocationCount: 100, successCount: 100 }),
      stat({ tool: 'research_obscure', invocationCount: 2, successCount: 2 }),
    ];
    const signals = detectConsolidationCandidates(report, WINDOW);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.title.toLowerCase()).toContain('low-confidence');
    expect(signals[0]!.body).toMatch(/WEAK hint/);
    expect(signals[0]!.severity).not.toBe('critical');
  });
});

// ============================================================================
// #3902 item 2 — break-glass / never-deprecate exemption for low-usage tools
// ============================================================================

describe('isNeverDeprecate (#3902 item 2)', () => {
  it('matches default break-glass patterns (rollback, recovery, emergency)', () => {
    expect(isNeverDeprecate('db_rollback')).toBe(true);
    expect(isNeverDeprecate('disaster_recovery')).toBe(true);
    expect(isNeverDeprecate('emergency_admin')).toBe(true);
    expect(DEFAULT_NEVER_DEPRECATE_PATTERNS.length).toBeGreaterThan(0);
  });

  it('does not match an ordinary tool', () => {
    expect(isNeverDeprecate('research_discover')).toBe(false);
  });

  it('honors an explicit exempt-tools override', () => {
    expect(isNeverDeprecate('weird_tool', { exemptTools: ['weird_tool'] })).toBe(true);
  });
});

describe('detectDeprecationCandidates — break-glass exemption (#3902 item 2)', () => {
  it('does NOT flag a break-glass tool with <=2 invocations as a deprecation candidate', () => {
    const signals = detectDeprecationCandidates(
      [stat({ tool: 'db_rollback', invocationCount: 1, successCount: 1 })],
      NO_WORKSPACE_SCOPE,
      WINDOW
    );
    expect(signals).toEqual([]);
  });

  it('still flags an ordinary low-usage tool (exemption is targeted, not blanket)', () => {
    const signals = detectDeprecationCandidates(
      [stat({ tool: 'ordinary_thing', invocationCount: 1, successCount: 1 })],
      NO_WORKSPACE_SCOPE,
      WINDOW
    );
    expect(signals).toHaveLength(1);
  });

  it('exempts a tool named via the injected never-deprecate config', () => {
    const signals = detectDeprecationCandidates(
      [stat({ tool: 'custom_breakglass_op', invocationCount: 1 })],
      NO_WORKSPACE_SCOPE,
      WINDOW,
      { exemptTools: ['custom_breakglass_op'] }
    );
    expect(signals).toEqual([]);
  });
});

// ============================================================================
// #3902 item 3 — workspace-scoped localized signal (not full suppression)
// ============================================================================

describe('detectDeprecationCandidates — localized signal not full suppression (#3902 item 3)', () => {
  const poisoned = stat({
    tool: 'workspace_local_fail',
    invocationCount: 2 * FITNESS_MIN_SAMPLE,
    successCount: FITNESS_MIN_SAMPLE, // 50% globally
    workspaces: ['healthy-repo', 'broken-repo'],
  });
  const statInWorkspace = (_tool: string, ws: string): ToolFitnessStat | undefined => {
    if (ws === 'healthy-repo') {
      return stat({
        tool: 'workspace_local_fail',
        invocationCount: FITNESS_MIN_SAMPLE,
        successCount: FITNESS_MIN_SAMPLE,
        workspaces: ['healthy-repo'],
      });
    }
    return stat({
      tool: 'workspace_local_fail',
      invocationCount: FITNESS_MIN_SAMPLE,
      successCount: 0,
      workspaces: ['broken-repo'],
    });
  };

  it('emits a workspace-scoped localized signal instead of a global deprecation', () => {
    const signals = detectDeprecationCandidates([poisoned], statInWorkspace, WINDOW);
    expect(signals).toHaveLength(1);
    const sig = signals[0]!;
    // NOT a global deprecation candidate…
    expect(sig.signalKey).not.toContain('deprecation-candidate');
    // …but a localized "failing here" signal that names the broken workspace.
    expect(sig.signalKey).toContain('localized-failure:workspace_local_fail:broken-repo');
    expect(sig.title).toContain('broken-repo');
    expect(sig.body).toMatch(/healthy in other workspaces/i);
    expect(sig.severity).not.toBe('critical');
  });

  it('locallyFailingWorkspaces returns only the genuinely-failing workspace', () => {
    const failing = locallyFailingWorkspaces(poisoned, statInWorkspace);
    expect(failing).toHaveLength(1);
    expect(failing[0]!.workspaces).toContain('broken-repo');
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

// ============================================================================
// #3930 — declarative break-glass + orthogonality metadata supersedes the
// two name-string heuristics (declarative-first, name-fallback-for-undeclared).
// ============================================================================

describe('declarative neverDeprecate metadata (#3930)', () => {
  it('the manifest declares the audited break-glass/safety tools', () => {
    // Purpose-based selection (NOT name-based): incident/integrity tools that are
    // rare BY DESIGN. None of these names match DEFAULT_NEVER_DEPRECATE_PATTERNS.
    expect(NEVER_DEPRECATE_TOOLS.has('verify_audit_chain')).toBe(true);
    expect(NEVER_DEPRECATE_TOOLS.has('cancel_job')).toBe(true);
    expect(NEVER_DEPRECATE_TOOLS.has('ci_health_check')).toBe(true);
  });

  it('a declared tool is protected REGARDLESS of name (no name pattern matches it)', () => {
    // 'verify_audit_chain' matches none of DEFAULT_NEVER_DEPRECATE_PATTERNS, yet it
    // is protected purely via the declaration — proving the heuristic is no longer
    // name-driven for declared tools.
    expect(DEFAULT_NEVER_DEPRECATE_PATTERNS.some((p) => 'verify_audit_chain'.includes(p))).toBe(
      false
    );
    expect(isDeclaredNeverDeprecate('verify_audit_chain')).toBe(true);
    expect(isNeverDeprecate('verify_audit_chain')).toBe(true);
  });

  it('declaration-protected tool is NOT flagged at <=2 invocations', () => {
    const signals = detectDeprecationCandidates(
      [stat({ tool: 'cancel_job', invocationCount: 1, successCount: 1 })],
      NO_WORKSPACE_SCOPE,
      WINDOW
    );
    expect(signals).toEqual([]);
  });

  it('a tool whose NAME matches a pattern but is UNDECLARED is still protected via the fallback', () => {
    // 'db_rollback' is not in the manifest (undeclared) — the documented name
    // fallback still protects it. Declarative-first, fallback-for-undeclared.
    expect(isDeclaredNeverDeprecate('db_rollback')).toBe(false);
    expect(isNeverDeprecate('db_rollback')).toBe(true);
    const signals = detectDeprecationCandidates(
      [stat({ tool: 'db_rollback', invocationCount: 1, successCount: 1 })],
      NO_WORKSPACE_SCOPE,
      WINDOW
    );
    expect(signals).toEqual([]);
  });

  it('an undeclared, ordinary-named low-usage tool is still flagged (exemption is targeted)', () => {
    expect(isDeclaredNeverDeprecate('ordinary_thing')).toBe(false);
    const signals = detectDeprecationCandidates(
      [stat({ tool: 'ordinary_thing', invocationCount: 1, successCount: 1 })],
      NO_WORKSPACE_SCOPE,
      WINDOW
    );
    expect(signals).toHaveLength(1);
  });
});

describe('declarative orthogonalityGroup metadata (#3930)', () => {
  it('the manifest declares orthogonality groups for the deliberately-distinct pairs', () => {
    expect(declaredOrthogonalityGroup('memory_query')).toBe('memory-read');
    expect(declaredOrthogonalityGroup('memory_write')).toBe('memory-write');
    expect(TOOL_ORTHOGONALITY_GROUPS.get('query_trace')).toBe('query-trace');
    expect(TOOL_ORTHOGONALITY_GROUPS.get('query_task_state')).toBe('query-task-state');
  });

  it('two DIFFERENT declared groups are orthogonal → "none" (read vs write)', () => {
    const read = stat({ tool: 'memory_query', invocationCount: 1 });
    const write = stat({ tool: 'memory_write', invocationCount: 100 });
    expect(consolidationConfidence(read, write)).toBe('none');
  });

  it('orthogonal declared siblings are NOT surfaced as consolidation candidates', () => {
    const report = [
      stat({ tool: 'memory_write', invocationCount: 100, successCount: 100 }),
      stat({ tool: 'memory_query', invocationCount: 1, successCount: 1 }),
    ];
    expect(detectConsolidationCandidates(report, WINDOW)).toEqual([]);
  });

  it('SAME declared group falls through to "low" (not orthogonal)', () => {
    const a = stat({ tool: 'memory_query', invocationCount: 1 });
    const b = stat({ tool: 'memory_stats', invocationCount: 100 });
    // Both declare 'memory-read' → same domain → not orthogonal → low hint.
    expect(consolidationConfidence(a, b)).toBe('low');
  });

  it('UNDECLARED siblings fall back to the verb proxy and still surface-as-LOW (conservative)', () => {
    // research_* tools declare no orthogonalityGroup → verb-suffix fallback path.
    const a = stat({ tool: 'research_discover', invocationCount: 2 });
    const b = stat({ tool: 'research_synthesize', invocationCount: 100 });
    expect(declaredOrthogonalityGroup('research_discover')).toBeUndefined();
    expect(consolidationConfidence(a, b)).toBe('low');
  });

  it('never emits a "high" tier from this signal (no false-high hiding)', () => {
    // Spot-check several pairings: the only outcomes are 'none' | 'low'.
    const pairs: Array<[string, string]> = [
      ['memory_query', 'memory_write'],
      ['memory_query', 'memory_stats'],
      ['research_discover', 'research_synthesize'],
      ['git_init', 'git_commit'],
    ];
    for (const [x, y] of pairs) {
      const c = consolidationConfidence(stat({ tool: x }), stat({ tool: y }));
      expect(['none', 'low']).toContain(c);
    }
  });
});
