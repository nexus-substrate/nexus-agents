/** Regression tests for command-specific registry timeout defaults (#7151). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatchCommand } = vi.hoisted(() => ({ dispatchCommand: vi.fn() }));

vi.mock('./cli-commands.js', () => ({
  dispatchCommand,
  printHelp: vi.fn(),
  printVersion: vi.fn(),
}));
vi.mock('./cli-direct-run.js', () => ({ isDirectRun: () => true }));

describe('CLI registry timeout defaults', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetModules();
    dispatchCommand.mockReset();
  });

  afterEach(async () => {
    process.argv = originalArgv;
    const { resetGlobalRegistry } = await import('./adapters/unified-registry.js');
    resetGlobalRegistry();
    vi.restoreAllMocks();
  });

  it.each(['review', 'orchestrate'])('%s retains per-complexity CLI timeouts', async (command) => {
    process.argv = [process.execPath, '/nexus/cli.ts', command];
    const adapters = await import('./adapters/resilient-adapter.js');
    const created = vi.spyOn(adapters, 'createResilientAdapter');
    const { getGlobalRegistry } = await import('./adapters/unified-registry.js');
    dispatchCommand.mockImplementation(() => {
      getGlobalRegistry().getAdapterForCli('codex');
      return Promise.resolve();
    });

    await import('./cli.js');

    expect(dispatchCommand).toHaveBeenCalledOnce();
    expect(created).toHaveBeenCalledOnce();
    expect(created.mock.calls[0]?.[0]).not.toHaveProperty('defaultCliTimeoutMs');
  });
});
