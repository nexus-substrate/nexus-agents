/**
 * nexus-agents setup environment detection tests
 *
 * @module cli/setup-environment
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

// Mock modules before importing the tested module
vi.mock('node:child_process');
vi.mock('node:fs');
vi.mock('node:os');
vi.mock('node:path');

describe('setup-environment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectClaudeCli', () => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const setupMocks = () => {
      vi.mocked(os.homedir).mockReturnValue('/home/user');
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
    };

    it('should detect installed Claude CLI with valid version', async () => {
      setupMocks();
      vi.mocked(childProcess.execSync).mockReturnValue('Claude CLI version 1.2.3\n');

      const { detectClaudeCli } = await import('./setup-environment.js');
      const result = detectClaudeCli();

      expect(result).toEqual({
        installed: true,
        version: '1.2.3',
        configPath: '/home/user/.claude',
        mcpJsonPath: '/home/user/.claude.json',
      });
    });

    it('should parse version from different output formats', async () => {
      setupMocks();
      vi.mocked(childProcess.execSync).mockReturnValue('v2.5.10-beta\n');

      const { detectClaudeCli } = await import('./setup-environment.js');
      const result = detectClaudeCli();

      expect(result).toEqual({
        installed: true,
        version: '2.5.10',
        configPath: '/home/user/.claude',
        mcpJsonPath: '/home/user/.claude.json',
      });
    });

    it('should handle Claude CLI without version number', async () => {
      setupMocks();
      vi.mocked(childProcess.execSync).mockReturnValue('Claude CLI\n');

      const { detectClaudeCli } = await import('./setup-environment.js');
      const result = detectClaudeCli();

      expect(result).toEqual({
        installed: true,
        version: undefined,
        configPath: '/home/user/.claude',
        mcpJsonPath: '/home/user/.claude.json',
      });
    });

    it('should handle Claude CLI not installed', async () => {
      setupMocks();
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        throw new Error('command not found');
      });

      const { detectClaudeCli } = await import('./setup-environment.js');
      const result = detectClaudeCli();

      expect(result).toEqual({
        installed: false,
        version: undefined,
        configPath: '/home/user/.claude',
        mcpJsonPath: '/home/user/.claude.json',
      });
    });

    it('should use 3 second timeout for execSync', async () => {
      setupMocks();
      vi.mocked(childProcess.execSync).mockReturnValue('Claude CLI version 1.0.0\n');

      const { detectClaudeCli } = await import('./setup-environment.js');
      detectClaudeCli();

      expect(childProcess.execSync).toHaveBeenCalledWith('claude --version', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 3000,
      });
    });
  });

  describe('detectMcpConfig', () => {
    it('should return undefined when mcp.json does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { detectMcpConfig } = await import('./setup-environment.js');
      const result = detectMcpConfig('/path/to/mcp.json');

      expect(result).toBeUndefined();
    });

    it('should detect MCP config with nexus-agents server', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          mcpServers: {
            'nexus-agents': { command: 'npx', args: ['nexus-agents', 'mcp'] },
            'other-server': { command: 'node', args: ['server.js'] },
          },
        })
      );

      const { detectMcpConfig } = await import('./setup-environment.js');
      const result = detectMcpConfig('/path/to/mcp.json');

      expect(result).toEqual({
        exists: true,
        path: '/path/to/mcp.json',
        hasNexusAgents: true,
        servers: ['nexus-agents', 'other-server'],
      });
    });

    it('should detect MCP config without nexus-agents', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          mcpServers: {
            'other-server': { command: 'node', args: ['server.js'] },
          },
        })
      );

      const { detectMcpConfig } = await import('./setup-environment.js');
      const result = detectMcpConfig('/path/to/mcp.json');

      expect(result).toEqual({
        exists: true,
        path: '/path/to/mcp.json',
        hasNexusAgents: false,
        servers: ['other-server'],
      });
    });

    it('should handle empty mcpServers object', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ mcpServers: {} }));

      const { detectMcpConfig } = await import('./setup-environment.js');
      const result = detectMcpConfig('/path/to/mcp.json');

      expect(result).toEqual({
        exists: true,
        path: '/path/to/mcp.json',
        hasNexusAgents: false,
        servers: [],
      });
    });

    it('should handle missing mcpServers field', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      const { detectMcpConfig } = await import('./setup-environment.js');
      const result = detectMcpConfig('/path/to/mcp.json');

      expect(result).toEqual({
        exists: true,
        path: '/path/to/mcp.json',
        hasNexusAgents: false,
        servers: [],
      });
    });

    it('should handle invalid JSON gracefully', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{ invalid json }');

      const { detectMcpConfig } = await import('./setup-environment.js');
      const result = detectMcpConfig('/path/to/mcp.json');

      expect(result).toEqual({
        exists: true,
        path: '/path/to/mcp.json',
        hasNexusAgents: false,
        servers: [],
      });
    });

    it('should handle file read errors', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { detectMcpConfig } = await import('./setup-environment.js');
      const result = detectMcpConfig('/path/to/mcp.json');

      expect(result).toEqual({
        exists: true,
        path: '/path/to/mcp.json',
        hasNexusAgents: false,
        servers: [],
      });
    });
  });

  describe('detectProjectType', () => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const setupPathMocks = () => {
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
    };

    it('should detect TypeScript project from tsconfig.json', async () => {
      setupPathMocks();
      vi.mocked(fs.existsSync).mockImplementation((p) => p === '/project/tsconfig.json');

      const { detectProjectType } = await import('./setup-environment.js');
      const result = detectProjectType('/project');

      expect(result).toBe('typescript');
    });

    it('should detect Rust project from Cargo.toml', async () => {
      setupPathMocks();
      vi.mocked(fs.existsSync).mockImplementation((p) => p === '/project/Cargo.toml');

      const { detectProjectType } = await import('./setup-environment.js');
      const result = detectProjectType('/project');

      expect(result).toBe('rust');
    });

    it('should detect Go project from go.mod', async () => {
      setupPathMocks();
      vi.mocked(fs.existsSync).mockImplementation((p) => p === '/project/go.mod');

      const { detectProjectType } = await import('./setup-environment.js');
      const result = detectProjectType('/project');

      expect(result).toBe('go');
    });

    it('should detect Python project from pyproject.toml', async () => {
      setupPathMocks();
      vi.mocked(fs.existsSync).mockImplementation((p) => p === '/project/pyproject.toml');

      const { detectProjectType } = await import('./setup-environment.js');
      const result = detectProjectType('/project');

      expect(result).toBe('python');
    });

    it('should detect Python project from setup.py', async () => {
      setupPathMocks();
      vi.mocked(fs.existsSync).mockImplementation((p) => p === '/project/setup.py');

      const { detectProjectType } = await import('./setup-environment.js');
      const result = detectProjectType('/project');

      expect(result).toBe('python');
    });

    it('should detect Java project from pom.xml', async () => {
      setupPathMocks();
      vi.mocked(fs.existsSync).mockImplementation((p) => p === '/project/pom.xml');

      const { detectProjectType } = await import('./setup-environment.js');
      const result = detectProjectType('/project');

      expect(result).toBe('java');
    });

    it('should detect Java project from build.gradle', async () => {
      setupPathMocks();
      vi.mocked(fs.existsSync).mockImplementation((p) => p === '/project/build.gradle');

      const { detectProjectType } = await import('./setup-environment.js');
      const result = detectProjectType('/project');

      expect(result).toBe('java');
    });

    it('should detect TypeScript from package.json with typescript dep', async () => {
      setupPathMocks();
      vi.mocked(fs.existsSync).mockImplementation((p) => p === '/project/package.json');
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          devDependencies: { typescript: '^5.0.0' },
        })
      );

      const { detectProjectType } = await import('./setup-environment.js');
      const result = detectProjectType('/project');

      expect(result).toBe('typescript');
    });

    it('should detect JavaScript from package.json without typescript', async () => {
      setupPathMocks();
      vi.mocked(fs.existsSync).mockImplementation((p) => p === '/project/package.json');
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          devDependencies: { eslint: '^8.0.0' },
        })
      );

      const { detectProjectType } = await import('./setup-environment.js');
      const result = detectProjectType('/project');

      expect(result).toBe('javascript');
    });

    it('should return unknown for unrecognized projects', async () => {
      setupPathMocks();
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { detectProjectType } = await import('./setup-environment.js');
      const result = detectProjectType('/project');

      expect(result).toBe('unknown');
    });
  });

  describe('detectProjectInfo', () => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const setupPathMocks = () => {
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
      vi.mocked(path.basename).mockImplementation((p) => {
        const pathStr = typeof p === 'string' ? p : (p as { toString(): string }).toString();
        const parts = pathStr.split('/');
        return parts[parts.length - 1] ?? '';
      });
    };

    it('should detect complete project info with package.json', async () => {
      setupPathMocks();
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const paths = [
          '/project/package.json',
          '/project/CLAUDE.md',
          '/project/.rules',
          '/project/nexus-agents.yaml',
          '/project/tsconfig.json',
        ];
        const pathStr = typeof p === 'string' ? p : (p as { toString(): string }).toString();
        return paths.includes(pathStr);
      });
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          name: 'my-awesome-project',
          devDependencies: { typescript: '^5.0.0' },
        })
      );

      const { detectProjectInfo } = await import('./setup-environment.js');
      const result = detectProjectInfo('/project');

      expect(result).toEqual({
        root: '/project',
        hasPackageJson: true,
        hasClaudeMd: true,
        hasClaudeRules: true,
        hasNexusConfig: true,
        projectType: 'typescript',
        packageName: 'my-awesome-project',
      });
    });

    it('should use directory basename when package name missing', async () => {
      setupPathMocks();
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { detectProjectInfo } = await import('./setup-environment.js');
      const result = detectProjectInfo('/home/user/my-project');

      expect(result.packageName).toBe('my-project');
    });

    it('should handle package.json without name field', async () => {
      setupPathMocks();
      vi.mocked(fs.existsSync).mockImplementation((p) => p === '/project/package.json');
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({}));

      const { detectProjectInfo } = await import('./setup-environment.js');
      const result = detectProjectInfo('/project');

      expect(result.packageName).toBe('project');
    });

    it('should handle invalid package.json gracefully', async () => {
      setupPathMocks();
      vi.mocked(fs.existsSync).mockImplementation((p) => p === '/project/package.json');
      vi.mocked(fs.readFileSync).mockReturnValue('{ invalid }');

      const { detectProjectInfo } = await import('./setup-environment.js');
      const result = detectProjectInfo('/project');

      expect(result.packageName).toBe('project');
    });

    it('should detect minimal project without any configs', async () => {
      setupPathMocks();
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { detectProjectInfo } = await import('./setup-environment.js');
      const result = detectProjectInfo('/empty-project');

      expect(result).toEqual({
        root: '/empty-project',
        hasPackageJson: false,
        hasClaudeMd: false,
        hasClaudeRules: false,
        hasNexusConfig: false,
        projectType: 'unknown',
        packageName: 'empty-project',
      });
    });
  });

  describe('detectEnvironment', () => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const setupCompleteMocks = () => {
      vi.mocked(os.homedir).mockReturnValue('/home/user');
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
      vi.mocked(path.basename).mockImplementation((p) => {
        const pathStr = typeof p === 'string' ? p : (p as { toString(): string }).toString();
        const parts = pathStr.split('/');
        return parts[parts.length - 1] ?? '';
      });
      vi.mocked(childProcess.execSync).mockReturnValue('Claude CLI version 1.2.3\n');
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const existingPaths = [
          '/home/user/.claude.json',
          '/project/package.json',
          '/project/tsconfig.json',
        ];
        const pathStr = typeof p === 'string' ? p : (p as { toString(): string }).toString();
        return existingPaths.includes(pathStr);
      });
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (p === '/home/user/.claude.json') {
          return JSON.stringify({
            projects: {
              '/project': {
                mcpServers: {
                  'nexus-agents': { command: 'npx', args: ['nexus-agents', 'mcp'] },
                },
              },
            },
          });
        }
        if (p === '/project/package.json') {
          return JSON.stringify({
            name: 'test-project',
            devDependencies: { typescript: '^5.0.0' },
          });
        }
        return '{}';
      });
    };

    it('should detect complete environment with all components', async () => {
      setupCompleteMocks();

      const { detectEnvironment } = await import('./setup-environment.js');
      const result = detectEnvironment('/project');

      expect(result).toMatchObject({
        platform: process.platform,
        homeDir: '/home/user',
        claudeCli: {
          installed: true,
          version: '1.2.3',
          configPath: '/home/user/.claude',
          mcpJsonPath: '/home/user/.claude.json',
        },
        existingMcpConfig: {
          exists: true,
          path: '/home/user/.claude.json',
          hasNexusAgents: true,
          servers: ['nexus-agents'],
        },
        projectInfo: {
          root: '/project',
          hasPackageJson: true,
          projectType: 'typescript',
          packageName: 'test-project',
        },
      });
    });

    it('should handle environment without Claude CLI', async () => {
      vi.mocked(os.homedir).mockReturnValue('/home/user');
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
      vi.mocked(path.basename).mockImplementation((p) => {
        const pathStr = typeof p === 'string' ? p : (p as { toString(): string }).toString();
        const parts = pathStr.split('/');
        return parts[parts.length - 1] ?? '';
      });
      vi.mocked(childProcess.execSync).mockImplementation(() => {
        throw new Error('command not found');
      });
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { detectEnvironment } = await import('./setup-environment.js');
      const result = detectEnvironment('/project');

      expect(result.claudeCli.installed).toBe(false);
      expect(result.existingMcpConfig).toBeUndefined();
    });

    it('should handle environment without MCP config', async () => {
      vi.mocked(os.homedir).mockReturnValue('/home/user');
      vi.mocked(path.join).mockImplementation((...args) => args.join('/'));
      vi.mocked(path.basename).mockImplementation((p) => {
        const pathStr = typeof p === 'string' ? p : (p as { toString(): string }).toString();
        const parts = pathStr.split('/');
        return parts[parts.length - 1] ?? '';
      });
      vi.mocked(childProcess.execSync).mockReturnValue('Claude CLI version 1.0.0\n');
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { detectEnvironment } = await import('./setup-environment.js');
      const result = detectEnvironment('/project');

      expect(result.claudeCli.installed).toBe(true);
      expect(result.existingMcpConfig).toBeUndefined();
    });
  });
});
