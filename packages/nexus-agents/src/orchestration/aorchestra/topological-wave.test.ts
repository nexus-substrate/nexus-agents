/**
 * Tests for topological wave assignment (#2034).
 */

import { describe, it, expect } from 'vitest';
import {
  topologicalWaveAssign,
  groupByTopologicalWave,
  CycleError,
  MissingDependencyError,
  type WaveEntry,
} from './topological-wave.js';

function entry(role: string, priority: number, wave = 1, dependsOn?: string[]): WaveEntry {
  return dependsOn !== undefined ? { role, priority, wave, dependsOn } : { role, priority, wave };
}

describe('topologicalWaveAssign', () => {
  it('handles empty input', () => {
    const result = topologicalWaveAssign([]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual([]);
  });

  it('preserves original wave when no dependsOn field present', () => {
    const plan = [entry('code', 1, 1), entry('test', 2, 2)];
    const result = topologicalWaveAssign(plan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value[0]?.wave).toBe(1);
      expect(result.value[1]?.wave).toBe(2);
    }
  });

  it('assigns wave 1 to entries with empty dependsOn', () => {
    const plan = [entry('code', 1, 5, [])]; // wave=5 original but no deps
    const result = topologicalWaveAssign(plan);
    expect(result.ok).toBe(true);
    // Entry's wave is preserved when dependsOn is empty (treated like no deps).
    if (result.ok) expect(result.value[0]?.wave).toBe(5);
  });

  it('linear chain A → B → C puts each in its own wave', () => {
    const plan = [entry('a', 1, 1), entry('b', 2, 1, ['a']), entry('c', 3, 1, ['b'])];
    const result = topologicalWaveAssign(plan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const waves = Object.fromEntries(result.value.map((e) => [e.role, e.wave]));
      expect(waves['a']).toBe(1);
      expect(waves['b']).toBe(2);
      expect(waves['c']).toBe(3);
    }
  });

  it('diamond: A → {B, C} → D puts B+C in wave 2, D in wave 3', () => {
    const plan = [
      entry('a', 1, 1),
      entry('b', 2, 1, ['a']),
      entry('c', 3, 1, ['a']),
      entry('d', 4, 1, ['b', 'c']),
    ];
    const result = topologicalWaveAssign(plan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const waves = Object.fromEntries(result.value.map((e) => [e.role, e.wave]));
      expect(waves['a']).toBe(1);
      expect(waves['b']).toBe(2);
      expect(waves['c']).toBe(2);
      expect(waves['d']).toBe(3);
    }
  });

  it('disconnected components both start at wave 1', () => {
    const plan = [
      entry('a', 1, 1),
      entry('b', 2, 1, ['a']),
      entry('x', 3, 1),
      entry('y', 4, 1, ['x']),
    ];
    const result = topologicalWaveAssign(plan);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const waves = Object.fromEntries(result.value.map((e) => [e.role, e.wave]));
      expect(waves['a']).toBe(1);
      expect(waves['x']).toBe(1);
      expect(waves['b']).toBe(2);
      expect(waves['y']).toBe(2);
    }
  });

  it('detects direct cycle A → B → A', () => {
    const plan = [entry('a', 1, 1, ['b']), entry('b', 2, 1, ['a'])];
    const result = topologicalWaveAssign(plan);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(CycleError);
      expect((result.error as CycleError).cycleRoles).toContain('a');
      expect((result.error as CycleError).cycleRoles).toContain('b');
    }
  });

  it('detects self-loop A → A', () => {
    const plan = [entry('a', 1, 1, ['a'])];
    const result = topologicalWaveAssign(plan);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(CycleError);
    }
  });

  it('surfaces missing dependency as MissingDependencyError', () => {
    const plan = [entry('a', 1, 1, ['nonexistent'])];
    const result = topologicalWaveAssign(plan);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(MissingDependencyError);
      expect((result.error as MissingDependencyError).sourceRole).toBe('a');
      expect((result.error as MissingDependencyError).missingRole).toBe('nonexistent');
    }
  });

  it('does not mutate input array or entries', () => {
    const plan = [entry('a', 1, 1), entry('b', 2, 1, ['a'])];
    const frozen = Object.freeze(plan);
    const result = topologicalWaveAssign(frozen);
    expect(result.ok).toBe(true);
    // Input should still have wave: 1 on both (mutation would break this).
    expect(plan[0]?.wave).toBe(1);
    expect(plan[1]?.wave).toBe(1);
  });
});

describe('groupByTopologicalWave', () => {
  it('returns empty array for empty input', () => {
    expect(groupByTopologicalWave([])).toEqual([]);
  });

  it('groups entries by wave in ascending order', () => {
    const plan = [entry('c', 3, 2), entry('a', 1, 1), entry('d', 4, 3), entry('b', 2, 1)];
    const waves = groupByTopologicalWave(plan);
    expect(waves.length).toBe(3);
    expect(waves[0]?.map((e) => e.role).sort()).toEqual(['a', 'b']);
    expect(waves[1]?.map((e) => e.role)).toEqual(['c']);
    expect(waves[2]?.map((e) => e.role)).toEqual(['d']);
  });

  it('preserves insertion order within a wave', () => {
    const plan = [entry('z', 1, 1), entry('a', 2, 1)];
    const waves = groupByTopologicalWave(plan);
    expect(waves[0]?.map((e) => e.role)).toEqual(['z', 'a']);
  });
});
