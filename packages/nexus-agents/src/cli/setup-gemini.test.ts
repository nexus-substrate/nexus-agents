/**
 * Tests for Gemini CLI MCP auto-configuration (#1259).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, existsSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock homedir to use temp directory
const testHome = join(tmpdir(), `nexus-gemini-test-${String(Date.now())}`);
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
      if (args?.[0] === 'gemini') return '/usr/bin/gemini\n';
      if (cmd === 'gemini') return 'gemini version 0.4.2\n';
      throw new Error('not found');
    }),
  };
});

describe('Gemini CLI MCP auto-configuration (#1259)', () => {
  beforeEach(() => {
    mkdirSync(testHome, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testHome)) {
      rmSync(testHome, { recursive: true, force: true });
    }
  });

  it('detects Gemini CLI', async () => {
    const { detectGeminiCli } = await import('./setup-gemini.js');
    const info = detectGeminiCli();
    expect(info.installed).toBe(true);
    expect(info.version).toBe('0.4.2');
  });

  it('creates settings.json in ~/.gemini', async () => {
    const { configureGemini } = await import('./setup-gemini.js');
    const result = configureGemini(false, false);
    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(false);

    const configPath = join(testHome, '.gemini', 'settings.json');
    expect(existsSync(configPath)).toBe(true);
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    const servers = config['mcpServers'] as Record<string, unknown>;
    expect(servers['nexus-agents']).toBeDefined();
  });

  it('skips if already configured', async () => {
    const configDir = join(testHome, '.gemini');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'settings.json'),
      JSON.stringify({
        mcpServers: { 'nexus-agents': { command: 'npx', args: ['test'], timeout: 30000 } },
      }),
      'utf-8'
    );

    const { configureGemini } = await import('./setup-gemini.js');
    const result = configureGemini(false, false);
    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(true);
  });

  it('overwrites with force flag', async () => {
    const configDir = join(testHome, '.gemini');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'settings.json'),
      JSON.stringify({
        mcpServers: { 'nexus-agents': { command: 'old', args: [], timeout: 5000 } },
      }),
      'utf-8'
    );

    const { configureGemini } = await import('./setup-gemini.js');
    const result = configureGemini(true, false);
    expect(result.success).toBe(true);
    expect(result.alreadyConfigured).toBe(false);
  });

  it('dry-run reports without writing', async () => {
    const { configureGemini } = await import('./setup-gemini.js');
    const result = configureGemini(false, true);
    expect(result.success).toBe(true);
    expect(result.message).toContain('Would configure');
    expect(existsSync(join(testHome, '.gemini', 'settings.json'))).toBe(false);
  });

  it('preserves existing MCP servers', async () => {
    const configDir = join(testHome, '.gemini');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'settings.json'),
      JSON.stringify({
        mcpServers: { 'other-tool': { command: 'other', args: [], timeout: 10000 } },
        theme: 'dark',
      }),
      'utf-8'
    );

    const { configureGemini } = await import('./setup-gemini.js');
    const result = configureGemini(false, false);
    expect(result.success).toBe(true);

    const config = JSON.parse(readFileSync(result.configPath, 'utf-8')) as Record<string, unknown>;
    const servers = config['mcpServers'] as Record<string, unknown>;
    expect(servers['other-tool']).toBeDefined();
    expect(servers['nexus-agents']).toBeDefined();
    expect(config['theme']).toBe('dark');
  });
});
