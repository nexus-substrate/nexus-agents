/** Canonical spawn-boundary security contract; every child/OS operation is offline. */
import { EventEmitter } from 'node:events';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubprocessCliAdapter, type CommandConfig } from './subprocess-adapter.js';
import type { CliTask, ModelInfo } from './types.js';
import { getDefaultCliCircuitBreakerRegistry } from './cli-circuit-breaker.js';

vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawn: vi.fn(),
}));
vi.mock('./process-tree-kill.js', async (original) => ({
  ...(await original<typeof import('./process-tree-kill.js')>()),
  trackProcessTree: (child: unknown) => child,
  terminateProcessTree: vi.fn().mockResolvedValue([]),
}));

class ArgvSecurityAdapter extends SubprocessCliAdapter {
  readonly name = 'claude';
  protected override readonly transientRetry = { enabled: false };
  protected readonly parser = {
    name: 'offline-argv-security',
    supportedVersionRange: '*',
    parse: (raw: string) => raw,
    extractResponse: (raw: string) => raw,
    extractUsage: () => null,
    extractSessionId: () => null,
  };

  protected getCommand(task: CliTask): CommandConfig {
    return { command: 'offline-cli', args: ['--prompt', task.content] };
  }

  getModelInfo(): ModelInfo {
    return { id: 'offline-fixture', name: 'Offline fixture', contextWindow: 1000 };
  }
}

const mockSpawn = vi.mocked(spawn);
const breaker = getDefaultCliCircuitBreakerRegistry().getArmBreaker('claude');

beforeEach(() => {
  breaker.reset();
  mockSpawn.mockReset().mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), {
      pid: undefined,
      exitCode: null,
      signalCode: null,
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: vi.fn(),
    });
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from('offline response'));
      child.emit('close', 0);
    });
    return child as unknown as ChildProcessWithoutNullStreams;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  breaker.reset();
});

describe('canonical subprocess argv isolation (#1101)', () => {
  // This replaces the inline-spawn source regex: materialization may move without
  // changing the security contract. Nothing in these strings reaches a real shell.
  it.each([false, true])(
    'wrapper=%s keeps command separate and metacharacters literal',
    async (wrapped) => {
      const literal = 'literal; value $(NOT_EXECUTED) `NOT_EXECUTED` | & > *\nnext line';
      const adapter = new ArgvSecurityAdapter();
      const result = await adapter.execute(
        {
          content: literal,
          ...(wrapped
            ? {
                wrapper: (command, args, options) => ({
                  command: 'offline-wrapper',
                  args: ['--wrapped-command', command, ...args],
                  options,
                }),
              }
            : {}),
        },
        { allowRetry: false }
      );

      expect(result.ok).toBe(true);
      expect(mockSpawn).toHaveBeenCalledTimes(1);
      const [command, argv, options] = mockSpawn.mock.calls[0] ?? [];
      expect(command).toBe(wrapped ? 'offline-wrapper' : 'offline-cli');
      expect(Array.isArray(argv)).toBe(true);
      expect(argv).toEqual(
        wrapped ? ['--wrapped-command', 'offline-cli', '--prompt', literal] : ['--prompt', literal]
      );
      expect([undefined, false]).toContain(options?.shell);
    }
  );
});
