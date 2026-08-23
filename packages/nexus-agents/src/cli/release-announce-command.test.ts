/**
 * nexus-agents/cli - Release Announce Command Tests
 * (Source: Issue #641 - Release announcement bot)
 */

import { describe, it, expect, vi, beforeEach, type MockInstance } from 'vitest';
import type { ReleaseAnnounceResult, ChannelAnnouncementResult } from './release-announce-types.js';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('{"version":"3.0.0"}'),
  existsSync: vi.fn().mockReturnValue(false),
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

vi.mock('./release-notes-helpers.js', () => ({
  getLatestTag: vi.fn(),
  getCommitsBetween: vi.fn(),
  tryGetCommitsBetween: vi.fn().mockReturnValue({ kind: 'ok', commits: [] }),
  parseConventionalCommit: vi.fn(),
  groupCommitsByCategory: vi.fn(),
}));

vi.mock('./bluesky-client.js', () => ({
  getBlueskyConfig: vi.fn().mockReturnValue(undefined),
  createBlueskyPost: vi
    .fn()
    .mockReturnValue(
      Promise.resolve({ success: true, url: 'https://bsky.app/profile/test/post/123' })
    ),
}));

import { readFileSync, existsSync } from 'node:fs';
import {
  runReleaseAnnounce,
  printReleaseAnnounceResult,
  releaseAnnounceCommand,
} from './release-announce-command.js';
import { getBlueskyConfig, createBlueskyPost } from './bluesky-client.js';
import {
  getLatestTag,
  getCommitsBetween,
  parseConventionalCommit,
  groupCommitsByCategory,
} from './release-notes-helpers.js';

/** Configure release-notes-helpers mocks with default return values. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setupReleaseNotesMocks() {
  vi.mocked(getLatestTag).mockReturnValue('v2.5.0');
  vi.mocked(getCommitsBetween).mockReturnValue([
    'abc1234 feat: add orchestration',
    'def5678 fix: resolve timeout',
  ]);
  vi.mocked(parseConventionalCommit).mockImplementation((_hash: string, msg: string) => ({
    hash: 'abc1234',
    type: msg.startsWith('feat') ? 'feat' : 'fix',
    subject: msg.replace(/^(feat|fix): /, ''),
    message: msg,
    breaking: false,
    issues: [],
  }));
  vi.mocked(groupCommitsByCategory).mockReturnValue([
    {
      name: 'Added',
      commits: [
        {
          hash: 'abc1234',
          type: 'feat',
          scope: 'core',
          subject: 'add orchestration',
          message: 'feat: add orchestration',
          breaking: false,
          issues: [],
        },
      ],
    },
    {
      name: 'Fixed',
      commits: [
        {
          hash: 'def5678',
          type: 'fix',
          subject: 'resolve timeout',
          message: 'fix: resolve timeout',
          breaking: false,
          issues: [],
        },
      ],
    },
  ]);
}

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeSuccessResult(overrides: Partial<ReleaseAnnounceResult> = {}) {
  return {
    success: true,
    version: '3.0.0',
    channels: [
      { channel: 'blog' as const, success: true, content: 'blog content', url: 'http://blog' },
    ],
    durationMs: 42,
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeChannelResult(overrides: Partial<ChannelAnnouncementResult> = {}) {
  return {
    channel: 'blog' as const,
    success: true,
    content: 'some content',
    ...overrides,
  };
}

// ============================================================================
// runReleaseAnnounce
// ============================================================================

describe('runReleaseAnnounce', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupReleaseNotesMocks();
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(getBlueskyConfig).mockReturnValue(undefined);
  });

  it('should return success for blog dry-run', async () => {
    const result = await runReleaseAnnounce({
      version: '3.0.0',
      channels: ['blog'],
      dryRun: true,
      verbose: false,
    });

    expect(result.success).toBe(true);
    expect(result.version).toBe('3.0.0');
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0]?.channel).toBe('blog');
  });

  it('should include durationMs in result', async () => {
    const result = await runReleaseAnnounce({
      version: '3.0.0',
      channels: ['blog'],
      dryRun: true,
      verbose: false,
    });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('should generate blog content with version', async () => {
    const result = await runReleaseAnnounce({
      version: '3.0.0',
      channels: ['blog'],
      dryRun: true,
      verbose: false,
    });

    expect(result.channels[0]?.content).toContain('3.0.0');
  });

  it('should use custom highlights in blog content', async () => {
    const result = await runReleaseAnnounce({
      version: '3.0.0',
      channels: ['blog'],
      dryRun: true,
      verbose: false,
      highlights: ['Custom highlight one', 'Custom highlight two'],
    });

    expect(result.channels[0]?.content).toContain('Custom highlight one');
    expect(result.channels[0]?.content).toContain('Custom highlight two');
  });

  it('should use custom releaseUrl in blog content', async () => {
    const result = await runReleaseAnnounce({
      version: '3.0.0',
      channels: ['blog'],
      dryRun: true,
      verbose: false,
      releaseUrl: 'https://github.com/custom/release/v3.0.0',
    });

    expect(result.channels[0]?.content).toContain('https://github.com/custom/release/v3.0.0');
  });

  it('should handle bluesky dry-run', async () => {
    const result = await runReleaseAnnounce({
      version: '3.0.0',
      channels: ['bluesky'],
      dryRun: true,
      verbose: false,
    });

    expect(result.channels[0]?.channel).toBe('bluesky');
    expect(result.channels[0]?.success).toBe(true);
    expect(result.channels[0]?.url).toBe('(dry-run)');
  });

  it('should fail bluesky without credentials', async () => {
    vi.mocked(getBlueskyConfig).mockReturnValue(undefined);

    const result = await runReleaseAnnounce({
      version: '3.0.0',
      channels: ['bluesky'],
      dryRun: false,
      verbose: false,
    });

    expect(result.channels[0]?.success).toBe(false);
    expect(result.channels[0]?.error).toContain('BLUESKY_HANDLE');
  });

  it('should succeed bluesky with valid credentials', async () => {
    vi.mocked(getBlueskyConfig).mockReturnValue({
      handle: 'test.bsky.social',
      appPassword: 'secret',
    });
    vi.mocked(createBlueskyPost).mockReturnValue(
      Promise.resolve({ success: true, url: 'https://bsky.app/profile/test/post/abc' })
    );

    const result = await runReleaseAnnounce({
      version: '3.0.0',
      channels: ['bluesky'],
      dryRun: false,
      verbose: false,
    });

    expect(result.channels[0]?.success).toBe(true);
    expect(result.channels[0]?.url).toBe('https://bsky.app/profile/test/post/abc');
  });

  it('should handle bluesky post failure', async () => {
    vi.mocked(getBlueskyConfig).mockReturnValue({
      handle: 'test.bsky.social',
      appPassword: 'secret',
    });
    vi.mocked(createBlueskyPost).mockReturnValue(
      Promise.resolve({ success: false, error: 'Rate limited' })
    );

    const result = await runReleaseAnnounce({
      version: '3.0.0',
      channels: ['bluesky'],
      dryRun: false,
      verbose: false,
    });

    expect(result.channels[0]?.success).toBe(false);
    expect(result.channels[0]?.error).toBe('Rate limited');
  });

  it('should handle unknown channel gracefully', async () => {
    const result = await runReleaseAnnounce({
      version: '3.0.0',
      channels: ['slack' as 'blog'],
      dryRun: false,
      verbose: false,
    });

    expect(result.channels[0]?.success).toBe(false);
    expect(result.channels[0]?.error).toContain('Unknown channel');
  });

  it('should handle multiple channels', async () => {
    const result = await runReleaseAnnounce({
      version: '3.0.0',
      channels: ['blog', 'bluesky'],
      dryRun: true,
      verbose: false,
    });

    expect(result.channels).toHaveLength(2);
    expect(result.channels[0]?.channel).toBe('blog');
    expect(result.channels[1]?.channel).toBe('bluesky');
  });

  it('should report allSuccess false if any channel fails', async () => {
    vi.mocked(getBlueskyConfig).mockReturnValue(undefined);

    const result = await runReleaseAnnounce({
      version: '3.0.0',
      channels: ['blog', 'bluesky'],
      dryRun: false,
      verbose: false,
    });

    // Blog succeeds but bluesky fails (no credentials)
    expect(result.success).toBe(false);
  });

  it('should log verbose output when verbose is true', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await runReleaseAnnounce({
      version: '3.0.0',
      channels: ['blog'],
      dryRun: true,
      verbose: true,
    });

    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('Release Announcement Generator');
    expect(output).toContain('3.0.0');
    logSpy.mockRestore();
  });

  // This test previously asserted `success: true` for an empty channel list —
  // it pinned the vacuous pass rather than catching it (#4581). Announcing
  // nothing is not a successful announcement.
  it('should not report success when no channels were announced', async () => {
    const result = await runReleaseAnnounce({
      version: '3.0.0',
      channels: [],
      dryRun: true,
      verbose: false,
    });

    expect(result.success).toBe(false);
    expect(result.channels).toHaveLength(0);
  });
});

// ============================================================================
// printReleaseAnnounceResult
// ============================================================================

describe('printReleaseAnnounceResult', () => {
  let logSpy: MockInstance;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('should print version and duration', () => {
    printReleaseAnnounceResult(makeSuccessResult());

    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('3.0.0');
    expect(output).toContain('42ms');
    logSpy.mockRestore();
  });

  it('should print channel URL when present', () => {
    printReleaseAnnounceResult(
      makeSuccessResult({
        channels: [makeChannelResult({ url: 'https://example.com/post' })],
      })
    );

    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('https://example.com/post');
    logSpy.mockRestore();
  });

  it('should print channel error when present', () => {
    printReleaseAnnounceResult(
      makeSuccessResult({
        success: false,
        channels: [makeChannelResult({ success: false, error: 'Connection failed' })],
      })
    );

    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('Connection failed');
    logSpy.mockRestore();
  });

  it('should print content preview in verbose mode', () => {
    printReleaseAnnounceResult(
      makeSuccessResult({
        channels: [makeChannelResult({ content: 'Line 1\nLine 2\nLine 3' })],
      }),
      true
    );

    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('Content preview');
    logSpy.mockRestore();
  });

  it('should print all-success message when all channels pass', () => {
    printReleaseAnnounceResult(makeSuccessResult());

    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('All announcements generated');
    logSpy.mockRestore();
  });

  it('should print warning when some channels fail', () => {
    printReleaseAnnounceResult(
      makeSuccessResult({
        channels: [makeChannelResult({ success: false, error: 'fail' })],
      })
    );

    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('Some announcements failed');
    logSpy.mockRestore();
  });
});

// ============================================================================
// releaseAnnounceCommand
// ============================================================================

describe('releaseAnnounceCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupReleaseNotesMocks();
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(getBlueskyConfig).mockReturnValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should return 0 on success with explicit version', async () => {
    const exitCode = await releaseAnnounceCommand({
      positionals: ['release-announce'],
      options: { version: '3.0.0', channels: 'blog', dryRun: true },
    });

    expect(exitCode).toBe(0);
  });

  it('should read version from package.json when not provided', async () => {
    vi.mocked(readFileSync).mockReturnValue('{"version":"2.9.0"}');

    const exitCode = await releaseAnnounceCommand({
      positionals: ['release-announce'],
      options: { channels: 'blog', dryRun: true },
    });

    expect(exitCode).toBe(0);
  });

  it('should return 1 when package.json has no version', async () => {
    vi.mocked(readFileSync).mockReturnValue('{}');

    const exitCode = await releaseAnnounceCommand({
      positionals: ['release-announce'],
      options: { dryRun: true },
    });

    expect(exitCode).toBe(1);
  });

  it('should return 1 when package.json is unreadable', async () => {
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });

    const exitCode = await releaseAnnounceCommand({
      positionals: ['release-announce'],
      options: { dryRun: true },
    });

    expect(exitCode).toBe(1);
  });

  it('should parse comma-separated channels', async () => {
    const exitCode = await releaseAnnounceCommand({
      positionals: ['release-announce'],
      options: { version: '3.0.0', channels: 'blog,bluesky', dryRun: true },
    });

    expect(exitCode).toBe(0);
  });

  it('should filter out invalid channels', async () => {
    const exitCode = await releaseAnnounceCommand({
      positionals: ['release-announce'],
      options: { version: '3.0.0', channels: 'blog,slack,bluesky', dryRun: true },
    });

    // 'slack' is filtered out; blog and bluesky remain valid
    expect(exitCode).toBe(0);
  });

  it('should return 1 when a channel fails', async () => {
    vi.mocked(getBlueskyConfig).mockReturnValue(undefined);

    const exitCode = await releaseAnnounceCommand({
      positionals: ['release-announce'],
      options: { version: '3.0.0', channels: 'bluesky', dryRun: false },
    });

    expect(exitCode).toBe(1);
  });

  it('should pass releaseUrl option through', async () => {
    const exitCode = await releaseAnnounceCommand({
      positionals: ['release-announce'],
      options: {
        version: '3.0.0',
        channels: 'blog',
        dryRun: true,
        releaseUrl: 'https://github.com/test/v3.0.0',
      },
    });

    expect(exitCode).toBe(0);
  });
  it('should reject an unrecognised channel rather than announcing nothing', async () => {
    const exitCode = await releaseAnnounceCommand({
      positionals: ['release-announce'],
      options: { version: '3.0.0', channels: 'bogus', dryRun: true },
    });

    expect(exitCode).toBe(1);
  });

  it('should not print the all-clear banner when no channels were announced', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    printReleaseAnnounceResult(makeSuccessResult({ success: false, channels: [] }));

    const output = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).not.toContain('All announcements generated');
    expect(output).toContain('No announcements');
    logSpy.mockRestore();
  });
});
