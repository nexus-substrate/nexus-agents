/**
 * nexus-agents/cli - Capabilities Command Tests
 * (Source: Issue #697 - Add test coverage for untested CLI commands)
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import type { ParsedCliArgs } from '../cli-types.js';

describe('handleCapabilitiesCommand', () => {
  let stdoutSpy: MockInstance;
  let exitSpy: MockInstance;

  function makeArgs(positionals: string[], options: Record<string, string> = {}): ParsedCliArgs {
    return {
      positionals,
      options,
    } as unknown as ParsedCliArgs;
  }

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('should show usage when no subcommand is provided', async () => {
    const { handleCapabilitiesCommand } = await import('./capabilities-command.js');

    expect(() => {
      handleCapabilitiesCommand(makeArgs(['capabilities']));
    }).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(0);
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(output).toContain('capabilities');
    expect(output).toContain('SUBCOMMANDS');
  });

  it('should show usage and exit with error for invalid subcommand', async () => {
    const { handleCapabilitiesCommand } = await import('./capabilities-command.js');

    expect(() => {
      handleCapabilitiesCommand(makeArgs(['capabilities', 'invalid']));
    }).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(3); // EXIT_CODES.INVALID_ARGS = 3
  });

  it('should list models with table format (default)', async () => {
    const { handleCapabilitiesCommand } = await import('./capabilities-command.js');

    handleCapabilitiesCommand(makeArgs(['capabilities', 'list']));

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(output).toContain('Model Capabilities Matrix');
    expect(output).toContain('Provider');
  });

  it('should list models with json format', async () => {
    const { handleCapabilitiesCommand } = await import('./capabilities-command.js');

    handleCapabilitiesCommand(makeArgs(['capabilities', 'list'], { format: 'json' }));

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    const parsed = JSON.parse(output) as { models: unknown[] };
    expect(parsed.models).toBeDefined();
    expect(Array.isArray(parsed.models)).toBe(true);
  });

  it('should list models with markdown format', async () => {
    const { handleCapabilitiesCommand } = await import('./capabilities-command.js');

    handleCapabilitiesCommand(makeArgs(['capabilities', 'list'], { format: 'markdown' }));

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(output).toContain('# Model Capabilities Matrix');
    expect(output).toContain('|');
  });

  it('should require two models for compare subcommand', async () => {
    const { handleCapabilitiesCommand } = await import('./capabilities-command.js');

    expect(() => {
      handleCapabilitiesCommand(makeArgs(['capabilities', 'compare']));
    }).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalled();
  });

  it('should require a capability for find subcommand', async () => {
    const { handleCapabilitiesCommand } = await import('./capabilities-command.js');

    expect(() => {
      handleCapabilitiesCommand(makeArgs(['capabilities', 'find']));
    }).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalled();
  });

  it('should find models by capability', async () => {
    const { handleCapabilitiesCommand } = await import('./capabilities-command.js');

    handleCapabilitiesCommand(makeArgs(['capabilities', 'find', 'mcp']));

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(output).toContain('Models supporting');
    expect(output).toContain('mcp');
  });

  it('should show message when no models found for capability', async () => {
    const { handleCapabilitiesCommand } = await import('./capabilities-command.js');

    handleCapabilitiesCommand(makeArgs(['capabilities', 'find', 'nonexistent_capability']));

    const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(output).toContain('No models found');
  });
});
