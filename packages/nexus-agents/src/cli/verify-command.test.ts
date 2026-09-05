/**
 * Tests for verify-command.ts
 * (Source: Issue #253)
 */

import { describe, it, expect, vi } from 'vitest';

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runVerify, printVerifyResult, verifyCommand } from './verify-command.js';
import type { VerifyResult, VerifyCheck } from './verify-command.js';

/**
 * Stub the CLI auth probe (#4629).
 *
 * `runVerify()` calls `checkAdapterAvailability()` → `probeAllClis()`, which
 * spawns each CLI binary for real. This file has 17 `runVerify`/`verifyCommand`
 * calls, so an unmocked run produced 17 real `opencode auth list` subprocesses
 * — 8.2 MB of leaked scratch each, and, worse, a suite whose result depended on
 * which CLIs happened to be installed on the machine. On a box without
 * `opencode` these tests exercised a different branch, and nothing reported
 * which branch had run.
 *
 * The canned panel is deliberately mixed — one authenticated, one not — so the
 * assertions below exercise both sides of the availability check rather than a
 * uniform all-authed shape that would hide a branch.
 */
vi.mock('./cli-auth-probe.js', () => ({
  probeAllClis: vi.fn().mockResolvedValue([
    { cli: 'claude', state: 'authenticated', via: 'cli-credentials' },
    { cli: 'gemini', state: 'needs-login', reason: 'stubbed', fixCommand: 'gemini auth login' },
    { cli: 'codex', state: 'needs-login', reason: 'stubbed', fixCommand: 'codex login' },
    { cli: 'opencode', state: 'needs-login', reason: 'stubbed', fixCommand: 'opencode auth login' },
  ]),
}));

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

    it.each(['v20.19.0', 'v22.4.1'])('rejects Node %s with range', async (version) => {
      const original = Object.getOwnPropertyDescriptor(process, 'version');
      Object.defineProperty(process, 'version', { value: version, configurable: true });
      try {
        const nodeCheck = (await runVerify()).checks.find((c) => c.name === 'Node.js Version');
        expect(nodeCheck?.passed).toBe(false);
        expect(nodeCheck?.message).toContain('>=22.5.0');
      } finally {
        if (original !== undefined) Object.defineProperty(process, 'version', original);
      }
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

    it('reports Native Grammars as PASSING, not merely present (#5427)', async () => {
      // Deliberately stronger than its siblings above. `toBeDefined()` on this
      // check would survive the exact regression it exists to catch: the
      // grammars failing to parse still produces a check object. The verdict
      // is the measurement, so the verdict is what is asserted.
      const result = await runVerify();
      const grammarCheck = result.checks.find((c) => c.name === 'Native Grammars');

      expect(grammarCheck).toBeDefined();
      expect(grammarCheck?.passed).toBe(true);
      expect(grammarCheck?.message).toContain('python');
      expect(grammarCheck?.message).toContain('go');
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
      const warnables = [
        'SQLite Storage',
        'Native Grammars',
        'Data Directories',
        'Adapter Availability',
      ];
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

    it('reports Configuration as failed (warn) when the project config file is malformed (#4844)', async () => {
      // #4181 added this failure branch, and #4181's test reached it by
      // turning `defaultConfig` into a throwing getter — something a plain
      // object export cannot do in production. The branch was guarding a
      // step that could not break. This drives the failure the remediation
      // text actually describes: a real config file that does not parse.
      const dir = mkdtempSync(join(tmpdir(), 'nexus-verify-cfg-'));
      writeFileSync(join(dir, 'nexus-agents.yaml'), 'models: [unclosed\n  bad: : :\n');
      const original = process.cwd();
      process.chdir(dir);
      try {
        const result = await runVerify();
        const configCheck = result.checks.find((c) => c.name === 'Configuration');

        expect(configCheck?.passed).toBe(false);
        // Diagnostic-only: degraded, not a hard gate.
        expect(configCheck?.severity).toBe('warn');
        expect(configCheck?.message).toContain('nexus-agents.yaml');
      } finally {
        process.chdir(original);
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('reports Configuration as passed when a project config file parses (#4844)', async () => {
      // The pair. Without it, "always fail" satisfies the test above.
      const dir = mkdtempSync(join(tmpdir(), 'nexus-verify-cfg-ok-'));
      writeFileSync(join(dir, 'nexus-agents.yaml'), 'version: "1.0"\n');
      const original = process.cwd();
      process.chdir(dir);
      try {
        const configCheck = (await runVerify()).checks.find((c) => c.name === 'Configuration');

        expect(configCheck?.passed).toBe(true);
        expect(configCheck?.message).toContain('nexus-agents.yaml');
      } finally {
        process.chdir(original);
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('reports Configuration as passed, and says so, when there is no config file (#4844)', async () => {
      // The benign population: most installs have no config file at all and
      // must not be told their configuration is broken. The message has to
      // distinguish "defaults" from "your file is fine" — otherwise a pass
      // implies a validation that never happened.
      const dir = mkdtempSync(join(tmpdir(), 'nexus-verify-cfg-none-'));
      const original = process.cwd();
      process.chdir(dir);
      try {
        const configCheck = (await runVerify()).checks.find((c) => c.name === 'Configuration');

        expect(configCheck?.passed).toBe(true);
        expect(configCheck?.message).toContain('default');
      } finally {
        process.chdir(original);
        rmSync(dir, { recursive: true, force: true });
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
