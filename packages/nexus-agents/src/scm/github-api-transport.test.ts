/** Characterize the single shared cache and transport without printing inherited environment. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execGhApiRaw, resetGhTokenCache } from './github-api-transport.js';
import {
  execGhApiRaw as legacyRaw,
  resetGhTokenCache as legacyReset,
} from './github-provider-traits.js';
import { CLI_SUBPROCESS_TIMEOUTS } from '../config/subprocess-timeouts.js';
interface Options {
  timeout?: number;
  maxBuffer?: number;
  env?: NodeJS.ProcessEnv;
}
type Execute = (
  file: string,
  args: readonly string[],
  options: Options
) => Promise<{ stdout: string; stderr?: string }>;
const mocked = vi.hoisted(() => ({ execute: vi.fn<Execute>() }));
vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  const execFile = vi.fn();
  Object.defineProperty(execFile, promisify.custom, { value: mocked.execute });
  return { execFile };
});
beforeEach(() => {
  mocked.execute.mockReset().mockResolvedValue({ stdout: '  fixture-output\n' });
  vi.stubEnv('GITHUB_TOKEN', 'fixture-primary-token');
  vi.stubEnv('GH_TOKEN', 'fixture-secondary-token');
  resetGhTokenCache();
});
afterEach(() => {
  vi.unstubAllEnvs();
  resetGhTokenCache();
});
const request = ['api', 'repos/fixture/repo/pulls/1'] as const;

describe('canonical GitHub API transport', () => {
  it('keeps the legacy imports identity-equal to the shared implementation', () => {
    expect(legacyRaw).toBe(execGhApiRaw);
    expect(legacyReset).toBe(resetGhTokenCache);
  });
  it('preserves args, timeout, output bound, trimming, and token precedence', async () => {
    expect(await execGhApiRaw(request)).toEqual({ ok: true, value: 'fixture-output' });
    expect(mocked.execute.mock.calls[0]?.[0]).toBe('gh');
    expect(mocked.execute.mock.calls[0]?.[1]).toEqual(request);
    expect(mocked.execute.mock.calls[0]?.[2].timeout).toBe(CLI_SUBPROCESS_TIMEOUTS.ghCommandMs);
    expect(mocked.execute.mock.calls[0]?.[2].maxBuffer).toBe(10 * 1024 * 1024);
    expect(mocked.execute.mock.calls[0]?.[2].env?.['GH_TOKEN']).toBe('fixture-primary-token');
    expect(mocked.execute.mock.calls.length).toBe(1);
  });
  it('shares resolved cache state across import paths and reset', async () => {
    await execGhApiRaw(request);
    vi.stubEnv('GITHUB_TOKEN', 'fixture-next-token');
    await legacyRaw(request);
    expect(mocked.execute.mock.calls[1]?.[2].env?.['GH_TOKEN']).toBe('fixture-primary-token');
    legacyReset();
    await execGhApiRaw(request);
    expect(mocked.execute.mock.calls[2]?.[2].env?.['GH_TOKEN']).toBe('fixture-next-token');
  });
  it('preserves the existing CLI-auth fallback for an empty primary variable', async () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    mocked.execute.mockResolvedValueOnce({ stdout: ' fixture-auth-token\n' });
    await execGhApiRaw(request);
    expect(mocked.execute.mock.calls[0]?.[1]).toEqual(['auth', 'token']);
    expect(mocked.execute.mock.calls[0]?.[2].timeout).toBe(5000);
    expect(mocked.execute.mock.calls[1]?.[2].env?.['GH_TOKEN']).toBe('fixture-auth-token');
  });
  it('does not repeat a completed empty auth lookup', async () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    vi.stubEnv('GH_TOKEN', '');
    mocked.execute.mockResolvedValueOnce({ stdout: '' });
    await execGhApiRaw(request);
    await legacyRaw(request);
    expect(mocked.execute.mock.calls.filter((call) => call[1][0] === 'auth').length).toBe(1);
    expect(mocked.execute.mock.calls[1]?.[2].env).toBeUndefined();
  });
  it('returns the existing SCM error envelope for a subprocess failure', async () => {
    mocked.execute.mockRejectedValueOnce(
      Object.assign(new Error('fixture-api-error'), { stderr: 'fixture-stderr' })
    );
    const result = await execGhApiRaw(request);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('fixture failure was lost');
    expect(result.error.message).toBe('gh api failed: fixture-api-error');
    expect(result.error.context?.['endpoint']).toBe(request[1]);
    expect(result.error.context?.['stderr']).toBe('fixture-stderr');
  });
});

const HEAD = 'a'.repeat(40);
async function minimalWriter(): Promise<
  Required<Pick<import('./types.js').IScmReviewer, 'createReview' | 'createReviewAtCommit'>>
> {
  const { createGitHubReviewWriter } = await import('./github-review-writer.js');
  return createGitHubReviewWriter('fixture/repo');
}
it('routes the legacy class and minimal writer through identical single POST requests', async () => {
  const { GitHubReviewer } = await import('./github-provider-traits.js');
  const { GitHubProvider } = await import('./github-provider.js');
  const writer = await minimalWriter();
  expect(await writer.createReview(1, 'fixture body', 'approve')).toEqual({
    ok: true,
    value: undefined,
  });
  expect(
    await new GitHubReviewer(new GitHubProvider('fixture/repo')).createReview(
      1,
      'fixture body',
      'approve'
    )
  ).toEqual({ ok: true, value: undefined });
  expect(mocked.execute.mock.calls.length).toBe(2);
  expect(mocked.execute.mock.calls[0]?.[1]).toEqual(mocked.execute.mock.calls[1]?.[1]);
});
it('returns the parsed commit-bound receipt from the minimal writer', async () => {
  mocked.execute.mockResolvedValueOnce({
    stdout: JSON.stringify({
      id: 7,
      commit_id: HEAD,
      state: 'APPROVED',
      user: { id: 1, login: 'fixture-reviewer', type: 'Bot' },
    }),
  });
  const result = await (
    await minimalWriter()
  ).createReviewAtCommit(1, 'fixture body', 'approve', HEAD);
  expect(result).toMatchObject({
    ok: true,
    value: { id: 7, commitId: HEAD, state: 'APPROVED', reviewerId: 1 },
  });
  expect(mocked.execute.mock.calls[0]?.[1]).toContain(`commit_id=${HEAD}`);
  expect(mocked.execute.mock.calls.length).toBe(1);
});
it.each([undefined, 12, 'short', 'A'.repeat(40), { toString: (): string => HEAD }])(
  'rejects an invalid commit before any auth or API subprocess %#',
  async (value) => {
    const result = await (
      await minimalWriter()
    ).createReviewAtCommit(1, 'fixture body', 'approve', value as unknown as string);
    expect(result.ok).toBe(false);
    expect(mocked.execute.mock.calls.length).toBe(0);
  }
);
it('retains malformed receipt failure after exactly one POST', async () => {
  mocked.execute.mockResolvedValueOnce({ stdout: '{}' });
  const result = await (
    await minimalWriter()
  ).createReviewAtCommit(1, 'fixture body', 'approve', HEAD);
  expect(result.ok).toBe(false);
  expect(mocked.execute.mock.calls.length).toBe(1);
});
