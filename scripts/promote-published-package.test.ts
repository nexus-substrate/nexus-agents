import { describe, expect, it, vi } from 'vitest';
import type { CommandResult } from './promote-published-package.js';

const olderLatest: CommandResult = { status: 0, stdout: '1.2.2\n', stderr: '' };
const successfulAdd: CommandResult = { status: 0, stdout: '', stderr: '' };
const confirmedLatest: CommandResult = {
  status: 0,
  stdout: 'latest: 1.2.3\nnext: 1.2.3\n',
  stderr: '',
};

async function promote(): Promise<
  typeof import('./promote-published-package.js').promotePublishedPackage
> {
  return (await import('./promote-published-package.js')).promotePublishedPackage;
}

describe('promotePublishedPackage', () => {
  it('adds latest then verifies the dist-tags endpoint through the publish-env wrapper', async () => {
    // The package document stays cached at the old version after the add;
    // only the dist-tags endpoint confirms the new latest.
    const run = vi.fn((_command: string, args: readonly string[]) => {
      if (args.includes('view')) return olderLatest;
      if (args.includes('add')) return successfulAdd;
      return confirmedLatest;
    });
    expect((await promote())('nexus-agents', '1.2.3', run)).toEqual({ ok: true });
    expect(run.mock.calls).toEqual([
      [
        'pnpm',
        [
          'exec',
          'tsx',
          'scripts/publish-env.ts',
          'npm',
          'view',
          'nexus-agents',
          'dist-tags.latest',
        ],
      ],
      [
        'pnpm',
        [
          'exec',
          'tsx',
          'scripts/publish-env.ts',
          'npm',
          'dist-tag',
          'add',
          'nexus-agents@1.2.3',
          'latest',
        ],
      ],
      ['pnpm', ['exec', 'tsx', 'scripts/publish-env.ts', 'npm', 'dist-tag', 'ls', 'nexus-agents']],
    ]);
  });

  it('supports scoped packages and prerelease versions without shell interpolation', async () => {
    const run = vi
      .fn()
      .mockReturnValueOnce(olderLatest)
      .mockReturnValueOnce(successfulAdd)
      .mockReturnValueOnce({
        ...confirmedLatest,
        stdout: 'next: 1.2.3-rc.1\nlatest: 1.2.3-rc.1\n',
      });
    expect((await promote())('@nexus-agents/memory', '1.2.3-rc.1', run)).toEqual({ ok: true });
    expect(run.mock.calls[1]?.[1]).toContain('@nexus-agents/memory@1.2.3-rc.1');
  });

  it.each([
    'latest: 1.2.2\nnext: 1.2.3\n',
    '',
    'next: 1.2.3\n',
    'latest: 1.2.3\nlatest: 1.2.2\n',
    'latest: 1.2.3\nlatest: 1.2.3\n',
    'not-latest: 1.2.3\n',
  ])('fails when verification is wrong or empty: %j', async (stdout) => {
    const run = vi
      .fn()
      .mockReturnValueOnce(olderLatest)
      .mockReturnValueOnce(successfulAdd)
      .mockReturnValueOnce({ ...confirmedLatest, stdout });
    const result = (await promote())('nexus-agents', '1.2.3', run);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected verification failure');
    expect(result.reason).toMatch(/^::error::/);
    expect(result.reason).toContain('could not verify');
    expect(result.reason).not.toContain('remains on the previous version');
  });

  it.each(['E403 Forbidden', 'E401 Unauthorized'])(
    'reports trusted-publisher setup for rejected add: %s',
    async (stderr) => {
      const run = vi
        .fn()
        .mockReturnValueOnce(olderLatest)
        .mockReturnValue({ status: 1, stdout: '', stderr });
      const result = (await promote())('nexus-agents', '1.2.3', run);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected rejected promotion');
      expect(result.reason).toMatch(/^::error::/);
      expect(result.reason).toContain('Allow npm dist-tag');
      expect(result.reason).toContain('11.21.0');
      expect(result.reason).toContain(stderr);
      expect(result.reason).toContain('remains on the previous version');
      expect(run).toHaveBeenCalledTimes(2);
    }
  );

  it('reports a spawn error without attempting verification', async () => {
    const run = vi
      .fn()
      .mockReturnValueOnce(olderLatest)
      .mockReturnValue({
        status: null,
        stdout: '',
        stderr: '',
        error: new Error('spawn pnpm ENOENT'),
      });
    const result = (await promote())('nexus-agents', '1.2.3', run);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected spawn failure');
    expect(result.reason).toContain('::error::');
    expect(result.reason).toContain('spawn pnpm ENOENT');
    expect(result.reason).not.toContain('remains on the previous version');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('reports command runner exceptions', async () => {
    const run = vi.fn(() => {
      throw new Error('command timed out');
    });
    const result = (await promote())('nexus-agents', '1.2.3', run);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected runner failure');
    expect(result.reason).toContain('::error::');
    expect(result.reason).toContain('command timed out');
    expect(result.reason).not.toContain('remains on the previous version');
  });

  it('fails loudly when the verification command fails after a successful add', async () => {
    const run = vi
      .fn()
      .mockReturnValueOnce(olderLatest)
      .mockReturnValueOnce(successfulAdd)
      .mockReturnValueOnce({ status: 1, stdout: '', stderr: 'E503 registry unavailable' });
    const result = (await promote())('nexus-agents', '1.2.3', run);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected registry verification failure');
    expect(result.reason).toContain('::error::');
    expect(result.reason).toContain('E503 registry unavailable');
    expect(result.reason).not.toContain('remains on the previous version');
  });

  it('skips writing latest when it already equals the requested version', async () => {
    const run = vi.fn().mockReturnValue({ ...olderLatest, stdout: '1.2.3\n' });
    expect((await promote())('nexus-agents', '1.2.3', run)).toEqual({ ok: true });
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[1]).toContain('view');
  });

  it('refuses to roll back a newer latest version', async () => {
    const run = vi.fn().mockReturnValue({ ...confirmedLatest, stdout: '1.2.4\n' });
    const result = (await promote())('nexus-agents', '1.2.3', run);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected rollback refusal');
    expect(result.reason).toContain('::error::');
    expect(result.reason).toContain('Refusing to roll back');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it.each(['', 'latest', 'v1.2.2'])(
    'rejects empty or invalid current latest: %j',
    async (stdout) => {
      const run = vi.fn().mockReturnValue({ ...confirmedLatest, stdout });
      const result = (await promote())('nexus-agents', '1.2.3', run);
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('Expected missing measurement failure');
      expect(result.reason).toContain('::error::');
      expect(result.reason).toContain('current latest');
      expect(run).toHaveBeenCalledTimes(1);
    }
  );

  it('does not claim latest is unchanged on an ambiguous add failure', async () => {
    const run = vi
      .fn()
      .mockReturnValueOnce(olderLatest)
      .mockReturnValue({ status: 1, stdout: '', stderr: 'ECONNRESET' });
    const result = (await promote())('nexus-agents', '1.2.3', run);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected unknown promotion outcome');
    expect(result.reason).toContain('::error::');
    expect(result.reason).not.toContain('remains on the previous version');
    expect(result.reason).toContain('outcome is unknown');
  });

  it.each([
    ['', '1.2.3'],
    ['nexus-agents', ''],
    ['--registry=https://example.com', '1.2.3'],
    ['nexus-agents', 'latest'],
    ['nexus-agents;echo bad', '1.2.3'],
    ['nexus-agents', 'v1.2.3'],
  ])('rejects invalid or empty inputs before running npm: %j %j', async (name, version) => {
    const run = vi.fn();
    const result = (await promote())(name, version, run);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected invalid input failure');
    expect(result.reason).toMatch(/^::error::/);
    expect(run).not.toHaveBeenCalled();
  });
});
