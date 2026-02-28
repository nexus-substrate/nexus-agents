/**
 * Tests for OpenCode MCP auto-configuration (#1253, #1255 JSONC support).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock homedir to use temp directory
const testHome = join(tmpdir(), `nexus-opencode-test-${String(Date.now())}`);
vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return { ...actual, homedir: (): string => testHome };
});

// Mock child_process to control CLI detection
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  return {
    ...actual,
    execFileSync: vi.fn().mockImplementation((cmd: string, args?: readonly string[]) => {
      if (args?.[0] === 'opencode') return '/usr/bin/opencode\n';
      if (cmd === 'opencode') return 'opencode version 1.2.15\n';
      throw new Error('not found');
    }),
  };
});

describe('OpenCode MCP auto-configuration (#1253)', () => {
  beforeEach(() => {
    mkdirSync(testHome, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testHome)) {
      rmSync(testHome, { recursive: true, force: true });
    }
  });

  it('detects OpenCode CLI', async () => {
    const { detectOpenCodeCli } = await import('./setup-opencode.js');
    const info = detectOpenCodeCli();
    expect(info.installed).toBe(true);
    expect(info.version).toBe('1.2.15');
  });

  it('creates opencode.json in config directory', async () => {
    const { configureOpenCode } = await import('./setup-opencode.js');
    const result = configureOpenCode(false, false);
    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(false);

    const configPath = join(testHome, '.config', 'opencode', 'opencode.json');
    expect(existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    const mcp = config['mcp'] as Record<string, unknown>;
    expect(mcp['nexus-agents']).toBeDefined();
  });

  it('skips if already configured', async () => {
    const configDir = join(testHome, '.config', 'opencode');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'opencode.json'),
      JSON.stringify({
        mcp: { 'nexus-agents': { type: 'local', command: ['test'], enabled: true } },
      }),
      'utf-8'
    );

    const { configureOpenCode } = await import('./setup-opencode.js');
    const result = configureOpenCode(false, false);
    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(true);
  });

  it('overwrites with force flag', async () => {
    const configDir = join(testHome, '.config', 'opencode');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'opencode.json'),
      JSON.stringify({
        mcp: { 'nexus-agents': { type: 'local', command: ['old'], enabled: true } },
      }),
      'utf-8'
    );

    const { configureOpenCode } = await import('./setup-opencode.js');
    const result = configureOpenCode(true, false);
    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(false);
  });

  it('dry-run reports without writing', async () => {
    const { configureOpenCode } = await import('./setup-opencode.js');
    const result = configureOpenCode(false, true);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Would configure');
    expect(existsSync(join(testHome, '.config', 'opencode', 'opencode.json'))).toBe(false);
  });
});

describe('JSONC support (#1255)', () => {
  beforeEach(() => {
    mkdirSync(testHome, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testHome)) {
      rmSync(testHome, { recursive: true, force: true });
    }
  });

  it('resolves .jsonc over .json when both exist', async () => {
    const { resolveOpenCodeConfig } = await import('./setup-opencode.js');
    const configDir = join(testHome, '.config', 'opencode');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'opencode.json'), '{}', 'utf-8');
    writeFileSync(join(configDir, 'opencode.jsonc'), '{}', 'utf-8');

    const resolved = resolveOpenCodeConfig(configDir);
    expect(resolved.isJsonc).toBe(true);
    expect(resolved.path).toContain('opencode.jsonc');
    expect(resolved.exists).toBe(true);
  });

  it('falls back to .json when no .jsonc exists', async () => {
    const { resolveOpenCodeConfig } = await import('./setup-opencode.js');
    const configDir = join(testHome, '.config', 'opencode');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'opencode.json'), '{}', 'utf-8');

    const resolved = resolveOpenCodeConfig(configDir);
    expect(resolved.isJsonc).toBe(false);
    expect(resolved.path).toContain('opencode.json');
    expect(resolved.exists).toBe(true);
  });

  it('returns non-existent .json path when dir is empty', async () => {
    const { resolveOpenCodeConfig } = await import('./setup-opencode.js');
    const configDir = join(testHome, '.config', 'opencode');
    mkdirSync(configDir, { recursive: true });

    const resolved = resolveOpenCodeConfig(configDir);
    expect(resolved.exists).toBe(false);
    expect(resolved.path).toContain('opencode.json');
  });

  it('parses JSONC with single-line comments', async () => {
    const configDir = join(testHome, '.config', 'opencode');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'opencode.jsonc'),
      [
        '{',
        '  // MCP server configuration',
        '  "mcp": {',
        '    "other-server": { "type": "local", "command": ["other"], "enabled": true }',
        '  }',
        '}',
      ].join('\n'),
      'utf-8'
    );

    const { configureOpenCode } = await import('./setup-opencode.js');
    const result = configureOpenCode(false, false);
    expect(result.success).toBe(true);
    expect(result.configPath).toContain('opencode.jsonc');

    const written = readFileSync(result.configPath, 'utf-8');
    expect(written).toContain('nexus-agents');
    expect(written).toContain('other-server');
  });

  it('parses JSONC with block comments', async () => {
    const configDir = join(testHome, '.config', 'opencode');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'opencode.jsonc'),
      ['/* OpenCode configuration */', '{', '  "mcp": {}', '}'].join('\n'),
      'utf-8'
    );

    const { configureOpenCode } = await import('./setup-opencode.js');
    const result = configureOpenCode(false, false);
    expect(result.success).toBe(true);
    expect(result.configPath).toContain('opencode.jsonc');
  });

  it('preserves comments when writing to .jsonc', async () => {
    const configDir = join(testHome, '.config', 'opencode');
    mkdirSync(configDir, { recursive: true });
    const original = [
      '{',
      '  // My custom MCP servers',
      '  "mcp": {',
      '    // Keep this server',
      '    "custom": { "type": "local", "command": ["custom-cmd"], "enabled": true }',
      '  }',
      '}',
    ].join('\n');
    writeFileSync(join(configDir, 'opencode.jsonc'), original, 'utf-8');

    const { configureOpenCode } = await import('./setup-opencode.js');
    const result = configureOpenCode(false, false);
    expect(result.success).toBe(true);

    const written = readFileSync(result.configPath, 'utf-8');
    // Comments must be preserved
    expect(written).toContain('// My custom MCP servers');
    expect(written).toContain('// Keep this server');
    // Existing entry preserved
    expect(written).toContain('"custom"');
    // New entry added
    expect(written).toContain('"nexus-agents"');
  });

  it('detects already-configured in .jsonc file', async () => {
    const configDir = join(testHome, '.config', 'opencode');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'opencode.jsonc'),
      [
        '{',
        '  // Already has nexus-agents',
        '  "mcp": {',
        '    "nexus-agents": { "type": "local", "command": ["npx", "nexus-agents"], "enabled": true }',
        '  }',
        '}',
      ].join('\n'),
      'utf-8'
    );

    const { configureOpenCode } = await import('./setup-opencode.js');
    const result = configureOpenCode(false, false);
    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(true);
  });

  it('merges into existing .json without losing other entries', async () => {
    const configDir = join(testHome, '.config', 'opencode');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'opencode.json'),
      JSON.stringify(
        {
          $schema: 'https://opencode.ai/config.json',
          mcp: {
            'existing-server': { type: 'local', command: ['exist'], enabled: true },
          },
          provider: { anthropic: {} },
        },
        null,
        2
      ),
      'utf-8'
    );

    const { configureOpenCode } = await import('./setup-opencode.js');
    const result = configureOpenCode(false, false);
    expect(result.success).toBe(true);

    const config = JSON.parse(readFileSync(result.configPath, 'utf-8')) as Record<string, unknown>;
    const mcp = config['mcp'] as Record<string, unknown>;
    expect(mcp['existing-server']).toBeDefined();
    expect(mcp['nexus-agents']).toBeDefined();
    expect(config['provider']).toBeDefined();
  });
});

describe('Project-local config (#1257)', () => {
  beforeEach(() => {
    mkdirSync(testHome, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testHome)) {
      rmSync(testHome, { recursive: true, force: true });
    }
  });

  it('writes to project root when projectRoot is provided', async () => {
    const projectDir = join(testHome, 'my-project');
    mkdirSync(projectDir, { recursive: true });

    const { configureOpenCode } = await import('./setup-opencode.js');
    const result = configureOpenCode(false, false, {
      force: false,
      dryRun: false,
      projectRoot: projectDir,
    });
    expect(result.success).toBe(true);

    const configPath = join(projectDir, 'opencode.json');
    expect(existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    const mcp = config['mcp'] as Record<string, unknown>;
    expect(mcp['nexus-agents']).toBeDefined();
  });

  it('merges into existing project-local .jsonc', async () => {
    const projectDir = join(testHome, 'my-project');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, 'opencode.jsonc'),
      [
        '{',
        '  // Project-local MCP config',
        '  "mcp": {',
        '    "local-tool": { "type": "local", "command": ["tool"], "enabled": true }',
        '  }',
        '}',
      ].join('\n'),
      'utf-8'
    );

    const { configureOpenCode } = await import('./setup-opencode.js');
    const result = configureOpenCode(false, false, {
      force: false,
      dryRun: false,
      projectRoot: projectDir,
    });
    expect(result.success).toBe(true);
    expect(result.configPath).toContain('opencode.jsonc');

    const written = readFileSync(result.configPath, 'utf-8');
    expect(written).toContain('// Project-local MCP config');
    expect(written).toContain('"local-tool"');
    expect(written).toContain('"nexus-agents"');
  });

  it('rejects non-existent projectRoot', async () => {
    const { configureOpenCode } = await import('./setup-opencode.js');
    const result = configureOpenCode(false, false, {
      force: false,
      dryRun: false,
      projectRoot: join(testHome, 'does-not-exist'),
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('does not exist');
  });

  it('detects already-configured in project-local config', async () => {
    const projectDir = join(testHome, 'my-project');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(
      join(projectDir, 'opencode.json'),
      JSON.stringify({
        mcp: { 'nexus-agents': { type: 'local', command: ['test'], enabled: true } },
      }),
      'utf-8'
    );

    const { configureOpenCode } = await import('./setup-opencode.js');
    const result = configureOpenCode(false, false, {
      force: false,
      dryRun: false,
      projectRoot: projectDir,
    });
    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(true);
  });
});
