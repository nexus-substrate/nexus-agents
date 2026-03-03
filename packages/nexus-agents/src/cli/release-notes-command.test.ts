/**
 * nexus-agents/cli - Release Notes Command Tests
 * (Source: Issue #697 - Add test coverage for untested CLI commands)
 */

import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import type { CategorizedCommit, ReleaseNotesCategory } from './release-notes-types.js';

const mockCommit: CategorizedCommit = {
  hash: 'abc1234',
  type: 'feat',
  subject: 'add new feature',
  message: 'feat: add new feature',
  breaking: false,
  issues: [],
};

const mockCategory: ReleaseNotesCategory = {
  name: 'Added',
  commits: [mockCommit],
};

vi.mock('./release-notes-helpers.js', () => ({
  getLatestTag: vi.fn().mockReturnValue('v2.5.0'),
  getCommitsBetween: vi.fn().mockReturnValue(['abc1234 feat: add new feature']),
  parseConventionalCommit: vi.fn().mockReturnValue({
    hash: 'abc1234',
    type: 'feat',
    subject: 'add new feature',
    message: 'feat: add new feature',
    breaking: false,
    issues: [],
  }),
  groupCommitsByCategory: vi.fn().mockReturnValue([
    {
      name: 'Added',
      commits: [
        {
          hash: 'abc1234',
          type: 'feat',
          subject: 'add new feature',
          message: 'feat: add new feature',
          breaking: false,
          issues: [],
        },
      ],
    },
  ]),
  suggestNextVersion: vi.fn().mockReturnValue('2.6.0'),
  generateChangelogFormat: vi
    .fn()
    .mockReturnValue('## [2.6.0] - 2026-02-04\n### Added\n- add new feature'),
  generateJsonFormat: vi.fn().mockReturnValue('{"version":"2.6.0","categories":[]}'),
  generateMarkdownFormat: vi.fn().mockReturnValue('# 2.6.0\n## Added\n- add new feature'),
}));

vi.mock('./ansi-output.js', () => ({
  colors: {
    reset: '',
    bold: '',
    dim: '',
    green: '',
    yellow: '',
    red: '',
    cyan: '',
  },
}));

import {
  runReleaseNotes,
  printReleaseNotesResult,
  releaseNotesCommand,
} from './release-notes-command.js';
import {
  getLatestTag,
  getCommitsBetween,
  parseConventionalCommit,
  groupCommitsByCategory,
  suggestNextVersion,
  generateChangelogFormat,
  generateJsonFormat,
  generateMarkdownFormat,
} from './release-notes-helpers.js';

function resetHelperMocks(): void {
  vi.mocked(getLatestTag).mockReturnValue('v2.5.0');
  vi.mocked(getCommitsBetween).mockReturnValue(['abc1234 feat: add new feature']);
  vi.mocked(parseConventionalCommit).mockReturnValue(mockCommit);
  vi.mocked(groupCommitsByCategory).mockReturnValue([mockCategory]);
  vi.mocked(suggestNextVersion).mockReturnValue('2.6.0');
  vi.mocked(generateChangelogFormat).mockReturnValue('## [2.6.0]\n### Added\n- add new feature');
  vi.mocked(generateJsonFormat).mockReturnValue('{"version":"2.6.0"}');
  vi.mocked(generateMarkdownFormat).mockReturnValue('# 2.6.0\n## Added\n- add new feature');
}

describe('runReleaseNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHelperMocks();
  });

  it('should return success with commits', async () => {
    const result = await runReleaseNotes({ format: 'changelog' });

    expect(result.success).toBe(true);
    expect(result.commitCount).toBe(1);
    expect(result.version).toBe('2.6.0');
    expect(result.categories).toHaveLength(1);
  });

  it('should return empty result when no commits found', async () => {
    vi.mocked(getCommitsBetween).mockReturnValue([]);

    const result = await runReleaseNotes();

    expect(result.success).toBe(true);
    expect(result.commitCount).toBe(0);
    expect(result.content).toBe('No commits found in range.');
    expect(result.usedConsensus).toBe(false);
  });

  it('should use latest tag as fromRef', async () => {
    await runReleaseNotes();

    expect(getCommitsBetween).toHaveBeenCalledWith('v2.5.0', 'HEAD');
  });

  it('should fall back to HEAD~50 when no tag exists', async () => {
    vi.mocked(getLatestTag).mockReturnValue(undefined);

    await runReleaseNotes();

    expect(getCommitsBetween).toHaveBeenCalledWith('HEAD~50', 'HEAD');
  });

  it('should use custom from/to references', async () => {
    await runReleaseNotes({ from: 'v1.0.0', to: 'v2.0.0' });

    expect(getCommitsBetween).toHaveBeenCalledWith('v1.0.0', 'v2.0.0');
  });

  it('should use changelog format by default', async () => {
    await runReleaseNotes();

    expect(generateChangelogFormat).toHaveBeenCalled();
    expect(generateJsonFormat).not.toHaveBeenCalled();
    expect(generateMarkdownFormat).not.toHaveBeenCalled();
  });

  it('should use json format when specified', async () => {
    await runReleaseNotes({ format: 'json' });

    expect(generateJsonFormat).toHaveBeenCalled();
    expect(generateChangelogFormat).not.toHaveBeenCalled();
  });

  it('should use markdown format when specified', async () => {
    await runReleaseNotes({ format: 'markdown' });

    expect(generateMarkdownFormat).toHaveBeenCalled();
    expect(generateChangelogFormat).not.toHaveBeenCalled();
  });

  it('should set usedConsensus based on dryRun', async () => {
    const dryResult = await runReleaseNotes({ dryRun: true });
    expect(dryResult.usedConsensus).toBe(false);

    const liveResult = await runReleaseNotes({ dryRun: false });
    expect(liveResult.usedConsensus).toBe(true);
  });

  it('should include durationMs in result', async () => {
    const result = await runReleaseNotes();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('printReleaseNotesResult', () => {
  let consoleSpy: MockInstance;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should print content', () => {
    printReleaseNotesResult({
      success: true,
      content: 'Release notes content',
      version: '2.6.0',
      fromRef: 'v2.5.0',
      toRef: 'HEAD',
      commitCount: 5,
      categories: [],
      usedConsensus: false,
      durationMs: 100,
    });

    const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('Release notes content');
    consoleSpy.mockRestore();
  });

  it('should print verbose header when verbose is true', () => {
    printReleaseNotesResult(
      {
        success: true,
        content: 'Notes',
        version: '2.6.0',
        fromRef: 'v2.5.0',
        toRef: 'HEAD',
        commitCount: 5,
        categories: [mockCategory],
        usedConsensus: false,
        durationMs: 100,
      },
      true
    );

    const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('Release Notes Generation');
    expect(output).toContain('2.6.0');
    expect(output).toContain('v2.5.0');
    consoleSpy.mockRestore();
  });

  it('should not print verbose header when verbose is false', () => {
    printReleaseNotesResult(
      {
        success: true,
        content: 'Notes',
        version: '2.6.0',
        fromRef: 'v2.5.0',
        toRef: 'HEAD',
        commitCount: 5,
        categories: [],
        usedConsensus: false,
        durationMs: 100,
      },
      false
    );

    const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).not.toContain('Release Notes Generation');
    consoleSpy.mockRestore();
  });
});

describe('releaseNotesCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHelperMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should return 0 on success', async () => {
    const exitCode = await releaseNotesCommand({
      positionals: ['release-notes'],
      options: {},
    });

    expect(exitCode).toBe(0);
  });

  it('should pass format option through', async () => {
    await releaseNotesCommand({
      positionals: ['release-notes'],
      options: { format: 'json' },
    });

    expect(generateJsonFormat).toHaveBeenCalled();
  });

  it('should pass from/to options through', async () => {
    await releaseNotesCommand({
      positionals: ['release-notes'],
      options: { from: 'v1.0.0', to: 'v2.0.0' },
    });

    expect(getCommitsBetween).toHaveBeenCalledWith('v1.0.0', 'v2.0.0');
  });

  it('should default format to changelog', async () => {
    await releaseNotesCommand({
      positionals: ['release-notes'],
      options: {},
    });

    expect(generateChangelogFormat).toHaveBeenCalled();
  });
});
