/**
 * Tests for Phase 4: Enhanced Agent Swarm (#1737)
 * - IncompleteResult
 * - SharedMemoryStore
 * - DynamicExpertManager
 */

import { describe, it, expect } from 'vitest';
import {
  isIncompleteResult,
  createIncompleteResult,
  canPipelineProceed,
  filterBySeverity,
} from './incomplete-result.js';
import { SharedMemoryStore } from './shared-memory.js';
import { DynamicExpertManager, MAX_DYNAMIC_EXPERTS } from './dynamic-expert.js';

// ============================================================================
// IncompleteResult Tests
// ============================================================================

describe('IncompleteResult', () => {
  it('creates an incomplete result with canProceed based on severity', () => {
    const warning = createIncompleteResult(
      'research',
      'partial',
      ['CVE data'],
      'warning',
      'API timeout'
    );
    expect(warning.canProceed).toBe(true);
    expect(warning.severity).toBe('warning');

    const critical = createIncompleteResult('security', null, ['scan'], 'critical', 'Blocked');
    expect(critical.canProceed).toBe(false);
  });

  it('isIncompleteResult type guard works', () => {
    const valid = createIncompleteResult('test', 'data', ['x'], 'info', 'test');
    expect(isIncompleteResult(valid)).toBe(true);

    expect(isIncompleteResult(null)).toBe(false);
    expect(isIncompleteResult({ stageId: 'x' })).toBe(false);
    expect(isIncompleteResult('string')).toBe(false);
  });

  it('canPipelineProceed checks all results', () => {
    const results = [
      createIncompleteResult('a', null, [], 'info', 'ok'),
      createIncompleteResult('b', null, [], 'warning', 'partial'),
    ];
    expect(canPipelineProceed(results)).toBe(true);

    const withCritical = [...results, createIncompleteResult('c', null, [], 'critical', 'blocked')];
    expect(canPipelineProceed(withCritical)).toBe(false);
  });

  it('filterBySeverity filters correctly', () => {
    const results = [
      createIncompleteResult('a', null, [], 'info', 'a'),
      createIncompleteResult('b', null, [], 'warning', 'b'),
      createIncompleteResult('c', null, [], 'error', 'c'),
      createIncompleteResult('d', null, [], 'critical', 'd'),
    ];

    expect(filterBySeverity(results, 'error')).toHaveLength(2);
    expect(filterBySeverity(results, 'warning')).toHaveLength(3);
    expect(filterBySeverity(results, 'info')).toHaveLength(4);
    expect(filterBySeverity(results, 'critical')).toHaveLength(1);
  });
});

// ============================================================================
// SharedMemoryStore Tests
// ============================================================================

describe('SharedMemoryStore', () => {
  it('writes and reads entries', () => {
    const store = new SharedMemoryStore();
    store.write('research', 'discovery', 'Found CVE-2025-1234');
    store.write('plan', 'decision', 'Use Rust for bootloader');

    expect(store.size).toBe(2);
    expect(store.read()).toHaveLength(2);
  });

  it('filters by tag', () => {
    const store = new SharedMemoryStore();
    store.write('research', 'discovery', 'Finding 1');
    store.write('research', 'risk', 'Risk 1');
    store.write('plan', 'discovery', 'Finding 2');

    const discoveries = store.read('discovery');
    expect(discoveries).toHaveLength(2);

    const risks = store.read('risk');
    expect(risks).toHaveLength(1);
  });

  it('filters by source stage', () => {
    const store = new SharedMemoryStore();
    store.write('research', 'discovery', 'A');
    store.write('plan', 'decision', 'B');
    store.write('research', 'risk', 'C');

    const fromResearch = store.readFromStage('research');
    expect(fromResearch).toHaveLength(2);
  });

  it('respects max entries with eviction', () => {
    const store = new SharedMemoryStore(3);
    store.write('a', 'discovery', '1');
    store.write('b', 'discovery', '2');
    store.write('c', 'discovery', '3');
    store.write('d', 'discovery', '4'); // Should evict '1'

    expect(store.size).toBe(3);
    const entries = store.read();
    const contents = entries.map((e) => e.content);
    expect(contents).not.toContain('1');
    expect(contents).toContain('4');
  });

  it('summarizes entries for LLM context', () => {
    const store = new SharedMemoryStore();
    store.write('research', 'discovery', 'Found vulnerability X');
    store.write('plan', 'decision', 'Use secure library Y');

    const summary = store.summarize();
    expect(summary).toContain('[discovery]');
    expect(summary).toContain('vulnerability X');
    expect(summary).toContain('[decision]');
  });

  it('truncates summary to maxLength', () => {
    const store = new SharedMemoryStore();
    store.write('a', 'discovery', 'x'.repeat(1000));
    store.write('b', 'discovery', 'y'.repeat(1000));

    const summary = store.summarize(100);
    expect(summary.length).toBeLessThanOrEqual(100);
    expect(summary).toContain('...');
  });

  it('clears all entries', () => {
    const store = new SharedMemoryStore();
    store.write('a', 'discovery', 'data');
    expect(store.size).toBe(1);

    store.clear();
    expect(store.size).toBe(0);
  });
});

// ============================================================================
// DynamicExpertManager Tests
// ============================================================================

describe('DynamicExpertManager', () => {
  it('creates experts up to limit', () => {
    const manager = new DynamicExpertManager();
    const expert1 = manager.create({
      id: 'bootloader-expert',
      name: 'Bootloader Expert',
      roleDescription: 'Analyzes UEFI boot chain',
      capabilities: ['code_review'],
      justification: 'No existing expert covers UEFI',
    });

    expect(expert1).not.toBeNull();
    expect(expert1?.spec.id).toBe('bootloader-expert');
    expect(manager.remaining).toBe(MAX_DYNAMIC_EXPERTS - 1);
  });

  it('rejects creation at limit', () => {
    const manager = new DynamicExpertManager(2);
    manager.create({
      id: 'a',
      name: 'A',
      roleDescription: 'A',
      capabilities: [],
      justification: 'J',
    });
    manager.create({
      id: 'b',
      name: 'B',
      roleDescription: 'B',
      capabilities: [],
      justification: 'J',
    });

    const third = manager.create({
      id: 'c',
      name: 'C',
      roleDescription: 'C',
      capabilities: [],
      justification: 'J',
    });
    expect(third).toBeNull();
    expect(manager.atLimit).toBe(true);
  });

  it('rejects duplicate IDs', () => {
    const manager = new DynamicExpertManager();
    manager.create({
      id: 'x',
      name: 'X',
      roleDescription: 'X',
      capabilities: [],
      justification: 'J',
    });
    const dup = manager.create({
      id: 'x',
      name: 'X2',
      roleDescription: 'X2',
      capabilities: [],
      justification: 'J',
    });
    expect(dup).toBeNull();
  });

  it('rejects invalid specs', () => {
    const manager = new DynamicExpertManager();
    const empty = manager.create({
      id: '',
      name: '',
      roleDescription: '',
      capabilities: [],
      justification: '',
    });
    expect(empty).toBeNull();
  });

  it('lists and retrieves created experts', () => {
    const manager = new DynamicExpertManager();
    manager.create({
      id: 'a',
      name: 'A',
      roleDescription: 'A',
      capabilities: [],
      justification: 'J',
    });

    expect(manager.list()).toHaveLength(1);
    expect(manager.get('a')?.spec.name).toBe('A');
    expect(manager.get('nonexistent')).toBeUndefined();
  });

  it('tracks remaining capacity', () => {
    const manager = new DynamicExpertManager(2);
    expect(manager.remaining).toBe(2);
    expect(manager.atLimit).toBe(false);

    manager.create({
      id: 'a',
      name: 'A',
      roleDescription: 'A',
      capabilities: [],
      justification: 'J',
    });
    expect(manager.remaining).toBe(1);

    manager.create({
      id: 'b',
      name: 'B',
      roleDescription: 'B',
      capabilities: [],
      justification: 'J',
    });
    expect(manager.remaining).toBe(0);
    expect(manager.atLimit).toBe(true);
  });
});
