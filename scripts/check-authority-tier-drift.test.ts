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
  ratificationGateFindings,
  analyzeTierDeclarations,
  analyzeLoopTierDeclarations,
  analyzeTierTransitionEvents,
  buildVoteRecordRatificationResolver,
  buildEnforceEvidenceMap,
  recoverTransitions,
  checkAuthorityTierDeclarations,
  soakDays,
  ENFORCE_FLOOR,
  type RatificationResolver,
} from './check-authority-tier-drift.js';
import type { AuthorityTier } from '../packages/nexus-agents/src/orchestration/strategy-manifest.js';
import type { LoopTierManifest } from '../packages/nexus-agents/src/orchestration/loop-tier-manifest.js';
import { LOOP_TIER_REGISTRY } from '../packages/nexus-agents/src/orchestration/loop-tier-registry.js';
import type { TierTransitionPayload } from '../packages/nexus-agents/src/audit/audit-types.js';
import {
  computeVoteRecordHash,
  type VoteRecord,
} from '../packages/nexus-agents/src/audit/vote-record.js';
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

describe('analyzeLoopTierDeclarations — loop-tier gate (#3843)', () => {
  const liveLoops = LOOP_TIER_REGISTRY.loops;

  /** A minimal valid suggest loop. */
  function suggestLoop(id: string): LoopTierManifest {
    return {
      id,
      schemaVersion: 1,
      description: 'a suggest loop',
      authorityTier: 'suggest',
      evidence: 'src/x.ts:1',
    };
  }

  /** A bounded enforce loop (the tune-loop shape). */
  function enforceLoop(id: string): LoopTierManifest {
    return {
      id,
      schemaVersion: 1,
      description: 'a bounded enforce loop',
      authorityTier: 'enforce',
      evidence: 'src/x.ts:1',
      boundedEnvelope: {
        summary: 'bounded demotion-only nudge',
        bounds: { demotionFloor: 0.5, maxStepPerAdjustment: 0.2, decayWindowMinutes: 30 },
        enforcedBy: 'src/x.ts:FLOOR',
        demotionTrigger: 'automatic decay',
      },
    };
  }

  it('PASSES the live registry (YAML ↔ constant in lockstep, all loops declared)', () => {
    const loopYaml = toYaml({ version: 1, loops: liveLoops });
    const findings = analyzeLoopTierDeclarations({
      loopYaml,
      embeddedLoops: liveLoops,
      enforceEvidenceById: new Map(),
    });
    expect(findings).toEqual([]);
  });

  it('FAILS loop-registry-invalid on an undeclared tier (TOOL_CLASS-or-CI-fails)', () => {
    // authorityTier omitted → schema parse fails → single registry-invalid finding.
    const loopYaml = toYaml({
      version: 1,
      loops: [{ id: 'undeclared', schemaVersion: 1, description: 'x', evidence: 'src/x.ts:1' }],
    });
    const findings = analyzeLoopTierDeclarations({
      loopYaml,
      embeddedLoops: liveLoops,
      enforceEvidenceById: new Map(),
    });
    expect(findings.some((f) => f.code === 'loop-registry-invalid')).toBe(true);
  });

  it('FAILS loop-registry-invalid on an enforce loop with NO envelope (breakage fixture)', () => {
    const loopYaml = toYaml({
      version: 1,
      loops: [
        {
          id: 'rogue',
          schemaVersion: 1,
          description: 'x',
          authorityTier: 'enforce',
          evidence: 'src/x.ts:1',
        },
      ],
    });
    const findings = analyzeLoopTierDeclarations({
      loopYaml,
      embeddedLoops: liveLoops,
      enforceEvidenceById: new Map(),
    });
    expect(findings.some((f) => f.code === 'loop-registry-invalid')).toBe(true);
  });

  it('FAILS loop-registry-drift when YAML and the embedded constant disagree', () => {
    // YAML declares pr-review as enforce-with-envelope, constant says advisory.
    const drifted = liveLoops.map((l) =>
      l.id === 'suggest-research-tasks' ? { ...l, authorityTier: 'observe' as const } : l
    );
    const loopYaml = toYaml({ version: 1, loops: drifted });
    const findings = analyzeLoopTierDeclarations({
      loopYaml,
      embeddedLoops: liveLoops,
      enforceEvidenceById: new Map(),
    });
    expect(findings.some((f) => f.code === 'loop-registry-drift')).toBe(true);
  });

  it('FAILS loop-enforce-without-envelope-or-evidence when an enforce loop has neither', () => {
    // Bypass the schema by injecting an enforce loop with no envelope directly as
    // the embedded constant (the (3) defence catches a future drop-the-envelope PR).
    const noEnvelope = { ...enforceLoop('bare-enforce'), boundedEnvelope: undefined };
    const findings = analyzeLoopTierDeclarations({
      loopYaml: undefined, // skip the YAML schema gate so (3) is what fires
      embeddedLoops: [suggestLoop('a'), noEnvelope],
      enforceEvidenceById: new Map(),
    });
    expect(findings.some((f) => f.code === 'loop-enforce-without-envelope-or-evidence')).toBe(true);
  });

  it('PASSES an enforce loop with a floor-meeting evidence record (ladder-promotion path)', () => {
    const noEnvelope = { ...enforceLoop('promoted'), boundedEnvelope: undefined };
    const evidence = buildEnforceEvidenceMap(
      toYaml({ version: 1, evidence: [meetingEvidence('promoted')] })
    );
    const findings = analyzeLoopTierDeclarations({
      loopYaml: undefined,
      embeddedLoops: [noEnvelope],
      enforceEvidenceById: evidence,
    });
    expect(findings).toEqual([]);
  });

  it('PASSES a bounded enforce loop with no evidence (pre-existing-loop path)', () => {
    const findings = analyzeLoopTierDeclarations({
      loopYaml: undefined,
      embeddedLoops: [enforceLoop('tune-like')],
      enforceEvidenceById: new Map(),
    });
    expect(findings).toEqual([]);
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

/**
 * Build a properly self-hashed authentic {@link VoteRecord} (#3927). `ratifies`
 * defaults to `auto-remediation` (the subject `transition()` promotes). Pass
 * `ratifies: null` to omit the field (an ordinary, non-ratifying vote).
 */
function voteRecord(
  id: string,
  opts: {
    ratifies?: string | null;
    decision?: VoteRecord['decision'];
    strategy?: VoteRecord['strategy'];
    sequence?: number;
  } = {}
): VoteRecord {
  const ratifies = opts.ratifies === null ? undefined : (opts.ratifies ?? 'auto-remediation');
  const payload: Omit<VoteRecord, 'hash'> = {
    version: '1.2',
    id,
    sequence: opts.sequence ?? 0,
    recordedAt: '2026-06-15T00:00:00.000Z',
    proposalHash: 'a'.repeat(64),
    proposal: 'Promote auto-remediation from advisory to enforce',
    strategy: opts.strategy ?? 'higher_order',
    decision: opts.decision ?? 'approved',
    approvalPercentage: 85.7,
    voteCounts: { approve: 6, reject: 1, abstain: 0, total: 7 },
    voters: [{ role: 'architect', decision: 'approve', confidence: 0.9 }],
    ...(ratifies !== undefined ? { ratifies } : {}),
  };
  return { ...payload, hash: computeVoteRecordHash(payload) };
}

/** An approved higher_order record ratifying `auto-remediation`. */
function approvedVote(id: string): VoteRecord {
  return voteRecord(id);
}

/** Serialize records to committed-ledger JSONL text (one record per line). */
function jsonl(...records: VoteRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + '\n';
}

/** A resolver backed by the given authentic records (keyed by id). */
function resolverOf(...records: VoteRecord[]): RatificationResolver {
  const byId = new Map(records.map((r) => [r.id, r]));
  return (ref) => byId.get(ref);
}

/** A resolver that resolves nothing (empty/absent ledger). */
const emptyResolver: RatificationResolver = () => undefined;

describe('ratificationGateFindings — the gate reads the evidence ledger (#5028)', () => {
  const evidenceEntry = {
    loopId: 'dev-pipeline',
    fromTier: 'advisory' as const,
    toTier: 'enforce' as const,
    evalN: 120,
    precision: 0.95,
    recall: 0.9,
    primaryMetric: { name: 'accuracy', value: 0.95, ci: [0.92, 0.97] as [number, number] },
    soakDuration: 'P31D',
    ratificationVote: '#9999',
    evidenceUri: 'https://example.invalid/evidence',
  };

  it('fails a promotion whose ratificationVote resolves to nothing', () => {
    // The wiring, not the machinery. `analyzeTierTransitionEvents` and
    // `buildVoteRecordRatificationResolver` were already well tested — and the
    // gate still could not fire, because it read
    // `governance/authority-tier-transitions.jsonl`, a 0-byte file whose only
    // writer is called from tests and a no-op stub. Tiers change by editing
    // `loop-tiers.yaml`, so the runtime event never occurs.
    const findings = ratificationGateFindings(
      new Map([['dev-pipeline', evidenceEntry as never]]),
      '' // no vote records at all
    );

    expect(findings.map((f) => f.code)).toContain('promotion-ratification-unresolved');
  });

  it('fails closed when the vote ledger itself cannot be verified', () => {
    // The pair for the negative above, and the more important direction: a
    // ledger that does not verify must reject every promotion rather than let
    // one through. A hand-written record with a bogus hash is exactly what a
    // forged ratification would look like.
    const forged = JSON.stringify({
      id: 'vote-1',
      decision: 'approved',
      strategy: 'higher_order',
      ratifies: 'dev-pipeline',
      proposal: 'promote dev-pipeline to enforce',
      sequence: 1,
      recordedAt: '2026-08-26T00:00:00.000Z',
      proposalHash: 'x'.repeat(64),
      approvalPercentage: 100,
      voteCounts: { approve: 7, reject: 0, abstain: 0, total: 7 },
      voters: [],
      hash: 'y'.repeat(64),
      version: '1.2',
    });

    const findings = ratificationGateFindings(
      new Map([['dev-pipeline', { ...evidenceEntry, ratificationVote: 'vote-1' } as never]]),
      forged
    );

    expect(findings.length).toBeGreaterThan(0);
  });

  it('reports nothing when no promotion has been claimed', () => {
    // The empty case, named: no evidence entries is "no promotions yet", not a
    // verdict about any promotion.
    expect(ratificationGateFindings(new Map(), '')).toEqual([]);
  });
});

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

  it('FAILS a promotion whose ref resolves to a REJECTED record (#3894)', () => {
    const findings = analyzeTierTransitionEvents(
      [transition('promotion', 'cv_no')],
      resolverOf(voteRecord('cv_no', { decision: 'rejected' }))
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('promotion-ratification-not-approved');
    expect(findings[0]?.message).toContain("'rejected'");
  });

  it('FAILS a promotion whose ref resolves to a NON-higher_order record (#3894)', () => {
    const findings = analyzeTierTransitionEvents(
      [transition('promotion', 'cv_maj')],
      resolverOf(voteRecord('cv_maj', { strategy: 'simple_majority' }))
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('promotion-ratification-not-approved');
    expect(findings[0]?.message).toContain('higher_order');
  });

  it('FAILS a promotion whose ref resolves to a record ratifying a DIFFERENT subject (#3894)', () => {
    const findings = analyzeTierTransitionEvents(
      [transition('promotion', 'cv_other')],
      resolverOf(voteRecord('cv_other', { ratifies: 'some-other-loop' }))
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('promotion-ratification-not-approved');
    expect(findings[0]?.message).toContain('not the transition subject');
  });

  it('FAILS a promotion whose ref resolves to a record with NO ratifies field (#3927)', () => {
    const findings = analyzeTierTransitionEvents(
      [transition('promotion', 'cv_plain')],
      resolverOf(voteRecord('cv_plain', { ratifies: null }))
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('promotion-ratification-not-approved');
    expect(findings[0]?.message).toContain('(no ratifies field)');
  });

  it('FAILS a promotion of an AMBIGUOUS subject (conflicting decisions) closed (#3927)', () => {
    // The subject has both an approved and a rejected record; even with a ref to
    // the approving one, the conflict must block the promotion.
    const findings = analyzeTierTransitionEvents(
      [transition('promotion', 'cv_ok')],
      resolverOf(voteRecord('cv_ok')),
      new Set(['auto-remediation'])
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('promotion-ratification-ambiguous');
    expect(findings[0]?.message).toContain('CONFLICTING');
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

describe('buildVoteRecordRatificationResolver — the authentic ledger (#3927 item 1)', () => {
  it('resolves an id present in a valid, verified ledger', () => {
    const { resolver, conflictSubjects, findings } = buildVoteRecordRatificationResolver(
      jsonl(voteRecord('cv_resolved'))
    );
    expect(findings).toEqual([]);
    expect(conflictSubjects.size).toBe(0);
    expect(resolver('cv_resolved')?.decision).toBe('approved');
    expect(resolver('cv_resolved')?.ratifies).toBe('auto-remediation');
    expect(resolver('missing')).toBeUndefined();
  });

  it('resolves NOTHING (fail-closed) for an absent ledger, no findings', () => {
    const { resolver, conflictSubjects, findings } = buildVoteRecordRatificationResolver(undefined);
    expect(findings).toEqual([]);
    expect(conflictSubjects.size).toBe(0);
    expect(resolver('anything')).toBeUndefined();
  });

  it('resolves NOTHING for an empty ledger (no records), no findings', () => {
    const { resolver, findings } = buildVoteRecordRatificationResolver('');
    expect(findings).toEqual([]);
    expect(resolver('anything')).toBeUndefined();
  });

  it('FAILS vote-records-ledger-invalid and resolves nothing on an UNPARSEABLE line', () => {
    const { resolver, findings } = buildVoteRecordRatificationResolver(
      `${JSON.stringify(voteRecord('cv_ok'))}\n{ not json\n`
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('vote-records-ledger-invalid');
    expect(findings[0]?.message).toContain('line(s)');
    expect(resolver('cv_ok')).toBeUndefined(); // whole ledger fails closed
  });

  it('FAILS vote-records-ledger-invalid on a TAMPERED record (hash_mismatch)', () => {
    const good = voteRecord('cv_tampered');
    // Flip the decision on the persisted line WITHOUT recomputing the hash.
    const tampered = JSON.stringify({ ...good, decision: 'rejected' });
    const { resolver, findings } = buildVoteRecordRatificationResolver(`${tampered}\n`);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('vote-records-ledger-invalid');
    expect(findings[0]?.message).toContain('hash_mismatch');
    expect(resolver('cv_tampered')).toBeUndefined();
  });

  it('FAILS vote-records-ledger-invalid on a SEQUENCE GAP (omitted record)', () => {
    // sequences {0, 2} — record at sequence 1 was deleted.
    const { findings } = buildVoteRecordRatificationResolver(
      jsonl(voteRecord('cv_a', { sequence: 0 }), voteRecord('cv_c', { sequence: 2 }))
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('vote-records-ledger-invalid');
    expect(findings[0]?.message).toContain('sequence_gap');
  });

  it('FAILS vote-records-ledger-invalid on DUPLICATE record ids (ambiguous ref)', () => {
    const { resolver, findings } = buildVoteRecordRatificationResolver(
      jsonl(
        voteRecord('dup', { sequence: 0 }),
        voteRecord('dup', { sequence: 1, decision: 'rejected' })
      )
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('vote-records-ledger-invalid');
    expect(findings[0]?.message).toContain("'dup'");
    expect(resolver('dup')).toBeUndefined();
  });

  it('surfaces a CONFLICTING-decision subject in conflictSubjects (benign fork, ambiguous basis)', () => {
    // Two records ratify the same subject but disagree on decision — a union-merge
    // fork. Sequences differ so the SET verifies; the conflict is reported.
    const { conflictSubjects, findings } = buildVoteRecordRatificationResolver(
      jsonl(
        voteRecord('cv_yes', { sequence: 0, decision: 'approved' }),
        voteRecord('cv_no', { sequence: 1, decision: 'rejected' })
      )
    );
    expect(findings).toEqual([]); // the set is valid; conflict is not a ledger error
    expect([...conflictSubjects]).toEqual(['auto-remediation']);
  });

  it('does NOT flag a subject with multiple AGREEING records as conflicting', () => {
    const { conflictSubjects, findings } = buildVoteRecordRatificationResolver(
      jsonl(
        voteRecord('cv_1', { sequence: 0, decision: 'approved' }),
        voteRecord('cv_2', { sequence: 1, decision: 'approved' })
      )
    );
    expect(findings).toEqual([]);
    expect(conflictSubjects.size).toBe(0);
  });

  it('END-TO-END: a conflicting ledger fails the matching promotion closed', () => {
    const ledger = buildVoteRecordRatificationResolver(
      jsonl(
        voteRecord('cv_yes', { sequence: 0, decision: 'approved' }),
        voteRecord('cv_no', { sequence: 1, decision: 'rejected' })
      )
    );
    const findings = analyzeTierTransitionEvents(
      [transition('promotion', 'cv_yes')],
      ledger.resolver,
      ledger.conflictSubjects
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('promotion-ratification-ambiguous');
  });

  it('END-TO-END: a clean ledger PASSES the matching promotion', () => {
    const ledger = buildVoteRecordRatificationResolver(jsonl(voteRecord('cv_clean')));
    const findings = analyzeTierTransitionEvents(
      [transition('promotion', 'cv_clean')],
      ledger.resolver,
      ledger.conflictSubjects
    );
    expect(findings).toEqual([]);
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
        // #4558: AuditLogConfig requires these; the Zod schema supplies the
        // same values as defaults, so the runtime never noticed and no gate
        // typechecked scripts/. Stated explicitly rather than relying on a
        // validation step to paper over a type error.
        filePrefix: 'audit',
        maxFileSizeBytes: 10 * 1024 * 1024,
        maxFiles: 10,
        enableCompression: false,
        maxQueueDepth: 10_000,
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
    const resolver = resolverOf(voteRecord('cv_2077', { ratifies: 'clawguard' }));
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

  // #3921: the transition payload is now hash-covered AND the gate verifies the
  // chain. A forged promotion whose payload is tampered post-write — flipping
  // toTier or borrowing another approval's ratificationVoteRef — breaks the
  // chain and FAILS the gate, even though every line still parses as an
  // AuditEvent and the (untrustworthy) payload would otherwise pass ratification.
  it('FAILS transition-log-chain-broken when a persisted toTier is flipped (#3921)', async () => {
    const { jsonl } = await jsonlOf((l) => {
      l.logTierTransition({
        kind: 'promotion',
        subject: 'clawguard',
        fromTier: 'observe',
        toTier: 'suggest',
        evidenceRef: 'evidence#2077',
        ratificationVoteRef: 'cv_2077',
      });
    });
    const event = JSON.parse(jsonl) as {
      metadata: { tierTransition: Record<string, unknown> };
    };
    // Forge a privilege escalation in the persisted payload, leaving the hash.
    event.metadata.tierTransition.toTier = 'enforce';
    const tamperedJsonl = JSON.stringify(event);

    const { findings } = recoverTransitions(tamperedJsonl);
    expect(findings.some((f) => f.code === 'transition-log-chain-broken')).toBe(true);
  });

  it('FAILS transition-log-chain-broken when a persisted ratificationVoteRef is rewritten (#3921)', async () => {
    const { jsonl } = await jsonlOf((l) => {
      l.logTierTransition({
        kind: 'promotion',
        subject: 'clawguard',
        fromTier: 'advisory',
        toTier: 'enforce',
        evidenceRef: 'evidence#2077',
        ratificationVoteRef: 'cv_real',
      });
    });
    const event = JSON.parse(jsonl) as {
      metadata: { tierTransition: Record<string, unknown> };
    };
    event.metadata.tierTransition.ratificationVoteRef = 'cv_borrowed';
    const tamperedJsonl = JSON.stringify(event);

    const { findings } = recoverTransitions(tamperedJsonl);
    expect(findings.some((f) => f.code === 'transition-log-chain-broken')).toBe(true);
  });

  it('an untampered emitted v2 transition log PASSES chain verification (#3921)', async () => {
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
    const { findings } = recoverTransitions(jsonl);
    expect(findings).toEqual([]);
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
