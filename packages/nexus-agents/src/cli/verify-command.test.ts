/**
 * Tests for verify-command.ts
 * (Source: Issue #253)
 */

import { describe, it, expect } from 'vitest';
import { runVerify, printVerifyResult, verifyCommand } from './verify-command.js';
import type { VerifyResult, VerifyCheck } from './verify-command.js';

describe('verify-command', () => {
  describe('runVerify', () => {
    it('returns a verify result with all required fields', async () => {
      const result = await runVerify();

      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('nodeVersion');
      expect(result).toHaveProperty('checks');
      expect(result).toHaveProperty('allPassed');
      expect(result).toHaveProperty('durationMs');
    });

    it('includes version string', async () => {
      const result = await runVerify();

      expect(typeof result.version).toBe('string');
      expect(result.version.length).toBeGreaterThan(0);
    });

    it('includes Node.js version', async () => {
      const result = await runVerify();

      expect(result.nodeVersion).toBe(process.version);
    });

    it('runs multiple checks', async () => {
      const result = await runVerify();

      expect(result.checks.length).toBeGreaterThanOrEqual(4);
    });

    it('includes Node.js version check', async () => {
      const result = await runVerify();

      const nodeCheck = result.checks.find((c) => c.name === 'Node.js Version');
      expect(nodeCheck).toBeDefined();
      expect(nodeCheck?.passed).toBe(true); // Should pass in test environment
    });

    it('includes package exports check', async () => {
      const result = await runVerify();

      const exportsCheck = result.checks.find((c) => c.name === 'Package Exports');
      expect(exportsCheck).toBeDefined();
      expect(exportsCheck?.passed).toBe(true);
    });

    it('includes configuration check', async () => {
      const result = await runVerify();

      const configCheck = result.checks.find((c) => c.name === 'Configuration');
      expect(configCheck).toBeDefined();
      expect(configCheck?.passed).toBe(true);
    });

    it('includes expert system check', async () => {
      const result = await runVerify();

      const expertCheck = result.checks.find((c) => c.name === 'Expert System');
      expect(expertCheck).toBeDefined();
      expect(expertCheck?.passed).toBe(true);
    });

    it('calculates duration', async () => {
      const result = await runVerify();

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('allPassed is true when all checks pass', async () => {
      const result = await runVerify();

      // In test environment, all checks should pass
      const expectedAllPassed = result.checks.every((c) => c.passed);
      expect(result.allPassed).toBe(expectedAllPassed);
    });
  });

  describe('printVerifyResult', () => {
    it('does not throw for successful result', () => {
      const result: VerifyResult = {
        version: '1.0.0',
        nodeVersion: 'v22.0.0',
        checks: [{ name: 'Test Check', passed: true, message: 'OK' }],
        allPassed: true,
        durationMs: 10,
      };

      expect(() => {
        printVerifyResult(result, false);
      }).not.toThrow();
    });

    it('does not throw for failed result', () => {
      const result: VerifyResult = {
        version: '1.0.0',
        nodeVersion: 'v22.0.0',
        checks: [{ name: 'Test Check', passed: false, message: 'Failed', fix: 'Do something' }],
        allPassed: false,
        durationMs: 10,
      };

      expect(() => {
        printVerifyResult(result, false);
      }).not.toThrow();
    });

    it('handles verbose mode', () => {
      const result: VerifyResult = {
        version: '1.0.0',
        nodeVersion: 'v22.0.0',
        checks: [],
        allPassed: true,
        durationMs: 10,
      };

      expect(() => {
        printVerifyResult(result, true);
      }).not.toThrow();
    });
  });

  describe('verifyCommand', () => {
    it('returns 0 when all checks pass', async () => {
      const exitCode = await verifyCommand({ verbose: false });

      // In test environment, should pass
      expect(exitCode).toBe(0);
    });

    it('accepts verbose option', async () => {
      const exitCode = await verifyCommand({ verbose: true });

      expect(exitCode).toBe(0);
    });
  });

  describe('VerifyCheck type', () => {
    it('check with fix property', () => {
      const check: VerifyCheck = {
        name: 'Test',
        passed: false,
        message: 'Failed',
        fix: 'Run this command',
      };

      expect(check.fix).toBe('Run this command');
    });

    it('check without fix property', () => {
      const check: VerifyCheck = {
        name: 'Test',
        passed: true,
        message: 'OK',
      };

      expect(check.fix).toBeUndefined();
    });
  });
});
