/**
 * Tests for `nexus-agents init --opencode` (#2504, child 4 of #2500).
 *
 * Mocks `node:fs` so tests don't touch the real filesystem. Covers the
 * merge-not-overwrite contract, dry-run, idempotency, and the
 * minimal-template path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockExistsSync, mockReadFileSync, mockWriteFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn<(path: string) => boolean>(),
  mockReadFileSync: vi.fn<(path: string, encoding: string) => string>(),
  mockWriteFileSync: vi.fn<(path: string, content: string, encoding: string) => void>(),
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}));

import { runInitOpencode, buildNexusMcpBlock } from './init-opencode.js';

describe('buildNexusMcpBlock', () => {
  it('produces the canonical block with passthrough env vars', () => {
    const block = buildNexusMcpBlock({
      cliPath: '/opt/nexus-agents/dist/cli.js',
      sandboxFlavor: 'docker-opencode',
      opencodeConfigPath: '/home/agent/.config/opencode/opencode.json',
    });
    expect(block.type).toBe('local');
    expect(block.command).toEqual(['node', '/opt/nexus-agents/dist/cli.js', '--mode=server']);
    expect(block.enabled).toBe(true);
    expect(block.environment['NEXUS_SANDBOX']).toBe('docker-opencode');
    expect(block.environment['NEXUS_DATA_DIR']).toBe('{env:NEXUS_DATA_DIR}');
    expect(block.environment['NEXUS_OPENCODE_CONFIG']).toBe(
      '/home/agent/.config/opencode/opencode.json'
    );
  });

  it('omits NEXUS_SANDBOX when sandboxFlavor is undefined', () => {
    const block = buildNexusMcpBlock({
      cliPath: '/x/cli.js',
      opencodeConfigPath: '/x/oc.json',
    });
    expect(block.environment['NEXUS_SANDBOX']).toBeUndefined();
    expect(block.environment['NEXUS_DATA_DIR']).toBeDefined();
  });
});

describe('runInitOpencode', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
  });

  it('writes a minimal template when the file does not exist', () => {
    mockExistsSync.mockReturnValue(false);
    const result = runInitOpencode({
      path: '/projects/opencode.json',
      cliPath: '/opt/nexus-agents/dist/cli.js',
      sandboxFlavor: 'docker-opencode',
    });
    expect(result.action).toBe('created');
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const written = mockWriteFileSync.mock.calls[0]?.[1] as string;
    const parsed = JSON.parse(written) as Record<string, unknown>;
    expect(parsed['$schema']).toBe('https://opencode.ai/config.json');
    expect(parsed['providers']).toBeDefined();
    expect(parsed['mcp']).toBeDefined();
    expect((parsed['mcp'] as Record<string, unknown>)['nexus-agents']).toBeDefined();
  });

  it('preserves existing operator-set keys when merging', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        $schema: 'https://opencode.ai/config.json',
        theme: 'tokyo-night',
        providers: {
          anthropic: { options: { apiKey: '{env:ANTHROPIC_API_KEY}' } },
        },
        mcp: { 'other-server': { type: 'local', command: ['x'] } },
      })
    );
    const result = runInitOpencode({
      path: '/projects/opencode.json',
      cliPath: '/opt/nexus-agents/dist/cli.js',
    });
    expect(result.action).toBe('updated');
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as Record<
      string,
      unknown
    >;
    expect(written['theme']).toBe('tokyo-night');
    expect((written['providers'] as Record<string, unknown>)['anthropic']).toBeDefined();
    expect((written['mcp'] as Record<string, unknown>)['other-server']).toBeDefined();
    expect((written['mcp'] as Record<string, unknown>)['nexus-agents']).toBeDefined();
  });

  it('preserves operator-customised enabled:false on nexus-agents block', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        mcp: {
          'nexus-agents': {
            type: 'local',
            command: ['old'],
            enabled: false,
            environment: { CUSTOM: 'value' },
          },
        },
      })
    );
    runInitOpencode({
      path: '/projects/opencode.json',
      cliPath: '/opt/nexus-agents/dist/cli.js',
    });
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as Record<
      string,
      unknown
    >;
    const block = (written['mcp'] as Record<string, unknown>)['nexus-agents'] as Record<
      string,
      unknown
    >;
    // enabled stays false (operator override preserved)
    expect(block['enabled']).toBe(false);
    // command is updated to current binary path
    expect(block['command']).toEqual(['node', '/opt/nexus-agents/dist/cli.js', '--mode=server']);
    // operator-set env vars preserved alongside our defaults
    const env = block['environment'] as Record<string, string>;
    expect(env['CUSTOM']).toBe('value');
    expect(env['NEXUS_DATA_DIR']).toBe('{env:NEXUS_DATA_DIR}');
  });

  it('--dry-run does not write', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify({ mcp: {} }));
    const result = runInitOpencode({
      path: '/projects/opencode.json',
      cliPath: '/opt/cli.js',
      dryRun: true,
    });
    expect(result.action).toBe('dry-run');
    expect(mockWriteFileSync).not.toHaveBeenCalled();
    expect(result.diff).toContain('+');
  });

  it('reports unchanged when re-running on already-merged file (idempotency)', () => {
    // First run: file exists with arbitrary content; merge produces a known
    // result we capture from the writeFileSync mock.
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValueOnce(JSON.stringify({ mcp: {} }));
    runInitOpencode({
      path: '/p/oc.json',
      cliPath: '/opt/cli.js',
      sandboxFlavor: 'docker-opencode',
    });
    const writtenOnce = mockWriteFileSync.mock.calls[0]?.[1] as string;
    expect(writtenOnce).toBeTruthy();

    // Second run: feed the merged JSON back as the "existing" file. Same
    // inputs → identical output → action: unchanged, no write.
    mockReadFileSync.mockReturnValueOnce(writtenOnce);
    mockWriteFileSync.mockClear();
    const result = runInitOpencode({
      path: '/p/oc.json',
      cliPath: '/opt/cli.js',
      sandboxFlavor: 'docker-opencode',
    });
    expect(result.action).toBe('unchanged');
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('throws on malformed JSON (does not silently overwrite)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('{ this is not json');
    expect(() =>
      runInitOpencode({
        path: '/p/broken.json',
        cliPath: '/opt/cli.js',
      })
    ).toThrow(/Failed to parse opencode\.json/);
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it('throws when JSON root is not an object', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('"just a string"');
    expect(() =>
      runInitOpencode({
        path: '/p/array.json',
        cliPath: '/opt/cli.js',
      })
    ).toThrow();
  });
});
