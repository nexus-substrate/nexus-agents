import { describe, expect, it } from 'vitest';

import {
  ATLDataSchema,
  createDefaultStages,
  FirewallConfigSchema,
  FirewallStagesSchema,
} from './firewall-types.js';

describe('FirewallStagesSchema', () => {
  it('uses sensible defaults when no stages provided', () => {
    const stages = FirewallStagesSchema.parse({});
    expect(stages.sanitization).toBe(true);
    expect(stages.trustClassification).toBe(true);
    expect(stages.reputationAssessment).toBe(false);
    expect(stages.policyEnforcement).toBe(true);
    expect(stages.corroboration).toBe(false);
    expect(stages.audit).toBe(true);
  });

  it('allows overriding individual stages', () => {
    const stages = FirewallStagesSchema.parse({
      reputationAssessment: true,
      audit: false,
    });
    expect(stages.reputationAssessment).toBe(true);
    expect(stages.audit).toBe(false);
    expect(stages.sanitization).toBe(true);
  });

  it('rejects non-boolean stage values', () => {
    expect(() => FirewallStagesSchema.parse({ sanitization: 'yes' })).toThrow();
  });
});

describe('FirewallConfigSchema', () => {
  it('provides default config values', () => {
    const cfg = FirewallConfigSchema.parse({});
    expect(cfg.allowlistedMaintainers).toEqual([]);
    expect(cfg.maxInputLength).toBe(50_000);
    expect(cfg.context.hasWriteAccess).toBe(false);
    expect(cfg.context.hasSecretAccess).toBe(false);
  });

  it('validates allowlistedMaintainers entries', () => {
    expect(() => FirewallConfigSchema.parse({ allowlistedMaintainers: [''] })).toThrow();
  });

  it('rejects non-positive maxInputLength', () => {
    expect(() => FirewallConfigSchema.parse({ maxInputLength: 0 })).toThrow();
    expect(() => FirewallConfigSchema.parse({ maxInputLength: -1 })).toThrow();
  });

  it('accepts valid custom config', () => {
    const cfg = FirewallConfigSchema.parse({
      allowlistedMaintainers: ['alice', 'bob'],
      maxInputLength: 10_000,
      context: { hasWriteAccess: true },
    });
    expect(cfg.allowlistedMaintainers).toEqual(['alice', 'bob']);
    expect(cfg.maxInputLength).toBe(10_000);
    expect(cfg.context.hasWriteAccess).toBe(true);
  });
});

describe('ATLDataSchema', () => {
  it('validates a complete ATL data object', () => {
    const data = ATLDataSchema.parse({
      tier: '3',
      source: 'github-comment',
      user: 'octocat',
      sanitized: true,
      rep: 0.45,
    });
    expect(data.tier).toBe('3');
    expect(data.rep).toBe(0.45);
  });

  it('allows optional rep field', () => {
    const data = ATLDataSchema.parse({
      tier: '1',
      source: 'github-issue',
      user: 'alice',
      sanitized: false,
    });
    expect(data.rep).toBeUndefined();
  });

  it('rejects invalid tier values', () => {
    expect(() =>
      ATLDataSchema.parse({
        tier: '5',
        source: 'x',
        user: 'y',
        sanitized: true,
      })
    ).toThrow();
  });

  it('rejects rep outside 0-1 range', () => {
    expect(() =>
      ATLDataSchema.parse({
        tier: '2',
        source: 'x',
        user: 'y',
        sanitized: true,
        rep: 1.5,
      })
    ).toThrow();
  });

  it('rejects empty source', () => {
    expect(() =>
      ATLDataSchema.parse({
        tier: '1',
        source: '',
        user: 'a',
        sanitized: true,
      })
    ).toThrow();
  });
});

describe('createDefaultStages', () => {
  it('returns the default stage config', () => {
    const stages = createDefaultStages();
    expect(stages.sanitization).toBe(true);
    expect(stages.reputationAssessment).toBe(false);
  });
});
