/**
 * Tests for the auto-remediation branch convention (#3540 inc.2d / #3614).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

describe('Rule-of-Two CI leg: secret-bearing PR-triggered workflows guard auto-remediation branches (#3778)', () => {
  // Repo root: this file lives at packages/nexus-agents/src/mcp/tools/ (5 up).
  const WORKFLOWS_DIR = join(import.meta.dirname, '../../../../..', '.github', 'workflows');

  // Workflows that expose a secret AND can trigger on a PR from an arbitrary
  // head ref. Each MUST skip auto-remediation/* branches so the bot path never
  // gets secrets on untrusted-signal-derived content (the CI leg of Rule-of-Two).
  const SECRET_PR_WORKFLOWS = ['ci.yml', 'pr-review.yml', 'self-dogfood.yml', 'link-check.yml'];

  for (const wf of SECRET_PR_WORKFLOWS) {
    it(`${wf} guards auto-remediation branches with the canonical prefix`, () => {
      const src = readFileSync(join(WORKFLOWS_DIR, wf), 'utf-8');
      // A negated startsWith on the canonical prefix must be present (github.head_ref
      // or github.event.pull_request.head.ref forms both accepted).
      expect(src).toMatch(
        new RegExp(`!startsWith\\([^)]*head[._]ref[^)]*,\\s*'${AUTO_REMEDIATION_BRANCH_PREFIX}'\\)`)
      );
    });
  }
});
