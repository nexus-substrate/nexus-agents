/**
 * Tests for Default Sandbox Policies
 *
 * @module security/sandbox/default-policies.test
 */

import { describe, it, expect } from 'vitest';
import {
  RESTRICTIVE_POLICY,
  STANDARD_POLICY,
  DEVELOPMENT_POLICY,
  PERMISSIVE_POLICY,
  READONLY_POLICY,
  DEFAULT_POLICIES,
  getPolicy,
  getDefaultPolicyForContext,
} from './default-policies.js';

// ============================================================================
// Policy Definitions
// ============================================================================

describe('RESTRICTIVE_POLICY', () => {
  it('has correct id and name', () => {
    expect(RESTRICTIVE_POLICY.id).toBe('restrictive');
    expect(RESTRICTIVE_POLICY.name).toBe('Restrictive');
  });

  it('has mode=policy', () => {
    expect(RESTRICTIVE_POLICY.mode).toBe('policy');
  });

  it('has no special capabilities', () => {
    expect(RESTRICTIVE_POLICY.capabilities).toEqual([]);
  });

  it('has limited memory (128MB)', () => {
    expect(RESTRICTIVE_POLICY.limits.maxMemoryBytes).toBe(128 * 1024 * 1024);
  });

  it('has short timeout (30s)', () => {
    expect(RESTRICTIVE_POLICY.limits.maxWallTimeMs).toBe(30 * 1000);
  });

  it('allows only 1 process', () => {
    expect(RESTRICTIVE_POLICY.limits.maxProcesses).toBe(1);
  });
});

describe('STANDARD_POLICY', () => {
  it('has correct id', () => {
    expect(STANDARD_POLICY.id).toBe('standard');
  });

  it('includes filesystem and process capabilities', () => {
    expect(STANDARD_POLICY.capabilities).toContain('filesystem_read');
    expect(STANDARD_POLICY.capabilities).toContain('filesystem_write');
    expect(STANDARD_POLICY.capabilities).toContain('process_spawn');
  });

  it('does not include env_access', () => {
    expect(STANDARD_POLICY.capabilities).not.toContain('env_access');
  });
});

describe('DEVELOPMENT_POLICY', () => {
  it('has correct id', () => {
    expect(DEVELOPMENT_POLICY.id).toBe('development');
  });

  it('includes all four capabilities', () => {
    expect(DEVELOPMENT_POLICY.capabilities).toContain('filesystem_read');
    expect(DEVELOPMENT_POLICY.capabilities).toContain('filesystem_write');
    expect(DEVELOPMENT_POLICY.capabilities).toContain('process_spawn');
    expect(DEVELOPMENT_POLICY.capabilities).toContain('env_access');
  });

  it('has 10 minute timeout', () => {
    expect(DEVELOPMENT_POLICY.limits.maxWallTimeMs).toBe(10 * 60 * 1000);
  });

  it('allows .git write access', () => {
    const gitRule = DEVELOPMENT_POLICY.pathRules.find((r) => r.path === '.git');
    expect(gitRule).toBeDefined();
    expect(gitRule?.access).toBe('write');
  });
});

describe('PERMISSIVE_POLICY', () => {
  it('has correct id', () => {
    expect(PERMISSIVE_POLICY.id).toBe('permissive');
  });

  it('has 30 minute timeout', () => {
    expect(PERMISSIVE_POLICY.limits.maxWallTimeMs).toBe(30 * 60 * 1000);
  });

  it('has 2GB memory limit', () => {
    expect(PERMISSIVE_POLICY.limits.maxMemoryBytes).toBe(2 * 1024 * 1024 * 1024);
  });

  it('allows root read access', () => {
    const rootRule = PERMISSIVE_POLICY.pathRules.find((r) => r.path === '/');
    expect(rootRule).toBeDefined();
    expect(rootRule?.access).toBe('read');
  });
});

describe('READONLY_POLICY', () => {
  it('has correct id', () => {
    expect(READONLY_POLICY.id).toBe('readonly');
  });

  it('has only filesystem_read capability', () => {
    expect(READONLY_POLICY.capabilities).toEqual(['filesystem_read']);
  });

  it('has 1 minute timeout', () => {
    expect(READONLY_POLICY.limits.maxWallTimeMs).toBe(60 * 1000);
  });

  it('allows git and gh commands', () => {
    expect(READONLY_POLICY.allowedCommands).toContain('git');
    expect(READONLY_POLICY.allowedCommands).toContain('gh');
  });

  it('has read-only path rules', () => {
    for (const rule of READONLY_POLICY.pathRules) {
      expect(rule.access).toBe('read');
    }
  });
});

// ============================================================================
// DEFAULT_POLICIES
// ============================================================================

describe('DEFAULT_POLICIES', () => {
  it('contains all 5 policies', () => {
    expect(Object.keys(DEFAULT_POLICIES)).toHaveLength(5);
  });

  it('keys match policy IDs', () => {
    for (const [key, policy] of Object.entries(DEFAULT_POLICIES)) {
      expect(policy.id).toBe(key);
    }
  });

  it('includes all expected policies', () => {
    expect(DEFAULT_POLICIES).toHaveProperty('restrictive');
    expect(DEFAULT_POLICIES).toHaveProperty('standard');
    expect(DEFAULT_POLICIES).toHaveProperty('development');
    expect(DEFAULT_POLICIES).toHaveProperty('permissive');
    expect(DEFAULT_POLICIES).toHaveProperty('readonly');
  });
});

// ============================================================================
// getPolicy
// ============================================================================

describe('getPolicy', () => {
  it('returns policy by ID', () => {
    expect(getPolicy('restrictive')).toBe(RESTRICTIVE_POLICY);
    expect(getPolicy('standard')).toBe(STANDARD_POLICY);
    expect(getPolicy('development')).toBe(DEVELOPMENT_POLICY);
    expect(getPolicy('permissive')).toBe(PERMISSIVE_POLICY);
    expect(getPolicy('readonly')).toBe(READONLY_POLICY);
  });

  it('returns undefined for unknown ID', () => {
    expect(getPolicy('nonexistent')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(getPolicy('')).toBeUndefined();
  });
});

// ============================================================================
// getDefaultPolicyForContext
// ============================================================================

describe('getDefaultPolicyForContext', () => {
  it('returns standard for verification contexts', () => {
    expect(getDefaultPolicyForContext('verification')).toBe(STANDARD_POLICY);
    expect(getDefaultPolicyForContext('build')).toBe(STANDARD_POLICY);
    expect(getDefaultPolicyForContext('test')).toBe(STANDARD_POLICY);
    expect(getDefaultPolicyForContext('lint')).toBe(STANDARD_POLICY);
  });

  it('returns development for implementation contexts', () => {
    expect(getDefaultPolicyForContext('implementation')).toBe(DEVELOPMENT_POLICY);
    expect(getDefaultPolicyForContext('development')).toBe(DEVELOPMENT_POLICY);
    expect(getDefaultPolicyForContext('git')).toBe(DEVELOPMENT_POLICY);
  });

  it('returns readonly for analysis contexts', () => {
    expect(getDefaultPolicyForContext('analysis')).toBe(READONLY_POLICY);
    expect(getDefaultPolicyForContext('query')).toBe(READONLY_POLICY);
    expect(getDefaultPolicyForContext('read')).toBe(READONLY_POLICY);
  });

  it('returns permissive for admin contexts', () => {
    expect(getDefaultPolicyForContext('admin')).toBe(PERMISSIVE_POLICY);
    expect(getDefaultPolicyForContext('infrastructure')).toBe(PERMISSIVE_POLICY);
  });

  it('falls back to restrictive for unknown context', () => {
    expect(getDefaultPolicyForContext('unknown')).toBe(RESTRICTIVE_POLICY);
    expect(getDefaultPolicyForContext('')).toBe(RESTRICTIVE_POLICY);
  });
});
