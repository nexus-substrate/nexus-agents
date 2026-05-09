/**
 * Tests for Deno Sandbox Helpers (#1898).
 *
 * Covers Deno availability check + policy → permission flag mapping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SandboxPolicy } from './sandbox-types.js';

const { mockExecFileAsync } = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:util', () => ({
  promisify: () => mockExecFileAsync,
}));

import {
  isDenoAvailable,
  resetDenoCache,
  policyToDenoFlags,
  collectPolicyConfigurationWarnings,
} from './deno-sandbox-helpers.js';

function makePolicy(overrides: Partial<SandboxPolicy> = {}): SandboxPolicy {
  return {
    id: 'test',
    name: 'test',
    mode: 'deno',
    allowedCommands: [],
    allowedEnvVars: [],
    pathRules: [],
    capabilities: [],
    limits: {},
    ...overrides,
  };
}

// ============================================================================
// isDenoAvailable
// ============================================================================

describe('isDenoAvailable', () => {
  beforeEach(() => {
    resetDenoCache();
    mockExecFileAsync.mockReset();
  });

  it('returns true when `deno --version` succeeds', async () => {
    mockExecFileAsync.mockResolvedValue({ stdout: 'deno 2.0.0', stderr: '' });
    expect(await isDenoAvailable()).toBe(true);
  });

  it('returns false when `deno --version` fails', async () => {
    mockExecFileAsync.mockRejectedValue(new Error('command not found'));
    expect(await isDenoAvailable()).toBe(false);
  });

  it('caches the availability check across calls', async () => {
    mockExecFileAsync.mockResolvedValue({ stdout: 'deno 2.0.0', stderr: '' });
    await isDenoAvailable();
    await isDenoAvailable();
    expect(mockExecFileAsync).toHaveBeenCalledTimes(1);
  });

  it('resetDenoCache clears the cache', async () => {
    mockExecFileAsync.mockResolvedValue({ stdout: 'deno 2.0.0', stderr: '' });
    await isDenoAvailable();
    resetDenoCache();
    await isDenoAvailable();
    expect(mockExecFileAsync).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// policyToDenoFlags
// ============================================================================

describe('policyToDenoFlags', () => {
  it('returns no flags for an empty policy', () => {
    expect(policyToDenoFlags(makePolicy())).toEqual([]);
  });

  it('emits --allow-run when process_spawn capability + allowedCommands', () => {
    const flags = policyToDenoFlags(
      makePolicy({
        capabilities: ['process_spawn'],
        allowedCommands: ['git', 'npm'],
      })
    );
    expect(flags).toEqual(['--allow-run=git,npm']);
  });

  it('skips --allow-run if process_spawn requested but no allowedCommands (no wildcard)', () => {
    const flags = policyToDenoFlags(
      makePolicy({ capabilities: ['process_spawn'], allowedCommands: [] })
    );
    expect(flags).toEqual([]);
  });

  it('emits coarse --allow-net for network capability', () => {
    const flags = policyToDenoFlags(makePolicy({ capabilities: ['network'] }));
    expect(flags).toEqual(['--allow-net']);
  });

  it('emits --allow-read with paths from filesystem_read + read rules', () => {
    const flags = policyToDenoFlags(
      makePolicy({
        capabilities: ['filesystem_read'],
        pathRules: [
          { path: '/tmp', access: 'read' },
          { path: '/var/log', access: 'read' },
        ],
      })
    );
    expect(flags).toEqual(['--allow-read=/tmp,/var/log']);
  });

  it('write rules imply read access (write paths show up in --allow-read)', () => {
    const flags = policyToDenoFlags(
      makePolicy({
        capabilities: ['filesystem_read', 'filesystem_write'],
        pathRules: [{ path: '/tmp', access: 'write' }],
      })
    );
    expect(flags).toContain('--allow-read=/tmp');
    expect(flags).toContain('--allow-write=/tmp');
  });

  it('emits --allow-write only for write rules', () => {
    const flags = policyToDenoFlags(
      makePolicy({
        capabilities: ['filesystem_write'],
        pathRules: [
          { path: '/data', access: 'write' },
          { path: '/etc', access: 'read' },
        ],
      })
    );
    expect(flags).toEqual(['--allow-write=/data']);
  });

  it('skips --allow-read/-write entirely if capability requested but no rules', () => {
    const flags = policyToDenoFlags(
      makePolicy({
        capabilities: ['filesystem_read', 'filesystem_write'],
        pathRules: [],
      })
    );
    expect(flags).toEqual([]);
  });

  it('emits --allow-env with allowed vars', () => {
    const flags = policyToDenoFlags(
      makePolicy({
        capabilities: ['env_access'],
        allowedEnvVars: ['HOME', 'PATH'],
      })
    );
    expect(flags).toEqual(['--allow-env=HOME,PATH']);
  });

  it('skips --allow-env if env_access requested but allowedEnvVars is empty', () => {
    const flags = policyToDenoFlags(
      makePolicy({ capabilities: ['env_access'], allowedEnvVars: [] })
    );
    expect(flags).toEqual([]);
  });

  it('combines flags for a multi-capability policy', () => {
    const flags = policyToDenoFlags(
      makePolicy({
        capabilities: ['process_spawn', 'network', 'filesystem_read', 'env_access'],
        allowedCommands: ['git'],
        allowedEnvVars: ['HOME'],
        pathRules: [{ path: '/tmp', access: 'read' }],
      })
    );
    expect(flags).toEqual([
      '--allow-run=git',
      '--allow-net',
      '--allow-read=/tmp',
      '--allow-env=HOME',
    ]);
  });

  it('ignores rules with access=none', () => {
    const flags = policyToDenoFlags(
      makePolicy({
        capabilities: ['filesystem_read'],
        pathRules: [
          { path: '/secret', access: 'none' },
          { path: '/tmp', access: 'read' },
        ],
      })
    );
    expect(flags).toEqual(['--allow-read=/tmp']);
  });
});

// ============================================================================
// collectPolicyConfigurationWarnings (#2428 ask 1)
// ============================================================================

describe('collectPolicyConfigurationWarnings (#2428)', () => {
  it('returns an empty list for an empty policy', () => {
    expect(collectPolicyConfigurationWarnings(makePolicy())).toEqual([]);
  });

  it('returns an empty list when all declared capabilities have allowlists', () => {
    const warnings = collectPolicyConfigurationWarnings(
      makePolicy({
        capabilities: ['process_spawn', 'filesystem_read', 'env_access'],
        allowedCommands: ['git'],
        allowedEnvVars: ['HOME'],
        pathRules: [{ path: '/tmp', access: 'read' }],
      })
    );
    expect(warnings).toEqual([]);
  });

  it('flags process_spawn with empty allowedCommands', () => {
    const warnings = collectPolicyConfigurationWarnings(
      makePolicy({ capabilities: ['process_spawn'], allowedCommands: [] })
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('process_spawn capability requested');
    expect(warnings[0]).toContain('allowedCommands is empty');
  });

  it('flags filesystem_read with no path rules', () => {
    const warnings = collectPolicyConfigurationWarnings(
      makePolicy({ capabilities: ['filesystem_read'], pathRules: [] })
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('filesystem_read');
  });

  it('flags filesystem_write when only read rules are present', () => {
    const warnings = collectPolicyConfigurationWarnings(
      makePolicy({
        capabilities: ['filesystem_write'],
        pathRules: [{ path: '/tmp', access: 'read' }],
      })
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('filesystem_write');
  });

  it('flags env_access with empty allowedEnvVars', () => {
    const warnings = collectPolicyConfigurationWarnings(
      makePolicy({ capabilities: ['env_access'], allowedEnvVars: [] })
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('env_access');
  });

  it('does NOT flag network — coarse on/off has no allowlist gap (#2428 phase 1)', () => {
    const warnings = collectPolicyConfigurationWarnings(makePolicy({ capabilities: ['network'] }));
    // Per-host network filtering is Phase 2 (#2428 ask 2); v1 has no
    // allowlist for `network`, so there's nothing to flag as missing.
    expect(warnings).toEqual([]);
  });

  it('returns multiple warnings when multiple capabilities are misconfigured', () => {
    const warnings = collectPolicyConfigurationWarnings(
      makePolicy({
        capabilities: ['process_spawn', 'filesystem_read', 'env_access'],
      })
    );
    expect(warnings).toHaveLength(3);
  });
});
