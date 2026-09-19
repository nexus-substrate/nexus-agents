/**
 * CLI Command Handlers - Init / Setup Tests
 *
 * Tests for handleInitCommand, handleSetupCommand and handleSetupCommandAsync
 * in cli-commands-handlers-setup.ts (#6148).
 *
 * @module cli-commands-handlers-setup.test
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { EXIT_CODES, type ParsedCliArgs } from './cli-types.js';

vi.mock('./cli/index.js', () => ({
  setupCommand: vi.fn(() => 0),
  setupCommandAsync: vi.fn(() => Promise.resolve(0)),
}));

vi.mock('./cli/init-portable.js', () => ({
  initPortable: vi.fn(() =>
    Promise.resolve({
      success: true,
      absolutePath: '/tmp/x/.nexus-agents',
      created: [],
      alreadyExisted: [],
      skipped: false,
      gitignoreUpdated: false,
    })
  ),
  formatInitPortableMessage: vi.fn(() => 'init --portable ok\n'),
}));

vi.mock('./cli/init-opencode.js', () => ({
  runInitOpencode: vi.fn(() => ({
    path: '/tmp/opencode.json',
    action: 'created',
    diff: '+ nexus block',
  })),
  runOpencodeValidate: vi.fn(() => Promise.resolve({ ok: false, reason: 'no gateway' })),
}));

vi.mock('./cli/setup-custom-api.js', () => ({
  configureCustomApi: vi.fn(() =>
    Promise.resolve({
      ok: true,
      value: {
        baseUrl: 'https://gw.example/v1',
        model: 'm',
        probeSucceeded: true,
        shellFragment: 'export X=1\n',
      },
    })
  ),
}));

import {
  handleInitCommand,
  handleSetupCommand,
  handleSetupCommandAsync,
} from './cli-commands-handlers-setup.js';
import { setupCommand, setupCommandAsync } from './cli/index.js';
import { initPortable } from './cli/init-portable.js';
import { runInitOpencode, runOpencodeValidate } from './cli/init-opencode.js';
import { configureCustomApi } from './cli/setup-custom-api.js';

/**
 * Creates a ParsedCliArgs object with default values. Optional properties are
 * omitted (not set to undefined) to satisfy exactOptionalPropertyTypes.
 */
function createMockArgs(
  command: ParsedCliArgs['command'],
  optionOverrides: Partial<ParsedCliArgs['options']> = {},
  positionals: string[] = [command]
): ParsedCliArgs {
  return {
    command,
    positionals,
    options: {
      help: false,
      version: false,
      verbose: false,
      interactive: false,
      all: false,
      mode: 'server',
      force: false,
      format: 'table',
      dryRun: false,
      banditStats: false,
      setup: false,
      skipChecks: false,
      createIssue: false,
      fix: false,
      quick: false,
      nonInteractive: false,
      skipMcp: false,
      skipRules: false,
      skipHooks: false,
      skipConfig: false,
      skipOpencode: false,
      skipGemini: false,
      skipCodex: false,
      mock: false,
      deep: false,
      live: false,
      ...optionOverrides,
    },
  };
}

let stdoutSpy: MockInstance;
let stderrSpy: MockInstance;

beforeEach(() => {
  vi.clearAllMocks();
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

function stderrText(): string {
  return stderrSpy.mock.calls.map((c) => String(c[0])).join('');
}

function stdoutText(): string {
  return stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
}

describe('handleInitCommand flag validation', () => {
  it('rejects a bare `init` with usage and INVALID_ARGS, without touching the filesystem', async () => {
    const result = await handleInitCommand(createMockArgs('init'));

    expect(result.exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(result.success).toBe(false);
    expect(stderrText()).toContain('Usage: nexus-agents init --portable');
    expect(initPortable).not.toHaveBeenCalled();
    expect(runInitOpencode).not.toHaveBeenCalled();
  });

  it('rejects --portable together with --opencode', async () => {
    const result = await handleInitCommand(
      createMockArgs('init', { portable: true, opencode: '/tmp/opencode.json' })
    );

    expect(result.exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(stderrText()).toContain('mutually exclusive entry modes');
    expect(initPortable).not.toHaveBeenCalled();
    expect(runInitOpencode).not.toHaveBeenCalled();
  });

  it('rejects --install together with --uninstall', async () => {
    const result = await handleInitCommand(
      createMockArgs('init', { portable: true, install: true, uninstall: true })
    );

    expect(result.exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(stderrText()).toContain('--install and --uninstall are mutually exclusive');
    expect(initPortable).not.toHaveBeenCalled();
  });
});

describe('handleInitCommand --portable', () => {
  it('forwards the positional path and flags to initPortable and maps success to SUCCESS', async () => {
    const result = await handleInitCommand(
      createMockArgs('init', { portable: true, gitignore: true, install: true }, [
        'init',
        './workspace',
      ])
    );

    expect(initPortable).toHaveBeenCalledWith({
      path: './workspace',
      force: false,
      dryRun: false,
      gitignore: true,
      mcpConfig: false,
      install: true,
      uninstall: false,
    });
    expect(stdoutText()).toContain('init --portable ok');
    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
  });

  it('omits the path key when no positional is given', async () => {
    await handleInitCommand(createMockArgs('init', { portable: true }));

    const call = vi.mocked(initPortable).mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(call).not.toHaveProperty('path');
  });

  it('maps an initPortable failure to SERVER_START_FAILED', async () => {
    vi.mocked(initPortable).mockResolvedValueOnce({
      success: false,
      absolutePath: '/tmp/x',
      created: [],
      alreadyExisted: [],
      skipped: false,
      gitignoreUpdated: false,
      error: 'EACCES',
    });

    const result = await handleInitCommand(createMockArgs('init', { portable: true }));

    expect(result.exitCode).toBe(EXIT_CODES.SERVER_START_FAILED);
    expect(result.success).toBe(false);
  });
});

describe('handleInitCommand --opencode', () => {
  it('runs the opencode merge, prints the action and diff, and exits SUCCESS', async () => {
    const result = await handleInitCommand(
      createMockArgs('init', { opencode: '/tmp/opencode.json' })
    );

    expect(runInitOpencode).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/tmp/opencode.json', dryRun: false })
    );
    expect(stdoutText()).toContain('init --opencode created /tmp/opencode.json');
    expect(stdoutText()).toContain('+ nexus block');
    expect(runOpencodeValidate).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
  });

  it('suppresses the diff when the file is unchanged and not a dry run', async () => {
    vi.mocked(runInitOpencode).mockReturnValueOnce({
      path: '/tmp/opencode.json',
      action: 'unchanged',
      diff: 'SHOULD-NOT-PRINT',
    });

    await handleInitCommand(createMockArgs('init', { opencode: '/tmp/opencode.json' }));

    expect(stdoutText()).toContain('init --opencode unchanged');
    expect(stdoutText()).not.toContain('SHOULD-NOT-PRINT');
  });

  it('--validate renders the failure reason and returns exit 1', async () => {
    const result = await handleInitCommand(
      createMockArgs('init', { opencode: '/tmp/opencode.json', validate: true })
    );

    expect(runOpencodeValidate).toHaveBeenCalledWith('/tmp/opencode.json');
    expect(stderrText()).toContain('init --opencode --validate: no gateway');
    expect(result.exitCode).toBe(1);
  });

  it('--validate lists discovered models and returns exit 0', async () => {
    vi.mocked(runOpencodeValidate).mockResolvedValueOnce({
      ok: true,
      baseURL: 'https://gw.example/v1',
      models: ['alpha', 'beta'],
    });

    const result = await handleInitCommand(
      createMockArgs('init', { opencode: '/tmp/opencode.json', validate: true })
    );

    expect(stdoutText()).toContain('2 model(s) discovered at https://gw.example/v1');
    expect(stdoutText()).toContain('  - alpha\n');
    expect(stdoutText()).toContain('  - beta\n');
    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
  });
});

describe('handleSetupCommand (sync)', () => {
  it('forwards the skip flags and defaults scope to user', () => {
    const result = handleSetupCommand(createMockArgs('setup', { skipMcp: true, verbose: true }));

    expect(setupCommand).toHaveBeenCalledWith(
      expect.objectContaining({ skipMcp: true, verbose: true, scope: 'user' })
    );
    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
  });

  it('passes scope project through and maps a non-zero status to SERVER_START_FAILED', () => {
    vi.mocked(setupCommand).mockReturnValueOnce(2);

    const result = handleSetupCommand(createMockArgs('setup', { scope: 'project' }));

    expect(setupCommand).toHaveBeenCalledWith(expect.objectContaining({ scope: 'project' }));
    expect(result.exitCode).toBe(EXIT_CODES.SERVER_START_FAILED);
    expect(result.success).toBe(false);
  });
});

describe('handleSetupCommandAsync', () => {
  it('forwards interactive and scope to setupCommandAsync and maps status 0 to SUCCESS', async () => {
    const result = await handleSetupCommandAsync(
      createMockArgs('setup', { interactive: true, scope: 'project' })
    );

    expect(setupCommandAsync).toHaveBeenCalledWith(
      expect.objectContaining({ interactive: true, scope: 'project' })
    );
    expect(configureCustomApi).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
  });

  it('maps a non-zero wizard status to SERVER_START_FAILED', async () => {
    vi.mocked(setupCommandAsync).mockResolvedValueOnce(1);

    const result = await handleSetupCommandAsync(createMockArgs('setup'));

    expect(result.exitCode).toBe(EXIT_CODES.SERVER_START_FAILED);
  });

  describe('--custom-api short-circuit (#2124)', () => {
    it('configures the gateway instead of running the wizard, and prints the shell fragment', async () => {
      const result = await handleSetupCommandAsync(
        createMockArgs('setup', {
          customApi: 'https://gw.example/v1',
          customApiKey: 'k',
          customModel: 'm',
          nonInteractive: true,
        })
      );

      expect(configureCustomApi).toHaveBeenCalledWith({
        baseUrl: 'https://gw.example/v1',
        nonInteractive: true,
        apiKey: 'k',
        model: 'm',
      });
      expect(setupCommandAsync).not.toHaveBeenCalled();
      // Previously pinned the full URL; host only since #4392 inc 3 (a base
      // URL can carry userinfo, and the fragment below carries it anyway).
      expect(stdoutText()).toContain('Gateway validated: gw.example');
      expect(stdoutText()).not.toContain('Gateway validated: https://');
      expect(stdoutText()).toContain('Probe succeeded');
      expect(stdoutText()).toContain('export X=1');
      expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    });

    it('prints the host, never userinfo, on the validated line (#4392 inc 3 review)', async () => {
      vi.mocked(configureCustomApi).mockResolvedValueOnce({
        ok: true,
        value: {
          baseUrl: 'https://u:ZQ9pw@gw.example/v1',
          model: 'm',
          probeSucceeded: true,
          shellFragment: 'export NEXUS_OPENAI_COMPAT_URL="https://u:ZQ9pw@gw.example/v1"\n',
        },
      });

      await handleSetupCommandAsync(
        createMockArgs('setup', {
          customApi: 'https://u:ZQ9pw@gw.example/v1',
          nonInteractive: true,
        })
      );

      const validated = stdoutText()
        .split('\n')
        .find((line) => line.includes('Gateway validated'));
      expect(validated).toBeDefined();
      expect(validated).toContain('gw.example');
      expect(validated).not.toContain('ZQ9pw');
    });

    it('omits apiKey and model keys when those flags are absent', async () => {
      await handleSetupCommandAsync(createMockArgs('setup', { customApi: 'https://gw.example' }));

      const input = vi.mocked(configureCustomApi).mock.calls[0]?.[0];
      expect(input).toBeDefined();
      expect(input).not.toHaveProperty('apiKey');
      expect(input).not.toHaveProperty('model');
    });

    it('reports a gateway error on stderr and returns SERVER_START_FAILED', async () => {
      vi.mocked(configureCustomApi).mockResolvedValueOnce({
        ok: false,
        error: new Error('bad url'),
      });

      const result = await handleSetupCommandAsync(
        createMockArgs('setup', { customApi: 'https://gw.example' })
      );

      expect(stderrText()).toContain('✗ bad url');
      expect(result.exitCode).toBe(EXIT_CODES.SERVER_START_FAILED);
      expect(result.success).toBe(false);
    });
  });
});
