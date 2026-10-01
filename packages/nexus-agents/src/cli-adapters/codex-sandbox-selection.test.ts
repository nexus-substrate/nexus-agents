import { describe, expect, it, vi } from 'vitest';
import {
  createCodexSandboxPreflight,
  type CodexSandboxProbeExec,
} from './codex-sandbox-preflight.js';
import { CLI_SUBPROCESS_TIMEOUTS, resolveClassGuardMs } from '../config/timeouts.js';

const LEGACY = ['-c', 'features.use_legacy_landlock=true'];
const PLAIN_ARGV = ['sandbox', '-c', 'sandbox_mode="read-only"', '--', 'true'];
const LEGACY_ARGV = ['sandbox', '-c', 'sandbox_mode="read-only"', ...LEGACY, '--', 'true'];
const PANIC = 'filesystem-restricted execution requires bubblewrap to isolate app-server sockets';

describe('Codex sandbox argument selection (#6841 item 3)', () => {
  it('selects plain args on success and never probes legacy', async () => {
    const exec = vi.fn<CodexSandboxProbeExec>().mockResolvedValue({ exitCode: 0, stderr: '' });
    const result = await createCodexSandboxPreflight(exec, 'linux')();
    expect(result).toEqual({ status: 'ok', sandboxArgs: [] });
    expect(exec.mock.calls).toEqual([
      [
        'codex',
        PLAIN_ARGV,
        Math.min(CLI_SUBPROCESS_TIMEOUTS.statusProbeMs, resolveClassGuardMs('interactive')),
      ],
    ]);
  });

  it('selects legacy after a recognized plain failure with exact candidate argv', async () => {
    const exec = vi
      .fn<CodexSandboxProbeExec>()
      .mockResolvedValueOnce({ exitCode: 1, stderr: 'bwrap: loopback: Failed RTM_NEWADDR' })
      .mockResolvedValueOnce({ exitCode: 0, stderr: '' });
    expect(await createCodexSandboxPreflight(exec, 'linux')()).toEqual({
      status: 'ok',
      sandboxArgs: LEGACY,
    });
    const timeout = Math.min(
      CLI_SUBPROCESS_TIMEOUTS.statusProbeMs,
      resolveClassGuardMs('interactive')
    );
    expect(exec.mock.calls).toEqual([
      ['codex', PLAIN_ARGV, timeout],
      ['codex', LEGACY_ARGV, timeout],
    ]);
  });

  it.each([true, false])(
    'retains a completed recognized failure from either candidate (plain=%s)',
    async (plain) => {
      const recognized = { exitCode: 101, stderr: PANIC };
      const unmeasured = { exitCode: null, stderr: 'timed out' };
      const exec = vi
        .fn<CodexSandboxProbeExec>()
        .mockResolvedValueOnce(plain ? recognized : unmeasured)
        .mockResolvedValueOnce(plain ? unmeasured : recognized);
      const result = await createCodexSandboxPreflight(exec, 'linux')();
      expect(result.status).toBe('broken');
      if (result.status !== 'ok') expect(result.reason).toContain(PANIC);
      expect(exec).toHaveBeenCalledTimes(2);
    }
  );

  it('reports broken when both candidates panic', async () => {
    const exec = vi.fn<CodexSandboxProbeExec>().mockResolvedValue({ exitCode: 101, stderr: PANIC });
    expect((await createCodexSandboxPreflight(exec, 'linux')()).status).toBe('broken');
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('proceeds with plain args when neither failure is recognized', async () => {
    const exec = vi
      .fn<CodexSandboxProbeExec>()
      .mockResolvedValue({ exitCode: 2, stderr: 'unsupported sandbox' });
    expect(await createCodexSandboxPreflight(exec, 'linux')()).toMatchObject({
      status: 'unknown',
      sandboxArgs: [],
      reason: expect.stringContaining('unsupported sandbox'),
    });
    expect(exec).toHaveBeenCalledTimes(2);
  });

  it('tries legacy even after a runner rejection', async () => {
    const exec = vi
      .fn<CodexSandboxProbeExec>()
      .mockRejectedValueOnce(new Error('probe failed'))
      .mockResolvedValueOnce({ exitCode: 0, stderr: '' });
    expect(await createCodexSandboxPreflight(exec, 'linux')()).toEqual({
      status: 'ok',
      sandboxArgs: LEGACY,
    });
  });

  it('does not turn an incomplete panic into broken', async () => {
    const exec = vi
      .fn<CodexSandboxProbeExec>()
      .mockResolvedValue({ exitCode: null, stderr: PANIC });
    expect(await createCodexSandboxPreflight(exec, 'linux')()).toMatchObject({
      status: 'unknown',
      sandboxArgs: [],
    });
  });

  it('shares the entire selection sequence among concurrent callers', async () => {
    const exec = vi.fn<CodexSandboxProbeExec>().mockImplementation(async (_command, args) => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      return { exitCode: args.includes(LEGACY[1]!) ? 0 : 1, stderr: PANIC };
    });
    const probe = createCodexSandboxPreflight(exec, 'linux');
    const first = probe();
    const second = probe();
    expect(second).toBe(first);
    expect(await first).toEqual({ status: 'ok', sandboxArgs: LEGACY });
    expect(await second).toBe(await first);
    expect(probe()).toBe(first);
    expect(exec.mock.calls.map((call) => call[1])).toEqual([PLAIN_ARGV, LEGACY_ARGV]);
  });

  it.each(['darwin', 'win32'] as const)(
    'probes plain only on %s even on failure',
    async (platform) => {
      const exec = vi
        .fn<CodexSandboxProbeExec>()
        .mockResolvedValue({ exitCode: 2, stderr: 'unsupported' });
      expect(await createCodexSandboxPreflight(exec, platform)()).toMatchObject({
        status: 'unknown',
        sandboxArgs: [],
      });
      expect(exec.mock.calls.map((call) => call[1])).toEqual([PLAIN_ARGV]);
    }
  );
});
