/**
 * Tests for scm/url-parsers.ts (#2553 — lifted from
 * `dogfooding/github-client.test.ts` when the URL parsers moved into
 * the canonical SCM module).
 */

import { describe, it, expect } from 'vitest';
import { parsePRUrl, parseIssueUrl } from './url-parsers.js';

describe('parsePRUrl', () => {
  describe('valid URLs', () => {
    it('parses full GitHub URL', () => {
      const result = parsePRUrl('https://github.com/owner/repo/pull/123');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ owner: 'owner', repo: 'repo', prNumber: 123 });
      }
    });

    it('parses URL with www prefix', () => {
      const result = parsePRUrl('https://www.github.com/owner/repo/pull/456');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.prNumber).toBe(456);
      }
    });

    it('parses short format with hash', () => {
      const result = parsePRUrl('owner/repo#789');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ owner: 'owner', repo: 'repo', prNumber: 789 });
      }
    });

    it('parses short format with /pull/', () => {
      const result = parsePRUrl('owner/repo/pull/101');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ owner: 'owner', repo: 'repo', prNumber: 101 });
      }
    });

    it('handles repos with hyphens', () => {
      const result = parsePRUrl('https://github.com/my-org/my-repo/pull/55');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.owner).toBe('my-org');
        expect(result.value.repo).toBe('my-repo');
      }
    });

    it('handles repos with underscores', () => {
      const result = parsePRUrl('my_org/my_repo#42');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.owner).toBe('my_org');
        expect(result.value.repo).toBe('my_repo');
      }
    });

    it('handles large PR numbers', () => {
      const result = parsePRUrl('https://github.com/owner/repo/pull/99999');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.prNumber).toBe(99999);
      }
    });
  });

  describe('invalid URLs', () => {
    it('rejects empty string', () => {
      const result = parsePRUrl('');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Invalid PR URL');
      }
    });

    it('rejects random text', () => {
      expect(parsePRUrl('not a url at all').ok).toBe(false);
    });

    it('rejects URL without PR number', () => {
      expect(parsePRUrl('https://github.com/owner/repo/pull/').ok).toBe(false);
    });

    it('rejects issue URL (not PR)', () => {
      expect(parsePRUrl('https://github.com/owner/repo/issues/123').ok).toBe(false);
    });

    it('rejects partial short format', () => {
      expect(parsePRUrl('owner/repo').ok).toBe(false);
    });

    it('rejects non-numeric PR number', () => {
      expect(parsePRUrl('owner/repo#abc').ok).toBe(false);
    });

    it('rejects URL with only owner', () => {
      expect(parsePRUrl('https://github.com/owner').ok).toBe(false);
    });
  });
});

describe('parseIssueUrl', () => {
  describe('valid URLs', () => {
    it('parses full GitHub issue URL', () => {
      const result = parseIssueUrl('https://github.com/owner/repo/issues/123');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ owner: 'owner', repo: 'repo', issueNumber: 123 });
      }
    });

    it('parses short format with hash', () => {
      const result = parseIssueUrl('owner/repo#456');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual({ owner: 'owner', repo: 'repo', issueNumber: 456 });
      }
    });

    it('handles repos with hyphens', () => {
      const result = parseIssueUrl('https://github.com/my-org/my-repo/issues/55');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.owner).toBe('my-org');
        expect(result.value.repo).toBe('my-repo');
      }
    });
  });

  describe('invalid URLs', () => {
    it('rejects empty string', () => {
      expect(parseIssueUrl('').ok).toBe(false);
    });

    it('rejects PR URL', () => {
      expect(parseIssueUrl('https://github.com/owner/repo/pull/123').ok).toBe(false);
    });

    it('rejects partial format', () => {
      expect(parseIssueUrl('owner/repo').ok).toBe(false);
    });
  });
});
