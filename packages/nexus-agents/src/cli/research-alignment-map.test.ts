/**
 * Tests for research alignment map.
 *
 * @module cli/research-alignment-map.test
 * (Source: Issue #1386 — Research Synthesis Pipeline)
 */
import { describe, it, expect } from 'vitest';
import { TECHNIQUE_IMPLEMENTATION_MAP, FEATURE_GATE_INVENTORY } from './research-alignment-map.js';

describe('TECHNIQUE_IMPLEMENTATION_MAP', () => {
  it('contains routing techniques', () => {
    expect(TECHNIQUE_IMPLEMENTATION_MAP.has('linucb-routing')).toBe(true);
    expect(TECHNIQUE_IMPLEMENTATION_MAP.has('topsis-routing')).toBe(true);
  });

  it('contains consensus techniques', () => {
    expect(TECHNIQUE_IMPLEMENTATION_MAP.has('consensus-protocol')).toBe(true);
    expect(TECHNIQUE_IMPLEMENTATION_MAP.has('higher-order-voting')).toBe(true);
  });

  it('contains memory techniques', () => {
    expect(TECHNIQUE_IMPLEMENTATION_MAP.has('adaptive-memory')).toBe(true);
    expect(TECHNIQUE_IMPLEMENTATION_MAP.has('mirix-six-type-memory')).toBe(true);
  });

  it('contains orchestration techniques', () => {
    expect(TECHNIQUE_IMPLEMENTATION_MAP.has('dynamic-agent-selection')).toBe(true);
    expect(TECHNIQUE_IMPLEMENTATION_MAP.has('role-based-protocols')).toBe(true);
  });

  it('all entries have valid status', () => {
    for (const [, mapping] of TECHNIQUE_IMPLEMENTATION_MAP) {
      expect(['implemented', 'partial']).toContain(mapping.status);
      expect(mapping.path.length).toBeGreaterThan(0);
    }
  });

  it('partial entries have improvement hints', () => {
    for (const [, mapping] of TECHNIQUE_IMPLEMENTATION_MAP) {
      if (mapping.status === 'partial') {
        expect(mapping.hint).toBeDefined();
      }
    }
  });

  it('has at least 40 technique mappings', () => {
    expect(TECHNIQUE_IMPLEMENTATION_MAP.size).toBeGreaterThanOrEqual(40);
  });

  it('self-refine-loop is now implemented', () => {
    const entry = TECHNIQUE_IMPLEMENTATION_MAP.get('self-refine-loop');
    expect(entry?.status).toBe('implemented');
  });
});

describe('FEATURE_GATE_INVENTORY', () => {
  it('contains at least 15 gates', () => {
    expect(FEATURE_GATE_INVENTORY.length).toBeGreaterThanOrEqual(15);
  });

  it('all gates have required fields', () => {
    for (const gate of FEATURE_GATE_INVENTORY) {
      expect(gate.envVar).toBeTruthy();
      expect(gate.defaultValue).toBeDefined();
      expect(gate.description).toBeTruthy();
    }
  });

  it('includes core pipeline gates', () => {
    const envVars = FEATURE_GATE_INVENTORY.map((g) => g.envVar);
    expect(envVars).toContain('NEXUS_AORCHESTRA');
    expect(envVars).toContain('NEXUS_PERSIST_LEARNING');
    expect(envVars).toContain('NEXUS_BILLING_MODE');
  });

  it('research-linked gates reference valid techniques', () => {
    const allTechniques = new Set(TECHNIQUE_IMPLEMENTATION_MAP.keys());
    for (const gate of FEATURE_GATE_INVENTORY) {
      if (gate.techniques !== undefined) {
        for (const tech of gate.techniques) {
          expect(allTechniques.has(tech)).toBe(true);
        }
      }
    }
  });
});
