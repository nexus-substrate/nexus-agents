/**
 * Tests for setup-codex Codex CLI MCP auto-configuration.
 *
 * (Source: Issue #1263)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockedExecFileSync } = vi.hoisted(() => ({
  mockedExecFileSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFileSync: mockedExecFileSync,
}));

import { detectCodexCli, configureCodex } from './setup-codex.js';

describe('detectCodexCli', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns installed=false when which fails', () => {
    mockedExecFileSync.mockImplementation(() => {
      throw new Error('not found');
    });

    const result = detectCodexCli();
    expect(result.installed).toBe(false);
    expect(result.version).toBeUndefined();
  });

  it('returns installed=true with version when available', () => {
    mockedExecFileSync.mockReturnValueOnce('/usr/bin/codex\n').mockReturnValueOnce('codex 5.3.1');

    const result = detectCodexCli();
    expect(result.installed).toBe(true);
    expect(result.version).toBe('5.3.1');
  });

  it('returns installed=true without version on version error', () => {
    mockedExecFileSync.mockReturnValueOnce('/usr/bin/codex\n').mockImplementationOnce(() => {
      throw new Error('version failed');
    });

    const result = detectCodexCli();
    expect(result.installed).toBe(true);
    expect(result.version).toBeUndefined();
  });
});

describe('configureCodex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns alreadyConfigured when server exists and force=false', () => {
    mockedExecFileSync.mockReturnValueOnce('nexus-agents  stdio');

    const result = configureCodex(false, false);
    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(true);
  });

  it('adds server when not configured', () => {
    mockedExecFileSync.mockReturnValueOnce('other-server  stdio').mockReturnValueOnce('added');

    const result = configureCodex(false, false);
    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(false);
    expect(result.message).toContain('Configured');
  });

  it('handles add failure', () => {
    mockedExecFileSync
      .mockImplementationOnce(() => {
        throw new Error('mcp list failed');
      })
      .mockImplementationOnce(() => {
        throw new Error('permission denied');
      });

    const result = configureCodex(false, false);
    expect(result.success).toBe(false);
    expect(result.message).toContain('permission denied');
  });

  it('returns dry-run message without adding', () => {
    mockedExecFileSync.mockImplementationOnce(() => {
      throw new Error('no list');
    });

    const result = configureCodex(false, true);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Would configure');
  });

  it('removes and re-adds when force=true', () => {
    mockedExecFileSync
      .mockReturnValueOnce('nexus-agents  stdio')
      .mockReturnValueOnce('nexus-agents  stdio')
      .mockReturnValueOnce('removed')
      .mockReturnValueOnce('added');

    const result = configureCodex(true, false);
    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(false);
  });

  it('uses correct command args for codex mcp add', () => {
    mockedExecFileSync
      .mockImplementationOnce(() => {
        throw new Error('no list');
      })
      .mockReturnValueOnce('added');

    configureCodex(false, false);

    const addCall = mockedExecFileSync.mock.calls[1] as unknown[];
    expect(addCall[0]).toBe('codex');
    const args = addCall[1] as string[];
    expect(args).toEqual([
      'mcp',
      'add',
      'nexus-agents',
      '--',
      'npx',
      'nexus-agents',
      '--mode=server',
    ]);
  });
});
