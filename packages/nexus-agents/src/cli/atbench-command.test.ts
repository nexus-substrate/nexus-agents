/**
 * Tests for the atbench CLI command (#1981).
 *
 * Covers arg parsing, info subcommand, and the run pipeline against a
 * local fixture (no network, no LLM in tests).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  atbenchCommand,
  parseAtbenchArgs,
  printAtbenchHelp,
  runEvaluation,
  runInfo,
} from './atbench-command.js';
import type { ATBenchTrajectory } from '../benchmarks/atbench/types.js';

function mkTrajectory(overrides: Partial<ATBenchTrajectory> = {}): ATBenchTrajectory {
  return {
    id: 't-001',
    scenario: 'tool-injection',
    userRequest: 'do something',
    sessionTranscript: ['user: do something'],
    toolEvents: [{ tool: 'read_file' }],
    safetyLabel: 'safe',
    taxonomy: { riskSource: 'user', failureMode: 'ok', harm: 'none' },
    ...overrides,
  };
}

beforeEach(() => {
  // Silence console for tests
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseAtbenchArgs', () => {
  it('defaults to run + claw', () => {
    const opts = parseAtbenchArgs([]);
    expect(opts.subcommand).toBe('run');
    expect(opts.variant).toBe('claw');
    expect(opts.limit).toBeUndefined();
    expect(opts.llmScoring).toBe(false);
    expect(opts.verbose).toBe(false);
  });

  it('parses info subcommand', () => {
    const opts = parseAtbenchArgs(['info']);
    expect(opts.subcommand).toBe('info');
  });

  it('parses --variant=codex', () => {
    const opts = parseAtbenchArgs(['run', '--variant=codex']);
    expect(opts.variant).toBe('codex');
  });

  it('falls back to claw on unknown variant', () => {
    const opts = parseAtbenchArgs(['run', '--variant=mystery']);
    expect(opts.variant).toBe('claw');
  });

  it('parses --limit=N as a positive integer', () => {
    const opts = parseAtbenchArgs(['run', '--limit=25']);
    expect(opts.limit).toBe(25);
  });

  it('ignores invalid --limit values', () => {
    const opts = parseAtbenchArgs(['run', '--limit=abc']);
    expect(opts.limit).toBeUndefined();
  });

  it('parses --fixture=<path>', () => {
    const opts = parseAtbenchArgs(['run', '--fixture=/tmp/data.jsonl']);
    expect(opts.fixturePath).toBe('/tmp/data.jsonl');
  });

  it('parses --llm-scoring + --verbose flags', () => {
    const opts = parseAtbenchArgs(['run', '--llm-scoring', '--verbose']);
    expect(opts.llmScoring).toBe(true);
    expect(opts.verbose).toBe(true);
  });

  it('parses -v as verbose alias', () => {
    const opts = parseAtbenchArgs(['run', '-v']);
    expect(opts.verbose).toBe(true);
  });
});

describe('runInfo', () => {
  it('reports HuggingFace source by default', () => {
    const result = runInfo({
      subcommand: 'info',
      variant: 'claw',
      llmScoring: false,
      verbose: false,
    });
    expect(result.success).toBe(true);
    expect(result.message).toContain('atbench/claw');
  });

  it('reports fixture source when provided', () => {
    const result = runInfo({
      subcommand: 'info',
      variant: 'codex',
      fixturePath: '/local/file.jsonl',
      llmScoring: true,
      verbose: false,
    });
    expect(result.success).toBe(true);
  });
});

describe('runEvaluation (against local fixture)', () => {
  let dir: string;
  let fixturePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'atbench-cli-test-'));
    fixturePath = join(dir, 'fixture.jsonl');
    const lines = [
      mkTrajectory({ id: 'a', safetyLabel: 'safe' }),
      mkTrajectory({ id: 'b', safetyLabel: 'unsafe' }),
      mkTrajectory({ id: 'c', safetyLabel: 'safe' }),
    ]
      .map((t) => JSON.stringify(t))
      .join('\n');
    writeFileSync(fixturePath, lines);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports 100% pass with stub oracle scorer (matches ground truth)', async () => {
    const result = await runEvaluation({
      subcommand: 'run',
      variant: 'claw',
      fixturePath,
      llmScoring: false,
      verbose: false,
    });
    expect(result.success).toBe(true);
    const details = result.details as { total: number; passed: number; passRate: number };
    expect(details.total).toBe(3);
    expect(details.passed).toBe(3);
    expect(details.passRate).toBe(1);
  });

  it('respects --limit cap', async () => {
    const result = await runEvaluation({
      subcommand: 'run',
      variant: 'claw',
      fixturePath,
      limit: 2,
      llmScoring: false,
      verbose: false,
    });
    const details = result.details as { total: number };
    expect(details.total).toBe(2);
  });

  it('reports verbose progress without crashing', async () => {
    const result = await runEvaluation({
      subcommand: 'run',
      variant: 'claw',
      fixturePath,
      llmScoring: false,
      verbose: true,
    });
    expect(result.success).toBe(true);
  });
});

describe('atbenchCommand top-level dispatch', () => {
  it('routes info subcommand to runInfo', async () => {
    const result = await atbenchCommand({
      subcommand: 'info',
      variant: 'claw',
      llmScoring: false,
      verbose: false,
    });
    expect(result.success).toBe(true);
    expect(result.message).toContain('info');
  });

  it('routes run subcommand to runEvaluation (with fixture)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'atbench-dispatch-'));
    const fixturePath = join(dir, 'fixture.jsonl');
    writeFileSync(fixturePath, JSON.stringify(mkTrajectory()));
    try {
      const result = await atbenchCommand({
        subcommand: 'run',
        variant: 'claw',
        fixturePath,
        llmScoring: false,
        verbose: false,
      });
      expect(result.success).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('printAtbenchHelp', () => {
  it('prints help text without crashing', () => {
    expect(() => {
      printAtbenchHelp();
    }).not.toThrow();
  });
});
