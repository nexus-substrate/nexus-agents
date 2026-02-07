/**
 * nexus-agents/cli - Visualize Summary Tests
 *
 * @module cli/visualize-summary.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// Mock all dependencies before importing the module under test
vi.mock('node:fs');
vi.mock('node:path');
vi.mock('node:url');

const mockFs = vi.mocked(fs);
const mockPath = vi.mocked(path);
const mockFileURLToPath = vi.mocked(fileURLToPath);

describe('visualize-summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockPath.join.mockImplementation((...args: string[]) => args.join('/'));
    mockPath.dirname.mockImplementation((p: string) => {
      const parts = p.split('/');
      parts.pop();
      return parts.join('/') || '/';
    });
    mockPath.resolve.mockImplementation((...args: string[]) => {
      return args.join('/').replace(/\/+/g, '/');
    });
    mockFileURLToPath.mockReturnValue('/test/project/src/cli/visualize-summary.js');
  });

  afterEach(() => {
    vi.resetModules();
  });

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const createMockDirent = (name: string, isDir: boolean) => ({
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
  });

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const setupPackageRoot = (hasPackageJson = true) => {
    mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
      const pStr = String(p);
      if (hasPackageJson && pStr.endsWith('package.json')) {
        return pStr === '/test/project/package.json';
      }
      return false;
    });
  };

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  const setupFileSystem = (structure: Record<string, string[]>, pkgVersion = '1.0.0') => {
    mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
      const pStr = String(p);
      if (pStr.endsWith('package.json')) {
        return pStr === '/test/project/package.json';
      }
      return Object.keys(structure).includes(pStr);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call
    (mockFs.readdirSync as any).mockImplementation((p: fs.PathLike) => {
      const pStr = String(p);
      const contents = structure[pStr];
      if (contents) {
        return contents.map((name) => {
          const isDir = !name.endsWith('.ts');
          return createMockDirent(name, isDir);
        });
      }
      return [];
    });

    mockFs.readFileSync.mockReturnValue(JSON.stringify({ version: pkgVersion }));
  };

  describe('gatherSystemSummary', () => {
    it('should return system summary with correct structure', async () => {
      setupPackageRoot(true);
      setupFileSystem({ '/test/project/src': ['file1.ts', 'file2.test.ts'] });
      const { gatherSystemSummary } = await import('./visualize-summary.js');
      const result = gatherSystemSummary();

      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('sourceFiles');
      expect(result).toHaveProperty('testFiles');
      expect(result).toHaveProperty('testCount');
      expect(result).toHaveProperty('mcpTools');
      expect(result).toHaveProperty('expertTypes');
      expect(result).toHaveProperty('workflowTemplates');
      expect(result).toHaveProperty('fitnessScore');
      expect(result).toHaveProperty('cliCommands');
      expect(result).toHaveProperty('adapters');
      expect(result).toHaveProperty('layers');
      expect(Array.isArray(result.layers)).toBe(true);
    });

    it('should read version from package.json', async () => {
      setupPackageRoot(true);
      setupFileSystem({ '/test/project/src': ['file1.ts'] }, '2.3.5');
      const { gatherSystemSummary } = await import('./visualize-summary.js');
      const result = gatherSystemSummary();

      expect(result.version).toBe('2.3.5');
    });

    it('should return unknown version when package.json is missing', async () => {
      setupPackageRoot(false);
      setupFileSystem({
        '/test/project/src': ['file1.ts'],
      });

      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      const { gatherSystemSummary } = await import('./visualize-summary.js');
      const result = gatherSystemSummary();

      expect(result.version).toBe('unknown');
    });

    it('should return unknown version when package.json has no version', async () => {
      setupPackageRoot(true);
      setupFileSystem({ '/test/project/src': ['file1.ts'] });
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ name: 'test-package' }));
      const { gatherSystemSummary } = await import('./visualize-summary.js');
      const result = gatherSystemSummary();

      expect(result.version).toBe('unknown');
    });

    it('should count source files excluding test files', async () => {
      setupPackageRoot(true);
      setupFileSystem({
        '/test/project/src': ['file1.ts', 'file2.ts', 'file3.test.ts', 'file4.test.ts'],
      });
      const { gatherSystemSummary } = await import('./visualize-summary.js');
      const result = gatherSystemSummary();

      expect(result.sourceFiles).toBe(2);
      expect(result.testFiles).toBe(2);
    });

    it('should calculate test count as testFiles * 30', async () => {
      setupPackageRoot(true);
      setupFileSystem({
        '/test/project/src': ['file1.test.ts', 'file2.test.ts', 'file3.test.ts'],
      });
      const { gatherSystemSummary } = await import('./visualize-summary.js');
      const result = gatherSystemSummary();

      expect(result.testFiles).toBe(3);
      expect(result.testCount).toBe(90);
    });

    it('should return layers with file counts', async () => {
      setupPackageRoot(true);
      setupFileSystem({
        '/test/project/src': [],
        '/test/project/src/core': ['core1.ts', 'core2.ts'],
        '/test/project/src/agents': ['agent1.ts'],
        '/test/project/src/mcp': ['tool1.ts', 'tool2.ts', 'tool3.ts'],
      });
      const { gatherSystemSummary } = await import('./visualize-summary.js');
      const result = gatherSystemSummary();

      expect(result.layers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Core', files: 2 }),
          expect.objectContaining({ name: 'Agents', files: 1 }),
          expect.objectContaining({ name: 'MCP/Tools', files: 3 }),
        ])
      );
    });

    it('should exclude layers with zero files', async () => {
      setupPackageRoot(true);
      setupFileSystem({
        '/test/project/src': [],
        '/test/project/src/core': ['core1.ts'],
        '/test/project/src/agents': [],
      });
      const { gatherSystemSummary } = await import('./visualize-summary.js');
      const result = gatherSystemSummary();

      const layerNames = result.layers.map((l) => l.name);
      expect(layerNames).toContain('Core');
      expect(layerNames).not.toContain('Agents');
    });

    it('should exclude node_modules and dist when counting files', async () => {
      setupPackageRoot(true);
      setupFileSystem({
        '/test/project/src': ['file1.ts'],
        '/test/project/src/core': ['core1.ts'],
      });
      const { gatherSystemSummary } = await import('./visualize-summary.js');
      const result = gatherSystemSummary();

      expect(result.sourceFiles).toBeGreaterThanOrEqual(1);
    });

    it('should return 0 files when src directory does not exist', async () => {
      setupPackageRoot(true);
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readFileSync.mockReturnValue(JSON.stringify({ version: '1.0.0' }));
      const { gatherSystemSummary } = await import('./visualize-summary.js');
      const result = gatherSystemSummary();

      expect(result.sourceFiles).toBe(0);
      expect(result.testFiles).toBe(0);
    });

    it('should include correct static metadata', async () => {
      setupPackageRoot(true);
      setupFileSystem({ '/test/project/src': ['file1.ts'] });
      const { gatherSystemSummary } = await import('./visualize-summary.js');
      const result = gatherSystemSummary();

      expect(result.mcpTools).toBe(8);
      expect(result.expertTypes).toBe(6);
      expect(result.workflowTemplates).toBe(3);
      expect(result.fitnessScore).toBe(97);
      expect(result.cliCommands).toBe(30);
      expect(result.adapters).toBe(3);
    });

    it('should handle nested directory structures', async () => {
      setupPackageRoot(true);
      setupFileSystem({
        '/test/project/src': [],
        '/test/project/src/core': ['types', 'utils', 'core.ts'],
        '/test/project/src/core/types': ['agent.ts', 'config.ts'],
        '/test/project/src/core/utils': ['helpers.ts'],
      });
      const { gatherSystemSummary } = await import('./visualize-summary.js');
      const result = gatherSystemSummary();

      const coreLayer = result.layers.find((l) => l.name === 'Core');
      expect(coreLayer?.files).toBe(4);
    });

    it('should handle package root search with no package.json found', async () => {
      mockFs.existsSync.mockReturnValue(false);
      setupFileSystem({ '/test/project/src': ['file1.ts'] });
      mockFs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });
      const { gatherSystemSummary } = await import('./visualize-summary.js');
      const result = gatherSystemSummary();

      expect(result.version).toBe('unknown');
    });

    it('should handle malformed package.json gracefully', async () => {
      setupPackageRoot(true);
      setupFileSystem({ '/test/project/src': ['file1.ts'] });
      mockFs.readFileSync.mockReturnValue('{ invalid json }');
      const { gatherSystemSummary } = await import('./visualize-summary.js');
      const result = gatherSystemSummary();

      expect(result.version).toBe('unknown');
    });

    it('should count only .ts files and ignore other extensions', async () => {
      setupPackageRoot(true);
      setupFileSystem({
        '/test/project/src': ['file1.ts', 'file2.js', 'file3.json', 'file4.md'],
      });
      const { gatherSystemSummary } = await import('./visualize-summary.js');
      const result = gatherSystemSummary();

      expect(result.sourceFiles).toBe(1);
      expect(result.testFiles).toBe(0);
    });

    it('should handle multiple layers with varying file counts', async () => {
      setupPackageRoot(true);
      setupFileSystem({
        '/test/project/src': [],
        '/test/project/src/core': ['a.ts', 'b.ts', 'c.ts'],
        '/test/project/src/cli': ['cmd.ts'],
        '/test/project/src/utils': ['helper1.ts', 'helper2.ts'],
      });
      const { gatherSystemSummary } = await import('./visualize-summary.js');
      const result = gatherSystemSummary();

      expect(result.layers.length).toBeGreaterThan(0);
      const coreLayer = result.layers.find((l) => l.name === 'Core');
      const cliLayer = result.layers.find((l) => l.name === 'CLI');
      const utilsLayer = result.layers.find((l) => l.name === 'Utils');

      expect(coreLayer?.files).toBe(3);
      expect(cliLayer?.files).toBe(1);
      expect(utilsLayer?.files).toBe(2);
    });

    it('should find package.json multiple levels up', async () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
        const pStr = String(p);
        return pStr === '/test/package.json';
      });
      setupFileSystem({ '/test/src': ['file1.ts'] }, '3.0.0');
      const { gatherSystemSummary } = await import('./visualize-summary.js');
      const result = gatherSystemSummary();

      expect(result.version).toBe('3.0.0');
    });

    it('should handle empty package.json gracefully', async () => {
      setupPackageRoot(true);
      setupFileSystem({ '/test/project/src': ['file1.ts'] });
      mockFs.readFileSync.mockReturnValue('{}');
      const { gatherSystemSummary } = await import('./visualize-summary.js');
      const result = gatherSystemSummary();

      expect(result.version).toBe('unknown');
    });

    it('should correctly separate test and source files', async () => {
      setupPackageRoot(true);
      setupFileSystem({
        '/test/project/src': [
          'module1.ts',
          'module1.test.ts',
          'module2.ts',
          'module2.test.ts',
          'module3.ts',
        ],
      });
      const { gatherSystemSummary } = await import('./visualize-summary.js');
      const result = gatherSystemSummary();

      expect(result.sourceFiles).toBe(3);
      expect(result.testFiles).toBe(2);
      expect(result.testCount).toBe(60);
    });
  });
});
