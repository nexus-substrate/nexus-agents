/**
 * Tests for the auto-remediation branch convention (#3540 inc.2d / #3614).
 */

import { describe, it, expect } from 'vitest';
import {
  AUTO_REMEDIATION_BRANCH_PREFIX,
  isAutoRemediationBranch,
  autoRemediationBranchName,
} from './auto-remediation-branch.js';

describe('isAutoRemediationBranch', () => {
  it('recognizes auto-remediation branches (bare and refs/heads form)', () => {
    expect(isAutoRemediationBranch('auto-remediation/tech-debt-fitness')).toBe(true);
    expect(isAutoRemediationBranch('refs/heads/auto-remediation/x')).toBe(true);
  });

  it('does not match normal branches', () => {
    expect(isAutoRemediationBranch('main')).toBe(false);
    expect(isAutoRemediationBranch('feat/some-feature')).toBe(false);
    expect(isAutoRemediationBranch('fix/auto-remediation-lookalike')).toBe(false);
  });
});

describe('autoRemediationBranchName', () => {
  it('prefixes and slugifies the signal key', () => {
    const name = autoRemediationBranchName('routing:cli-floor:claude:security_review');
    expect(name.startsWith(AUTO_REMEDIATION_BRANCH_PREFIX)).toBe(true);
    expect(isAutoRemediationBranch(name)).toBe(true);
    expect(name).toMatch(/^auto-remediation\/[a-z0-9._-]+$/);
  });

  it('strips characters that could enable ref/option injection', () => {
    const name = autoRemediationBranchName('  --upload-pack=evil ; rm -rf / ');
    expect(name).toMatch(/^auto-remediation\/[a-z0-9._-]+$/);
    expect(name).not.toContain(' ');
    expect(name).not.toContain(';');
    expect(name).not.toContain('--upload-pack=evil'); // '=' and spaces collapsed
  });

  it('falls back to a stable name when the key slugs to empty', () => {
    expect(autoRemediationBranchName('!!!')).toBe('auto-remediation/signal');
  });

  it('bounds the slug length', () => {
    const name = autoRemediationBranchName('a'.repeat(500));
    expect(name.length).toBeLessThanOrEqual(AUTO_REMEDIATION_BRANCH_PREFIX.length + 100);
  });
});
