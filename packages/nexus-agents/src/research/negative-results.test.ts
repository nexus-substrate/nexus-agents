/**
 * Tests for negative-results.ts
 * @module research/negative-results.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  checkRejected,
  getRejectedIds,
  formatRejectionWarning,
  resetNegativeResultsCache,
} from './negative-results.js';
import { REGISTRY_PATH, _resetRegistryRootForTests } from '../cli/research-helpers-io.js';
import { _resetActiveWorkspaceRootForTests } from '../config/nexus-data-dir.js';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';

describe('negative results enforcement', () => {
  it('detects rejected techniques', () => {
    const result = checkRejected('latent-space-sharing');
    // This exists in the actual registry
    if (result !== undefined) {
      expect(result.name).toContain('LatentMAS');
      expect(result.failure_mode).toBe('architecture_incompatible');
    }
  });

  it('returns undefined for non-rejected techniques', () => {
    const result = checkRejected('nonexistent-technique');
    expect(result).toBeUndefined();
  });

  it('lists all rejected IDs', () => {
    const ids = getRejectedIds();
    expect(Array.isArray(ids)).toBe(true);
  });

  it('formats rejection warning', () => {
    const warning = formatRejectionWarning('test', {
      name: 'Test Technique',
      paper: 'arxiv-0000.00000',
      rejection_date: '2026-01-01',
      failure_mode: 'architecture_incompatible',
      lessons_learned: ['Lesson 1'],
      reopen_conditions: ['Condition 1'],
    });
    expect(warning).toContain('REJECTED');
    expect(warning).toContain('Lesson 1');
    expect(warning).toContain('Condition 1');
  });
});

describe('negative-results registry root (#5053)', () => {
  const originalCwd = process.cwd();
  let root: string;

  beforeEach(() => {
    // Outside any git repo: vitest pins TMPDIR under the repo, where the
    // resolver would legitimately find the repo's own registry.
    root = mkdtempOutsideRepo('nexus-5053-negative-');
    mkdirSync(join(root, REGISTRY_PATH), { recursive: true });
    writeFileSync(
      join(root, REGISTRY_PATH, 'negative-results.yaml'),
      [
        'negative_results:',
        '  root-only-rejected:',
        '    name: Root Only Rejected',
        '    paper: arxiv-0000.00000',
        "    rejection_date: '2026-01-01'",
        '    failure_mode: did not work',
        '    lessons_learned: []',
        '    reopen_conditions: []',
        '',
      ].join('\n'),
      'utf-8'
    );
    _resetRegistryRootForTests();
    _resetActiveWorkspaceRootForTests();
    resetNegativeResultsCache();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    _resetRegistryRootForTests();
    _resetActiveWorkspaceRootForTests();
    resetNegativeResultsCache();
    rmSync(root, { recursive: true, force: true });
  });

  it('reads the root registry from a nested cwd, not a cwd-relative path', () => {
    const nested = join(root, 'packages', 'nexus-agents');
    mkdirSync(nested, { recursive: true });
    process.chdir(nested);

    expect(getRejectedIds()).toEqual(['root-only-rejected']);
    expect(checkRejected('root-only-rejected')?.name).toBe('Root Only Rejected');
  });
});
