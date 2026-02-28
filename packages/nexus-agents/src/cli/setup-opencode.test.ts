/**
 * Tests for OpenCode MCP auto-configuration (#1253).
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
