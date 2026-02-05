/**
 * Tests for Release Notes Helpers
 * @module cli/release-notes-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { CategorizedCommit, ReleaseNotesCategory } from './release-notes-types.js';
import {
  parseConventionalCommit,
  extractIssueNumbers,
  mapTypeToCategory,
  groupCommitsByCategory,
  formatCommitEntry,
  generateChangelogFormat,
  generateJsonFormat,
  generateMarkdownFormat,
  suggestNextVersion,
} from './release-notes-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeCommit(overrides: Partial<CategorizedCommit> = {}): CategorizedCommit {
  return {
    hash: 'abc1234',
    type: 'feat',
    subject: 'add new feature',
    message: 'feat: add new feature',
    breaking: false,
    issues: [],
    ...overrides,
  };
}

// ============================================================================
// extractIssueNumbers
// ============================================================================

describe('extractIssueNumbers', () => {
  it('extracts single issue number', () => {
    expect(extractIssueNumbers('fix bug #123')).toEqual(['#123']);
  });

  it('extracts multiple issue numbers', () => {
    expect(extractIssueNumbers('fix #123 and #456')).toEqual(['#123', '#456']);
  });

  it('returns empty for no issues', () => {
    expect(extractIssueNumbers('simple change')).toEqual([]);
  });
});

// ============================================================================
// parseConventionalCommit
// ============================================================================

describe('parseConventionalCommit', () => {
  it('parses simple conventional commit', () => {
    const result = parseConventionalCommit('abc1234', 'feat: add login');
    expect(result.hash).toBe('abc1234');
    expect(result.type).toBe('feat');
    expect(result.subject).toBe('add login');
    expect(result.breaking).toBe(false);
  });

  it('parses commit with scope', () => {
    const result = parseConventionalCommit('abc1234', 'fix(auth): resolve token issue');
    expect(result.type).toBe('fix');
    expect(result.scope).toBe('auth');
    expect(result.subject).toBe('resolve token issue');
  });

  it('parses breaking change', () => {
    const result = parseConventionalCommit('abc1234', 'feat!: remove old API');
    expect(result.breaking).toBe(true);
  });

  it('parses breaking change with scope', () => {
    const result = parseConventionalCommit('abc1234', 'refactor(api)!: change response format');
    expect(result.breaking).toBe(true);
    expect(result.scope).toBe('api');
  });

  it('extracts issue numbers from subject', () => {
    const result = parseConventionalCommit('abc1234', 'fix: resolve #42 login bug');
    expect(result.issues).toEqual(['#42']);
  });

  it('handles non-conventional commit', () => {
    const result = parseConventionalCommit('abc1234', 'Update README');
    expect(result.type).toBe('other');
    expect(result.subject).toBe('Update README');
    expect(result.breaking).toBe(false);
  });

  it('extracts issues from non-conventional commits', () => {
    const result = parseConventionalCommit('abc1234', 'Fix bug mentioned in #99');
    expect(result.issues).toEqual(['#99']);
  });
});

// ============================================================================
// mapTypeToCategory
// ============================================================================

describe('mapTypeToCategory', () => {
  it('maps feat to Added', () => {
    expect(mapTypeToCategory('feat')).toBe('Added');
  });

  it('maps fix to Fixed', () => {
    expect(mapTypeToCategory('fix')).toBe('Fixed');
  });

  it('maps refactor to Changed', () => {
    expect(mapTypeToCategory('refactor')).toBe('Changed');
  });

  it('maps docs to Documentation', () => {
    expect(mapTypeToCategory('docs')).toBe('Documentation');
  });

  it('maps unknown type to Maintenance', () => {
    expect(mapTypeToCategory('other')).toBe('Maintenance');
    expect(mapTypeToCategory('xyz')).toBe('Maintenance');
  });

  it('is case insensitive', () => {
    expect(mapTypeToCategory('FEAT')).toBe('Added');
  });
});

// ============================================================================
// groupCommitsByCategory
// ============================================================================

describe('groupCommitsByCategory', () => {
  it('groups commits by category', () => {
    const commits = [
      makeCommit({ type: 'feat', subject: 'add A' }),
      makeCommit({ type: 'feat', subject: 'add B' }),
      makeCommit({ type: 'fix', subject: 'fix C' }),
    ];
    const categories = groupCommitsByCategory(commits);
    const added = categories.find((c) => c.name === 'Added');
    expect(added).toBeDefined();
    expect(added!.commits).toHaveLength(2);
    const fixed = categories.find((c) => c.name === 'Fixed');
    expect(fixed).toBeDefined();
    expect(fixed!.commits).toHaveLength(1);
  });

  it('orders by CATEGORY_ORDER', () => {
    const commits = [
      makeCommit({ type: 'fix', subject: 'fix' }),
      makeCommit({ type: 'feat', subject: 'feat' }),
    ];
    const categories = groupCommitsByCategory(commits);
    // Added comes before Fixed in CATEGORY_ORDER
    const addedIdx = categories.findIndex((c) => c.name === 'Added');
    const fixedIdx = categories.findIndex((c) => c.name === 'Fixed');
    expect(addedIdx).toBeLessThan(fixedIdx);
  });

  it('returns empty for no commits', () => {
    expect(groupCommitsByCategory([])).toEqual([]);
  });
});

// ============================================================================
// formatCommitEntry
// ============================================================================

describe('formatCommitEntry', () => {
  it('formats basic commit', () => {
    const commit = makeCommit({ subject: 'add login' });
    expect(formatCommitEntry(commit)).toBe('- add login');
  });

  it('includes scope', () => {
    const commit = makeCommit({ scope: 'auth', subject: 'add login' });
    expect(formatCommitEntry(commit)).toBe('- **auth**: add login');
  });

  it('includes breaking prefix', () => {
    const commit = makeCommit({ breaking: true, subject: 'remove old API' });
    expect(formatCommitEntry(commit)).toBe('- **BREAKING**: remove old API');
  });

  it('includes issue references', () => {
    const commit = makeCommit({ subject: 'fix bug', issues: ['#42', '#43'] });
    expect(formatCommitEntry(commit)).toBe('- fix bug (#42, #43)');
  });

  it('combines scope, breaking, and issues', () => {
    const commit = makeCommit({
      scope: 'api',
      breaking: true,
      subject: 'change format',
      issues: ['#100'],
    });
    expect(formatCommitEntry(commit)).toBe('- **BREAKING**: **api**: change format (#100)');
  });
});

// ============================================================================
// generateChangelogFormat
// ============================================================================

describe('generateChangelogFormat', () => {
  it('generates changelog with header and categories', () => {
    const categories: ReleaseNotesCategory[] = [
      { name: 'Added', commits: [makeCommit({ subject: 'new feature' })] },
    ];
    const result = generateChangelogFormat('2.0.0', '2026-01-15', categories);
    expect(result).toContain('## [2.0.0] - 2026-01-15');
    expect(result).toContain('### Added');
    expect(result).toContain('- new feature');
  });

  it('handles multiple categories', () => {
    const categories: ReleaseNotesCategory[] = [
      { name: 'Added', commits: [makeCommit({ subject: 'feat' })] },
      { name: 'Fixed', commits: [makeCommit({ subject: 'fix' })] },
    ];
    const result = generateChangelogFormat('1.0.0', '2026-01-01', categories);
    expect(result).toContain('### Added');
    expect(result).toContain('### Fixed');
  });
});

// ============================================================================
// generateJsonFormat
// ============================================================================

describe('generateJsonFormat', () => {
  it('generates valid JSON', () => {
    const categories: ReleaseNotesCategory[] = [
      {
        name: 'Added',
        commits: [makeCommit({ hash: 'a1', subject: 'new thing', scope: 'core' })],
      },
    ];
    const json = generateJsonFormat('1.0.0', '2026-01-01', categories);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.version).toBe('1.0.0');
    expect(parsed.date).toBe('2026-01-01');
  });

  it('includes commit details', () => {
    const categories: ReleaseNotesCategory[] = [
      {
        name: 'Added',
        commits: [makeCommit({ hash: 'abc', type: 'feat', breaking: true, issues: ['#1'] })],
      },
    ];
    const parsed = JSON.parse(generateJsonFormat('1.0.0', '2026-01-01', categories)) as {
      categories: Array<{ commits: Array<{ hash: string; breaking: boolean; issues: string[] }> }>;
    };
    const commit = parsed.categories[0]!.commits[0]!;
    expect(commit.hash).toBe('abc');
    expect(commit.breaking).toBe(true);
    expect(commit.issues).toEqual(['#1']);
  });
});

// ============================================================================
// generateMarkdownFormat
// ============================================================================

describe('generateMarkdownFormat', () => {
  it('generates release header', () => {
    const categories: ReleaseNotesCategory[] = [{ name: 'Added', commits: [makeCommit()] }];
    const result = generateMarkdownFormat('2.0.0', categories);
    expect(result).toContain('# Release 2.0.0');
  });

  it('includes highlights section with counts', () => {
    const categories: ReleaseNotesCategory[] = [
      { name: 'Added', commits: [makeCommit(), makeCommit({ hash: 'b' })] },
      { name: 'Fixed', commits: [makeCommit({ hash: 'c', type: 'fix' })] },
    ];
    const result = generateMarkdownFormat('1.0.0', categories);
    expect(result).toContain('**3** changes');
    expect(result).toContain('2 new features');
    expect(result).toContain('1 bug fixes');
  });

  it('does not include feat/fix counts when zero', () => {
    const categories: ReleaseNotesCategory[] = [
      { name: 'Documentation', commits: [makeCommit({ type: 'docs' })] },
    ];
    const result = generateMarkdownFormat('1.0.0', categories);
    expect(result).not.toContain('new features');
    expect(result).not.toContain('bug fixes');
  });
});

// ============================================================================
// suggestNextVersion
// ============================================================================

describe('suggestNextVersion', () => {
  it('bumps major for breaking changes', () => {
    const commits = [makeCommit({ breaking: true })];
    expect(suggestNextVersion('2.5.3', commits)).toBe('3.0.0');
  });

  it('bumps minor for features', () => {
    const commits = [makeCommit({ type: 'feat' })];
    expect(suggestNextVersion('2.5.3', commits)).toBe('2.6.0');
  });

  it('bumps patch for fixes', () => {
    const commits = [makeCommit({ type: 'fix' })];
    expect(suggestNextVersion('2.5.3', commits)).toBe('2.5.4');
  });

  it('strips v prefix', () => {
    const commits = [makeCommit({ type: 'fix' })];
    expect(suggestNextVersion('v1.0.0', commits)).toBe('1.0.1');
  });

  it('returns original for invalid version format', () => {
    expect(suggestNextVersion('invalid', [])).toBe('invalid');
  });

  it('prioritizes breaking over features', () => {
    const commits = [makeCommit({ type: 'feat', breaking: true })];
    expect(suggestNextVersion('1.0.0', commits)).toBe('2.0.0');
  });
});
