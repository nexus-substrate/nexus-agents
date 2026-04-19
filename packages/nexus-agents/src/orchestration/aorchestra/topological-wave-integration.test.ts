/**
 * Integration test for topological-wave recomputation in worker-dispatcher
 * (#2034 → #2043). Verifies that dispatch consumes `dependsOn` when
 * present and ignores it cleanly when absent.
 */

import { describe, it, expect } from 'vitest';
import type { AgentPlanEntry } from './agent-planner.js';
import { applyDependencyWaves, groupByWave } from './worker-dispatcher.js';

function entry(overrides: Partial<AgentPlanEntry> & Pick<AgentPlanEntry, 'role'>): AgentPlanEntry {
  return {
    subTask: overrides.subTask ?? 'do thing',
    priority: overrides.priority ?? 1,
    reasoning: overrides.reasoning ?? 'test',
    wave: overrides.wave ?? 1,
    ...overrides,
  };
}

describe('applyDependencyWaves', () => {
  it('returns plan unchanged when no entry has dependsOn', () => {
    const plan = [entry({ role: 'code', wave: 1 }), entry({ role: 'testing', wave: 2 })];
    const result = applyDependencyWaves(plan);
    // Object identity — no new array created when no deps to recompute.
    expect(result).toBe(plan);
  });

  it('recomputes waves when dependsOn is present', () => {
    const plan = [
      entry({ role: 'architecture', wave: 1 }),
      entry({ role: 'code', wave: 1, dependsOn: ['architecture'] }),
      entry({ role: 'testing', wave: 1, dependsOn: ['code'] }),
    ];
    const result = applyDependencyWaves(plan);
    const waves = Object.fromEntries(result.map((e) => [e.role, e.wave]));
    expect(waves['architecture']).toBe(1);
    expect(waves['code']).toBe(2);
    expect(waves['testing']).toBe(3);
  });

  it('groups into correct waves after recomputation', () => {
    const plan = [
      entry({ role: 'architecture', wave: 1 }),
      entry({ role: 'code', wave: 1, dependsOn: ['architecture'] }),
      entry({ role: 'documentation', wave: 1, dependsOn: ['architecture'] }),
      entry({ role: 'testing', wave: 1, dependsOn: ['code'] }),
    ];
    const result = applyDependencyWaves(plan);
    const grouped = groupByWave(result);
    expect(grouped.length).toBe(3);
    expect(grouped[0]?.map((e) => e.role)).toEqual(['architecture']);
    // Wave 2: both code and documentation depend on architecture only.
    expect(grouped[1]?.map((e) => e.role).sort()).toEqual(['code', 'documentation']);
    expect(grouped[2]?.map((e) => e.role)).toEqual(['testing']);
  });

  it('falls back to original wave assignment on cycle (never fails dispatch)', () => {
    const plan = [
      entry({ role: 'code', wave: 3, dependsOn: ['testing'] }),
      entry({ role: 'testing', wave: 5, dependsOn: ['code'] }),
    ];
    const result = applyDependencyWaves(plan);
    // Fall-through returns original plan; tests see the original waves.
    expect(result[0]?.wave).toBe(3);
    expect(result[1]?.wave).toBe(5);
  });

  it('falls back on missing dependency reference', () => {
    const plan = [entry({ role: 'code', wave: 1, dependsOn: ['nonexistent'] as never })];
    const result = applyDependencyWaves(plan);
    // Original plan returned; no throw.
    expect(result).toBe(plan);
  });

  it('empty plan returns empty array without error', () => {
    const plan: AgentPlanEntry[] = [];
    const result = applyDependencyWaves(plan);
    expect(result).toEqual([]);
  });
});
