/**
 * nexus-agents/cli - Capabilities Command Tests
 * (Source: Issue #697 - Add test coverage for untested CLI commands)
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import type { ParsedCliArgs } from '../cli-types.js';

describe('handleCapabilitiesCommand', () => {
  let stdoutSpy: MockInstance;

  function makeArgs(positionals: string[], options: Record<string, string> = {}): ParsedCliArgs {
    return {
      positionals,
      options,
    } as unknown as ParsedCliArgs;
  }

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  // #3942: the handler RETURNS a CliExitResult instead of calling process.exit;
  // the dispatcher owns the exit. Assert the returned exitCode.
  it('should show usage and return SUCCESS when no subcommand is provided', async () => {
    const { handleCapabilitiesCommand } = await import('./capabilities-command.js');

    const result = handleCapabilitiesCommand(makeArgs(['capabilities']));
    expect(result).toEqual({ success: true, exitCode: 0 });
    const output = stdoutSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('');
    expect(output).toContain('capabilities');
    expect(output).toContain('SUBCOMMANDS');
  });

  it('should show usage and return INVALID_ARGS for invalid subcommand', async () => {
    const { handleCapabilitiesCommand } = await import('./capabilities-command.js');

    const result = handleCapabilitiesCommand(makeArgs(['capabilities', 'invalid']));
    expect(result).toEqual({ success: false, exitCode: 3 }); // EXIT_CODES.INVALID_ARGS = 3
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

    const result = handleCapabilitiesCommand(makeArgs(['capabilities', 'compare']));
    expect(result).toEqual({ success: false, exitCode: 3 });
  });

  it('should require a capability for find subcommand', async () => {
    const { handleCapabilitiesCommand } = await import('./capabilities-command.js');

    const result = handleCapabilitiesCommand(makeArgs(['capabilities', 'find']));
    expect(result).toEqual({ success: false, exitCode: 3 });
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
