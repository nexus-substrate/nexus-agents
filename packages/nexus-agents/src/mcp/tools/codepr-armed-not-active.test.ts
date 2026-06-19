/**
 * Regression: "armed ≠ active" — owner approval can NOT bypass the evidence gates
 * (#3670 code-PR adapter; #3769 capability-loop enforce).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * On 2026-06-19 the repo owner approved enabling the code-PR adapter (#3670) and
 * capability-loop enforce (#3769). A 7-0 enable-vote recorded the binding reading
 * of that approval: owner sign-off satisfies the HUMAN-AUTHORIZATION gate, but it
 * MUST NOT collapse the EVIDENCE gates. The gates are CONJUNCTIVE — every criterion
 * must hold — and each is FALSIFIABLE and EVIDENCE-BASED (a realized operational
 * fact, never model output and never "the owner said so").
 *
 * "Armed" (built, owner-approved, dormant) is therefore NOT the same as "active":
 *  - For #3670, an owner-ack plus a recorded enable-vote ref is necessary but NEVER
 *    sufficient — the guards-green soak (≥ minGuardsGreenSoak consecutive clean
 *    dry-run plans) and the explicit OFF→on flag are independent, additional gates,
 *    and the scoped push credential (NEXUS_CODEPR_TOKEN) is a further hard gate.
 *  - For #3769, owner approval is not even an INPUT to `evaluateEnforceReadiness`:
 *    enforce-readiness depends only on the volume / judged-coverage / soundness /
 *    named-evaluator / named-owner evidence. Approval cannot make it ready.
 *
 * These tests assert EXISTING behavior of the current code — they are a permanent
 * regression fence so a future change cannot quietly let owner approval short-circuit
 * a missing-evidence state into "active". They change NO gate logic, threshold,
 * guard, or default; they only pin the invariant.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  evaluateCodePrEnableReadiness,
  DEFAULT_CODEPR_ENABLE_READINESS_CONFIG,
  type CodePrEnableReadinessEvidence,
} from './codepr-enable-readiness.js';
import {
  executeCodePrPush,
  CODEPR_TOKEN_ENV,
  type CodePrPushInput,
  type CodePrPushDeps,
  type OpenedPrRef,
  type OpenPullRequestArgs,
} from './codepr-push.js';
import {
  evaluateEnforceReadiness,
  type EnforceReadinessEvidence,
} from './improvement-enforce-readiness.js';
import type { IAuditLogger, AuditEventInput } from '../../audit/audit-types.js';

// ----------------------------------------------------------------------------
// Helpers (mirror the mock-seam pattern from codepr-push.test.ts)
// ----------------------------------------------------------------------------

function makeCapturingLogger(): { logger: IAuditLogger; events: AuditEventInput[] } {
  const events: AuditEventInput[] = [];
  const logger: IAuditLogger = {
    log: (input) => {
      events.push(input);
    },
    logToolInvocation: () => {},
    logPolicyDecision: () => {},
    logSecurityEvent: () => {},
    logRateLimitViolation: () => {},
    logTierTransition: () => {},
    flush: async () => {},
    close: async () => {},
  };
  return { logger, events };
}

/** Deps whose external-action seams are mocked so they can be asserted NEVER-called. */
interface MockDeps {
  deps: CodePrPushDeps;
  gitPush: ReturnType<typeof vi.fn>;
  openPullRequest: ReturnType<typeof vi.fn>;
  events: AuditEventInput[];
}

function makeMockDeps(soak: number): MockDeps {
  const { logger, events } = makeCapturingLogger();
  const pr: OpenedPrRef = { number: 1, url: 'https://example.com/org/repo/pull/1' };
  const gitPush = vi.fn((_b: string, _w: string, _t: string) => {
    /* mock: a real push would be a security violation in this test */
  });
  const openPullRequest = vi.fn((_a: OpenPullRequestArgs): OpenedPrRef => pr);
  const deps: CodePrPushDeps = { gitPush, openPullRequest, logger, readSoak: () => soak };
  return { deps, gitPush, openPullRequest, events };
}

/**
 * A code-PR push input that is "armed": the owner-ack, a recorded enable-vote ref,
 * and the explicit OFF→on flag are all present. The remaining evidence gates (the
 * soak read, the scoped token) are controlled per-test.
 */
function armedInput(over: Partial<CodePrPushInput> = {}): CodePrPushInput {
  return {
    run: {
      runId: 'run-armed-not-active',
      sourceSignalHash: 'sig-hash-1',
      changes: [{ relPath: 'src/feature.ts', newContent: 'export const x = 1;\n' }],
    },
    // owner + enable-vote-ref + flag all set: the HUMAN-AUTHORIZATION half is satisfied.
    readiness: { flagEnabled: true, enableVoteRef: 'enable-vote-2026-06-19', owner: 'williamzujkowski' },
    prTitle: 'auto code-PR',
    prBody: 'body',
    ...over,
  };
}

// ============================================================================
// #3670 — evaluateCodePrEnableReadiness: owner approval can NOT activate alone
// ============================================================================

describe('armed ≠ active — code-PR enable-readiness (#3670)', () => {
  it('1) owner-ack + enable-vote-ref + flag, but soak below threshold ⇒ NOT ready (blocks on guards-green-soak)', () => {
    // The full HUMAN-AUTHORIZATION surface is present (owner, vote ref, OFF→on flag)
    // yet the guards-green soak has not been earned. Approval does NOT substitute.
    const evidence: CodePrEnableReadinessEvidence = {
      flagEnabled: true,
      enableVoteRef: 'enable-vote-2026-06-19',
      consecutiveGreenDryRuns: 0, // soak not accrued — below DEFAULT min (50)
      owner: 'williamzujkowski',
    };
    const verdict = evaluateCodePrEnableReadiness(evidence);
    expect(verdict.ready).toBe(false);
    expect(verdict.blockers).toContain('guards-green-soak');
    // The owner-ack and enable-vote criteria themselves are satisfied — proving the
    // soak is an INDEPENDENT gate, not a consequence of missing approval.
    expect(verdict.blockers).not.toContain('owner-ack');
    expect(verdict.blockers).not.toContain('enable-vote-ref');
    expect(verdict.blockers).not.toContain('flag-enabled');
  });

  it('2) owner-ack alone (flag off, no soak) ⇒ NOT ready (blocks on flag + soak)', () => {
    // Owner approval recorded, but neither the explicit flag nor the soak is present.
    // The conjunctive gate stays closed; approval is necessary, never sufficient.
    const evidence: CodePrEnableReadinessEvidence = {
      flagEnabled: false,
      enableVoteRef: '',
      consecutiveGreenDryRuns: 0,
      owner: 'williamzujkowski',
    };
    const verdict = evaluateCodePrEnableReadiness(evidence);
    expect(verdict.ready).toBe(false);
    expect(verdict.blockers).toEqual(
      expect.arrayContaining(['flag-enabled', 'guards-green-soak'])
    );
    // owner-ack is the ONE criterion the approval satisfies — it must NOT be a blocker.
    expect(verdict.blockers).not.toContain('owner-ack');
    // The default soak bar is a real, high gate (sanity: not silently 0).
    expect(DEFAULT_CODEPR_ENABLE_READINESS_CONFIG.minGuardsGreenSoak).toBeGreaterThan(0);
  });
});

// ============================================================================
// #3670 — executeCodePrPush: refuses (no external action) while armed-but-not-ready
// ============================================================================

describe('armed ≠ active — code-PR push refuses external action (#3670)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('3a) armed (owner+vote+flag) but soak=0 ⇒ not_enabled; gitPush/openPullRequest NEVER called', () => {
    // Even with a token present, the readiness gate runs FIRST and the un-earned
    // soak blocks the push. No external action is taken.
    vi.stubEnv(CODEPR_TOKEN_ENV, 'scoped-token-present');
    const m = makeMockDeps(0); // soak not accrued — below default min
    const result = executeCodePrPush(armedInput(), m.deps);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected denial');
    expect(result.reason).toBe('not_enabled');
    expect(result.detail).toContain('guards-green-soak');
    expect(m.gitPush).not.toHaveBeenCalled();
    expect(m.openPullRequest).not.toHaveBeenCalled();
  });

  it('3b) armed but no NEXUS_CODEPR_TOKEN ⇒ no_credentials; gitPush/openPullRequest NEVER called', () => {
    // Make the readiness gate fully PASS (high soak, low bar) so the ONLY remaining
    // gate is the scoped credential — and prove its absence still refuses the push.
    vi.stubEnv(CODEPR_TOKEN_ENV, '');
    const m = makeMockDeps(1000); // soak well above the (lowered) bar
    const result = executeCodePrPush(
      armedInput({
        readinessConfig: {
          minGuardsGreenSoak: 1,
          requireEnableVoteRef: true,
          requireOwnerAck: true,
        },
      }),
      m.deps
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected denial');
    expect(result.reason).toBe('no_credentials');
    expect(m.gitPush).not.toHaveBeenCalled();
    expect(m.openPullRequest).not.toHaveBeenCalled();
  });
});

// ============================================================================
// #3769 — evaluateEnforceReadiness: approval is not even an input; evidence only
// ============================================================================

describe('armed ≠ active — capability-loop enforce-readiness (#3769)', () => {
  it('4) audit-only / insufficient-soak evidence ⇒ NOT ready, and owner approval is not even an input that could flip it', () => {
    // "Audit-only" state: the soak has produced few judged, sound shadow selections.
    // This is the parallel of the code-PR un-earned soak: not enough EVIDENCE.
    const auditOnly: EnforceReadinessEvidence = {
      shadowSelections: 0, // no volume — nothing judged yet (default min volume is 20)
      judgedSelections: 0,
      judgedSound: 0,
      // A named owner IS present (this is exactly the field an "owner approved it"
      // reading would point at) — yet it cannot make enforce ready.
      owner: 'williamzujkowski',
    };
    const verdict = evaluateEnforceReadiness(auditOnly);
    expect(verdict.ready).toBe(false);
    // Blocked on the evidence gates, NOT on a missing owner.
    expect(verdict.blockers).toEqual(
      expect.arrayContaining(['volume', 'judged-coverage', 'soundness'])
    );
    expect(verdict.blockers).not.toContain('named-owner');

    // The function signature itself encodes "armed ≠ active": there is NO approval
    // parameter. Adding owner approval changes nothing — readiness is a function of
    // the realized evidence alone. The named-owner criterion is just one of the five
    // conjunctive criteria; satisfying it cannot satisfy volume/coverage/soundness.
    const stillNotReady = evaluateEnforceReadiness({
      ...auditOnly,
      evaluator: 'security-reviewer@example', // even adding the evaluator…
    });
    expect(stillNotReady.ready).toBe(false);
    expect(stillNotReady.blockers).toEqual(
      expect.arrayContaining(['volume', 'judged-coverage', 'soundness'])
    );
  });
});
