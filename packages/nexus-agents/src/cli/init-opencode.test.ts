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

const { mockReadOpencodeGateway, mockDiscoverModels } = vi.hoisted(() => ({
  mockReadOpencodeGateway: vi.fn<(p: string) => unknown>(),
  mockDiscoverModels: vi.fn<(c: unknown) => Promise<unknown>>(),
}));
vi.mock('../config/opencode-bridge.js', () => ({
  readOpencodeGateway: mockReadOpencodeGateway,
}));
vi.mock('../adapters/openai-compat-adapter.js', () => ({
  discoverModels: mockDiscoverModels,
}));

import {
  runInitOpencode,
  buildNexusMcpBlock,
  buildDefaultPermissionBlock,
  runOpencodeValidate,
} from './init-opencode.js';
import { ok, err, ConfigError } from '../core/index.js';

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

describe('buildDefaultPermissionBlock (#2658)', () => {
  it('asks for bash and edit, allows skill', () => {
    const p = buildDefaultPermissionBlock();
    expect(p['bash']).toBe('ask');
    expect(p['skill']).toBe('allow');
    expect(typeof p['edit']).toBe('object');
  });

  it('hard-denies secrets, keys, and .git in edit — with deny patterns AFTER "*"', () => {
    const edit = buildDefaultPermissionBlock()['edit'] as Record<string, string>;
    // OpenCode evaluates last-matching-rule-wins, so the broad `*` must come
    // first and the deny patterns after, or secrets would resolve to `ask`.
    const keys = Object.keys(edit);
    expect(keys[0]).toBe('*');
    expect(edit['*']).toBe('ask');
    for (const denied of ['**/.env', '**/.env.*', '**/*.pem', '**/*.key', '**/.git/**']) {
      expect(edit[denied]).toBe('deny');
      expect(keys.indexOf(denied)).toBeGreaterThan(0);
    }
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
    // #2658 — a new file gets the default permission block.
    expect(parsed['permission']).toEqual(buildDefaultPermissionBlock());
  });

  it('adds the default permission block to an existing file that lacks one (#2658)', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ $schema: 'https://opencode.ai/config.json', theme: 'tokyo-night' })
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
    expect(written['permission']).toEqual(buildDefaultPermissionBlock());
  });

  it('never overwrites an operator-set permission block (#2658)', () => {
    mockExistsSync.mockReturnValue(true);
    const operatorPermission = { bash: 'allow', edit: 'allow' };
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        $schema: 'https://opencode.ai/config.json',
        permission: operatorPermission,
      })
    );
    runInitOpencode({ path: '/projects/opencode.json', cliPath: '/opt/nexus-agents/dist/cli.js' });
    const written = JSON.parse(mockWriteFileSync.mock.calls[0]?.[1] as string) as Record<
      string,
      unknown
    >;
    expect(written['permission']).toEqual(operatorPermission);
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

describe('runOpencodeValidate', () => {
  beforeEach(() => {
    mockReadOpencodeGateway.mockReset();
    mockDiscoverModels.mockReset();
  });

  it('returns ok when gateway resolves and models are discovered', async () => {
    mockReadOpencodeGateway.mockReturnValue({
      baseURL: 'https://gateway.example/v1',
      apiKey: 'sk-test',
    });
    mockDiscoverModels.mockResolvedValue(ok([{ id: 'm1' }, { id: 'm2' }]));

    const result = await runOpencodeValidate('/projects/opencode.json');
    expect(result.ok).toBe(true);
    expect(result.baseURL).toBe('https://gateway.example/v1');
    expect(result.models).toEqual(['m1', 'm2']);
  });

  it('returns failure when bridge cannot resolve config', async () => {
    mockReadOpencodeGateway.mockReturnValue(null);
    const result = await runOpencodeValidate('/projects/opencode.json');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('does not resolve a usable gateway');
    expect(mockDiscoverModels).not.toHaveBeenCalled();
  });

  it('returns failure when probe fails', async () => {
    mockReadOpencodeGateway.mockReturnValue({
      baseURL: 'https://gateway.example/v1',
      apiKey: 'sk-test',
    });
    mockDiscoverModels.mockResolvedValue(err(new ConfigError('ECONNREFUSED')));

    const result = await runOpencodeValidate('/projects/opencode.json');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('ECONNREFUSED');
    expect(result.baseURL).toBe('https://gateway.example/v1');
  });

  it('returns failure when gateway returns 0 models', async () => {
    mockReadOpencodeGateway.mockReturnValue({
      baseURL: 'https://gateway.example/v1',
      apiKey: 'sk-test',
    });
    mockDiscoverModels.mockResolvedValue(ok([]));

    const result = await runOpencodeValidate('/projects/opencode.json');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('0 models');
  });

  it('does not include the API key in the result payload', async () => {
    mockReadOpencodeGateway.mockReturnValue({
      baseURL: 'https://gateway.example/v1',
      apiKey: 'sk-secret-do-not-leak',
    });
    mockDiscoverModels.mockResolvedValue(ok([{ id: 'm1' }]));

    const result = await runOpencodeValidate('/projects/opencode.json');
    const flat = JSON.stringify(result);
    expect(flat).not.toContain('sk-secret-do-not-leak');
  });
});
