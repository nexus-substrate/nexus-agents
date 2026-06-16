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
  recoverTransitions,
  checkAuthorityTierDeclarations,
  soakDays,
  ENFORCE_FLOOR,
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

describe('analyzeTierTransitionEvents — ratification gate (#3842)', () => {
  it('FAILS a promotion event with NO ratificationVoteRef (breakage fixture)', () => {
    const findings = analyzeTierTransitionEvents([transition('promotion')]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('promotion-without-ratification');
    expect(findings[0]?.message).toContain('auto-remediation');
  });

  it('FAILS a promotion event whose ratificationVoteRef is empty/whitespace', () => {
    const findings = analyzeTierTransitionEvents([transition('promotion', '   ')]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('promotion-without-ratification');
  });

  it('PASSES a promotion event WITH a ratificationVoteRef', () => {
    const findings = analyzeTierTransitionEvents([transition('promotion', 'cv_3769')]);
    expect(findings).toEqual([]);
  });

  it('PASSES a demotion event with NO ratificationVoteRef (automatic, ADR-0017)', () => {
    const findings = analyzeTierTransitionEvents([transition('demotion')]);
    expect(findings).toEqual([]);
  });

  it('flags only the offending promotion in a mixed batch', () => {
    const findings = analyzeTierTransitionEvents([
      transition('promotion', 'cv_ok'),
      transition('demotion'),
      transition('promotion'), // offender
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe('promotion-without-ratification');
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
    const gate = analyzeTierTransitionEvents(transitions);
    expect(gate).toHaveLength(1);
    expect(gate[0]?.code).toBe('promotion-without-ratification');
  });

  it('recovers a ratified promotion + a demotion and the gate PASSES', async () => {
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
    expect(analyzeTierTransitionEvents(transitions)).toEqual([]);
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
