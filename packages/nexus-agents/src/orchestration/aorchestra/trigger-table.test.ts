/**
 * Tests for TriggerTable — file-pattern to expert role routing.
 *
 * Maps file extensions and path prefixes to recommended expert types.
 * Used by agent planner to augment expert selection based on task file context.
 *
 * @module orchestration/aorchestra/trigger-table.test
 * (Source: Issue #1304, Epic #1299, arXiv:2602.20478)
 */

import { describe, it, expect } from 'vitest';
import { matchTriggers, DEFAULT_TRIGGER_TABLE, type TriggerRule } from './trigger-table.js';

// ============================================================================
// DEFAULT_TRIGGER_TABLE
// ============================================================================

describe('DEFAULT_TRIGGER_TABLE', () => {
  it('contains rules for common file patterns', () => {
    expect(DEFAULT_TRIGGER_TABLE.length).toBeGreaterThan(0);
    // Should have rules for test, security, docs, config patterns
    const patterns = DEFAULT_TRIGGER_TABLE.map((r) => r.pattern);
    expect(patterns.some((p) => p.includes('test'))).toBe(true);
    expect(patterns.some((p) => p.includes('security') || p.includes('auth'))).toBe(true);
  });
});

// ============================================================================
// matchTriggers
// ============================================================================

describe('matchTriggers', () => {
  it('returns empty array when no files provided', () => {
    expect(matchTriggers([])).toEqual([]);
  });

  it('returns empty array when no files match any rules', () => {
    expect(matchTriggers(['src/utils.ts'])).toEqual([]);
  });

  it('matches test files to testing expert', () => {
    const roles = matchTriggers(['src/auth.test.ts']);
    expect(roles).toContain('testing');
  });

  it('matches spec files to testing expert', () => {
    const roles = matchTriggers(['src/auth.spec.ts']);
    expect(roles).toContain('testing');
  });

  it('matches security-related files to security expert', () => {
    const roles = matchTriggers(['src/security/validator.ts']);
    expect(roles).toContain('security');
  });

  it('matches auth files to security expert', () => {
    const roles = matchTriggers(['src/auth/login.ts']);
    expect(roles).toContain('security');
  });

  it('matches documentation files to documentation expert', () => {
    const roles = matchTriggers(['docs/architecture.md']);
    expect(roles).toContain('documentation');
  });

  it('matches config files to devops expert', () => {
    const roles = matchTriggers(['docker-compose.yml']);
    expect(roles).toContain('devops');
  });

  it('matches Dockerfile to devops expert', () => {
    const roles = matchTriggers(['Dockerfile']);
    expect(roles).toContain('devops');
  });

  it('matches CI config to devops expert', () => {
    const roles = matchTriggers(['.github/workflows/ci.yml']);
    expect(roles).toContain('devops');
  });

  it('returns unique roles even with multiple matching files', () => {
    const roles = matchTriggers(['src/auth.test.ts', 'src/login.test.ts', 'src/register.spec.ts']);
    const testingCount = roles.filter((r) => r === 'testing').length;
    expect(testingCount).toBe(1);
  });

  it('returns multiple roles for diverse file sets', () => {
    const roles = matchTriggers(['src/auth.test.ts', 'src/security/policy.ts', 'docs/README.md']);
    expect(roles).toContain('testing');
    expect(roles).toContain('security');
    expect(roles).toContain('documentation');
  });

  it('accepts custom trigger table', () => {
    const custom: TriggerRule[] = [
      { pattern: '.custom', role: 'research', reason: 'Custom pattern' },
    ];
    const roles = matchTriggers(['data.custom'], custom);
    expect(roles).toContain('research');
  });

  it('matches infrastructure files to infrastructure expert', () => {
    const roles = matchTriggers(['terraform/main.tf']);
    expect(roles).toContain('infrastructure');
  });
});
