/**
 * Tests for the transient-error classifier in changeset-version-with-retry (#4072).
 * The classifier decides whether a `changeset version` failure is the retryable
 * GitHub-GraphQL flake or a genuine error that must surface.
 */

import { afterEach, describe, it, expect } from 'vitest';

import { isRetryableChangesetVersionError, intEnv } from './changeset-version-with-retry.js';

describe('isRetryableChangesetVersionError (#4072)', () => {
  it('retries the observed get-github-info GraphQL premature-close flake', () => {
    const real = [
      'The following error was encountered while generating changelog entries',
      'We have escaped applying the changesets, and no files should have been affected',
      '🦋  error Error: Failed to parse data from GitHub',
      '🦋  error Invalid response body while trying to fetch https://api.github.com/graphql: Premature close',
      '    at node_modules/.pnpm/@changesets+get-github-info@0.8.0/...changesets-get-github-info.cjs.js:185:11',
    ].join('\n');
    expect(isRetryableChangesetVersionError(real)).toBe(true);
  });

  it.each([
    'Invalid response body while trying to fetch https://api.github.com/graphql: Premature close',
    'Error: connect ECONNRESET 140.82.112.5:443',
    'request to https://api.github.com/graphql failed, reason: socket hang up',
    'getaddrinfo EAI_AGAIN api.github.com',
    'fetch failed: ETIMEDOUT',
  ])('treats network/GraphQL transient %# as retryable', (msg) => {
    expect(isRetryableChangesetVersionError(msg)).toBe(true);
  });

  it.each([
    'Some of your changesets contain invalid frontmatter',
    'error No unreleased changesets found, exiting.',
    'EACCES: permission denied, open CHANGELOG.md',
    'error A changeset references a package that does not exist',
    '',
  ])('does NOT retry a genuine (non-transient) failure: %s', (msg) => {
    expect(isRetryableChangesetVersionError(msg)).toBe(false);
  });
});

describe('intEnv — fail-safe attempt/delay parsing (#4072 review)', () => {
  const KEY = 'CHANGESET_VERSION_TEST_KNOB';
  afterEach(() => {
    Reflect.deleteProperty(process.env, KEY);
  });

  it('returns the fallback when unset or blank', () => {
    Reflect.deleteProperty(process.env, KEY);
    expect(intEnv(KEY, 3, 1)).toBe(3);
    process.env[KEY] = '   ';
    expect(intEnv(KEY, 3, 1)).toBe(3);
  });

  it('parses a valid integer at/above the floor', () => {
    process.env[KEY] = '5';
    expect(intEnv(KEY, 3, 1)).toBe(5);
    process.env[KEY] = '0';
    expect(intEnv(KEY, 5000, 0)).toBe(0);
  });

  it('falls back (NEVER NaN) on a non-numeric value — the desync footgun', () => {
    // A NaN MAX_ATTEMPTS would skip the loop and exit 0 without versioning.
    process.env[KEY] = 'abc';
    expect(intEnv(KEY, 3, 1)).toBe(3);
    process.env[KEY] = '2.5';
    expect(intEnv(KEY, 3, 1)).toBe(3);
  });

  it('falls back when below the floor (MAX_ATTEMPTS must be >= 1)', () => {
    process.env[KEY] = '0';
    expect(intEnv(KEY, 3, 1)).toBe(3);
    process.env[KEY] = '-4';
    expect(intEnv(KEY, 3, 1)).toBe(3);
  });
});
