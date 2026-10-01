import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createCodexSandboxPreflight,
  codexSandboxPreflight,
  type CodexSandboxProbeExec,
} from './codex-sandbox-preflight.js';
import { execFileSync } from 'node:child_process';
import { createCliAdapter } from './factory.js';
import { CLI_SUBPROCESS_TIMEOUTS, resolveClassGuardMs } from '../config/timeouts.js';

const PANIC = 'filesystem-restricted execution requires bubblewrap to isolate app-server sockets';

const { execFileAsync, closeStdin } = vi.hoisted(() => ({
  execFileAsync: vi.fn<(...args: unknown[]) => Promise<{ stdout: string; stderr: string }>>(),
  closeStdin: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => {
  const { promisify } = await import('node:util');
  const execFile = Object.assign(vi.fn(), {
    [promisify.custom]: (...args: unknown[]) =>
      Object.assign(execFileAsync(...args), { child: { stdin: { end: closeStdin } } }),
  });
  return {
    ...(await importOriginal<typeof import('node:child_process')>()),
    execFile,
    execFileSync: vi.fn(),
  };
});

describe('Codex sandbox preflight (#6841)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('probes the read-only seat sandbox with the exact Linux argv and a short class-bound timeout', async () => {
    const exec = vi.fn<CodexSandboxProbeExec>(() => Promise.resolve({ exitCode: 0, stderr: '' }));
    expect(await createCodexSandboxPreflight(exec, 'linux')()).toEqual({ status: 'ok' });
    expect(exec).toHaveBeenCalledWith(
      'codex',
      [
        'sandbox',
        '-c',
        'sandbox_mode="read-only"',
        '-c',
        'features.use_legacy_landlock=true',
        '--',
        'true',
      ],
      Math.min(CLI_SUBPROCESS_TIMEOUTS.statusProbeMs, resolveClassGuardMs('interactive'))
    );
  });

  it('honors a shorter operation-class override', async () => {
    vi.stubEnv('NEXUS_TIMEOUT_CLASS_INTERACTIVE_MS', '1000');
    const exec = vi.fn<CodexSandboxProbeExec>(() => Promise.resolve({ exitCode: 0, stderr: '' }));
    await createCodexSandboxPreflight(exec, 'linux')();
    expect(exec.mock.calls[0]?.[2]).toBe(1000);
  });

  it.each([
    [101, `thread 'main' panicked\n${PANIC}\nnote: backtrace`],
    [1, 'bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted'],
    [1, 'landlock sandbox failed: Operation not permitted'],
  ])('reports recognized sandbox failure at exit %i with its cause', async (exitCode, stderr) => {
    const result = await createCodexSandboxPreflight(
      () => Promise.resolve({ exitCode, stderr }),
      'linux'
    )();
    expect(result.status).toBe('broken');
    if (result.status !== 'ok') {
      expect(result.reason).toContain(`exit ${String(exitCode)}`);
      expect(result.reason).toContain(
        stderr
          .split('\n')
          .find(
            (line) =>
              line.includes('bwrap') || line.includes('sandbox') || line.includes('filesystem')
          )
      );
    }
  });

  it.each([
    { exitCode: null, stderr: 'spawn codex ENOENT' },
    { exitCode: null, stderr: 'codex sandbox timed out (SIGKILL)' },
    { exitCode: null, stderr: '' },
    { exitCode: 2, stderr: 'unknown subcommand sandbox' },
    { exitCode: 1, stderr: '' },
  ])('names unmeasured execution as unknown: %j', async (execution) => {
    const result = await createCodexSandboxPreflight(() => Promise.resolve(execution), 'linux')();
    expect(result.status).toBe('unknown');
    if (result.status !== 'ok') expect(result.reason.length).toBeGreaterThan(0);
  });

  it('keeps a recognised panic line unknown when the probe never completed', async () => {
    // A timed-out probe has no exit code. The panic text alone is not proof
    // that the sandbox refused: the process may have been killed mid-output.
    const exec = vi.fn<CodexSandboxProbeExec>(() =>
      Promise.resolve({ exitCode: null, stderr: PANIC })
    );
    const result = await createCodexSandboxPreflight(exec, 'linux')();
    expect(result.status).toBe('unknown');
    expect(result.status === 'unknown' ? result.reason : '').toContain('did not complete');
  });

  it('records a runner exception as unknown', async () => {
    const probe = createCodexSandboxPreflight(() => {
      throw new Error('spawn codex ENOENT');
    });
    await expect(probe()).resolves.toEqual({ status: 'unknown', reason: 'spawn codex ENOENT' });
  });

  it('caches an asynchronous runner rejection as unknown', async () => {
    const exec = vi.fn<CodexSandboxProbeExec>().mockRejectedValue(new Error('spawn codex ENOENT'));
    const probe = createCodexSandboxPreflight(exec, 'linux');
    await expect(probe()).resolves.toEqual({ status: 'unknown', reason: 'spawn codex ENOENT' });
    await expect(probe()).resolves.toEqual({ status: 'unknown', reason: 'spawn codex ENOENT' });
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it.each([0, 101, null])('memoizes even unknown or broken results (exit %s)', (exitCode) => {
    const exec = vi.fn<CodexSandboxProbeExec>(() => Promise.resolve({ exitCode, stderr: PANIC }));
    const probe = createCodexSandboxPreflight(exec, 'linux');
    expect(probe()).toBe(probe());
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('shares one pending probe between concurrent first callers without blocking the event loop', async () => {
    const exec = vi.fn(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      return { exitCode: 0, stderr: '' };
    });
    const probe = createCodexSandboxPreflight(exec, 'linux');
    const first = probe();
    const second = probe();
    expect(first).toBeInstanceOf(Promise);
    expect(second).toBe(first);
    expect(exec).toHaveBeenCalledTimes(1);
    await expect(first).resolves.toEqual({ status: 'ok' });
    expect(probe()).toBe(first);
  });

  it('does not apply Linux-only backend arguments elsewhere', async () => {
    const exec = vi.fn<CodexSandboxProbeExec>(() => Promise.resolve({ exitCode: 0, stderr: '' }));
    await createCodexSandboxPreflight(exec, 'darwin')();
    expect(exec.mock.calls[0]?.[1]).toEqual([
      'sandbox',
      '-c',
      'sandbox_mode="read-only"',
      '--',
      'true',
    ]);
  });

  it('shares the default cached result with a factory arm and bounds the real process runner', async () => {
    execFileAsync.mockRejectedValue(
      Object.assign(new Error('Command failed'), { code: 101, stderr: PANIC })
    );
    const pending = codexSandboxPreflight();
    expect(codexSandboxPreflight()).toBe(pending);
    const result = await pending;
    expect(result.status).toBe('broken');
    expect(await codexSandboxPreflight()).toBe(result);
    const adapter = createCliAdapter({ cli: 'codex', transport: 'subprocess' });
    const initialize = vi.spyOn(adapter, 'initialize').mockResolvedValue();
    const execution = await adapter.execute({
      content: 'review',
      accessMode: 'read-only-analysis',
    });
    expect(execution.ok).toBe(false);
    expect(initialize).not.toHaveBeenCalled();
    expect(execFileAsync).toHaveBeenCalledTimes(1);
    expect(execFileSync).not.toHaveBeenCalled();
    expect(closeStdin).toHaveBeenCalledTimes(1);
    expect(execFileAsync).toHaveBeenCalledWith('codex', expect.any(Array), {
      encoding: 'utf8',
      timeout: Math.min(CLI_SUBPROCESS_TIMEOUTS.statusProbeMs, resolveClassGuardMs('interactive')),
      killSignal: 'SIGKILL',
    });
  });
});

describe('Codex sandbox async process boundary (#6846)', () => {
  it.each([
    { code: 101, stderr: PANIC, expected: 'broken' },
    { code: 'ENOENT', stderr: PANIC, expected: 'unknown' },
    { code: null, signal: 'SIGKILL', killed: true, stderr: PANIC, expected: 'unknown' },
    { code: 2, stderr: 'unknown subcommand sandbox', expected: 'unknown' },
    { code: 1, stderr: '', expected: 'unknown' },
  ])('classifies async process failure: %j', async ({ expected, ...failure }) => {
    vi.resetModules();
    execFileAsync
      .mockReset()
      .mockRejectedValue(Object.assign(new Error('Command failed'), failure));
    const { codexSandboxPreflight: freshProbe } = await import('./codex-sandbox-preflight.js');
    const result = await freshProbe();
    expect(result.status).toBe(expected);
    if (result.status !== 'ok') expect(result.reason.length).toBeGreaterThan(0);
    expect(execFileAsync).toHaveBeenCalledTimes(1);
  });

  it('shares a pending successful subprocess between concurrent first callers', async () => {
    vi.resetModules();
    execFileAsync.mockReset().mockImplementation(async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      return { stdout: '', stderr: PANIC };
    });
    const { codexSandboxPreflight: freshProbe } = await import('./codex-sandbox-preflight.js');
    const first = freshProbe();
    const second = freshProbe();
    expect(second).toBe(first);
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'ok' },
      { status: 'ok' },
    ]);
    expect(execFileAsync).toHaveBeenCalledTimes(1);
    expect(execFileSync).not.toHaveBeenCalled();
  });
});
