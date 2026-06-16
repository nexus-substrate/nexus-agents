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
  checkAuthorityTierDeclarations,
  soakDays,
  ENFORCE_FLOOR,
} from './check-authority-tier-drift.js';
import type { AuthorityTier } from '../packages/nexus-agents/src/orchestration/strategy-manifest.js';

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

describe('checkAuthorityTierDeclarations — live registry (#3841)', () => {
  it('the committed registry + evidence ledger pass the gate', () => {
    expect(checkAuthorityTierDeclarations()).toBe(true);
  });
});
