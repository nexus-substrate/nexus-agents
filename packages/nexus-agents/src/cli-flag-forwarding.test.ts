/**
 * Flags the CLI parser consumed and the handlers never read (#6678).
 *
 * The parser is strict and uses one global option set, so a flag with a
 * global spelling is consumed into `options` and never reaches the
 * positionals. Handlers that re-parsed the positionals (or read a key the
 * parser never set) accepted the flag and did nothing. Every case here runs
 * the argv through the REAL `parseCliArgs` and the real handler, and asserts
 * the effect the flag exists for: the file is written, JSON is emitted, the
 * filter is applied, or the invalid value is refused. Only storage and
 * process-spawning boundaries are replaced.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

const storage = vi.hoisted(() => ({
  initialize: vi.fn(),
  listSessions: vi.fn(),
  getSessionWithTasks: vi.fn(),
  close: vi.fn(),
}));

vi.mock('./cli/session-storage.js', () => ({
  createSessionStorage: () => storage,
  SQLiteSessionStorage: vi.fn(),
}));

const orchestrate = vi.hoisted(() => ({ orchestrateCommand: vi.fn() }));
vi.mock('./cli/orchestrate-command.js', () => orchestrate);

const benchmark = vi.hoisted(() => ({
  runMemoryBenchmark: vi.fn(),
  generateSyntheticTestCases: vi.fn(),
  formatBenchmarkResult: vi.fn(),
  validateBenchmarkResults: vi.fn(),
}));
vi.mock('./testing/memory-benchmark.js', () => benchmark);

import { parseCliArgs } from './cli.js';
import {
  handleResearchCommand,
  handleSessionCommand,
  handleValidationCommand,
} from './cli-commands-handlers.js';
import { handleOrchestrateCommand } from './cli-commands-handlers-complex.js';
import { handleUsageCommand } from './cli/usage-command.js';
import { handleMemoryBenchmarkCommand } from './cli/memory-benchmark-command.js';
import { recordUsageEvent } from './learning/usage-log.js';
import { ValidationDashboard } from './observability/validation-dashboard.js';
import { EXIT_CODES } from './cli-types.js';

const SESSION = {
  id: 'sess-6678',
  status: 'completed',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  metadata: {},
  tasks: [],
};

let dir: string;
let stdout: string[];
let stderr: string[];
let outSpy: MockInstance | undefined;
let errSpy: MockInstance | undefined;
let logSpy: MockInstance | undefined;
let savedDataDir: string | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cli-flags-6678-'));
  savedDataDir = process.env['NEXUS_DATA_DIR'];
  process.env['NEXUS_DATA_DIR'] = dir;
  storage.initialize.mockReset().mockResolvedValue({ ok: true, value: undefined });
  storage.listSessions.mockReset().mockResolvedValue({ ok: true, value: [SESSION] });
  storage.getSessionWithTasks.mockReset().mockResolvedValue({ ok: true, value: SESSION });
  storage.close.mockReset();
  orchestrate.orchestrateCommand.mockReset().mockResolvedValue(0);
  stdout = [];
  stderr = [];
  outSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  });
  errSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  });
  logSpy = vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => {
    stdout.push(`${parts.map(String).join(' ')}\n`);
  });
  vi.spyOn(console, 'error').mockImplementation((...parts: unknown[]) => {
    stderr.push(`${parts.map(String).join(' ')}\n`);
  });
});

afterEach(() => {
  outSpy?.mockRestore();
  errSpy?.mockRestore();
  logSpy?.mockRestore();
  vi.restoreAllMocks();
  if (savedDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
  else process.env['NEXUS_DATA_DIR'] = savedDataDir;
  rmSync(dir, { recursive: true, force: true });
});

describe('session (#6678)', () => {
  it('export --output writes the file instead of printing the session', async () => {
    const file = join(dir, 'session.json');
    await handleSessionCommand(parseCliArgs(['session', 'export', SESSION.id, '--output', file]));

    expect(JSON.parse(readFileSync(file, 'utf-8'))).toMatchObject({ id: SESSION.id });
    expect(stdout.join('')).toContain(`Exported to ${file}`);
  });

  it.each([['--json'], ['--format', 'json']])(
    'list %s emits JSON, not a table',
    async (...flag) => {
      await handleSessionCommand(parseCliArgs(['session', 'list', ...flag]));

      expect(JSON.parse(stdout.join(''))).toEqual([SESSION]);
    }
  );

  it('show --json emits JSON, not the text view', async () => {
    await handleSessionCommand(parseCliArgs(['session', 'show', SESSION.id, '--json']));

    expect(JSON.parse(stdout.join(''))).toMatchObject({ id: SESSION.id });
  });
});

describe('orchestrate -t/--task (#6678)', () => {
  it('runs the help example `orchestrate -t "..."` instead of printing usage', async () => {
    const result = await handleOrchestrateCommand(parseCliArgs(['orchestrate', '-t', 'do X']));

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(orchestrate.orchestrateCommand).toHaveBeenCalledWith(
      expect.objectContaining({ task: 'do X' })
    );
  });

  it('refuses a task given both as an argument and with --task', async () => {
    const result = await handleOrchestrateCommand(
      parseCliArgs(['orchestrate', 'do Y', '--task', 'do X'])
    );

    expect(result.exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(orchestrate.orchestrateCommand).not.toHaveBeenCalled();
  });
});

describe('validation --period/--model (#6678)', () => {
  it('applies both filters', () => {
    const getSummary = vi.spyOn(ValidationDashboard.prototype, 'getSummary');

    const result = handleValidationCommand(
      parseCliArgs(['validation', '--period=7d', '--model=a,b', '--format=json'])
    );

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(getSummary).toHaveBeenCalledWith({ period: '7d', models: ['a', 'b'] });
    expect(JSON.parse(stdout.join(''))).toMatchObject({ period: '7d' });
  });

  it('refuses an invalid period rather than showing everything', () => {
    const getSummary = vi.spyOn(ValidationDashboard.prototype, 'getSummary');

    const result = handleValidationCommand(parseCliArgs(['validation', '--period=7days']));

    expect(result.exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(stderr.join('')).toContain('--period must be one of');
    expect(getSummary).not.toHaveBeenCalled();
  });
});

describe('research index flags (#6678)', () => {
  beforeEach(() => {
    const registry = join(dir, 'docs', 'research', 'registry');
    mkdirSync(registry, { recursive: true });
    writeFileSync(join(registry, 'papers.yaml'), 'schema_version: "1.0"\npapers: {}\n');
    writeFileSync(join(registry, 'techniques.yaml'), 'schema_version: "1.0"\ntechniques: {}\n');
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
  });

  it('--generate -o writes the index to the given path', async () => {
    const out = join(dir, 'custom-index.md');
    const result = await handleResearchCommand(
      parseCliArgs(['research', 'index', '--generate', '-o', out])
    );

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(existsSync(out)).toBe(true);
    expect(existsSync(join(dir, 'docs', 'research', 'RESEARCH_INDEX.md'))).toBe(false);
  });

  it('--validate --format json emits the validation result as JSON', async () => {
    const result = await handleResearchCommand(
      parseCliArgs(['research', 'index', '--validate', '--format', 'json'])
    );

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(JSON.parse(stdout.join(''))).toMatchObject({ valid: true });
  });

  it('refuses an argument it does not know', async () => {
    const result = await handleResearchCommand(parseCliArgs(['research', 'index', '--genrate']));

    expect(result.exitCode).not.toBe(EXIT_CODES.SUCCESS);
    expect(stdout.join('')).toContain("Unknown research index argument '--genrate'");
  });
});

describe('memory-benchmark --validate/--quick (#6678)', () => {
  it('runs the quick benchmark and validates it against the thresholds', async () => {
    benchmark.generateSyntheticTestCases.mockResolvedValue([]);
    benchmark.runMemoryBenchmark.mockResolvedValue({});
    benchmark.formatBenchmarkResult.mockReturnValue('results');
    benchmark.validateBenchmarkResults.mockReturnValue({ pass: false, failures: ['recall'] });

    const result = await handleMemoryBenchmarkCommand(
      parseCliArgs(['memory-benchmark', '--validate', '--quick'])
    );

    expect(benchmark.generateSyntheticTestCases).toHaveBeenCalledWith(expect.anything(), 20);
    expect(stdout.join('')).toContain('Mode: quick');
    expect(stdout.join('')).toContain('Threshold validation failed');
    expect(result.exitCode).toBe(EXIT_CODES.SERVER_START_FAILED);
  });
});

describe('usage --model (#6678)', () => {
  const now = new Date().toISOString();
  const event = (modelId: string): Parameters<typeof recordUsageEvent>[0] => ({
    timestamp: now,
    modelId,
    providerId: 'test',
    inputTokens: 1,
    outputTokens: 1,
    usdCost: 0,
    latencyMs: 1,
    success: true,
  });

  it('filters the report to a real model id', async () => {
    recordUsageEvent(event('claude-opus'));
    recordUsageEvent(event('gpt-5.5'));

    const result = await handleUsageCommand(
      parseCliArgs(['usage', '--model', 'claude-opus', '--format', 'json'])
    );

    expect(result.exitCode).toBe(EXIT_CODES.SUCCESS);
    const report = JSON.parse(stdout.join('')) as { rollups: { modelId: string }[] };
    expect(report.rollups.map((r) => r.modelId)).toEqual(['claude-opus']);
  });

  it('refuses a model id the registry does not know', async () => {
    recordUsageEvent(event('claude-opus'));

    const result = await handleUsageCommand(parseCliArgs(['usage', '--model', 'no-such-model-xq']));

    expect(result.exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(stderr.join('')).toContain("--model 'no-such-model-xq'");
    expect(stdout.join('')).toBe('');
  });
});
