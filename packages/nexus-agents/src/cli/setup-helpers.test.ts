/**
 * Tests for setup-helpers module
 *
 * Tests all exported functions from setup-helpers.ts and setup-formatting.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync, execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import * as setupHelpers from './setup-helpers.js';

// Mock node modules
vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('node:os');

const mockExecSync = vi.mocked(execSync);
const mockExecFileSync = vi.mocked(execFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockHomedir = vi.mocked(homedir);

// Test helpers
function mockPackageJson(name: string): string {
  return JSON.stringify({ name, version: '1.0.0' });
}

function mockMcpJson(servers: Record<string, unknown>): string {
  return JSON.stringify({ mcpServers: servers });
}

function mockFileExists(paths: string[]): void {
  mockExistsSync.mockImplementation((path) => paths.some((p) => String(path).endsWith(p)));
}

describe('setup-environment functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHomedir.mockReturnValue('/home/user');
  });

  describe('detectClaudeCli', () => {
    it('detects installed CLI and handles errors', () => {
      mockExecSync.mockReturnValue('claude version 1.2.3\n');
      expect(setupHelpers.detectClaudeCli()).toMatchObject({
        installed: true,
        version: '1.2.3',
        configPath: '/home/user/.claude',
      });

      mockExecSync.mockImplementation(() => {
        throw new Error('command not found');
      });
      expect(setupHelpers.detectClaudeCli()).toMatchObject({
        installed: false,
        version: undefined,
      });
    });
  });

  describe('detectMcpConfig', () => {
    it('parses mcp.json and handles missing/invalid files', () => {
      mockExistsSync.mockReturnValue(false);
      expect(setupHelpers.detectMcpConfig('/home/user/.claude.json')).toBeUndefined();

      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(mockMcpJson({ 'nexus-agents': {}, 'other-server': {} }));
      expect(setupHelpers.detectMcpConfig('/home/user/.claude.json')).toMatchObject({
        hasNexusAgents: true,
        servers: ['nexus-agents', 'other-server'],
      });

      mockReadFileSync.mockReturnValue('invalid json');
      expect(setupHelpers.detectMcpConfig('/home/user/.claude.json')!.hasNexusAgents).toBe(false);
    });
  });

  describe('detectProjectType', () => {
    it('detects various project types', () => {
      mockFileExists(['tsconfig.json']);
      expect(setupHelpers.detectProjectType('/project')).toBe('typescript');

      mockFileExists(['Cargo.toml']);
      expect(setupHelpers.detectProjectType('/project')).toBe('rust');

      mockFileExists(['package.json']);
      mockReadFileSync.mockReturnValue(mockPackageJson('test'));
      expect(setupHelpers.detectProjectType('/project')).toBe('javascript');

      mockExistsSync.mockReturnValue(false);
      expect(setupHelpers.detectProjectType('/project')).toBe('unknown');
    });
  });

  describe('detectProjectInfo', () => {
    it('gathers project info and uses directory name as fallback', () => {
      mockFileExists(['package.json', 'CLAUDE.md', 'tsconfig.json']);
      mockReadFileSync.mockReturnValue(mockPackageJson('@org/my-project'));
      expect(setupHelpers.detectProjectInfo('/project')).toMatchObject({
        hasPackageJson: true,
        projectType: 'typescript',
        packageName: '@org/my-project',
      });

      mockExistsSync.mockReturnValue(false);
      expect(setupHelpers.detectProjectInfo('/home/user/my-project').packageName).toBe(
        'my-project'
      );
    });
  });

  describe('detectEnvironment', () => {
    it('combines all environment detection', () => {
      mockHomedir.mockReturnValue('/home/user');
      mockExecSync.mockReturnValue('claude version 1.2.3\n');
      mockFileExists(['package.json', 'mcp.json']);
      mockReadFileSync.mockImplementation((path) =>
        String(path).endsWith('mcp.json')
          ? mockMcpJson({ 'nexus-agents': {} })
          : mockPackageJson('test')
      );

      expect(setupHelpers.detectEnvironment('/project')).toMatchObject({
        platform: process.platform,
        homeDir: '/home/user',
        claudeCli: expect.objectContaining({ installed: true }),
        projectInfo: expect.objectContaining({ root: '/project' }),
      });
    });
  });
});

describe('setup-mcp functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('MCP constants', () => {
    it('exports correct MCP entries', () => {
      expect(setupHelpers.NEXUS_AGENTS_MCP_ENTRY.command).toBe('nexus-agents');
      expect(setupHelpers.NEXUS_AGENTS_MCP_NPX_ENTRY.command).toBe('npx');
    });
  });

  describe('isMcpServerConfigured', () => {
    it('returns true when configured, false on error', () => {
      mockExecSync.mockReturnValue('nexus-agents server config\n');
      expect(setupHelpers.isMcpServerConfigured()).toBe(true);

      mockExecSync.mockImplementation(() => {
        throw new Error('not found');
      });
      expect(setupHelpers.isMcpServerConfigured()).toBe(false);
    });
  });

  describe('configureMcpServer', () => {
    it('handles configuration states: existing, success, failure, npx', () => {
      mockExecSync.mockReturnValue('nexus-agents\n');
      expect(setupHelpers.configureMcpServer(false, false).alreadyConfigured).toBe(true);

      mockExecSync.mockReturnValue('');
      mockExecFileSync.mockReturnValue('');
      expect(setupHelpers.configureMcpServer(false, false).success).toBe(true);

      mockExecFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });
      expect(setupHelpers.configureMcpServer(false, false).success).toBe(false);

      mockExecFileSync.mockReturnValue('');
      setupHelpers.configureMcpServer(true, false);
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['nexus-agents', expect.stringContaining('npx')]),
        expect.any(Object)
      );
    });
  });

  describe('generateMcpSnippet', () => {
    it('generates valid JSON with correct command', () => {
      expect(
        JSON.parse(setupHelpers.generateMcpSnippet(false)).mcpServers['nexus-agents'].command
      ).toBe('nexus-agents');
      expect(
        JSON.parse(setupHelpers.generateMcpSnippet(true)).mcpServers['nexus-agents'].command
      ).toBe('npx');
    });
  });

  describe('getMcpJsonPath', () => {
    it('returns correct path for user and project scope', () => {
      mockHomedir.mockReturnValue('/home/user');
      expect(setupHelpers.getMcpJsonPath('user', '/project')).toBe('/home/user/.claude.json');
      expect(setupHelpers.getMcpJsonPath('project', '/project')).toBe('/project/.mcp.json');
    });
  });

  describe('Hook configuration', () => {
    describe('generateHookConfig', () => {
      it('generates valid hook configuration with all lifecycle hooks', () => {
        const { hooks } = setupHelpers.generateHookConfig();
        expect(hooks.SessionStart).toBeDefined();
        expect(hooks.PreToolUse).toBeDefined();
        expect(hooks.PostToolUse).toBeDefined();
        expect(hooks.Stop).toBeDefined();
      });
    });

    describe('areHooksConfigured', () => {
      it('returns true when configured, false on error', () => {
        mockExecSync.mockReturnValue('hooks: nexus-agents commands\n');
        expect(setupHelpers.areHooksConfigured()).toBe(true);

        mockExecSync.mockImplementation(() => {
          throw new Error('not found');
        });
        expect(setupHelpers.areHooksConfigured()).toBe(false);
      });
    });

    describe('configureHooks', () => {
      it('handles already configured and new configuration', () => {
        mockExecSync.mockReturnValue('nexus-agents\n');
        expect(setupHelpers.configureHooks(false).alreadyConfigured).toBe(true);

        mockExecSync.mockReturnValue('');
        mockExecFileSync.mockReturnValue('');
        expect(setupHelpers.configureHooks(false).success).toBe(true);
      });
    });

    describe('mergeHookConfigs', () => {
      it('returns new config when no existing config', () => {
        const newConfig = setupHelpers.generateHookConfig().hooks;
        expect(setupHelpers.mergeHookConfigs(undefined, newConfig)).toEqual(newConfig);
      });

      it('preserves existing non-nexus hooks and deduplicates', () => {
        const existing = {
          SessionStart: [{ hooks: [{ type: 'command' as const, command: 'my-custom-hook' }] }],
        };
        const newConfig = setupHelpers.generateHookConfig().hooks;
        const merged = setupHelpers.mergeHookConfigs(existing, newConfig);
        expect(merged.SessionStart).toHaveLength(2);

        const existingNexus = {
          SessionStart: [
            { hooks: [{ type: 'command' as const, command: 'nexus-agents hooks session-start' }] },
          ],
        };
        const mergedDedup = setupHelpers.mergeHookConfigs(existingNexus, newConfig);
        const hasNexus = mergedDedup.SessionStart?.some((entry) =>
          entry.hooks.some((h) => h.command.includes('nexus-agents'))
        );
        expect(hasNexus).toBe(true);
      });
    });

    describe('generateHookSnippet', () => {
      it('generates valid JSON snippet', () => {
        const snippet = setupHelpers.generateHookSnippet();
        const parsed = JSON.parse(snippet);

        expect(parsed.hooks).toBeDefined();
        expect(parsed.hooks.SessionStart).toBeDefined();
      });
    });
  });
});

describe('setup-rules functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateRulesContent and getRulesFilePath', () => {
    it('generates content with correct keywords and path', () => {
      const content = setupHelpers.generateRulesContent();
      expect(content).toContain('# Nexus-Agents Integration');
      expect(content).toContain('orchestrate');
      expect(setupHelpers.getRulesFilePath('/project')).toBe('/project/.rules/nexus-agents.md');
    });
  });

  describe('createRulesFile', () => {
    it('creates file when not dry run, skips when dry run', () => {
      const expectedPath = '/project/.rules/nexus-agents.md';
      expect(setupHelpers.createRulesFile('/project', false)).toBe(expectedPath);
      expect(mockWriteFileSync).toHaveBeenCalled();

      vi.clearAllMocks();
      expect(setupHelpers.createRulesFile('/project', true)).toBe(expectedPath);
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });
  });

  describe('backupFile and restoreBackup', () => {
    it('creates and restores backups correctly', () => {
      mockReadFileSync.mockReturnValue('original content');
      const backup = setupHelpers.backupFile('/path/to/file.txt');
      expect(backup.type).toBe('file');
      expect(backup.content).toBe('original content');
      expect(backup.backupPath).toContain('.backup.');

      setupHelpers.restoreBackup(backup);
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        '/path/to/file.txt',
        'original content',
        'utf-8'
      );
    });
  });
});

describe('setup-formatting functions', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('isInteractive', () => {
    it('detects interactive mode based on TTY and CI env vars', () => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });
      delete process.env['CI'];
      delete process.env['CONTINUOUS_INTEGRATION'];
      expect(setupHelpers.isInteractive()).toBe(true);

      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });
      expect(setupHelpers.isInteractive()).toBe(false);

      Object.defineProperty(process.stdout, 'isTTY', {
        value: true,
        writable: true,
        configurable: true,
      });
      process.env['CI'] = 'true';
      expect(setupHelpers.isInteractive()).toBe(false);

      delete process.env['CI'];
      process.env['CONTINUOUS_INTEGRATION'] = '1';
      expect(setupHelpers.isInteractive()).toBe(false);
    });
  });

  describe('formatting exports', () => {
    it('exports all formatting functions', () => {
      expect(typeof setupHelpers.formatStatus).toBe('function');
      expect(typeof setupHelpers.formatHeader).toBe('function');
      expect(typeof setupHelpers.formatCodeBlock).toBe('function');
    });
  });
});
