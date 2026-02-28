/**
 * Tests for resolveProjectRoot utility.
 *
 * (Source: Issue #1265)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { resolveProjectRoot } from './resolve-project-root.js';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

const mockedExistsSync = vi.mocked(existsSync);

describe('resolveProjectRoot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns dir containing .git', () => {
    const startDir = '/home/user/project/src/lib';
    mockedExistsSync.mockImplementation((p: unknown) => {
      return (p as string) === join('/home/user/project', '.git');
    });

    const result = resolveProjectRoot(startDir);
    expect(result).toBe('/home/user/project');
  });

  it('returns dir containing package.json', () => {
    const startDir = '/home/user/project/packages/sub';
    mockedExistsSync.mockImplementation((p: unknown) => {
      return (p as string) === join('/home/user/project', 'package.json');
    });

    const result = resolveProjectRoot(startDir);
    expect(result).toBe('/home/user/project');
  });

  it('returns startDir when no markers found', () => {
    const startDir = '/tmp/some/random/dir';
    mockedExistsSync.mockReturnValue(false);

    const result = resolveProjectRoot(startDir);
    expect(result).toBe(resolve(startDir));
  });

  it('finds nearest marker (prefers .git in current dir)', () => {
    const startDir = '/home/user/project';
    mockedExistsSync.mockImplementation((p: unknown) => {
      return (p as string) === join('/home/user/project', '.git');
    });

    const result = resolveProjectRoot(startDir);
    expect(result).toBe('/home/user/project');
  });

  it('finds Cargo.toml for Rust projects', () => {
    const startDir = '/home/user/rust-project/src';
    mockedExistsSync.mockImplementation((p: unknown) => {
      return (p as string) === join('/home/user/rust-project', 'Cargo.toml');
    });

    const result = resolveProjectRoot(startDir);
    expect(result).toBe('/home/user/rust-project');
  });

  it('finds go.mod for Go projects', () => {
    const startDir = '/home/user/go-project/cmd/server';
    mockedExistsSync.mockImplementation((p: unknown) => {
      return (p as string) === join('/home/user/go-project', 'go.mod');
    });

    const result = resolveProjectRoot(startDir);
    expect(result).toBe('/home/user/go-project');
  });
});
