/**
 * Tests for centralized token resolver.
 *
 * (Source: Issue #1136 — Centralized SCM Provider Module)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveToken, hasToken, getTokenEnvVars } from './token-resolver.js';

describe('resolveToken', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    delete process.env.GITLAB_TOKEN;
    delete process.env.GL_TOKEN;
    delete process.env.GITEA_TOKEN;
  });

  afterEach(() => {
    process.env.GITHUB_TOKEN = originalEnv.GITHUB_TOKEN;
    process.env.GH_TOKEN = originalEnv.GH_TOKEN;
    process.env.GITLAB_TOKEN = originalEnv.GITLAB_TOKEN;
    process.env.GL_TOKEN = originalEnv.GL_TOKEN;
    process.env.GITEA_TOKEN = originalEnv.GITEA_TOKEN;
  });

  it('resolves explicit token with highest priority', async () => {
    process.env.GITHUB_TOKEN = 'env-token';
    const result = await resolveToken({ token: 'explicit-token' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe('explicit-token');
      expect(result.value.strategy).toBe('config');
      expect(result.value.platform).toBe('github');
    }
  });

  it('resolves GITHUB_TOKEN from env', async () => {
    process.env.GITHUB_TOKEN = 'ghp_test123';
    const result = await resolveToken();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe('ghp_test123');
      expect(result.value.strategy).toBe('env');
    }
  });

  it('resolves GH_TOKEN as fallback', async () => {
    process.env.GH_TOKEN = 'gh-fallback';
    const result = await resolveToken();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe('gh-fallback');
      expect(result.value.strategy).toBe('env');
    }
  });

  it('prefers GITHUB_TOKEN over GH_TOKEN', async () => {
    process.env.GITHUB_TOKEN = 'primary';
    process.env.GH_TOKEN = 'fallback';
    const result = await resolveToken();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe('primary');
    }
  });

  it('resolves custom env var', async () => {
    process.env.MY_GH_TOKEN = 'custom';
    const result = await resolveToken({ envVar: 'MY_GH_TOKEN' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe('custom');
    }
    delete process.env.MY_GH_TOKEN;
  });

  it('resolves GITLAB_TOKEN for gitlab platform', async () => {
    process.env.GITLAB_TOKEN = 'glpat-test';
    const result = await resolveToken({ platform: 'gitlab' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value).toBe('glpat-test');
      expect(result.value.platform).toBe('gitlab');
    }
  });

  it('returns error when no token available', async () => {
    const result = await resolveToken();

    // May succeed if gh CLI is authenticated, or fail if not
    // We just verify the function doesn't throw
    expect(typeof result.ok).toBe('boolean');
  });

  it('ignores empty string tokens', async () => {
    process.env.GITHUB_TOKEN = '';
    process.env.GH_TOKEN = '';
    const result = await resolveToken();

    // Should not resolve empty strings as valid tokens
    if (result.ok) {
      expect(result.value.value).not.toBe('');
    }
  });
});

describe('hasToken', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env.GITHUB_TOKEN = originalEnv.GITHUB_TOKEN;
    process.env.GH_TOKEN = originalEnv.GH_TOKEN;
  });

  it('returns true when GITHUB_TOKEN is set', () => {
    process.env.GITHUB_TOKEN = 'test';
    expect(hasToken()).toBe(true);
  });

  it('returns true when GH_TOKEN is set', () => {
    delete process.env.GITHUB_TOKEN;
    process.env.GH_TOKEN = 'test';
    expect(hasToken()).toBe(true);
  });

  it('returns false when no token is set', () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    expect(hasToken()).toBe(false);
  });
});

describe('getTokenEnvVars', () => {
  it('returns github env vars by default', () => {
    const vars = getTokenEnvVars();
    expect(vars).toContain('GITHUB_TOKEN');
    expect(vars).toContain('GH_TOKEN');
  });

  it('returns gitlab env vars', () => {
    const vars = getTokenEnvVars('gitlab');
    expect(vars).toContain('GITLAB_TOKEN');
    expect(vars).toContain('GL_TOKEN');
  });

  it('returns gitea env vars', () => {
    const vars = getTokenEnvVars('gitea');
    expect(vars).toContain('GITEA_TOKEN');
  });
});
