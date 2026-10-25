/** Actual entry parser and release handler composition; no parser/handler mocks. */
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { parseCliArgs } from '../cli.js';
import { handleReleaseAnnounceCommand } from '../cli-release-handlers.js';

describe('release-announce real CLI channels', () => {
  let logSpy: MockInstance;
  let errorSpy: MockInstance;
  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it.each([
    ['bluesky', false],
    ['blog,bluesky', false],
    ['blog, bluesky', false],
    ['blog,Bluesky', false],
    ['bluesky ', false],
    [' Bluesky,blog', false],
    ['blog, bluesky', true],
    ['blog,Bluesky', true],
    ['bluesky ', true],
    [' Bluesky,blog', true],
  ] as const)(
    'rejects retired --channels %s before blog output (dryRun=%s)',
    async (channels, dryRun) => {
      const args = parseCliArgs([
        'release-announce',
        '3.0.0',
        '--channels',
        channels,
        ...(dryRun ? ['--dry-run'] : []),
      ]);
      const result = await handleReleaseAnnounceCommand(args);
      expect(result.exitCode).not.toBe(0);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Bluesky announcement channel is retired')
      );
      expect(logSpy).not.toHaveBeenCalled();
    }
  );

  it('supports --channels blog with --dry-run through the actual handler', async () => {
    const args = parseCliArgs(['release-announce', '3.0.0', '--channels', 'blog', '--dry-run']);
    const result = await handleReleaseAnnounceCommand(args);
    expect(result.exitCode).toBe(0);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('BLOG'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('(dry-run)'));
  });

  it.each(['', 'unknown-channel'])('rejects empty or unknown --channels %s', async (channels) => {
    const args = parseCliArgs(['release-announce', '3.0.0', '--channels', channels, '--dry-run']);
    const result = await handleReleaseAnnounceCommand(args);
    expect(result.exitCode).not.toBe(0);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('No known announcement channels')
    );
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('preserves the existing positional blog channel', async () => {
    const result = await handleReleaseAnnounceCommand(
      parseCliArgs(['release-announce', '3.0.0', 'blog', '--dry-run'])
    );
    expect(result.exitCode).toBe(0);
  });
});
