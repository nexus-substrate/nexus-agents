/** Subprocess stdout observations retained for late-settlement measurement (#6851). */
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAbortObservation, recordAbortObservation } from '../adapters/abort-observation.js';
import { SubprocessCliAdapter } from './subprocess-adapter.js';
import type { CliTask, ICliResponseParser } from './types.js';
import type { CommandConfig } from './subprocess-adapter.js';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: vi.fn(),
}));
vi.mock('./process-tree-kill.js', () => ({
  SIGKILL_GRACE_MS: 2000,
  trackProcessTree: (child: ChildProcess): ChildProcess => child,
  terminateProcessTree: vi.fn().mockResolvedValue(undefined),
}));
import { spawn } from 'node:child_process';

class ObservationAdapter extends SubprocessCliAdapter {
  readonly name = 'claude' as const;
  readonly version = '1.0.0';
  protected override readonly transientRetry = { enabled: false };
  protected readonly parser: ICliResponseParser = {
    name: 'observation-test',
    supportedVersionRange: '*',
    parse: (raw: string): string => raw,
    extractResponse: (raw: string): string | null => raw.trim() || null,
    extractUsage: (): null => null,
    extractSessionId: (): null => null,
  };
  protected getCommand(_task: CliTask): CommandConfig {
    return { command: 'fake-cli', args: [] };
  }
  getModelInfo(): ReturnType<SubprocessCliAdapter['getModelInfo']> {
    return {
      id: 'test-model',
      name: 'Test model',
      contextWindow: 100000,
      maxOutput: 10000,
      costPerMillionInput: 1,
      costPerMillionOutput: 2,
    };
  }
}

function makeChild(): { child: ChildProcess; stdout: Readable } {
  const stdout = new Readable({ read() {} });
  const child = Object.assign(new EventEmitter(), {
    stdin: new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    }),
    stdout,
    stderr: new Readable({ read() {} }),
    kill: vi.fn(),
    pid: 1234,
    exitCode: null,
    signalCode: null,
  }) as unknown as ChildProcess;
  return { child, stdout };
}

describe('subprocess abort stdout observation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    { text: 'é🙂', stdoutBytes: 6, sawFirstByte: true },
    { text: '', stdoutBytes: 0, sawFirstByte: false },
  ])('snapshots bytes before the kill: $stdoutBytes', async (sample) => {
    const reason = new DOMException('overall consensus deadline exceeded', 'TimeoutError');
    const controller = new AbortController();
    const { child, stdout } = makeChild();
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => {
        if (sample.text !== '') stdout.emit('data', Buffer.from(sample.text));
        controller.abort(reason);
        child.emit('close', null);
      });
      return child;
    });

    const result = await new ObservationAdapter().execute(
      { content: 'vote' },
      { signal: controller.signal }
    );

    expect(result.ok).toBe(false);
    expect(getAbortObservation(reason)).toEqual({
      stdoutBytes: sample.stdoutBytes,
      sawFirstByte: sample.sawFirstByte,
    });
  });

  it('does not record an unrelated cancellation', async () => {
    const reason = new DOMException('operator cancel', 'AbortError');
    const controller = new AbortController();
    const { child, stdout } = makeChild();
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => {
        stdout.emit('data', Buffer.from('started'));
        controller.abort(reason);
        child.emit('close', null);
      });
      return child;
    });
    await new ObservationAdapter().execute({ content: 'vote' }, { signal: controller.signal });
    expect(getAbortObservation(reason)).toBeUndefined();
  });

  it('counts all received stdout bytes after the capture buffer stops growing', async () => {
    const reason = new DOMException('overall consensus deadline exceeded', 'TimeoutError');
    const controller = new AbortController();
    const { child, stdout } = makeChild();
    const oversized = Buffer.alloc(11 * 1024 * 1024, 'x');
    const trailing = Buffer.from('é🙂');
    vi.mocked(spawn).mockImplementation(() => {
      queueMicrotask(() => {
        stdout.emit('data', oversized);
        stdout.emit('data', trailing);
        controller.abort(reason);
        child.emit('close', null);
      });
      return child;
    });
    await new ObservationAdapter().execute({ content: 'vote' }, { signal: controller.signal });
    expect(getAbortObservation(reason)).toEqual({
      stdoutBytes: oversized.length + trailing.length,
      sawFirstByte: true,
    });
  });

  it('names missing reason and unobserved deadline as absent', () => {
    const reason = new DOMException('deadline', 'TimeoutError');
    expect(getAbortObservation(reason)).toBeUndefined();
    recordAbortObservation(undefined, { stdoutBytes: 0, sawFirstByte: false });
    expect(getAbortObservation(undefined)).toBeUndefined();
    recordAbortObservation('cancel', { stdoutBytes: 3, sawFirstByte: true });
    expect(getAbortObservation('cancel')).toBeUndefined();
  });
});
