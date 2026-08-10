/**
 * Tests for cli-auth-probe.ts (#2447).
 *
 * Strategy: probes touch the filesystem (cred-file presence/shape) and shell
 * out to codex/opencode for status. Mock node:child_process.execFile,
 * node:fs.existsSync, and readFileSync to keep tests pure.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { execFileMock, existsSyncMock, readFileSyncMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));
vi.mock('node:util', () => ({
  promisify: () => execFileMock,
}));
vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
  readFileSync: readFileSyncMock,
}));

import { probeCli, probeAllClis } from './cli-auth-probe.js';

beforeEach(() => {
  execFileMock.mockReset();
  existsSyncMock.mockReset();
  readFileSyncMock.mockReset();
  delete process.env['ANTHROPIC_API_KEY'];
  delete process.env['OPENAI_API_KEY'];
  delete process.env['GOOGLE_AI_API_KEY'];
  delete process.env['GEMINI_API_KEY'];
});

describe('probeCli — claude', () => {
  it('reports authenticated via env when ANTHROPIC_API_KEY is set', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-test';
    const r = await probeCli('claude');
    expect(r.state).toBe('authenticated');
    if (r.state === 'authenticated') expect(r.via).toBe('env-var');
  });

  it('reports needs-login when no creds file and no env', async () => {
    existsSyncMock.mockReturnValue(false);
    const r = await probeCli('claude');
    expect(r.state).toBe('needs-login');
    if (r.state === 'needs-login') {
      expect(r.fixCommand).toBe('claude /login');
      expect(r.envFallback).toBe('ANTHROPIC_API_KEY');
    }
  });

  it('reports needs-login when creds file exists but is malformed', async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue('{}'); // missing claudeAiOauth
    const r = await probeCli('claude');
    expect(r.state).toBe('needs-login');
    if (r.state === 'needs-login') {
      expect(r.reason).toContain('expected shape');
    }
  });

  it('reports needs-login when token is expired', async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue(
      JSON.stringify({
        claudeAiOauth: {
          accessToken: 'tok',
          expiresAt: Date.now() - 1000,
        },
      })
    );
    const r = await probeCli('claude');
    expect(r.state).toBe('needs-login');
    if (r.state === 'needs-login') expect(r.reason).toMatch(/expired/);
  });

  it('reports authenticated when token is non-expired', async () => {
    existsSyncMock.mockReturnValue(true);
    const future = Date.now() + 86_400_000;
    readFileSyncMock.mockReturnValue(
      JSON.stringify({
        claudeAiOauth: {
          accessToken: 'tok',
          expiresAt: future,
        },
      })
    );
    const r = await probeCli('claude');
    expect(r.state).toBe('authenticated');
    if (r.state === 'authenticated') expect(r.via).toBe('cli-credentials');
  });
});

describe('probeCli — codex', () => {
  it('reports authenticated via env when OPENAI_API_KEY is set', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-test';
    const r = await probeCli('codex');
    expect(r.state).toBe('authenticated');
  });

  it('reports authenticated when codex login status says logged-in', async () => {
    execFileMock.mockResolvedValue({ stdout: 'You are logged in as foo@bar.com', stderr: '' });
    const r = await probeCli('codex');
    expect(r.state).toBe('authenticated');
  });

  it('reports needs-login when codex login status says not-logged-in', async () => {
    execFileMock.mockResolvedValue({ stdout: 'Not logged in. Run codex login.', stderr: '' });
    const r = await probeCli('codex');
    expect(r.state).toBe('needs-login');
    if (r.state === 'needs-login') expect(r.fixCommand).toBe('codex login');
  });

  it('reports not-installed when codex binary is missing', async () => {
    execFileMock.mockRejectedValue(
      Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' })
    );
    const r = await probeCli('codex');
    expect(r.state).toBe('not-installed');
  });
});

// #4391/#4393: the gemini ARM runs `agy` (Antigravity), which offers NO
// non-interactive auth check — `agy models` hangs without a TTY (90s, no
// output), there is no auth/login/whoami subcommand, and it does not use
// `~/.gemini/oauth_creds.json` (verified: it served a completion while that
// file sat expired and untouched). So the probe declines to guess.
describe('probeCli — gemini (agy)', () => {
  it('reports unknown when agy is installed', async () => {
    execFileMock.mockResolvedValue({ stdout: '1.1.11\n' });

    const r = await probeCli('gemini');

    expect(r.state).toBe('unknown');
  });

  it('checks presence with --version, never the hanging models subcommand', async () => {
    execFileMock.mockResolvedValue({ stdout: '1.1.11\n' });

    await probeCli('gemini');

    expect(execFileMock).toHaveBeenCalledWith('agy', ['--version'], expect.anything());
    const calls = execFileMock.mock.calls.map((c) => JSON.stringify(c));
    expect(calls.some((c) => c.includes('models'))).toBe(false);
  });

  it('ignores the retired CLI credential file entirely', async () => {
    existsSyncMock.mockReturnValue(true);
    execFileMock.mockResolvedValue({ stdout: '1.1.11\n' });

    await probeCli('gemini');

    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  it('reports not-installed when the agy binary is missing', async () => {
    // An absent binary is a different problem with a different fix, and must
    // never read as an auth failure.
    execFileMock.mockRejectedValue(Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));

    const r = await probeCli('gemini');

    expect(r.state).toBe('not-installed');
  });

  it('never claims authenticated — nothing here can prove that', async () => {
    execFileMock.mockResolvedValue({ stdout: '1.1.11\n' });

    const r = await probeCli('gemini');

    expect(r.state).not.toBe('authenticated');
  });

  it('does not echo gateway stderr into the result', async () => {
    execFileMock.mockRejectedValue(
      Object.assign(new Error('boom'), { code: 1, stderr: 'Bearer sk-secret-token-value' })
    );

    const r = await probeCli('gemini');

    expect(JSON.stringify(r)).not.toContain('sk-secret-token-value');
  });
});

describe('probeCli — opencode', () => {
  it('reports needs-login when opencode auth list reports 0 credentials', async () => {
    execFileMock.mockResolvedValue({ stdout: '0 credentials', stderr: '' });
    const r = await probeCli('opencode');
    expect(r.state).toBe('needs-login');
    if (r.state === 'needs-login') expect(r.fixCommand).toBe('opencode auth login');
  });

  it('reports authenticated when opencode auth list reports providers', async () => {
    execFileMock.mockResolvedValue({
      stdout: '┌  Credentials\n│ anthropic\n└  1 credential',
      stderr: '',
    });
    const r = await probeCli('opencode');
    expect(r.state).toBe('authenticated');
  });

  it('reports not-installed when opencode binary is missing', async () => {
    execFileMock.mockRejectedValue(
      Object.assign(new Error('command not found'), { code: 'ENOENT' })
    );
    const r = await probeCli('opencode');
    expect(r.state).toBe('not-installed');
  });
});

describe('probeAllClis', () => {
  it('returns one result per CLI in canonical order', async () => {
    existsSyncMock.mockReturnValue(false);
    execFileMock.mockResolvedValue({ stdout: '', stderr: '' });

    const results = await probeAllClis();
    expect(results.map((r) => r.cli)).toEqual(['claude', 'gemini', 'codex', 'opencode']);
    expect(results.length).toBe(4);
  });
});
