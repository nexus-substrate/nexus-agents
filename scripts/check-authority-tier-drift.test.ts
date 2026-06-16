/**
 * Tests for the authority-tier declaration gate (#3841, ADR-0017).
 *
 * Proves the gate fails on (a) an undeclared tier, (b) an `enforce` declaration
 * without a floor-meeting promotion-evidence record (the deliberate-breakage
 * fixture), and (c) evidence below the ADR-0017 advisory→enforce floor — and that
 * it PASSES the live registry (all 8 conservatively declared, none `enforce`).
 *
 * @module scripts/check-authority-tier-drift.test
 * (Source: ADR-0017, Issue #3841)
 */

import { describe, it, expect } from 'vitest';
import { stringify as toYaml } from 'yaml';
import {
  analyzeTierDeclarations,
  analyzeTierTransitionEvents,
  buildRatificationResolver,
  recoverTransitions,
  checkAuthorityTierDeclarations,
  soakDays,
  ENFORCE_FLOOR,
  type RatificationResolver,
  type RatificationVote,
} from './check-authority-tier-drift.js';
import type { AuthorityTier } from '../packages/nexus-agents/src/orchestration/strategy-manifest.js';
import type { TierTransitionPayload } from '../packages/nexus-agents/src/audit/audit-types.js';
import { AuditLogger } from '../packages/nexus-agents/src/audit/audit-logger.js';
import { InMemoryAuditStorage } from '../packages/nexus-agents/src/audit/audit-storage.js';

/** A floor-meeting promotion-evidence record for `loopId`, advisory→enforce. */
function meetingEvidence(loopId: string): Record<string, unknown> {
  return {
    loopId,
    fromTier: 'advisory',
    toTier: 'enforce',
    evalN: ENFORCE_FLOOR.evalN,
    precision: ENFORCE_FLOOR.precision,
    recall: ENFORCE_FLOOR.recall,
    primaryMetric: { name: 'would-block-rate', value: 0.02, ci: [0.0, 0.05] },
    soakDuration: `P${String(ENFORCE_FLOOR.soakDays)}D`,
    ratificationVote: 'consensus-vote://2026-06-15/abc123',
    evidenceUri: 'https://example.test/report',
  };
}

describe('soakDays parser', () => {
  it('parses day and week ISO-8601 durations', () => {
    expect(soakDays('P30D')).toBe(30);
    expect(soakDays('P14D')).toBe(14);
    expect(soakDays('P4W')).toBe(28);
  });
  it('fails closed (0) on an unparseable duration', () => {
    expect(soakDays('garbage')).toBe(0);
  });
});

describe('analyzeTierDeclarations (#3841)', () => {
  it('PASSES when every manifest declares a tier and none are enforce', () => {
    const declaredTiers = new Map<string, AuthorityTier | undefined>([
      ['a', 'suggest'],
      ['b', 'advisory'],
      ['c', 'observe'],
    ]);
    const findings = analyzeTierDeclarations({ declaredTiers, evidenceYaml: undefined });
    expect(findings).toEqual([]);
  });

  it('FAILS (a) on an undeclared tier', () => {
    const declaredTiers = new Map<string, AuthorityTier | undefined>([
      ['a', 'suggest'],
      ['undeclared', undefined],
    ]);
    const findings = analyzeTierDeclarations({ declaredTiers, evidenceYaml: undefined });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('tier-undeclared');
    expect(findings[0]?.message).toContain('undeclared');
  });

  it('FAILS (b) on a manifest claiming enforce WITHOUT an evidence record (breakage fixture)', () => {
    const declaredTiers = new Map<string, AuthorityTier | undefined>([['rogue', 'enforce']]);
    // No evidence ledger at all → enforce is a default flip → refused.
    const findings = analyzeTierDeclarations({ declaredTiers, evidenceYaml: undefined });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('enforce-without-evidence');
    expect(findings[0]?.message).toContain('rogue');
  });

  it('FAILS (b) on enforce when the ledger has evidence for a DIFFERENT loop', () => {
    const declaredTiers = new Map<string, AuthorityTier | undefined>([['rogue', 'enforce']]);
    const evidenceYaml = toYaml({ version: 1, evidence: [meetingEvidence('some-other-loop')] });
    const findings = analyzeTierDeclarations({ declaredTiers, evidenceYaml });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('enforce-without-evidence');
  });

  it('FAILS (c) when an enforce record is BELOW the floor (evalN/soak/precision/recall)', () => {
    const declaredTiers = new Map<string, AuthorityTier | undefined>([['weak', 'enforce']]);
    const below = {
      ...meetingEvidence('weak'),
      evalN: 10, // < 100
      precision: 0.5, // < 0.90
      recall: 0.3, // < 0.80
      soakDuration: 'P3D', // < P30D
    };
    const evidenceYaml = toYaml({ version: 1, evidence: [below] });
    const findings = analyzeTierDeclarations({ declaredTiers, evidenceYaml });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('enforce-evidence-below-floor');
    expect(findings[0]?.message).toContain('evalN');
    expect(findings[0]?.message).toContain('precision');
    expect(findings[0]?.message).toContain('recall');
  });

  it('PASSES an enforce declaration backed by a floor-meeting record + ratification', () => {
    const declaredTiers = new Map<string, AuthorityTier | undefined>([['earned', 'enforce']]);
    const evidenceYaml = toYaml({ version: 1, evidence: [meetingEvidence('earned')] });
    const findings = analyzeTierDeclarations({ declaredTiers, evidenceYaml });
    expect(findings).toEqual([]);
  });

  it('FAILS (c) on an evidence ledger that does not validate against the schema', () => {
    const declaredTiers = new Map<string, AuthorityTier | undefined>([['a', 'suggest']]);
    const evidenceYaml = toYaml({ version: 1, evidence: [{ loopId: 'x' /* missing fields */ }] });
    const findings = analyzeTierDeclarations({ declaredTiers, evidenceYaml });
    expect(findings.some((f) => f.code === 'evidence-ledger-invalid')).toBe(true);
  });
});

/** A tier-transition payload with the given kind and optional vote ref. */
function transition(
  kind: 'promotion' | 'demotion',
  ratificationVoteRef?: string
): TierTransitionPayload {
  return {
    kind,
    subject: 'auto-remediation',
    fromTier: kind === 'promotion' ? 'advisory' : 'enforce',
    toTier: kind === 'promotion' ? 'enforce' : 'advisory',
    evidenceRef: 'evidence#3769',
    ...(ratificationVoteRef !== undefined ? { ratificationVoteRef } : {}),
  };
}

/** An approved higher_order ratification vote for `auto-remediation`. */
function approvedVote(id: string): RatificationVote {
  return {
    id,
    subject: 'auto-remediation',
    decision: 'approved',
    strategy: 'higher_order',
    votedAt: '2026-06-15T00:00:00.000Z',
  };
}

/** A resolver backed by the given recorded votes (keyed by id). */
function resolverOf(...votes: RatificationVote[]): RatificationResolver {
  const byId = new Map(votes.map((v) => [v.id, v]));
  return (ref) => byId.get(ref);
}

/** A resolver that resolves nothing (empty/absent ledger). */
const emptyResolver: RatificationResolver = () => undefined;

describe('analyzeTierTransitionEvents — ratification gate (#3842, hardened #3894)', () => {
  it('FAILS a promotion event with NO ratificationVoteRef (breakage fixture)', () => {
    const findings = analyzeTierTransitionEvents([transition('promotion')], emptyResolver);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('promotion-without-ratification');
    expect(findings[0]?.message).toContain('auto-remediation');
  });

  it('FAILS a promotion event whose ratificationVoteRef is empty/whitespace', () => {
    const findings = analyzeTierTransitionEvents([transition('promotion', '   ')], emptyResolver);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('promotion-without-ratification');
  });

  // #3894: non-emptiness is no longer enough — the ref must RESOLVE.
  it('FAILS a promotion whose non-empty ref does NOT resolve (bogus ref, #3894)', () => {
    const findings = analyzeTierTransitionEvents([transition('promotion', 'x')], emptyResolver);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('promotion-ratification-unresolved');
    expect(findings[0]?.message).toContain("ratificationVoteRef='x'");
  });

  it('FAILS a promotion whose ref resolves to a REJECTED vote (#3894)', () => {
    const rejected: RatificationVote = { ...approvedVote('cv_no'), decision: 'rejected' };
    const findings = analyzeTierTransitionEvents(
      [transition('promotion', 'cv_no')],
      resolverOf(rejected)
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('promotion-ratification-not-approved');
    expect(findings[0]?.message).toContain("'rejected'");
  });

  it('FAILS a promotion whose ref resolves to a NON-higher_order vote (#3894)', () => {
    const wrongStrategy: RatificationVote = {
      ...approvedVote('cv_maj'),
      strategy: 'simple_majority',
    };
    const findings = analyzeTierTransitionEvents(
      [transition('promotion', 'cv_maj')],
      resolverOf(wrongStrategy)
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('promotion-ratification-not-approved');
    expect(findings[0]?.message).toContain('higher_order');
  });

  it('FAILS a promotion whose ref resolves to a vote for a DIFFERENT subject (#3894)', () => {
    const otherSubject: RatificationVote = {
      ...approvedVote('cv_other'),
      subject: 'some-other-loop',
    };
    const findings = analyzeTierTransitionEvents(
      [transition('promotion', 'cv_other')],
      resolverOf(otherSubject)
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('promotion-ratification-not-approved');
    expect(findings[0]?.message).toContain('does not match');
  });

  it('PASSES a promotion whose ref RESOLVES to an approved higher_order vote (#3894)', () => {
    const findings = analyzeTierTransitionEvents(
      [transition('promotion', 'cv_3769')],
      resolverOf(approvedVote('cv_3769'))
    );
    expect(findings).toEqual([]);
  });

  it('resolves a ref with surrounding whitespace (trimmed) (#3894)', () => {
    const findings = analyzeTierTransitionEvents(
      [transition('promotion', '  cv_3769  ')],
      resolverOf(approvedVote('cv_3769'))
    );
    expect(findings).toEqual([]);
  });

  it('PASSES a demotion event with NO ratificationVoteRef (automatic, ADR-0017)', () => {
    const findings = analyzeTierTransitionEvents([transition('demotion')], emptyResolver);
    expect(findings).toEqual([]);
  });

  it('flags only the offending promotion in a mixed batch', () => {
    const findings = analyzeTierTransitionEvents(
      [
        transition('promotion', 'cv_ok'),
        transition('demotion'),
        transition('promotion'), // offender — no ref
      ],
      resolverOf(approvedVote('cv_ok'))
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('promotion-without-ratification');
  });
});

describe('buildRatificationResolver — the committed ledger (#3894)', () => {
  it('resolves an id present in a valid ledger', () => {
    const yaml = toYaml({
      version: 1,
      votes: [approvedVote('cv_resolved')],
    });
    const { resolver, findings } = buildRatificationResolver(yaml);
    expect(findings).toEqual([]);
    expect(resolver('cv_resolved')?.decision).toBe('approved');
    expect(resolver('missing')).toBeUndefined();
  });

  it('resolves NOTHING (fail-closed) for an absent ledger', () => {
    const { resolver, findings } = buildRatificationResolver(undefined);
    expect(findings).toEqual([]);
    expect(resolver('anything')).toBeUndefined();
  });

  it('FAILS ratification-ledger-invalid and resolves nothing on a schema-invalid ledger', () => {
    const yaml = toYaml({ version: 1, votes: [{ id: 'x' /* missing fields */ }] });
    const { resolver, findings } = buildRatificationResolver(yaml);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('ratification-ledger-invalid');
    expect(resolver('x')).toBeUndefined();
  });
});

describe('recoverTransitions — reads the chained transition log (#3842)', () => {
  /** Emit transitions through the real hash-chained logger and serialize to JSONL. */
  async function jsonlOf(
    emit: (logger: AuditLogger) => void
  ): Promise<{ jsonl: string; eventCount: number }> {
    const storage = new InMemoryAuditStorage();
    const logger = new AuditLogger(
      {
        logDir: '/tmp/recover-transitions-test',
        enableHashChain: true,
        flushIntervalMs: 60_000,
        minSeverity: 'info',
      },
      storage
    );
    emit(logger);
    await logger.close();
    const events = storage.getAll();
    return { jsonl: events.map((e) => JSON.stringify(e)).join('\n'), eventCount: events.length };
  }

  it('recovers a promotion-without-vote from real emitted events and the gate FAILS', async () => {
    const { jsonl } = await jsonlOf((l) => {
      l.logTierTransition({
        kind: 'promotion',
        subject: 'clawguard',
        fromTier: 'advisory',
        toTier: 'enforce',
        evidenceRef: 'evidence#2077',
        // no ratificationVoteRef — the breakage
      });
    });
    const { transitions, findings } = recoverTransitions(jsonl);
    expect(findings).toEqual([]); // the log itself is valid
    expect(transitions).toHaveLength(1);
    const gate = analyzeTierTransitionEvents(transitions, emptyResolver);
    expect(gate).toHaveLength(1);
    expect(gate[0]?.code).toBe('promotion-without-ratification');
  });

  it('recovers a ratified promotion + a demotion and the gate PASSES (#3894 resolved)', async () => {
    const { jsonl } = await jsonlOf((l) => {
      l.logTierTransition({
        kind: 'promotion',
        subject: 'clawguard',
        fromTier: 'advisory',
        toTier: 'enforce',
        evidenceRef: 'evidence#2077',
        ratificationVoteRef: 'cv_2077',
      });
      l.logTierTransition({
        kind: 'demotion',
        subject: 'clawguard',
        fromTier: 'enforce',
        toTier: 'advisory',
        evidenceRef: 'regression#2077',
      });
    });
    const { transitions, findings } = recoverTransitions(jsonl);
    expect(findings).toEqual([]);
    expect(transitions).toHaveLength(2);
    const resolver = resolverOf({
      id: 'cv_2077',
      subject: 'clawguard',
      decision: 'approved',
      strategy: 'higher_order',
      votedAt: '2026-06-15T00:00:00.000Z',
    });
    expect(analyzeTierTransitionEvents(transitions, resolver)).toEqual([]);
  });

  it('recovers a promotion whose ref does NOT resolve and the gate FAILS (#3894)', async () => {
    const { jsonl } = await jsonlOf((l) => {
      l.logTierTransition({
        kind: 'promotion',
        subject: 'clawguard',
        fromTier: 'advisory',
        toTier: 'enforce',
        evidenceRef: 'evidence#2077',
        ratificationVoteRef: 'bogus-ref', // non-empty, but resolves to nothing
      });
    });
    const { transitions } = recoverTransitions(jsonl);
    const gate = analyzeTierTransitionEvents(transitions, emptyResolver);
    expect(gate).toHaveLength(1);
    expect(gate[0]?.code).toBe('promotion-ratification-unresolved');
  });

  it('FAILS transition-log-invalid on a malformed JSONL line', () => {
    const { findings } = recoverTransitions('{ not json');
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('transition-log-invalid');
  });

  it('skips non-tier-transition audit events without error', async () => {
    const { jsonl } = await jsonlOf((l) => {
      l.logSystemStartup({ note: 'boot' });
    });
    const { transitions, findings } = recoverTransitions(jsonl);
    expect(findings).toEqual([]);
    expect(transitions).toEqual([]);
  });
});

describe('checkAuthorityTierDeclarations — live registry (#3841/#3842)', () => {
  it('the committed registry + evidence ledger + transition log pass the gate', () => {
    expect(checkAuthorityTierDeclarations()).toBe(true);
  });
});
