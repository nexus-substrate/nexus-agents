/**
 * Tests for the unbypassable denylist (#1977 condition 3).
 *
 * Critical property: these rules win against ANY policy, including
 * LLM-derived policies that claim to allow credentials or destructive tools.
 */

import { describe, it, expect } from 'vitest';
import {
  isPathDenied,
  isToolDenied,
  matchDenyPattern,
  UNBYPASSABLE_PATH_PATTERNS,
  UNBYPASSABLE_TOOL_NAMES,
} from './index.js';

describe('matchDenyPattern', () => {
  it('matches exact .env filename', () => {
    expect(matchDenyPattern('.env', '.env')).toBe(true);
    expect(matchDenyPattern('env', '.env')).toBe(false);
  });

  it('matches nested .env via **', () => {
    expect(matchDenyPattern('backend/.env', '**/.env')).toBe(true);
    expect(matchDenyPattern('app/server/.env', '**/.env')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(matchDenyPattern('.ENV', '.env')).toBe(true);
    expect(matchDenyPattern('~/.SSH/id_rsa', '~/.ssh/**')).toBe(true);
  });

  it('treats ~/ as a home-anchor prefix', () => {
    expect(matchDenyPattern('~/.ssh/id_ed25519', '~/.ssh/**')).toBe(true);
    expect(matchDenyPattern('/home/user/.ssh/id_rsa', '~/.ssh/**')).toBe(true);
  });

  it('does not match partial segment names with *', () => {
    expect(matchDenyPattern('foo/bar/.envtest', '**/.env')).toBe(false);
  });
});

describe('isPathDenied', () => {
  it('denies .env at any depth', () => {
    expect(isPathDenied('.env')).toBe(true);
    expect(isPathDenied('server/.env')).toBe(true);
    expect(isPathDenied('packages/app/.env.production')).toBe(true);
  });

  it('denies SSH keys', () => {
    expect(isPathDenied('~/.ssh/id_rsa')).toBe(true);
    expect(isPathDenied('/home/user/.ssh/id_ed25519')).toBe(true);
    expect(isPathDenied('keys/my_rsa')).toBe(true);
  });

  it('denies cloud credentials', () => {
    expect(isPathDenied('~/.aws/credentials')).toBe(true);
    expect(isPathDenied('~/.azure/access-token.json')).toBe(true);
    expect(isPathDenied('~/.kube/config')).toBe(true);
  });

  it('denies /etc/shadow and sudoers', () => {
    expect(isPathDenied('/etc/shadow')).toBe(true);
    expect(isPathDenied('/etc/sudoers.d/admin')).toBe(true);
  });

  it('denies secret file name patterns', () => {
    expect(isPathDenied('packages/app/secrets.yaml')).toBe(true);
    expect(isPathDenied('config/credentials.json')).toBe(true);
    expect(isPathDenied('keys/private_key.pem')).toBe(true);
  });

  it('allows ordinary source files', () => {
    expect(isPathDenied('src/index.ts')).toBe(false);
    expect(isPathDenied('packages/core/src/router.ts')).toBe(false);
    expect(isPathDenied('README.md')).toBe(false);
  });
});

describe('isToolDenied', () => {
  it('denies destructive git tools', () => {
    expect(isToolDenied('git_push_force')).toBe(true);
    expect(isToolDenied('git_reset_hard')).toBe(true);
  });

  it('denies destructive fs tools', () => {
    expect(isToolDenied('rm_recursive_force')).toBe(true);
  });

  it('denies identity mutations', () => {
    expect(isToolDenied('ssh_add_key')).toBe(true);
    expect(isToolDenied('npm_publish_force')).toBe(true);
  });

  it('denies remote destruction', () => {
    expect(isToolDenied('github_repo_delete')).toBe(true);
    expect(isToolDenied('aws_account_close')).toBe(true);
  });

  it('allows ordinary tools', () => {
    expect(isToolDenied('gh_issue_view')).toBe(false);
    expect(isToolDenied('memory_query')).toBe(false);
  });
});

describe('UNBYPASSABLE lists', () => {
  it('path patterns list is non-empty', () => {
    expect(UNBYPASSABLE_PATH_PATTERNS.length).toBeGreaterThan(10);
  });

  it('tool names list is non-empty', () => {
    expect(UNBYPASSABLE_TOOL_NAMES.length).toBeGreaterThan(5);
  });
});
