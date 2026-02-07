/**
 * CLI Release Handlers Tests
 *
 * Tests for the release automation command handlers in cli-release-handlers.ts.
 * (Source: Issue #637 - Release automation suite)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ParsedCliArgs } from './cli-types.js';
import { EXIT_CODES } from './cli-types.js';
import type { ServerMode } from './cli/index.js';

// Mock release commands
vi.mock('./cli/index.js', () => ({
  releaseNotesCommand: vi.fn(() => Promise.resolve(0)),
  releaseValidateCommand: vi.fn(() => Promise.resolve(0)),
  releaseAnnounceCommand: vi.fn(() => Promise.resolve(0)),
}));

import {
  handleReleaseNotesCommand,
  handleReleaseValidateCommand,
  handleReleaseAnnounceCommand,
} from './cli-release-handlers.js';
import {
  releaseNotesCommand,
  releaseValidateCommand,
  releaseAnnounceCommand,
} from './cli/index.js';

// Mock process.exit to throw so tests can catch the exit call
const mockExit = vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
  throw new Error(`process.exit(${String(code)})`);
});

/**
 * Creates a ParsedCliArgs object with sensible defaults for release handler tests.
 * Uses omission pattern for optional properties to comply with exactOptionalPropertyTypes.
 */
function createArgs(overrides?: Partial<ParsedCliArgs>): ParsedCliArgs {
  const baseOptions = {
    help: false,
    version: false,
    verbose: false,
    interactive: false,
    mode: 'server' as ServerMode,
    force: false,
    format: 'changelog',
    dryRun: false,
    banditStats: false,
    setup: false,
    skipChecks: false,
    createIssue: false,
    fix: false,
    quick: false,
    resume: false,
    nonInteractive: false,
    skipMcp: false,
    skipRules: false,
    skipHooks: false,
    mock: false,
  };

  const result = {
    command: 'release-notes' as const,
    options: baseOptions,
    positionals: ['release-notes'],
    ...overrides,
  } as unknown as ParsedCliArgs;
  return result;
}

afterEach(() => {
  vi.clearAllMocks();
  mockExit.mockRestore();
  // Re-apply the mock for the next test
  vi.spyOn(process, 'exit').mockImplementation((code?: number) => {
    throw new Error(`process.exit(${String(code)})`);
  });
});

describe('handleReleaseNotesCommand', () => {
  it('passes correct options to releaseNotesCommand', async () => {
    const args = createArgs({
      positionals: ['release-notes'],
      options: {
        ...createArgs().options,
        format: 'json',
        dryRun: true,
        verbose: true,
      },
    });

    await expect(handleReleaseNotesCommand(args)).rejects.toThrow('process.exit(0)');

    expect(releaseNotesCommand).toHaveBeenCalledWith({
      positionals: ['release-notes'],
      options: {
        format: 'json',
        dryRun: true,
        verbose: true,
      },
    });
  });

  it('calls process.exit(0) on success', async () => {
    const args = createArgs();

    await expect(handleReleaseNotesCommand(args)).rejects.toThrow('process.exit(0)');

    expect(process.exit).toHaveBeenCalledWith(EXIT_CODES.SUCCESS);
  });

  it('calls process.exit with SERVER_START_FAILED on failure', async () => {
    vi.mocked(releaseNotesCommand).mockResolvedValueOnce(1);
    const args = createArgs();

    await expect(handleReleaseNotesCommand(args)).rejects.toThrow(
      `process.exit(${String(EXIT_CODES.SERVER_START_FAILED)})`
    );

    expect(process.exit).toHaveBeenCalledWith(EXIT_CODES.SERVER_START_FAILED);
  });

  it('defaults format to changelog for unrecognized formats', async () => {
    const args = createArgs({
      positionals: ['release-notes'],
      options: {
        ...createArgs().options,
        format: 'unknown-format',
      },
    });

    await expect(handleReleaseNotesCommand(args)).rejects.toThrow('process.exit(0)');

    expect(releaseNotesCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          format: 'changelog',
        }),
      })
    );
  });

  it('accepts markdown as a valid format', async () => {
    const args = createArgs({
      positionals: ['release-notes'],
      options: {
        ...createArgs().options,
        format: 'markdown',
      },
    });

    await expect(handleReleaseNotesCommand(args)).rejects.toThrow('process.exit(0)');

    expect(releaseNotesCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          format: 'markdown',
        }),
      })
    );
  });

  it('passes from/to from positionals[1] and positionals[2]', async () => {
    const args = createArgs({
      positionals: ['release-notes', 'v1.0.0', 'v2.0.0'],
    });

    await expect(handleReleaseNotesCommand(args)).rejects.toThrow('process.exit(0)');

    expect(releaseNotesCommand).toHaveBeenCalledWith({
      positionals: ['release-notes', 'v1.0.0', 'v2.0.0'],
      options: {
        from: 'v1.0.0',
        to: 'v2.0.0',
        format: 'changelog',
        dryRun: false,
        verbose: false,
      },
    });
  });

  it('omits from/to when positionals are missing', async () => {
    const args = createArgs({
      positionals: ['release-notes'],
    });

    await expect(handleReleaseNotesCommand(args)).rejects.toThrow('process.exit(0)');

    expect(releaseNotesCommand).toHaveBeenCalledWith({
      positionals: ['release-notes'],
      options: {
        format: 'changelog',
        dryRun: false,
        verbose: false,
      },
    });
  });
});

describe('handleReleaseValidateCommand', () => {
  it('passes correct options to releaseValidateCommand', async () => {
    const args = createArgs({
      command: 'release-validate',
      positionals: ['release-validate', '2.0.0'],
      options: {
        ...createArgs().options,
        verbose: true,
        force: true,
      },
    });

    await expect(handleReleaseValidateCommand(args)).rejects.toThrow('process.exit(0)');

    expect(releaseValidateCommand).toHaveBeenCalledWith({
      positionals: ['release-validate', '2.0.0'],
      options: {
        version: '2.0.0',
        verbose: true,
        strict: true,
      },
    });
  });

  it('calls process.exit(0) on success', async () => {
    const args = createArgs({
      command: 'release-validate',
      positionals: ['release-validate'],
    });

    await expect(handleReleaseValidateCommand(args)).rejects.toThrow('process.exit(0)');

    expect(process.exit).toHaveBeenCalledWith(EXIT_CODES.SUCCESS);
  });

  it('calls process.exit with SERVER_START_FAILED on failure', async () => {
    vi.mocked(releaseValidateCommand).mockResolvedValueOnce(1);
    const args = createArgs({
      command: 'release-validate',
      positionals: ['release-validate'],
    });

    await expect(handleReleaseValidateCommand(args)).rejects.toThrow(
      `process.exit(${String(EXIT_CODES.SERVER_START_FAILED)})`
    );

    expect(process.exit).toHaveBeenCalledWith(EXIT_CODES.SERVER_START_FAILED);
  });

  it('reuses force flag as strict', async () => {
    const argsWithForce = createArgs({
      command: 'release-validate',
      positionals: ['release-validate', '1.0.0'],
      options: {
        ...createArgs().options,
        force: true,
      },
    });

    await expect(handleReleaseValidateCommand(argsWithForce)).rejects.toThrow('process.exit(0)');

    expect(releaseValidateCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          strict: true,
        }),
      })
    );
  });

  it('passes strict as false when force is false', async () => {
    const args = createArgs({
      command: 'release-validate',
      positionals: ['release-validate', '1.0.0'],
      options: {
        ...createArgs().options,
        force: false,
      },
    });

    await expect(handleReleaseValidateCommand(args)).rejects.toThrow('process.exit(0)');

    expect(releaseValidateCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          strict: false,
        }),
      })
    );
  });

  it('omits version when positional[1] is missing', async () => {
    const args = createArgs({
      command: 'release-validate',
      positionals: ['release-validate'],
    });

    await expect(handleReleaseValidateCommand(args)).rejects.toThrow('process.exit(0)');

    expect(releaseValidateCommand).toHaveBeenCalledWith({
      positionals: ['release-validate'],
      options: {
        verbose: false,
        strict: false,
      },
    });
  });
});

describe('handleReleaseAnnounceCommand', () => {
  it('passes correct options to releaseAnnounceCommand', async () => {
    const args = createArgs({
      command: 'release-announce',
      positionals: ['release-announce', '2.0.0', 'slack,discord'],
      options: {
        ...createArgs().options,
        dryRun: true,
        verbose: true,
      },
    });

    await expect(handleReleaseAnnounceCommand(args)).rejects.toThrow('process.exit(0)');

    expect(releaseAnnounceCommand).toHaveBeenCalledWith({
      positionals: ['release-announce', '2.0.0', 'slack,discord'],
      options: {
        version: '2.0.0',
        channels: 'slack,discord',
        dryRun: true,
        verbose: true,
      },
    });
  });

  it('calls process.exit(0) on success', async () => {
    const args = createArgs({
      command: 'release-announce',
      positionals: ['release-announce', '1.0.0'],
    });

    await expect(handleReleaseAnnounceCommand(args)).rejects.toThrow('process.exit(0)');

    expect(process.exit).toHaveBeenCalledWith(EXIT_CODES.SUCCESS);
  });

  it('calls process.exit with SERVER_START_FAILED on failure', async () => {
    vi.mocked(releaseAnnounceCommand).mockResolvedValueOnce(1);
    const args = createArgs({
      command: 'release-announce',
      positionals: ['release-announce', '1.0.0'],
    });

    await expect(handleReleaseAnnounceCommand(args)).rejects.toThrow(
      `process.exit(${String(EXIT_CODES.SERVER_START_FAILED)})`
    );

    expect(process.exit).toHaveBeenCalledWith(EXIT_CODES.SERVER_START_FAILED);
  });

  it('passes channels from positionals[2]', async () => {
    const args = createArgs({
      command: 'release-announce',
      positionals: ['release-announce', '1.0.0', 'email'],
    });

    await expect(handleReleaseAnnounceCommand(args)).rejects.toThrow('process.exit(0)');

    expect(releaseAnnounceCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          channels: 'email',
        }),
      })
    );
  });

  it('omits version and channels when positionals are missing', async () => {
    const args = createArgs({
      command: 'release-announce',
      positionals: ['release-announce'],
    });

    await expect(handleReleaseAnnounceCommand(args)).rejects.toThrow('process.exit(0)');

    expect(releaseAnnounceCommand).toHaveBeenCalledWith({
      positionals: ['release-announce'],
      options: {
        dryRun: false,
        verbose: false,
      },
    });
  });

  it('omits channels but includes version when only positional[1] is present', async () => {
    const args = createArgs({
      command: 'release-announce',
      positionals: ['release-announce', '3.0.0'],
    });

    await expect(handleReleaseAnnounceCommand(args)).rejects.toThrow('process.exit(0)');

    expect(releaseAnnounceCommand).toHaveBeenCalledWith({
      positionals: ['release-announce', '3.0.0'],
      options: {
        version: '3.0.0',
        dryRun: false,
        verbose: false,
      },
    });
  });
});
