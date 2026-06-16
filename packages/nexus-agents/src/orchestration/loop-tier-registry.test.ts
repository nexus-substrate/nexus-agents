/**
 * Tests for the loop-tier registry (#3843, ADR-0017).
 *
 * Proves (a) the embedded constant validates against the schema, (b) it equals the
 * `governance/loop-tiers.yaml` source of truth (no drift — the #3837 lockstep
 * discipline applied to loops), (c) the four un-issued loops are declared at the
 * epic recon tiers, and (d) the schema's `enforce`-needs-an-envelope cross-check
 * fails a mis-declared loop.
 *
 * @module orchestration/loop-tier-registry.test
 * (Source: ADR-0017, Issue #3843)
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { LOOP_TIER_REGISTRY } from './loop-tier-registry.js';
import {
  LoopTierRegistrySchema,
  parseLoopTierRegistry,
  LOOP_TIER_SCHEMA_VERSION,
} from './loop-tier-manifest.js';

const repoRoot = join(import.meta.dirname, '..', '..', '..', '..');
const yamlPath = join(repoRoot, 'governance', 'loop-tiers.yaml');

describe('loop-tier registry (#3843)', () => {
  it('the embedded constant validates against the schema', () => {
    expect(() => LoopTierRegistrySchema.parse(LOOP_TIER_REGISTRY)).not.toThrow();
  });

  it('the embedded constant equals governance/loop-tiers.yaml (no drift)', () => {
    const fromYaml = parseLoopTierRegistry(readFileSync(yamlPath, 'utf-8'));
    expect(fromYaml).toEqual(LOOP_TIER_REGISTRY);
  });

  it('declares the four un-issued loops at their epic-recon tiers', () => {
    const byId = new Map(LOOP_TIER_REGISTRY.loops.map((l) => [l.id, l.authorityTier]));
    expect(byId.get('suggest-research-tasks')).toBe('suggest');
    expect(byId.get('improvement-review')).toBe('suggest');
    expect(byId.get('pr-review')).toBe('advisory');
    expect(byId.get('tune-loop')).toBe('enforce');
    expect(LOOP_TIER_REGISTRY.loops).toHaveLength(4);
  });

  it('the tune loop carries a bounded safety envelope with the recorded bounds', () => {
    const tune = LOOP_TIER_REGISTRY.loops.find((l) => l.id === 'tune-loop');
    expect(tune?.boundedEnvelope).toBeDefined();
    expect(tune?.boundedEnvelope?.bounds).toMatchObject({
      demotionFloor: 0.5,
      maxStepPerAdjustment: 0.2,
      decayWindowMinutes: 30,
    });
    expect(tune?.boundedEnvelope?.demotionTrigger).toMatch(/automatic/i);
  });

  it('every loop carries recon evidence and a promotion-criteria doc', () => {
    for (const loop of LOOP_TIER_REGISTRY.loops) {
      expect(loop.evidence.length).toBeGreaterThan(0);
      expect(loop.promotionCriteriaDoc).toBeDefined();
    }
  });
});

describe('LoopTierRegistrySchema cross-checks (#3843)', () => {
  it('FAILS an enforce loop with NO boundedEnvelope (mis-declared loop)', () => {
    const result = LoopTierRegistrySchema.safeParse({
      version: 1,
      loops: [
        {
          id: 'rogue-loop',
          schemaVersion: LOOP_TIER_SCHEMA_VERSION,
          description: 'a loop claiming enforce with no bounds',
          authorityTier: 'enforce',
          evidence: 'src/somewhere.ts:1',
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /boundedEnvelope/.test(i.message))).toBe(true);
    }
  });

  it('FAILS a non-enforce loop that carries a boundedEnvelope', () => {
    const result = LoopTierRegistrySchema.safeParse({
      version: 1,
      loops: [
        {
          id: 'confused-loop',
          schemaVersion: LOOP_TIER_SCHEMA_VERSION,
          description: 'a suggest loop with an envelope it should not have',
          authorityTier: 'suggest',
          evidence: 'src/somewhere.ts:1',
          boundedEnvelope: {
            summary: 'x',
            bounds: { floor: 0.5 },
            enforcedBy: 'src/x.ts:Y',
            demotionTrigger: 'automatic',
          },
        },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /meaningful only at 'enforce'/.test(i.message))).toBe(
        true
      );
    }
  });

  it('FAILS a duplicate loop id', () => {
    const one = {
      id: 'dup',
      schemaVersion: LOOP_TIER_SCHEMA_VERSION,
      description: 'first',
      authorityTier: 'suggest' as const,
      evidence: 'src/a.ts:1',
    };
    const result = LoopTierRegistrySchema.safeParse({ version: 1, loops: [one, { ...one }] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /duplicate loop id/.test(i.message))).toBe(true);
    }
  });

  it('FAILS an undeclared tier (authorityTier missing — the TOOL_CLASS-or-CI-fails pattern)', () => {
    const result = LoopTierRegistrySchema.safeParse({
      version: 1,
      loops: [
        {
          id: 'undeclared',
          schemaVersion: LOOP_TIER_SCHEMA_VERSION,
          description: 'a loop with no tier',
          evidence: 'src/a.ts:1',
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
