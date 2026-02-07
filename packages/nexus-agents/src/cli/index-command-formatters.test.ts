/**
 * Tests for CLI Index Command Formatters
 *
 * Tests output formatting functions for the index command.
 *
 * @module cli/index-command-formatters.test
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ANSI,
  formatFileList,
  formatValidationResult,
  formatIndexResult,
} from './index-command-formatters.js';
import type { IndexCommandResult } from './index-command-types.js';

describe('index-command-formatters', () => {
  describe('ANSI', () => {
    it('should export ANSI color codes', () => {
      expect(ANSI.reset).toBe('\x1b[0m');
      expect(ANSI.green).toBe('\x1b[32m');
      expect(ANSI.yellow).toBe('\x1b[33m');
      expect(ANSI.red).toBe('\x1b[31m');
      expect(ANSI.cyan).toBe('\x1b[36m');
      expect(ANSI.bold).toBe('\x1b[1m');
    });
  });

  describe('formatFileList', () => {
    let lines: string[];

    beforeEach(() => {
      lines = [];
    });

    it('should not add anything for empty file list', () => {
      formatFileList([], 'Missing files', '+', lines);
      expect(lines).toHaveLength(0);
    });

    it('should format file list with label and marker', () => {
      const files = ['src/foo.ts', 'src/bar.ts'];
      formatFileList(files, 'Missing files', '+', lines);

      expect(lines).toHaveLength(4);
      expect(lines[0]).toBe('');
      expect(lines[1]).toContain('Missing files');
      expect(lines[1]).toContain(ANSI.yellow);
      expect(lines[2]).toContain('+ src/foo.ts');
      expect(lines[3]).toContain('+ src/bar.ts');
    });

    it('should truncate file list to 10 items', () => {
      const files = Array.from({ length: 15 }, (_, i) => `file${String(i)}.ts`);
      formatFileList(files, 'Files', '*', lines);

      expect(lines).toHaveLength(13); // empty + label + 10 files + "... and X more"
      expect(lines[lines.length - 1]).toContain('... and 5 more');
    });

    it('should show exactly 10 files without truncation message', () => {
      const files = Array.from({ length: 10 }, (_, i) => `file${String(i)}.ts`);
      formatFileList(files, 'Files', '*', lines);

      expect(lines).toHaveLength(12); // empty + label + 10 files
      expect(lines[lines.length - 1]).not.toContain('... and');
    });

    it('should use custom marker for each file', () => {
      formatFileList(['a.ts', 'b.ts'], 'Label', '~', lines);
      expect(lines[2]).toContain('~ a.ts');
      expect(lines[3]).toContain('~ b.ts');
    });
  });

  describe('formatValidationResult', () => {
    let lines: string[];

    beforeEach(() => {
      lines = [];
    });

    it('should not add anything for undefined validation result', () => {
      formatValidationResult(undefined, lines);
      expect(lines).toHaveLength(0);
    });

    it('should format missing files with + marker', () => {
      const validationResult = {
        valid: false,
        missingFiles: ['src/missing.ts'],
        extraFiles: [],
        modifiedFiles: [],
      };
      formatValidationResult(validationResult, lines);

      expect(lines.some((line) => line.includes('Missing files'))).toBe(true);
      expect(lines.some((line) => line.includes('+ src/missing.ts'))).toBe(true);
    });

    it('should format extra files with - marker', () => {
      const validationResult = {
        valid: false,
        missingFiles: [],
        extraFiles: ['src/extra.ts'],
        modifiedFiles: [],
      };
      formatValidationResult(validationResult, lines);

      expect(lines.some((line) => line.includes('Extra files'))).toBe(true);
      expect(lines.some((line) => line.includes('- src/extra.ts'))).toBe(true);
    });

    it('should format modified files with ~ marker', () => {
      const validationResult = {
        valid: false,
        missingFiles: [],
        extraFiles: [],
        modifiedFiles: ['src/modified.ts'],
      };
      formatValidationResult(validationResult, lines);

      expect(lines.some((line) => line.includes('Modified files'))).toBe(true);
      expect(lines.some((line) => line.includes('~ src/modified.ts'))).toBe(true);
    });

    it('should format all file categories when present', () => {
      const validationResult = {
        valid: false,
        missingFiles: ['missing.ts'],
        extraFiles: ['extra.ts'],
        modifiedFiles: ['modified.ts'],
      };
      formatValidationResult(validationResult, lines);

      expect(lines.some((line) => line.includes('Missing files'))).toBe(true);
      expect(lines.some((line) => line.includes('Extra files'))).toBe(true);
      expect(lines.some((line) => line.includes('Modified files'))).toBe(true);
    });

    it('should not format empty file categories', () => {
      const validationResult = {
        valid: true,
        missingFiles: [],
        extraFiles: [],
        modifiedFiles: [],
      };
      formatValidationResult(validationResult, lines);

      expect(lines).toHaveLength(0);
    });
  });

  describe('formatIndexResult', () => {
    it('should format success result', () => {
      const result: IndexCommandResult = {
        success: true,
        message: 'Index generated successfully',
      };
      const output = formatIndexResult(result);

      expect(output).toContain(ANSI.green);
      expect(output).toContain(ANSI.bold);
      expect(output).toContain('SUCCESS');
      expect(output).toContain('Index generated successfully');
    });

    it('should format failure result', () => {
      const result: IndexCommandResult = {
        success: false,
        message: 'Index generation failed',
      };
      const output = formatIndexResult(result);

      expect(output).toContain(ANSI.red);
      expect(output).toContain(ANSI.bold);
      expect(output).toContain('FAILED');
      expect(output).toContain('Index generation failed');
    });

    it('should include filesIndexed when present', () => {
      const result: IndexCommandResult = {
        success: true,
        message: 'Done',
        data: {
          filesIndexed: 42,
        },
      };
      const output = formatIndexResult(result);

      expect(output).toContain('Files indexed');
      expect(output).toContain('42');
      expect(output).toContain(ANSI.cyan);
    });

    it('should include modulesFound when present', () => {
      const result: IndexCommandResult = {
        success: true,
        message: 'Done',
        data: {
          modulesFound: 15,
        },
      };
      const output = formatIndexResult(result);

      expect(output).toContain('Modules found');
      expect(output).toContain('15');
    });

    it('should include outputPath when present', () => {
      const result: IndexCommandResult = {
        success: true,
        message: 'Done',
        data: {
          outputPath: '/tmp/index.json',
        },
      };
      const output = formatIndexResult(result);

      expect(output).toContain('Output');
      expect(output).toContain('/tmp/index.json');
    });

    it('should include validation result when present', () => {
      const result: IndexCommandResult = {
        success: false,
        message: 'Validation failed',
        data: {
          validationResult: {
            valid: false,
            missingFiles: ['src/missing.ts'],
            extraFiles: ['src/extra.ts'],
            modifiedFiles: [],
          },
        },
      };
      const output = formatIndexResult(result);

      expect(output).toContain('Missing files');
      expect(output).toContain('Extra files');
      expect(output).toContain('+ src/missing.ts');
      expect(output).toContain('- src/extra.ts');
    });

    it('should handle result with all data fields', () => {
      const result: IndexCommandResult = {
        success: true,
        message: 'Complete',
        data: {
          filesIndexed: 50,
          modulesFound: 10,
          outputPath: '/output/index.json',
          validationResult: {
            valid: true,
            missingFiles: [],
            extraFiles: [],
            modifiedFiles: [],
          },
        },
      };
      const output = formatIndexResult(result);

      expect(output).toContain('SUCCESS');
      expect(output).toContain('Files indexed');
      expect(output).toContain('50');
      expect(output).toContain('Modules found');
      expect(output).toContain('10');
      expect(output).toContain('Output');
      expect(output).toContain('/output/index.json');
    });

    it('should handle result with no data', () => {
      const result: IndexCommandResult = {
        success: true,
        message: 'Done',
      };
      const output = formatIndexResult(result);

      expect(output).toContain('SUCCESS');
      expect(output).toContain('Done');
      expect(output).not.toContain('Files indexed');
      expect(output).not.toContain('Modules found');
    });

    it('should handle result with undefined validation result', () => {
      const result: IndexCommandResult = {
        success: true,
        message: 'Done',
        data: {
          filesIndexed: 10,
        },
      };
      const output = formatIndexResult(result);

      expect(output).toContain('SUCCESS');
      expect(output).toContain('Files indexed');
      expect(output).not.toContain('Missing files');
    });
  });
});
