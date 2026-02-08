import { describe, expect, it } from 'vitest';

import { createGitHubAdapter, GitHubInputSchema } from './github-adapter.js';

describe('GitHubInputSchema', () => {
  it('validates an issue input', () => {
    const input = GitHubInputSchema.parse({
      type: 'issue',
      username: 'alice',
      authorAssociation: 'COLLABORATOR',
      title: 'Bug report',
      body: 'Something is broken',
    });
    expect(input.type).toBe('issue');
  });

  it('validates a comment input', () => {
    const input = GitHubInputSchema.parse({
      type: 'comment',
      username: 'bob',
      authorAssociation: 'NONE',
      body: 'Please close this',
    });
    expect(input.type).toBe('comment');
  });

  it('validates a PR input', () => {
    const input = GitHubInputSchema.parse({
      type: 'pull_request',
      username: 'charlie',
      authorAssociation: 'CONTRIBUTOR',
      title: 'Fix bug',
      body: 'Fixes #123',
    });
    expect(input.type).toBe('pull_request');
  });

  it('defaults missing body/title to empty string', () => {
    const input = GitHubInputSchema.parse({
      type: 'issue',
      username: 'alice',
      authorAssociation: 'OWNER',
    });
    if (input.type === 'issue') {
      expect(input.title).toBe('');
      expect(input.body).toBe('');
    }
  });

  it('rejects unknown type', () => {
    expect(() =>
      GitHubInputSchema.parse({
        type: 'wiki',
        username: 'x',
        authorAssociation: 'NONE',
      })
    ).toThrow();
  });
});

describe('createGitHubAdapter', () => {
  const adapter = createGitHubAdapter();

  it('has platform set to github', () => {
    expect(adapter.platform).toBe('github');
  });

  describe('extractMetadata - issues', () => {
    it('combines title and body for issue content', () => {
      const meta = adapter.extractMetadata({
        type: 'issue',
        username: 'alice',
        authorAssociation: 'COLLABORATOR',
        title: 'Bug',
        body: 'Details here',
      });
      expect(meta.content).toBe('Bug\n\nDetails here');
      expect(meta.sourceType).toBe('github-issue');
      expect(meta.username).toBe('alice');
      expect(meta.authorAssociation).toBe('collaborator');
    });

    it('uses only title when body is empty', () => {
      const meta = adapter.extractMetadata({
        type: 'issue',
        username: 'alice',
        authorAssociation: 'OWNER',
        title: 'Title only',
        body: '',
      });
      expect(meta.content).toBe('Title only');
    });

    it('uses only body when title is empty', () => {
      const meta = adapter.extractMetadata({
        type: 'issue',
        username: 'alice',
        authorAssociation: 'OWNER',
        title: '',
        body: 'Body only',
      });
      expect(meta.content).toBe('Body only');
    });
  });

  describe('extractMetadata - comments', () => {
    it('extracts comment body as content', () => {
      const meta = adapter.extractMetadata({
        type: 'comment',
        username: 'bob',
        authorAssociation: 'NONE',
        body: 'This is hostile',
      });
      expect(meta.content).toBe('This is hostile');
      expect(meta.sourceType).toBe('github-comment');
      expect(meta.authorAssociation).toBe('unknown');
    });
  });

  describe('extractMetadata - pull requests', () => {
    it('combines title and body for PR content', () => {
      const meta = adapter.extractMetadata({
        type: 'pull_request',
        username: 'charlie',
        authorAssociation: 'CONTRIBUTOR',
        title: 'Fix',
        body: 'Details',
      });
      expect(meta.content).toBe('Fix\n\nDetails');
      expect(meta.sourceType).toBe('github-pr');
      expect(meta.authorAssociation).toBe('contributor');
    });
  });

  describe('extractMetadata - role mapping', () => {
    it('maps OWNER to owner', () => {
      const meta = adapter.extractMetadata({
        type: 'comment',
        username: 'x',
        authorAssociation: 'OWNER',
        body: 'test',
      });
      expect(meta.authorAssociation).toBe('owner');
    });

    it('maps MEMBER to member', () => {
      const meta = adapter.extractMetadata({
        type: 'comment',
        username: 'x',
        authorAssociation: 'MEMBER',
        body: 'test',
      });
      expect(meta.authorAssociation).toBe('member');
    });

    it('maps FIRST_TIMER to unknown', () => {
      const meta = adapter.extractMetadata({
        type: 'comment',
        username: 'x',
        authorAssociation: 'FIRST_TIMER',
        body: 'test',
      });
      expect(meta.authorAssociation).toBe('unknown');
    });
  });

  describe('extractMetadata - validation', () => {
    it('throws for invalid input with descriptive message', () => {
      expect(() => adapter.extractMetadata({ type: 'invalid' })).toThrow(
        'GitHub input validation failed'
      );
    });

    it('throws for missing username with field path', () => {
      expect(() =>
        adapter.extractMetadata({
          type: 'comment',
          authorAssociation: 'NONE',
          body: 'test',
        })
      ).toThrow('username');
    });

    it('includes all validation issues in error message', () => {
      expect(() => adapter.extractMetadata({})).toThrow('GitHub input validation failed');
    });
  });
});
