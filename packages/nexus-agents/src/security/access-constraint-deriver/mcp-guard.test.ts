/**
 * Tests for the MCP dispatch guard (#1977 final wiring).
 *
 * Covers:
 * - withAccessPolicy ALS propagation across async boundaries
 * - End-to-end smoke: derive policy → run tool call under guard → assert
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getActivePolicy,
  getActiveAuditTrail,
  recordAuditModeViolation,
  resetPolicyCache,
  withAccessPolicy,
  withAuditTrail,
} from './index.js';
import type { TaskAccessPolicy } from './types.js';
import { AuditTrail, createAuditTrail } from '../audit-trail.js';
import type { AuditEvent } from '../audit-trail.js';

function policyFactory(overrides: Partial<TaskAccessPolicy> = {}): TaskAccessPolicy {
  return {
    allowedTools: '*',
    allowedPathPatterns: [],
    allowedOperations: '*',
    objectiveHash: 'abcdef0123456789',
    derivedAt: '2026-04-19T00:00:00.000Z',
    source: 'bypass',
    mode: 'off',
    ...overrides,
  };
}

beforeEach(() => {
  resetPolicyCache();
});

describe('getActivePolicy / withAccessPolicy', () => {
  it('returns undefined when no policy wrapping', () => {
    expect(getActivePolicy()).toBeUndefined();
  });

  it('returns the policy inside withAccessPolicy', async () => {
    const policy = policyFactory({ source: 'llm' });
    await withAccessPolicy(policy, () => {
      expect(getActivePolicy()).toEqual(policy);
      return Promise.resolve();
    });
  });

  it('unsets the policy after withAccessPolicy returns', async () => {
    const policy = policyFactory();
    await withAccessPolicy(policy, () => {
      expect(getActivePolicy()).toBeDefined();
      return Promise.resolve();
    });
    expect(getActivePolicy()).toBeUndefined();
  });

  it('propagates policy across async boundaries', async () => {
    const policy = policyFactory({ source: 'fallback-keyword' });
    await withAccessPolicy(policy, async () => {
      await new Promise((r) => setTimeout(r, 5));
      expect(getActivePolicy()?.source).toBe('fallback-keyword');
    });
  });

  it('supports nested withAccessPolicy (inner wins)', async () => {
    const outer = policyFactory({ source: 'llm' });
    const inner = policyFactory({ source: 'fallback-keyword' });
    await withAccessPolicy(outer, async () => {
      expect(getActivePolicy()?.source).toBe('llm');
      await withAccessPolicy(inner, () => {
        expect(getActivePolicy()?.source).toBe('fallback-keyword');
        return Promise.resolve();
      });
      expect(getActivePolicy()?.source).toBe('llm');
    });
  });
});

describe('recordAuditModeViolation (#4097)', () => {
  const sample = {
    toolName: 'write_file',
    warning: 'tool not in allowlist',
    policySource: 'llm',
    mode: 'audit',
    requestId: 'req-1',
  };

  it('no-ops when no trail is established in ALS', () => {
    expect(getActiveAuditTrail()).toBeUndefined();
    // No throw and nothing to mirror — the no-logger path stays inert.
    expect(() => {
      recordAuditModeViolation(sample);
    }).not.toThrow();
  });

  it('emits exactly one clawguard_violation within withAuditTrail', async () => {
    const mirrored: AuditEvent[] = [];
    const trail = createAuditTrail((e) => mirrored.push(e));
    await withAuditTrail(trail, () => {
      recordAuditModeViolation(sample);
      return Promise.resolve();
    });
    expect(trail.query({ type: 'clawguard_violation' })).toHaveLength(1);
    expect(mirrored).toHaveLength(1);
    expect(mirrored[0]?.type).toBe('clawguard_violation');
  });

  it('caps the persisted warning at 500 chars', async () => {
    const trail = createAuditTrail();
    await withAuditTrail(trail, () => {
      recordAuditModeViolation({ ...sample, warning: 'x'.repeat(1000) });
      return Promise.resolve();
    });
    const ev = trail.query({ type: 'clawguard_violation' })[0];
    if (ev?.type === 'clawguard_violation') {
      expect(ev.warning).toHaveLength(500);
    }
  });

  it('never throws even when the trail append throws', async () => {
    const throwingTrail = {
      append: () => {
        throw new Error('sink exploded');
      },
    } as unknown as AuditTrail;
    await withAuditTrail(throwingTrail, () => {
      expect(() => {
        recordAuditModeViolation(sample);
      }).not.toThrow();
      return Promise.resolve();
    });
  });
});
