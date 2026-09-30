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

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}));

describe('Codex sandbox preflight (#6841)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('probes the read-only seat sandbox with the exact Linux argv and a short class-bound timeout', () => {
    const exec = vi.fn<CodexSandboxProbeExec>(() => ({ exitCode: 0, stderr: '' }));
    expect(createCodexSandboxPreflight(exec, 'linux')()).toEqual({ status: 'ok' });
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

  it('honors a shorter operation-class override', () => {
    vi.stubEnv('NEXUS_TIMEOUT_CLASS_INTERACTIVE_MS', '1000');
    const exec = vi.fn<CodexSandboxProbeExec>(() => ({ exitCode: 0, stderr: '' }));
    createCodexSandboxPreflight(exec, 'linux')();
    expect(exec.mock.calls[0]?.[2]).toBe(1000);
  });

  it.each([
    [101, `thread 'main' panicked\n${PANIC}\nnote: backtrace`],
    [1, 'bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted'],
    [1, 'landlock sandbox failed: Operation not permitted'],
  ])('reports recognized sandbox failure at exit %i with its cause', (exitCode, stderr) => {
    const result = createCodexSandboxPreflight(() => ({ exitCode, stderr }), 'linux')();
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
  ])('names unmeasured execution as unknown: %j', (execution) => {
    const result = createCodexSandboxPreflight(() => execution, 'linux')();
    expect(result.status).toBe('unknown');
    if (result.status !== 'ok') expect(result.reason.length).toBeGreaterThan(0);
  });

  it('keeps a recognised panic line unknown when the probe never completed', () => {
    // A timed-out probe has no exit code. The panic text alone is not proof
    // that the sandbox refused: the process may have been killed mid-output.
    const exec = vi.fn<CodexSandboxProbeExec>(() => ({ exitCode: null, stderr: PANIC }));
    const result = createCodexSandboxPreflight(exec, 'linux')();
    expect(result.status).toBe('unknown');
    expect(result.status === 'unknown' ? result.reason : '').toContain('did not complete');
  });

  it('records a runner exception as unknown', () => {
    const probe = createCodexSandboxPreflight(() => {
      throw new Error('spawn codex ENOENT');
    });
    expect(probe()).toEqual({ status: 'unknown', reason: 'spawn codex ENOENT' });
  });

  it.each([0, 101, null])('memoizes even unknown or broken results (exit %s)', (exitCode) => {
    const exec = vi.fn<CodexSandboxProbeExec>(() => ({ exitCode, stderr: PANIC }));
    const probe = createCodexSandboxPreflight(exec, 'linux');
    expect(probe()).toBe(probe());
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('does not apply Linux-only backend arguments elsewhere', () => {
    const exec = vi.fn<CodexSandboxProbeExec>(() => ({ exitCode: 0, stderr: '' }));
    createCodexSandboxPreflight(exec, 'darwin')();
    expect(exec.mock.calls[0]?.[1]).toEqual([
      'sandbox',
      '-c',
      'sandbox_mode="read-only"',
      '--',
      'true',
    ]);
  });

  it('shares the default cached result with a factory arm and bounds the real process runner', async () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw Object.assign(new Error('Command failed'), { status: 101, stderr: PANIC });
    });
    const result = codexSandboxPreflight();
    expect(result.status).toBe('broken');
    expect(codexSandboxPreflight()).toBe(result);
    const adapter = createCliAdapter({ cli: 'codex', transport: 'subprocess' });
    const initialize = vi.spyOn(adapter, 'initialize').mockResolvedValue();
    const execution = await adapter.execute({
      content: 'review',
      accessMode: 'read-only-analysis',
    });
    expect(execution.ok).toBe(false);
    expect(initialize).not.toHaveBeenCalled();
    expect(execFileSync).toHaveBeenCalledTimes(1);
    expect(execFileSync).toHaveBeenCalledWith('codex', expect.any(Array), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: Math.min(CLI_SUBPROCESS_TIMEOUTS.statusProbeMs, resolveClassGuardMs('interactive')),
      killSignal: 'SIGKILL',
    });
  });
});
