/**
 * Tests for expert list command
 *
 * Verifies expert listing functionality across formats.
 * (Source: Issue #66, CODING_STANDARDS.md)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runExpertList, printExpertListResult, expertListCommand } from './expert-list.js';

describe('expert-list', () => {
  let stdoutWriteMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutWriteMock = vi.fn();
    vi.spyOn(process.stdout, 'write').mockImplementation(stdoutWriteMock);
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runExpertList', () => {
    it('should return built-in experts', () => {
      const result = runExpertList();

      expect(result.success).toBe(true);
      expect(result.builtIn.length).toBeGreaterThan(0);
      expect(result.builtIn.length).toBe(6); // 6 built-in experts
    });

    it('should return empty custom experts by default', () => {
      const result = runExpertList();

      expect(result.custom).toEqual([]);
    });

    it('should return success message with counts', () => {
      const result = runExpertList();

      expect(result.message).toContain('built-in experts');
      expect(result.message).toContain('custom experts');
    });

    it('should include code expert', () => {
      const result = runExpertList();

      const codeExpert = result.builtIn.find((e) => e.id === 'code-expert');
      expect(codeExpert).toBeDefined();
      expect(codeExpert?.name).toBe('Code Expert');
      expect(codeExpert?.primaryDomain).toBe('code');
    });

    it('should include security expert', () => {
      const result = runExpertList();

      const securityExpert = result.builtIn.find((e) => e.id === 'security-expert');
      expect(securityExpert).toBeDefined();
      expect(securityExpert?.name).toBe('Security Expert');
      expect(securityExpert?.primaryDomain).toBe('security');
    });

    it('should include all 5 built-in experts', () => {
      const result = runExpertList();

      const expectedIds = [
        'code-expert',
        'security-expert',
        'architecture-expert',
        'documentation-expert',
        'testing-expert',
      ];

      for (const id of expectedIds) {
        expect(result.builtIn.some((e) => e.id === id)).toBe(true);
      }
    });
  });

  describe('printExpertListResult', () => {
    it('should print table format by default', () => {
      const result = runExpertList();

      printExpertListResult(result);

      expect(stdoutWriteMock).toHaveBeenCalled();
      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('Built-in Experts');
      expect(output).toContain('Name');
      expect(output).toContain('Domain');
      expect(output).toContain('Tier');
    });

    it('should print JSON format when specified', () => {
      const result = runExpertList();

      printExpertListResult(result, { format: 'json' });

      expect(stdoutWriteMock).toHaveBeenCalled();
      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');

      // Verify valid JSON
      const parsed = JSON.parse(output) as { builtIn: unknown[]; custom: unknown[] };

      expect(parsed.builtIn).toBeInstanceOf(Array);
      expect(parsed.custom).toBeInstanceOf(Array);
    });

    it('should print YAML format when specified', () => {
      const result = runExpertList();

      printExpertListResult(result, { format: 'yaml' });

      expect(stdoutWriteMock).toHaveBeenCalled();
      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('builtIn:');
      expect(output).toContain('custom:');
      expect(output).toContain('id:');
      expect(output).toContain('name:');
    });

    it('should show Custom Experts section even when empty', () => {
      const result = runExpertList();

      printExpertListResult(result);

      expect(stdoutWriteMock).toHaveBeenCalled();
      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('Custom Experts');
    });
  });

  describe('expertListCommand', () => {
    it('should return 0 on success', () => {
      try {
        expertListCommand();
      } catch {
        // Expected - process.exit is mocked to throw
      }

      expect(stdoutWriteMock).toHaveBeenCalled();
    });

    it('should pass format option through', () => {
      try {
        expertListCommand({ format: 'json' });
      } catch {
        // Expected - process.exit is mocked to throw
      }

      expect(stdoutWriteMock).toHaveBeenCalled();
      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(() => {
        JSON.parse(output);
      }).not.toThrow();
    });
  });

  describe('format outputs', () => {
    it('should include tier information in JSON', () => {
      const result = runExpertList();

      printExpertListResult(result, { format: 'json' });

      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      const parsed = JSON.parse(output) as { builtIn: Array<{ tier: string }> };
      const firstBuiltIn = parsed.builtIn[0];

      expect(firstBuiltIn).toBeDefined();
      expect(firstBuiltIn?.tier).toBeDefined();
      expect(['balanced', 'powerful'].includes(firstBuiltIn?.tier ?? '')).toBe(true);
    });

    it('should include capabilities in JSON', () => {
      const result = runExpertList();

      printExpertListResult(result, { format: 'json' });

      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      const parsed = JSON.parse(output) as { builtIn: Array<{ capabilities: string[] }> };
      const firstBuiltIn = parsed.builtIn[0];

      expect(firstBuiltIn).toBeDefined();
      expect(firstBuiltIn?.capabilities).toBeInstanceOf(Array);
      expect((firstBuiltIn?.capabilities ?? []).length).toBeGreaterThan(0);
    });

    it('should properly format table borders', () => {
      const result = runExpertList();

      printExpertListResult(result, { format: 'table' });

      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('┌');
      expect(output).toContain('┐');
      expect(output).toContain('└');
      expect(output).toContain('┘');
      expect(output).toContain('│');
    });
  });
});
