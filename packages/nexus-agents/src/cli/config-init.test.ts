/**
 * Tests for config init command
 *
 * Verifies configuration file generation functionality.
 * (Source: Issue #65, CODING_STANDARDS.md)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { runConfigInit, printConfigInitResult, configInitCommand } from './config-init.js';

// Mock fs modules
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  unlink: vi.fn().mockResolvedValue(undefined),
  rmdir: vi.fn().mockResolvedValue(undefined),
}));

describe('config-init', () => {
  let stdoutWriteMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutWriteMock = vi.fn();
    vi.spyOn(process.stdout, 'write').mockImplementation(
      stdoutWriteMock as unknown as typeof process.stdout.write
    );
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runConfigInit', () => {
    it('should create config file when none exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = await runConfigInit();

      expect(result.success).toBe(true);
      expect(result.created).toBe(true);
      expect(result.path).toContain('nexus-agents.yaml');
      expect(writeFile).toHaveBeenCalledTimes(1);
    });

    it('should fail when file exists and force is not set', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const result = await runConfigInit();

      expect(result.success).toBe(false);
      expect(result.created).toBe(false);
      expect(result.message).toContain('already exists');
      expect(writeFile).not.toHaveBeenCalled();
    });

    it('should overwrite when force is true', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const result = await runConfigInit({ force: true });

      expect(result.success).toBe(true);
      expect(result.created).toBe(true);
      expect(writeFile).toHaveBeenCalledTimes(1);
    });

    it('should use custom output path', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const customPath = './config/my-config.yaml';

      const result = await runConfigInit({ output: customPath });

      expect(result.success).toBe(true);
      expect(result.path).toContain('my-config.yaml');
    });

    it('should handle write errors gracefully', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      vi.mocked(writeFile).mockRejectedValueOnce(new Error('Permission denied'));

      const result = await runConfigInit();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Permission denied');
    });

    it('should create parent directories when needed', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      const nestedPath = './deep/nested/config.yaml';

      await runConfigInit({ output: nestedPath });

      expect(mkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });
  });

  describe('printConfigInitResult', () => {
    it('should print success message for successful result', () => {
      const result = {
        success: true,
        path: '/path/to/nexus-agents.yaml',
        message: 'Created',
        created: true,
      };

      printConfigInitResult(result);

      expect(stdoutWriteMock).toHaveBeenCalled();
      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => call[0]).join('');
      expect(output).toContain('successfully');
      expect(output).toContain(result.path);
    });

    it('should print error message for failed result', () => {
      const result = {
        success: false,
        path: '/path/to/nexus-agents.yaml',
        message: 'File already exists',
        created: false,
      };

      printConfigInitResult(result);

      expect(stdoutWriteMock).toHaveBeenCalled();
      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => call[0]).join('');
      expect(output).toContain('failed');
      expect(output).toContain('File already exists');
    });
  });

  describe('configInitCommand', () => {
    it('should return 0 on success', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const exitCode = await configInitCommand();

      expect(exitCode).toBe(0);
    });

    it('should return 1 on failure', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const exitCode = await configInitCommand();

      expect(exitCode).toBe(1);
    });

    it('should pass options through to runConfigInit', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      const exitCode = await configInitCommand({ force: true });

      expect(exitCode).toBe(0);
      expect(writeFile).toHaveBeenCalled();
    });
  });

  describe('config template content', () => {
    it('should generate valid YAML config with all sections', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      await runConfigInit();

      expect(writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('models:'),
        'utf-8'
      );
      expect(writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('experts:'),
        'utf-8'
      );
      expect(writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('workflows:'),
        'utf-8'
      );
      expect(writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('security:'),
        'utf-8'
      );
      expect(writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('logging:'),
        'utf-8'
      );
      expect(writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('gateway'),
        'utf-8'
      );
    });

    it('should include model tiers configuration', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      await runConfigInit();

      expect(writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('fast:'),
        'utf-8'
      );
      expect(writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('balanced:'),
        'utf-8'
      );
      expect(writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('powerful:'),
        'utf-8'
      );
    });
  });
});
