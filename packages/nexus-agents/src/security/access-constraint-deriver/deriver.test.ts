/**
 * Tests for the access-constraint-deriver skeleton (#1977).
 *
 * The current implementation is a skeleton: off/audit/enforce modes all
 * return a bypass policy. These tests lock in the skeleton contract so
 * later LLM integration cannot regress the public surface.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  deriveAccessPolicy,
  hashObjective,
  resolveAccessPolicyMode,
  checkAccess,
  resetPolicyCache,
  TaskAccessPolicySchema,
} from './index.js';

beforeEach(() => {
  resetPolicyCache();
});

describe('resolveAccessPolicyMode', () => {
  it('defaults to "off" when env var is unset', () => {
    expect(resolveAccessPolicyMode({})).toBe('off');
  });

  it('returns "audit" when env is set to audit', () => {
    expect(resolveAccessPolicyMode({ NEXUS_ACCESS_POLICY_MODE: 'audit' })).toBe('audit');
  });

  it('returns "enforce" when env is set to enforce', () => {
    expect(resolveAccessPolicyMode({ NEXUS_ACCESS_POLICY_MODE: 'enforce' })).toBe('enforce');
  });

  it('is case-insensitive', () => {
    expect(resolveAccessPolicyMode({ NEXUS_ACCESS_POLICY_MODE: 'AUDIT' })).toBe('audit');
  });

  it('falls back to "off" on invalid values', () => {
    expect(resolveAccessPolicyMode({ NEXUS_ACCESS_POLICY_MODE: 'lockdown' })).toBe('off');
  });

  it('falls back to "off" on empty string', () => {
    expect(resolveAccessPolicyMode({ NEXUS_ACCESS_POLICY_MODE: '' })).toBe('off');
  });
});

describe('hashObjective', () => {
  it('returns a 16-char hex digest', () => {
    const h = hashObjective('summarize this issue');
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is deterministic for the same input', () => {
    expect(hashObjective('same task')).toBe(hashObjective('same task'));
  });

  it('changes for different inputs', () => {
    expect(hashObjective('a')).not.toBe(hashObjective('b'));
  });
});

describe('deriveAccessPolicy (skeleton)', () => {
  it('returns a bypass policy with allow-all tools/ops', async () => {
    const policy = await deriveAccessPolicy('summarize this issue');
    expect(policy.allowedTools).toBe('*');
    expect(policy.allowedOperations).toBe('*');
    expect(policy.source).toBe('bypass');
  });

  it('includes the objective hash for audit tracking', async () => {
    const policy = await deriveAccessPolicy('fix the login bug');
    expect(policy.objectiveHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('returns a valid TaskAccessPolicy per Zod schema', async () => {
    const policy = await deriveAccessPolicy('test');
    const parsed = TaskAccessPolicySchema.safeParse(policy);
    expect(parsed.success).toBe(true);
  });

  it('sets the mode field from current env', async () => {
    const policy = await deriveAccessPolicy('test');
    expect(['off', 'audit', 'enforce']).toContain(policy.mode);
  });
});

describe('checkAccess (enforcer)', () => {
  const bypassPolicy = {
    allowedTools: '*' as const,
    allowedPathPatterns: [],
    allowedOperations: '*' as const,
    objectiveHash: 'deadbeefcafef00d',
    derivedAt: '2026-04-19T00:00:00.000Z',
    source: 'bypass' as const,
    mode: 'off' as const,
  };

  it('allows any tool under a bypass policy', () => {
    expect(checkAccess('gh_issue_close', bypassPolicy).decision).toBe('allow');
  });

  it('allows tools in the allowedTools list', () => {
    const policy = { ...bypassPolicy, allowedTools: ['gh_issue_view', 'memory_query'] as const };
    expect(checkAccess('gh_issue_view', policy).decision).toBe('allow');
  });

  it('denies tools not in the allowedTools list under enforce mode', () => {
    const policy = {
      ...bypassPolicy,
      allowedTools: ['gh_issue_view'] as const,
      mode: 'enforce' as const,
    };
    const result = checkAccess('gh_issue_close', policy);
    expect(result.decision).toBe('deny');
    if (result.decision === 'deny') {
      expect(result.reason).toContain('gh_issue_close');
    }
  });

  it('returns log-and-allow under audit mode for out-of-scope tools', () => {
    const policy = {
      ...bypassPolicy,
      allowedTools: ['gh_issue_view'] as const,
      mode: 'audit' as const,
    };
    const result = checkAccess('gh_issue_close', policy);
    expect(result.decision).toBe('log-and-allow');
  });

  it('denies unbypassable tools even under bypass policy', () => {
    const result = checkAccess('git_push_force', bypassPolicy);
    expect(result.decision).toBe('deny');
    if (result.decision === 'deny') {
      expect(result.matchedRule).toBe('unbypassable:tool');
    }
  });

  it('denies unbypassable tools even when LLM policy tries to allow them', () => {
    const policy = {
      ...bypassPolicy,
      allowedTools: ['git_push_force', 'rm_recursive_force'] as const,
      mode: 'enforce' as const,
    };
    // Even though policy claims to allow, denylist still wins.
    const result = checkAccess('git_push_force', policy);
    expect(result.decision).toBe('deny');
    if (result.decision === 'deny') {
      expect(result.matchedRule).toBe('unbypassable:tool');
    }
  });

  it('denies unbypassable paths even under bypass policy', () => {
    const result = checkAccess('read_file', bypassPolicy, { path: '.env' });
    expect(result.decision).toBe('deny');
    if (result.decision === 'deny') {
      expect(result.matchedRule).toBe('unbypassable:path');
    }
  });

  it('denies SSH key paths regardless of policy', () => {
    const policy = {
      ...bypassPolicy,
      allowedTools: ['read_file'] as const,
      mode: 'enforce' as const,
    };
    const result = checkAccess('read_file', policy, { path: '~/.ssh/id_rsa' });
    expect(result.decision).toBe('deny');
    if (result.decision === 'deny') {
      expect(result.matchedRule).toBe('unbypassable:path');
    }
  });

  it('allows ordinary paths under bypass policy', () => {
    const result = checkAccess('read_file', bypassPolicy, { path: 'src/index.ts' });
    expect(result.decision).toBe('allow');
  });
});

describe('deriveAccessPolicy caching (#1977 condition 5)', () => {
  it('returns the same policy for repeat invocations with same objective', async () => {
    const a = await deriveAccessPolicy('test objective');
    const b = await deriveAccessPolicy('test objective');
    // Same cache hit → identical reference (or at least identical derivedAt)
    expect(a.derivedAt).toBe(b.derivedAt);
  });

  it('returns distinct policies for different objectives', async () => {
    const a = await deriveAccessPolicy('first task');
    const b = await deriveAccessPolicy('second task');
    expect(a.objectiveHash).not.toBe(b.objectiveHash);
  });
});
