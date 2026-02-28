/**
 * Tests for setup-codex Codex CLI MCP auto-configuration.
 *
 * (Source: Issue #1263)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { detectCodexCli, configureCodex } from './setup-codex.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

const mockedExecFileSync = vi.mocked(execFileSync);

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
    mockedExecFileSync
      .mockReturnValueOnce(Buffer.from('/usr/bin/codex'))
      .mockReturnValueOnce('codex 5.3.1' as unknown as Buffer);

    const result = detectCodexCli();
    expect(result.installed).toBe(true);
    expect(result.version).toBe('5.3.1');
  });

  it('returns installed=true without version on version error', () => {
    mockedExecFileSync
      .mockReturnValueOnce(Buffer.from('/usr/bin/codex'))
      .mockImplementationOnce(() => {
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
    // isAlreadyConfigured: codex mcp list includes nexus-agents
    mockedExecFileSync.mockReturnValueOnce('nexus-agents  stdio' as unknown as Buffer);

    const result = configureCodex(false, false);
    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(true);
  });

  it('adds server when not configured', () => {
    // isAlreadyConfigured: codex mcp list does not include nexus-agents
    mockedExecFileSync
      .mockReturnValueOnce('other-server  stdio' as unknown as Buffer)
      // addMcpServer: codex mcp add
      .mockReturnValueOnce(Buffer.from('added'));

    const result = configureCodex(false, false);
    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(false);
    expect(result.message).toContain('Configured');
  });

  it('handles add failure', () => {
    // isAlreadyConfigured throws (not configured)
    mockedExecFileSync
      .mockImplementationOnce(() => {
        throw new Error('mcp list failed');
      })
      // addMcpServer fails
      .mockImplementationOnce(() => {
        throw new Error('permission denied');
      });

    const result = configureCodex(false, false);
    expect(result.success).toBe(false);
    expect(result.message).toContain('permission denied');
  });

  it('returns dry-run message without adding', () => {
    // isAlreadyConfigured: not configured
    mockedExecFileSync.mockImplementationOnce(() => {
      throw new Error('no list');
    });

    const result = configureCodex(false, true);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Would configure');
  });

  it('removes and re-adds when force=true', () => {
    // isAlreadyConfigured (first check): yes
    mockedExecFileSync
      .mockReturnValueOnce('nexus-agents  stdio' as unknown as Buffer)
      // isAlreadyConfigured (second check in force path): yes
      .mockReturnValueOnce('nexus-agents  stdio' as unknown as Buffer)
      // removeExisting: codex mcp remove
      .mockReturnValueOnce(Buffer.from('removed'))
      // addMcpServer: codex mcp add
      .mockReturnValueOnce(Buffer.from('added'));

    const result = configureCodex(true, false);
    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(false);
  });

  it('uses correct command args for codex mcp add', () => {
    // isAlreadyConfigured: not configured
    mockedExecFileSync
      .mockImplementationOnce(() => {
        throw new Error('no list');
      })
      // addMcpServer
      .mockReturnValueOnce(Buffer.from('added'));

    configureCodex(false, false);

    const addCall = mockedExecFileSync.mock.calls[1]!;
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
