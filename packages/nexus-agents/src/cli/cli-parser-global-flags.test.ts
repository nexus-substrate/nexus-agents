/**
 * Tests for global CLI parser flag forwarding and vote enum validation (#6678).
 *
 * Verifies that global CLI options consumed by `parseArgs` are preserved and
 * forwarded to command handlers, and that invalid enum/numeric values on the
 * `vote` command are refused with clear errors instead of silently defaulting.
 *
 * @module cli/cli-parser-global-flags.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCliArgs } from '../cli.js';
import { handleOrchestrateCommand } from '../cli-commands-handlers-complex.js';
import { parseValidationArgs } from './validation-dashboard-command.js';
import { parseResearchIndexArgs } from './research-index-helpers.js';
import { handleMemoryBenchmarkCommand } from './memory-benchmark-command.js';
import { sessionCommand } from './session-commands.js';

// Mock session-commands dependencies
vi.mock('./session-storage.js', () => ({
  createSessionStorage: vi.fn(() => ({
    initialize: vi.fn().mockResolvedValue({ ok: true }),
    listSessions: vi.fn().mockResolvedValue({ ok: true, value: [] }),
    getSessionWithTasks: vi.fn().mockResolvedValue({ ok: true, value: null }),
    deleteSession: vi.fn().mockResolvedValue({ ok: true, value: true }),
    prune: vi.fn().mockResolvedValue({ ok: true, value: 0 }),
    close: vi.fn(),
  })),
  SQLiteSessionStorage: vi.fn(),
}));

vi.mock('./orchestrate-command.js', () => ({
  orchestrateCommand: vi.fn().mockResolvedValue(0),
}));

vi.mock('./memory-benchmark-runner.js', () => ({
  runMemoryBenchmark: vi.fn().mockResolvedValue({
    summary: { totalTests: 10, passed: 10, failed: 0, durationMs: 100 },
    suites: [],
  }),
  createBenchmarkBackend: vi.fn(() => ({})),
  generateSyntheticTestCases: vi.fn().mockResolvedValue([]),
}));

describe('Issue #6678 - vote command refuses invalid values', () => {
  it('refuses invalid --error-policy naming allowed enum values', () => {
    expect(() =>
      parseCliArgs(['vote', '-p', 'proposal', '--error-policy', 'absolute-quorum'])
    ).toThrow(/--error-policy must be one of/);
    expect(() =>
      parseCliArgs(['vote', '-p', 'proposal', '--error-policy', 'invalid_policy'])
    ).toThrow('invalid_policy');
  });

  it('accepts valid --error-policy values', () => {
    const parsed = parseCliArgs([
      'vote',
      '-p',
      'proposal',
      '--error-policy',
      'absolute_quorum',
    ]);
    expect(parsed.options.errorPolicy).toBe('absolute_quorum');
  });

  it('refuses invalid --threshold naming allowed enum values', () => {
    expect(() =>
      parseCliArgs(['vote', '-p', 'proposal', '--threshold', 'supermajorty'])
    ).toThrow(/--threshold must be one of/);
  });

  it('accepts valid --threshold values', () => {
    const parsed = parseCliArgs(['vote', '-p', 'proposal', '--threshold', 'supermajority']);
    expect(parsed.options.threshold).toBe('supermajority');
  });

  it('refuses invalid --on-no-quorum naming allowed policies', () => {
    expect(() =>
      parseCliArgs(['vote', '-p', 'proposal', '--on-no-quorum', 'ignore'])
    ).toThrow(/--on-no-quorum must be one of/);
  });

  it('accepts valid --on-no-quorum values', () => {
    const parsed = parseCliArgs(['vote', '-p', 'proposal', '--on-no-quorum', 'exit2']);
    expect(parsed.options.onNoQuorum).toBe('exit2');
  });

  it('refuses non-positive or non-numeric --timeout', () => {
    expect(() =>
      parseCliArgs(['vote', '-p', 'proposal', '--timeout', 'invalid'])
    ).toThrow(/--timeout must be a positive number/);
    expect(() =>
      parseCliArgs(['vote', '-p', 'proposal', '--timeout=-5'])
    ).toThrow(/--timeout must be a positive number/);
    expect(() =>
      parseCliArgs(['vote', '-p', 'proposal', '--timeout', '0'])
    ).toThrow(/--timeout must be a positive number/);
  });

  it('accepts valid positive --timeout in seconds and converts to ms', () => {
    const parsed = parseCliArgs(['vote', '-p', 'proposal', '--timeout', '120']);
    expect(parsed.options.timeoutMs).toBe(120000);
  });
});

describe('Issue #6678 - orchestrate --task / -t forwarding', () => {
  it('forwards -t flag to options.task', () => {
    const parsed = parseCliArgs(['orchestrate', '-t', 'implement feature x']);
    expect(parsed.options.task).toBe('implement feature x');
  });

  it('forwards --task flag to options.task', () => {
    const parsed = parseCliArgs(['orchestrate', '--task', 'implement feature y']);
    expect(parsed.options.task).toBe('implement feature y');
  });

  it('handleOrchestrateCommand accepts task from options.task when positional is absent', async () => {
    const parsed = parseCliArgs(['orchestrate', '-t', 'task from flag']);
    const result = await handleOrchestrateCommand(parsed);
    expect(result.exitCode).toBe(0);
  });
});

describe('Issue #6678 - usage --model=<id> preserves model id', () => {
  it('preserves non-CLI model identifiers in options.model', () => {
    const parsed = parseCliArgs(['usage', '--model=claude-3-7-sonnet']);
    expect(parsed.options.model).toBe('claude-3-7-sonnet');
  });
});

describe('Issue #6678 - validation --period and --model options', () => {
  it('parses --period=7d and --model=a,b into options', () => {
    const parsed = parseCliArgs(['validation', '--period=7d', '--model=claude,gemini']);
    expect(parsed.options.period).toBe('7d');
    expect(parsed.options.model).toBe('claude,gemini');
  });

  it('parseValidationArgs extracts period and models from forwarded options', () => {
    const options = parseValidationArgs([], 'table', false, {
      period: '7d',
      model: 'claude,gemini',
    });
    expect(options['period']).toBe('7d');
    expect(options['models']).toEqual(['claude', 'gemini']);
  });
});

describe('Issue #6678 - research index flags', () => {
  it('parses research index flags into options', () => {
    const parsed = parseCliArgs([
      'research',
      'index',
      '--validate',
      '-o',
      'custom-index.md',
      '--format',
      'json',
    ]);
    expect(parsed.options.validate).toBe(true);
    expect(parsed.options.output).toBe('custom-index.md');
    expect(parsed.options.format).toBe('json');
  });

  it('parseResearchIndexArgs respects forwarded options', () => {
    const indexOpts = parseResearchIndexArgs([], {
      validate: true,
      output: 'custom.md',
      format: 'json',
    });
    expect(indexOpts.action).toBe('validate');
    expect(indexOpts.output).toBe('custom.md');
    expect(indexOpts.format).toBe('json');
  });
});

describe('Issue #6678 - memory-benchmark flags', () => {
  it('parses --validate and --quick into options', () => {
    const parsed = parseCliArgs(['memory-benchmark', '--validate', '--quick']);
    expect(parsed.options.validate).toBe(true);
    expect(parsed.options.quick).toBe(true);
  });

  it('handleMemoryBenchmarkCommand respects options.validate and options.quick', async () => {
    const quickOnly = parseCliArgs(['memory-benchmark', '--quick', '--format', 'json']);
    const quickResult = await handleMemoryBenchmarkCommand(quickOnly);
    expect(quickResult.exitCode).toBe(0);

    const withValidate = parseCliArgs([
      'memory-benchmark',
      '--validate',
      '--quick',
      '--format',
      'json',
    ]);
    const validateResult = await handleMemoryBenchmarkCommand(withValidate);
    // --validate triggers threshold check on synthetic data, failing with code 1
    expect(validateResult.exitCode).toBe(1);
  });
});

describe('Issue #6678 - session export and list flags', () => {
  let stdoutChunks: string[] = [];

  beforeEach(() => {
    stdoutChunks = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stdoutChunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
      return true;
    });
  });

  it('parses session export --output into options.output', () => {
    const parsed = parseCliArgs(['session', 'export', 's-123', '--output', 'export.json']);
    expect(parsed.options.output).toBe('export.json');
  });

  it('parses session list --json into options.json', () => {
    const parsed = parseCliArgs(['session', 'list', '--json']);
    expect(parsed.options.json).toBe(true);
  });

  it('sessionCommand forwards flags.output and flags.json/format', async () => {
    await sessionCommand('list', [], undefined, { json: true });
    const output = stdoutChunks.join('');
    expect(output).toContain('[]');
  });
});
