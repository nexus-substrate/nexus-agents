/**
 * Tests for `nexus-agents model-drift` (#6625). Sources and `gh` are faked.
 */
import { describe, expect, it, vi } from 'vitest';

import type { CliExitResult, ParsedCliArgs } from '../cli-types.js';
import { parseCliArgs } from '../cli.js';
import type { DriftSource } from '../config/model-drift.js';
import { handleModelDriftCommand } from './model-drift-command.js';

const REGISTRY = [{ id: 'claude-sonnet', cliModelName: 'claude-sonnet-4-6' }];
const NOW_MS = Date.UTC(2026, 8, 23);

function args(flags: { json?: boolean; fileIssue?: boolean } = {}): ParsedCliArgs {
  return {
    command: 'model-drift',
    positionals: ['model-drift'],
    options: { ...flags } as unknown as ParsedCliArgs['options'],
  };
}

const listing: DriftSource = {
  name: 'vendor-a',
  probe: () =>
    Promise.resolve({
      status: 'measured',
      models: [{ id: 'claude-sonnet-4-6' }, { id: 'claude-opus-4-9' }],
    }),
};

const noCredentials: DriftSource = {
  name: 'vendor-b',
  probe: () => Promise.resolve({ status: 'unmeasured', reason: 'no credentials' }),
};

interface RunHandle {
  readonly result: Promise<CliExitResult>;
  readonly output: () => string;
  readonly fileIssue: ReturnType<typeof vi.fn>;
}

function run(
  flags: { json?: boolean; fileIssue?: boolean },
  sources: readonly DriftSource[]
): RunHandle {
  let out = '';
  const fileIssue = vi.fn(() =>
    Promise.resolve({ ok: true as const, url: 'https://example.invalid/1' })
  );
  const result = handleModelDriftCommand(args(flags), {
    sources,
    registry: REGISTRY,
    nowMs: NOW_MS,
    write: (t) => {
      out += t;
    },
    issueDeps: {
      ghAvailable: () => Promise.resolve(true),
      listOpenIssueTitles: () => Promise.resolve([]),
      fileIssue,
    },
  });
  return { result, output: () => out, fileIssue };
}

describe('handleModelDriftCommand', () => {
  it('prints the report as JSON with --json', async () => {
    const r = run({ json: true }, [listing]);
    const exit = await r.result;
    const parsed = JSON.parse(r.output()) as { verdict: string; newModels: unknown[] };

    expect(exit.exitCode).toBe(0);
    expect(parsed.verdict).toBe('drift');
    expect(parsed.newModels).toHaveLength(1);
  });

  it('does not file an issue unless --file-issue is passed', async () => {
    const r = run({ json: true }, [listing]);
    await r.result;
    expect(r.fileIssue).not.toHaveBeenCalled();
  });

  it('files an issue with --file-issue', async () => {
    const r = run({ json: true, fileIssue: true }, [listing]);
    await r.result;
    expect(r.fileIssue).toHaveBeenCalledTimes(1);
    expect((JSON.parse(r.output()) as { issues: { status: string } }).issues.status).toBe('ran');
  });

  it('exits non-zero and says so when no source was measured', async () => {
    const r = run({}, [noCredentials]);
    const exit = await r.result;

    expect(exit.exitCode).not.toBe(0);
    expect(r.output()).toContain('UNMEASURED');
    expect(r.output()).toContain('not "up to date"');
  });

  it('parses --file-issue from the command line', () => {
    const parsed = parseCliArgs(['model-drift', '--json', '--file-issue']);
    expect(parsed.command).toBe('model-drift');
    expect(parsed.options.fileIssue).toBe(true);
    expect(parsed.options.json).toBe(true);
  });
});
