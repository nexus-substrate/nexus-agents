/**
 * Tests for expert degradation detection (#1401).
 *
 * Verifies that isExpertDegraded() correctly identifies degraded
 * expert roles based on consecutive trailing failures in outcomes.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isExpertDegraded } from './execute-expert.js';
import { getOutcomeStore, resetOutcomeStore } from '../../orchestration/outcomes/index.js';
import type { TaskOutcome } from '../../orchestration/outcomes/outcome-types.js';

// Disable persistence for clean in-memory store
vi.mock('../../config/learning-persistence.js', () => ({
  isPersistenceEnabled: vi.fn(() => false),
}));

function makeOutcome(overrides: Partial<TaskOutcome> = {}): TaskOutcome {
  return {
    id: `test-${String(Date.now())}-${Math.random().toString(36).slice(2, 6)}`,
    cli: 'claude',
    category: 'code_generation',
    model: 'worker-code',
    success: true,
    durationMs: 100,
    timestamp: new Date().toISOString(),
    source: 'delegate',
    ...overrides,
  };
}

beforeEach(() => {
  resetOutcomeStore();
});

describe('isExpertDegraded', () => {
  it('returns false when no outcomes exist', () => {
    expect(isExpertDegraded('code')).toBe(false);
  });

  it('returns false with fewer than 3 outcomes', () => {
    const store = getOutcomeStore();
    store.append(makeOutcome({ model: 'worker-security', success: false }));
    store.append(makeOutcome({ model: 'worker-security', success: false }));
    expect(isExpertDegraded('security')).toBe(false);
  });

  it('returns true with 3 consecutive trailing failures', () => {
    const store = getOutcomeStore();
    store.append(makeOutcome({ model: 'worker-security', success: true }));
    store.append(makeOutcome({ model: 'worker-security', success: false }));
    store.append(makeOutcome({ model: 'worker-security', success: false }));
    store.append(makeOutcome({ model: 'worker-security', success: false }));
    expect(isExpertDegraded('security')).toBe(true);
  });

  it('returns false when last outcome is success', () => {
    const store = getOutcomeStore();
    store.append(makeOutcome({ model: 'worker-security', success: false }));
    store.append(makeOutcome({ model: 'worker-security', success: false }));
    store.append(makeOutcome({ model: 'worker-security', success: false }));
    store.append(makeOutcome({ model: 'worker-security', success: true }));
    expect(isExpertDegraded('security')).toBe(false);
  });

  it('ignores outcomes from other roles', () => {
    const store = getOutcomeStore();
    store.append(makeOutcome({ model: 'worker-code', success: false }));
    store.append(makeOutcome({ model: 'worker-code', success: false }));
    store.append(makeOutcome({ model: 'worker-code', success: false }));
    // code role is degraded, but security role has no outcomes
    expect(isExpertDegraded('security')).toBe(false);
    expect(isExpertDegraded('code')).toBe(true);
  });

  it('returns true with exactly 3 failures and no successes', () => {
    const store = getOutcomeStore();
    store.append(makeOutcome({ model: 'worker-testing', success: false }));
    store.append(makeOutcome({ model: 'worker-testing', success: false }));
    store.append(makeOutcome({ model: 'worker-testing', success: false }));
    expect(isExpertDegraded('testing')).toBe(true);
  });
});
