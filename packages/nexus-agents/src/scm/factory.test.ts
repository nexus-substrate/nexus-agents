/**
 * Tests for SCM provider factory.
 *
 * (Source: Issue #1136 — Centralized SCM Provider Module)
 */

import { describe, it, expect } from 'vitest';
import { createScmProvider, createGitHubProvider } from './factory.js';

describe('createScmProvider', () => {
  it('creates GitHub provider by default', async () => {
    const result = await createScmProvider({ repo: 'owner/repo' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.platform).toBe('github');
      expect(result.value.repo).toBe('owner/repo');
    }
  });

  it('creates GitHub provider explicitly', async () => {
    const result = await createScmProvider({
      repo: 'owner/repo',
      platform: 'github',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.platform).toBe('github');
    }
  });

  it('returns error for unsupported GitLab platform', async () => {
    const result = await createScmProvider({
      repo: 'owner/repo',
      platform: 'gitlab',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('not yet implemented');
      expect(result.error.platform).toBe('gitlab');
    }
  });

  it('returns error for unsupported Gitea platform', async () => {
    const result = await createScmProvider({
      repo: 'owner/repo',
      platform: 'gitea',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('not yet implemented');
    }
  });
});

describe('createGitHubProvider', () => {
  it('creates provider directly without async', () => {
    const provider = createGitHubProvider('owner/repo');

    expect(provider.platform).toBe('github');
    expect(provider.repo).toBe('owner/repo');
  });
});
