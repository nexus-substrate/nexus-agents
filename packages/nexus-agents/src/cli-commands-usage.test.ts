import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ParsedCliArgs } from './cli-types.js';
import { handleUsageCommand } from './cli/usage-command.js';
import {
  printIndexUsage,
  printOrchestrateUsage,
  printResearchUsage,
  printRoutingAuditUsage,
  printValidationUsage,
  printVoteUsage,
  printWorkflowRunUsage,
} from './cli-commands-usage.js';
import { getCommandHelp } from './cli-command-help.js';
import type { UsageEvent } from './learning/usage-log.js';

function makeUsageArgs(): ParsedCliArgs {
  return { positionals: ['usage'], options: {} } as unknown as ParsedCliArgs;
}

function makeUsageEvent(overrides: Partial<UsageEvent> = {}): UsageEvent {
  return {
    timestamp: new Date().toISOString(),
    modelId: 'claude-sonnet',
    providerId: 'anthropic',
    inputTokens: 100,
    outputTokens: 50,
    usdCost: 0.1,
    latencyMs: 100,
    success: true,
    priced: true,
    ...overrides,
  };
}

describe('cli-commands-usage', () => {
  let writeSpy: MockInstance;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  describe('printWorkflowRunUsage', () => {
    it('should call process.stdout.write at least once', () => {
      printWorkflowRunUsage();
      expect(writeSpy).toHaveBeenCalled();
    });

    it('should include the command name in output', () => {
      printWorkflowRunUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('workflow run');
    });

    it('should include Usage: in output', () => {
      printWorkflowRunUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Usage:');
    });
  });

  describe('printRoutingAuditUsage', () => {
    it('should call process.stdout.write at least once', () => {
      printRoutingAuditUsage();
      expect(writeSpy).toHaveBeenCalled();
    });

    it('should include the command name in output', () => {
      printRoutingAuditUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('routing-audit');
    });

    it('should include Usage: in output', () => {
      printRoutingAuditUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Usage:');
    });

    it('should include Examples: in output', () => {
      printRoutingAuditUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Examples:');
    });
  });

  describe('printOrchestrateUsage', () => {
    it('should call process.stdout.write at least once', () => {
      printOrchestrateUsage();
      expect(writeSpy).toHaveBeenCalled();
    });

    it('should include the command name in output', () => {
      printOrchestrateUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('orchestrate');
    });

    it('should include Usage: in output', () => {
      printOrchestrateUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Usage:');
    });

    it('should include Examples: in output', () => {
      printOrchestrateUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Examples:');
    });
  });

  describe('printVoteUsage', () => {
    it('should call process.stdout.write at least once', () => {
      printVoteUsage();
      expect(writeSpy).toHaveBeenCalled();
    });

    it('should include the command name in output', () => {
      printVoteUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('vote');
    });

    it('should include Usage: in output', () => {
      printVoteUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Usage:');
    });

    it('should include Examples: in output', () => {
      printVoteUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Examples:');
    });
  });

  describe('printIndexUsage', () => {
    it('should call process.stdout.write at least once', () => {
      printIndexUsage();
      expect(writeSpy).toHaveBeenCalled();
    });

    it('should include the command name in output', () => {
      printIndexUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('index');
    });

    it('should include Usage: in output', () => {
      printIndexUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Usage:');
    });

    it('should include Subcommands: in output', () => {
      printIndexUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Subcommands:');
    });
  });

  describe('printResearchUsage', () => {
    it('should call process.stdout.write at least once', () => {
      printResearchUsage();
      expect(writeSpy).toHaveBeenCalled();
    });

    it('should include the command name in output', () => {
      printResearchUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('research');
    });

    it('should include Usage: in output', () => {
      printResearchUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Usage:');
    });

    it('should include Subcommands: in output', () => {
      printResearchUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Subcommands:');
    });
  });

  describe('printValidationUsage', () => {
    it('should call process.stdout.write at least once', () => {
      printValidationUsage();
      expect(writeSpy).toHaveBeenCalled();
    });

    it('should include the command name in output', () => {
      printValidationUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('validation');
    });

    it('should include Usage: in output', () => {
      printValidationUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Usage:');
    });

    it('should include Examples: in output', () => {
      printValidationUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Examples:');
    });

    it('should include Options: in output', () => {
      printValidationUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(output).toContain('Options:');
    });
  });

  // DRIFT GUARD (#3209, epic #3691): the on-error usage examples are single-sourced
  // from COMMAND_HELP, so they can't diverge from `nexus-agents <cmd> --help`.
  describe('usage examples are single-sourced from COMMAND_HELP', () => {
    it.each([
      ['vote', printVoteUsage],
      ['orchestrate', printOrchestrateUsage],
    ] as const)('%s usage renders exactly the COMMAND_HELP examples', (command, printUsage) => {
      printUsage();
      const output = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      const examples = getCommandHelp(command)?.examples ?? [];
      expect(examples.length).toBeGreaterThan(0);
      for (const example of examples) {
        expect(output).toContain(`  ${example}\n`);
      }
    });
  });
});

describe('handleUsageCommand ledger fidelity (#5522)', () => {
  let dataDir: string;
  let previousDataDir: string | undefined;
  let logSpy: MockInstance;
  let errorSpy: MockInstance;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'usage-command-'));
    previousDataDir = process.env['NEXUS_DATA_DIR'];
    process.env['NEXUS_DATA_DIR'] = dataDir;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    if (previousDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = previousDataDir;
    rmSync(dataDir, { recursive: true, force: true });
  });

  function output(): string {
    return [...logSpy.mock.calls, ...errorSpy.mock.calls]
      .map((call: unknown[]) => String(call[0]))
      .join('\n');
  }

  function writeEvents(events: readonly UsageEvent[]): void {
    const usageDir = join(dataDir, 'usage');
    mkdirSync(usageDir, { recursive: true });
    writeFileSync(
      join(usageDir, 'usage-current.jsonl'),
      `${events.map((event) => JSON.stringify(event)).join('\n')}\n`
    );
  }

  it('returns non-zero and names the ledger when its directory cannot be read', async () => {
    writeFileSync(join(dataDir, 'usage'), 'not a directory');

    const result = await handleUsageCommand(makeUsageArgs());

    expect(result.exitCode).not.toBe(0);
    expect(output().toLowerCase()).toContain('usage ledger');
  });

  it('reports partial output when one ledger file is unreadable', async () => {
    writeEvents([makeUsageEvent()]);
    mkdirSync(join(dataDir, 'usage', 'usage-unreadable.jsonl'));

    const result = await handleUsageCommand(makeUsageArgs());

    expect(result.exitCode).not.toBe(0);
    expect(output()).toContain('partial: 1 file(s) unreadable');
    expect(output()).toContain('claude-sonnet');
  });

  it('labels model and grand-total costs when calls are unpriced', async () => {
    writeEvents([makeUsageEvent({ priced: false, usdCost: 0 })]);

    await handleUsageCommand(makeUsageArgs());

    expect(output()).toContain('≥ $0.0000 (1 unpriced)');
    expect(output()).toContain('cost / success  : ≥ $0.0000 / success');
    expect(output().match(/unpriced/g)).toHaveLength(2);
  });

  it('renders N/A when a model has no successful calls', async () => {
    writeEvents([
      makeUsageEvent({ success: false, usdCost: 0.1 }),
      makeUsageEvent({ success: false, usdCost: 0.2 }),
    ]);

    await handleUsageCommand(makeUsageArgs());

    expect(output()).toContain('N/A (no successes)');
  });
});
