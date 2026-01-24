/**
 * Default Policies Tests
 *
 * Tests for pre-defined sandbox policies.
 * Verifies policy structure, loading, merging, and context mapping.
 *
 * @module security/sandbox/__tests__/default-policies.test
 * (Source: Issue #162, Alignment Roadmap Phase 4)
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
} from '../default-policies.js';
import { DEFAULT_RESOURCE_LIMITS } from '../sandbox-types.js';
import { COMMAND_CATEGORIES, ALLOWED_COMMANDS } from '../command-allowlist.js';
import { SAFE_ENV_VARS } from '../env-sanitizer.js';

describe('Default Policies', () => {
  describe('RESTRICTIVE_POLICY', () => {
    it('should have correct id and name', () => {
      expect(RESTRICTIVE_POLICY.id).toBe('restrictive');
      expect(RESTRICTIVE_POLICY.name).toBe('Restrictive');
    });

    it('should have mode set to policy', () => {
      expect(RESTRICTIVE_POLICY.mode).toBe('policy');
    });

    it('should only allow shell utilities', () => {
      expect(RESTRICTIVE_POLICY.allowedCommands).toEqual(
        expect.arrayContaining([...COMMAND_CATEGORIES.shellUtils])
      );
      expect(RESTRICTIVE_POLICY.allowedCommands).not.toContain('pnpm');
      expect(RESTRICTIVE_POLICY.allowedCommands).not.toContain('git');
    });

    it('should have minimal allowed env vars', () => {
      expect(RESTRICTIVE_POLICY.allowedEnvVars).toContain('PATH');
      expect(RESTRICTIVE_POLICY.allowedEnvVars).toContain('HOME');
      expect(RESTRICTIVE_POLICY.allowedEnvVars).toContain('NODE_ENV');
      expect(RESTRICTIVE_POLICY.allowedEnvVars.length).toBeLessThan(SAFE_ENV_VARS.length);
    });

    it('should have limited path access', () => {
      expect(RESTRICTIVE_POLICY.pathRules).toHaveLength(2);
      expect(RESTRICTIVE_POLICY.pathRules).toContainEqual({
        path: '/tmp',
        access: 'write',
      });
    });

    it('should have no capabilities', () => {
      expect(RESTRICTIVE_POLICY.capabilities).toHaveLength(0);
    });

    it('should have reduced resource limits', () => {
      expect(RESTRICTIVE_POLICY.limits.maxMemoryBytes).toBe(128 * 1024 * 1024);
      expect(RESTRICTIVE_POLICY.limits.maxWallTimeMs).toBe(30 * 1000);
      expect(RESTRICTIVE_POLICY.limits.maxProcesses).toBe(1);
    });
  });

  describe('STANDARD_POLICY', () => {
    it('should have correct id and name', () => {
      expect(STANDARD_POLICY.id).toBe('standard');
      expect(STANDARD_POLICY.name).toBe('Standard');
    });

    it('should allow package managers', () => {
      expect(STANDARD_POLICY.allowedCommands).toContain('pnpm');
      expect(STANDARD_POLICY.allowedCommands).toContain('npm');
    });

    it('should allow node runtime', () => {
      expect(STANDARD_POLICY.allowedCommands).toContain('node');
      expect(STANDARD_POLICY.allowedCommands).toContain('tsx');
    });

    it('should allow build and test tools', () => {
      expect(STANDARD_POLICY.allowedCommands).toContain('vitest');
      expect(STANDARD_POLICY.allowedCommands).toContain('eslint');
      expect(STANDARD_POLICY.allowedCommands).toContain('tsc');
    });

    it('should not allow git or GitHub CLI', () => {
      expect(STANDARD_POLICY.allowedCommands).not.toContain('git');
      expect(STANDARD_POLICY.allowedCommands).not.toContain('gh');
    });

    it('should allow all safe env vars', () => {
      expect(STANDARD_POLICY.allowedEnvVars).toEqual(expect.arrayContaining([...SAFE_ENV_VARS]));
    });

    it('should have appropriate capabilities', () => {
      expect(STANDARD_POLICY.capabilities).toContain('filesystem_read');
      expect(STANDARD_POLICY.capabilities).toContain('filesystem_write');
      expect(STANDARD_POLICY.capabilities).toContain('process_spawn');
    });

    it('should use default resource limits', () => {
      expect(STANDARD_POLICY.limits).toEqual(DEFAULT_RESOURCE_LIMITS);
    });
  });

  describe('DEVELOPMENT_POLICY', () => {
    it('should have correct id and name', () => {
      expect(DEVELOPMENT_POLICY.id).toBe('development');
      expect(DEVELOPMENT_POLICY.name).toBe('Development');
    });

    it('should allow all standard commands', () => {
      expect(DEVELOPMENT_POLICY.allowedCommands).toEqual(
        expect.arrayContaining([...ALLOWED_COMMANDS])
      );
    });

    it('should allow git and GitHub CLI', () => {
      expect(DEVELOPMENT_POLICY.allowedCommands).toContain('git');
      expect(DEVELOPMENT_POLICY.allowedCommands).toContain('gh');
    });

    it('should allow write access to .git', () => {
      const gitRule = DEVELOPMENT_POLICY.pathRules.find((r) => r.path === '.git');
      expect(gitRule).toBeDefined();
      expect(gitRule?.access).toBe('write');
    });

    it('should have env_access capability', () => {
      expect(DEVELOPMENT_POLICY.capabilities).toContain('env_access');
    });

    it('should have extended wall time limit', () => {
      expect(DEVELOPMENT_POLICY.limits.maxWallTimeMs).toBe(10 * 60 * 1000);
    });
  });

  describe('PERMISSIVE_POLICY', () => {
    it('should have correct id and name', () => {
      expect(PERMISSIVE_POLICY.id).toBe('permissive');
      expect(PERMISSIVE_POLICY.name).toBe('Permissive');
    });

    it('should allow read access to root', () => {
      const rootRule = PERMISSIVE_POLICY.pathRules.find((r) => r.path === '/');
      expect(rootRule).toBeDefined();
      expect(rootRule?.access).toBe('read');
    });

    it('should have all capabilities', () => {
      expect(PERMISSIVE_POLICY.capabilities).toContain('filesystem_read');
      expect(PERMISSIVE_POLICY.capabilities).toContain('filesystem_write');
      expect(PERMISSIVE_POLICY.capabilities).toContain('process_spawn');
      expect(PERMISSIVE_POLICY.capabilities).toContain('env_access');
    });

    it('should have extended limits', () => {
      expect(PERMISSIVE_POLICY.limits.maxWallTimeMs).toBe(30 * 60 * 1000);
      expect(PERMISSIVE_POLICY.limits.maxMemoryBytes).toBe(2 * 1024 * 1024 * 1024);
    });
  });

  describe('READONLY_POLICY', () => {
    it('should have correct id and name', () => {
      expect(READONLY_POLICY.id).toBe('readonly');
      expect(READONLY_POLICY.name).toBe('Read-Only');
    });

    it('should allow git and gh for read operations', () => {
      expect(READONLY_POLICY.allowedCommands).toContain('git');
      expect(READONLY_POLICY.allowedCommands).toContain('gh');
    });

    it('should only allow filesystem_read capability', () => {
      expect(READONLY_POLICY.capabilities).toContain('filesystem_read');
      expect(READONLY_POLICY.capabilities).not.toContain('filesystem_write');
      expect(READONLY_POLICY.capabilities).not.toContain('process_spawn');
    });

    it('should only have read access paths', () => {
      for (const rule of READONLY_POLICY.pathRules) {
        expect(rule.access).toBe('read');
      }
    });

    it('should have reduced limits', () => {
      expect(READONLY_POLICY.limits.maxWallTimeMs).toBe(60 * 1000);
      expect(READONLY_POLICY.limits.maxMemoryBytes).toBe(256 * 1024 * 1024);
    });
  });

  describe('DEFAULT_POLICIES', () => {
    it('should contain all policies', () => {
      expect(DEFAULT_POLICIES).toHaveProperty('restrictive');
      expect(DEFAULT_POLICIES).toHaveProperty('standard');
      expect(DEFAULT_POLICIES).toHaveProperty('development');
      expect(DEFAULT_POLICIES).toHaveProperty('permissive');
      expect(DEFAULT_POLICIES).toHaveProperty('readonly');
    });

    it('should reference the same policy objects', () => {
      expect(DEFAULT_POLICIES.restrictive).toBe(RESTRICTIVE_POLICY);
      expect(DEFAULT_POLICIES.standard).toBe(STANDARD_POLICY);
      expect(DEFAULT_POLICIES.development).toBe(DEVELOPMENT_POLICY);
      expect(DEFAULT_POLICIES.permissive).toBe(PERMISSIVE_POLICY);
      expect(DEFAULT_POLICIES.readonly).toBe(READONLY_POLICY);
    });
  });

  describe('getPolicy', () => {
    it('should return policy by id', () => {
      expect(getPolicy('standard')).toBe(STANDARD_POLICY);
      expect(getPolicy('restrictive')).toBe(RESTRICTIVE_POLICY);
      expect(getPolicy('development')).toBe(DEVELOPMENT_POLICY);
      expect(getPolicy('permissive')).toBe(PERMISSIVE_POLICY);
      expect(getPolicy('readonly')).toBe(READONLY_POLICY);
    });

    it('should return undefined for unknown id', () => {
      expect(getPolicy('unknown')).toBeUndefined();
      expect(getPolicy('')).toBeUndefined();
    });
  });

  describe('getDefaultPolicyForContext', () => {
    describe('verification contexts', () => {
      it('should return STANDARD for verification', () => {
        expect(getDefaultPolicyForContext('verification')).toBe(STANDARD_POLICY);
      });

      it('should return STANDARD for build', () => {
        expect(getDefaultPolicyForContext('build')).toBe(STANDARD_POLICY);
      });

      it('should return STANDARD for test', () => {
        expect(getDefaultPolicyForContext('test')).toBe(STANDARD_POLICY);
      });

      it('should return STANDARD for lint', () => {
        expect(getDefaultPolicyForContext('lint')).toBe(STANDARD_POLICY);
      });
    });

    describe('development contexts', () => {
      it('should return DEVELOPMENT for implementation', () => {
        expect(getDefaultPolicyForContext('implementation')).toBe(DEVELOPMENT_POLICY);
      });

      it('should return DEVELOPMENT for development', () => {
        expect(getDefaultPolicyForContext('development')).toBe(DEVELOPMENT_POLICY);
      });

      it('should return DEVELOPMENT for git', () => {
        expect(getDefaultPolicyForContext('git')).toBe(DEVELOPMENT_POLICY);
      });
    });

    describe('read-only contexts', () => {
      it('should return READONLY for analysis', () => {
        expect(getDefaultPolicyForContext('analysis')).toBe(READONLY_POLICY);
      });

      it('should return READONLY for query', () => {
        expect(getDefaultPolicyForContext('query')).toBe(READONLY_POLICY);
      });

      it('should return READONLY for read', () => {
        expect(getDefaultPolicyForContext('read')).toBe(READONLY_POLICY);
      });
    });

    describe('admin contexts', () => {
      it('should return PERMISSIVE for admin', () => {
        expect(getDefaultPolicyForContext('admin')).toBe(PERMISSIVE_POLICY);
      });

      it('should return PERMISSIVE for infrastructure', () => {
        expect(getDefaultPolicyForContext('infrastructure')).toBe(PERMISSIVE_POLICY);
      });
    });

    describe('unknown contexts', () => {
      it('should return RESTRICTIVE for unknown context', () => {
        expect(getDefaultPolicyForContext('unknown')).toBe(RESTRICTIVE_POLICY);
        expect(getDefaultPolicyForContext('')).toBe(RESTRICTIVE_POLICY);
        expect(getDefaultPolicyForContext('malicious')).toBe(RESTRICTIVE_POLICY);
      });
    });
  });

  describe('policy structure validation', () => {
    const allPolicies = [
      RESTRICTIVE_POLICY,
      STANDARD_POLICY,
      DEVELOPMENT_POLICY,
      PERMISSIVE_POLICY,
      READONLY_POLICY,
    ];

    it('should have unique ids', () => {
      const ids = allPolicies.map((p) => p.id);
      const uniqueIds = [...new Set(ids)];
      expect(uniqueIds).toHaveLength(ids.length);
    });

    it('should have valid mode values', () => {
      for (const policy of allPolicies) {
        expect(['none', 'policy', 'container']).toContain(policy.mode);
      }
    });

    it('should have allowedCommands as array', () => {
      for (const policy of allPolicies) {
        expect(Array.isArray(policy.allowedCommands)).toBe(true);
      }
    });

    it('should have allowedEnvVars as array', () => {
      for (const policy of allPolicies) {
        expect(Array.isArray(policy.allowedEnvVars)).toBe(true);
      }
    });

    it('should have pathRules as array', () => {
      for (const policy of allPolicies) {
        expect(Array.isArray(policy.pathRules)).toBe(true);
      }
    });

    it('should have capabilities as array', () => {
      for (const policy of allPolicies) {
        expect(Array.isArray(policy.capabilities)).toBe(true);
      }
    });

    it('should have limits object', () => {
      for (const policy of allPolicies) {
        expect(typeof policy.limits).toBe('object');
        expect(policy.limits).not.toBeNull();
      }
    });

    it('should have valid path access values', () => {
      for (const policy of allPolicies) {
        for (const rule of policy.pathRules) {
          expect(['read', 'write', 'none']).toContain(rule.access);
        }
      }
    });

    it('should have valid capability values', () => {
      const validCapabilities = [
        'network',
        'filesystem_read',
        'filesystem_write',
        'process_spawn',
        'env_access',
      ];

      for (const policy of allPolicies) {
        for (const cap of policy.capabilities) {
          expect(validCapabilities).toContain(cap);
        }
      }
    });
  });

  describe('policy security hierarchy', () => {
    it('should have restrictive < standard < development < permissive', () => {
      // Compare by number of allowed commands
      expect(RESTRICTIVE_POLICY.allowedCommands.length).toBeLessThan(
        STANDARD_POLICY.allowedCommands.length
      );
      expect(STANDARD_POLICY.allowedCommands.length).toBeLessThanOrEqual(
        DEVELOPMENT_POLICY.allowedCommands.length
      );

      // Compare by capabilities
      expect(RESTRICTIVE_POLICY.capabilities.length).toBeLessThan(
        STANDARD_POLICY.capabilities.length
      );
      expect(STANDARD_POLICY.capabilities.length).toBeLessThanOrEqual(
        DEVELOPMENT_POLICY.capabilities.length
      );
    });

    it('should have readonly as least permissive in terms of write capability', () => {
      expect(READONLY_POLICY.capabilities).not.toContain('filesystem_write');
      expect(RESTRICTIVE_POLICY.capabilities).not.toContain('filesystem_write');
    });
  });
});
