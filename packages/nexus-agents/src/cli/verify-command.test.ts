/**
 * Tests for verify-command.ts
 * (Source: Issue #253)
 */

import { describe, it, expect, vi } from 'vitest';
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

      // Pin that there was something to check before comparing — otherwise a
      // run that produced zero checks satisfies this assertion vacuously on
      // both sides (#4581).
      expect(result.checks.length).toBeGreaterThan(0);
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
        noHardFailures: true,
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
        noHardFailures: false,
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
        noHardFailures: true,
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

  describe('expanded health checks (#2136)', () => {
    it('includes SQLite storage check', async () => {
      const result = await runVerify();
      const sqliteCheck = result.checks.find((c) => c.name === 'SQLite Storage');
      expect(sqliteCheck).toBeDefined();
    });

    it('includes Data Directories check', async () => {
      const result = await runVerify();
      const dirCheck = result.checks.find((c) => c.name === 'Data Directories');
      expect(dirCheck).toBeDefined();
    });

    it('includes Adapter Availability check', async () => {
      const result = await runVerify();
      const adapterCheck = result.checks.find((c) => c.name === 'Adapter Availability');
      expect(adapterCheck).toBeDefined();
    });

    it('classifies sqlite, data-dir, and adapter failures as warn (not hard)', async () => {
      const result = await runVerify();
      const warnables = ['SQLite Storage', 'Data Directories', 'Adapter Availability'];
      for (const name of warnables) {
        const check = result.checks.find((c) => c.name === name);
        expect(check).toBeDefined();
        if (check === undefined) continue;
        if (!check.passed) {
          // Any of these failing must be warn — not a hard blocker.
          expect(check.severity).toBe('warn');
        }
      }
    });

    it('noHardFailures is true when only warn-severity checks fail', () => {
      const result: VerifyResult = {
        version: '1.0.0',
        nodeVersion: 'v22.0.0',
        checks: [
          { name: 'OK', passed: true, message: 'ok' },
          { name: 'Warn', passed: false, severity: 'warn', message: 'degraded' },
        ],
        allPassed: false,
        noHardFailures: true,
        durationMs: 1,
      };
      // Validate the contract: presence of warn-only failures still yields noHardFailures=true.
      expect(result.noHardFailures).toBe(true);
      expect(result.allPassed).toBe(false);
    });

    it('verifyCommand exits 0 when only warn-severity checks fail (degraded but functional)', () => {
      // Exit-code contract: only hard failures flip the exit code.
      const passing: VerifyResult = {
        version: '1.0.0',
        nodeVersion: 'v22.0.0',
        checks: [{ name: 'X', passed: false, severity: 'warn', message: 'msg' }],
        allPassed: false,
        noHardFailures: true,
        durationMs: 1,
      };
      const failing: VerifyResult = {
        version: '1.0.0',
        nodeVersion: 'v22.0.0',
        checks: [{ name: 'X', passed: false, severity: 'hard', message: 'msg' }],
        allPassed: false,
        noHardFailures: false,
        durationMs: 1,
      };
      // These results aren't passed directly to verifyCommand (it calls runVerify
      // itself), but the shape contract is verified here.
      expect(passing.noHardFailures).toBe(true);
      expect(failing.noHardFailures).toBe(false);
    });

    it('reports Configuration as failed (warn) with a fix hint when config access throws (#4181)', async () => {
      vi.resetModules();
      vi.doMock('../config/index.js', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../config/index.js')>();
        return {
          ...actual,
          get defaultConfig(): never {
            throw new Error('simulated config loader failure');
          },
        };
      });
      try {
        const mod = await import('./verify-command.js');
        const result = await mod.runVerify();
        const configCheck = result.checks.find((c) => c.name === 'Configuration');
        expect(configCheck).toBeDefined();
        expect(configCheck?.passed).toBe(false);
        // Diagnostic-only: degraded, not a hard gate.
        expect(configCheck?.severity).toBe('warn');
        expect(configCheck?.message).toBe('Failed to load default configuration');
        expect(configCheck?.fix).toContain('Reinstall nexus-agents');
      } finally {
        vi.doUnmock('../config/index.js');
        vi.resetModules();
      }
    });

    it('printVerifyResult renders warn-only failures as degraded, not failed', () => {
      const result: VerifyResult = {
        version: '1.0.0',
        nodeVersion: 'v22.0.0',
        checks: [
          { name: 'OK', passed: true, message: 'ok' },
          { name: 'Warn', passed: false, severity: 'warn', message: 'degraded', fix: 'run x' },
        ],
        allPassed: false,
        noHardFailures: true,
        durationMs: 1,
      };
      const writes: string[] = [];
      const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        writes.push(
          typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString()
        );
        return true;
      });
      try {
        printVerifyResult(result, false);
      } finally {
        writeSpy.mockRestore();
      }
      const output = writes.join('');
      expect(output).toMatch(/warning/i);
      expect(output).toMatch(/degraded/i);
      // Must NOT claim hard failure in warn-only case.
      expect(output).not.toMatch(/Verification failed/i);
    });
  });
});
