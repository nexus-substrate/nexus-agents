/**
 * Tests for the post-setup health gate (#2137).
 *
 * Verifies that `setupCommandAsync` runs the verify checks at the end and
 * that warn-only failures don't change the exit code (only `severity: 'hard'`
 * failures do). End-to-end: stubs the verify result via module mocking so we
 * don't depend on the host environment.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process so setup's CLI detection doesn't shell out (perf, isolation).
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execSync: vi.fn(() => {
      throw new Error('not found');
    }),
    execFileSync: vi.fn(() => {
      throw new Error('not found');
    }),
  };
});

// Mock verify-command so we control what the health gate sees.
vi.mock('./verify-command.js', () => ({
  runVerify: vi.fn(),
}));

import { setupCommandAsync } from './setup-command.js';
import { runVerify } from './verify-command.js';
import type { VerifyResult } from './verify-command.js';

const mockedRunVerify = vi.mocked(runVerify);

/** Helper: build a VerifyResult quickly for the gate to render. */
function makeVerifyResult(checks: VerifyResult['checks'], noHardFailures: boolean): VerifyResult {
  return {
    version: '2.55.1',
    nodeVersion: 'v22.0.0',
    checks,
    allPassed: checks.every((c) => c.passed),
    noHardFailures,
    durationMs: 1,
  };
}

/** Captures stdout writes for the duration of `fn`. */
async function captureStdout(fn: () => Promise<unknown>): Promise<string> {
  const writes: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString());
    return true;
  });
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return writes.join('');
}

describe('setup health gate (#2137)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs verify after setup and prints the structured health summary', async () => {
    mockedRunVerify.mockResolvedValueOnce(
      makeVerifyResult(
        [
          { name: 'Node.js Version', passed: true, message: 'v22.0.0' },
          { name: 'SQLite Storage', passed: true, message: 'OK' },
        ],
        true
      )
    );

    const output = await captureStdout(async () => {
      await setupCommandAsync({
        nonInteractive: true,
        skipMcp: true,
        skipRules: true,
        skipHooks: true,
        skipConfig: true,
        skipOpencode: true,
        skipGemini: true,
        skipCodex: true,
      });
    });

    expect(mockedRunVerify).toHaveBeenCalledTimes(1);
    expect(output).toContain('Health check (2/2 passed)');
    expect(output).toContain('Node.js Version');
    expect(output).toContain('SQLite Storage');
    expect(output).toContain('All health checks passed');
  });

  it('skips the health gate entirely in --dry-run mode (preview, not install)', async () => {
    const output = await captureStdout(async () => {
      await setupCommandAsync({
        nonInteractive: true,
        dryRun: true,
        skipMcp: true,
        skipRules: true,
        skipHooks: true,
        skipConfig: true,
        skipOpencode: true,
        skipGemini: true,
        skipCodex: true,
      });
    });

    expect(mockedRunVerify).not.toHaveBeenCalled();
    expect(output).not.toContain('Health check');
  });

  it('renders warn-severity failures with the ⚠ symbol and remediation text', async () => {
    mockedRunVerify.mockResolvedValueOnce(
      makeVerifyResult(
        [
          { name: 'Node.js Version', passed: true, message: 'v22.0.0' },
          {
            name: 'SQLite Storage',
            passed: false,
            severity: 'warn',
            message: 'better-sqlite3 not installed',
            fix: 'pnpm rebuild better-sqlite3',
          },
        ],
        true
      )
    );

    const output = await captureStdout(async () => {
      await setupCommandAsync({
        nonInteractive: true,
        skipMcp: true,
        skipRules: true,
        skipHooks: true,
        skipConfig: true,
        skipOpencode: true,
        skipGemini: true,
        skipCodex: true,
      });
    });

    expect(output).toContain('Health check (1/2 passed)');
    expect(output).toContain('better-sqlite3 not installed');
    expect(output).toContain('→ Fix: pnpm rebuild better-sqlite3');
    expect(output).toMatch(/warning\(s\) — nexus-agents will run/);
  });

  it('renders hard-severity failures with the ✗ symbol and "Action required" message', async () => {
    mockedRunVerify.mockResolvedValueOnce(
      makeVerifyResult(
        [
          {
            name: 'Node.js Version',
            passed: false,
            severity: 'hard',
            message: 'v18.0.0 (unsupported)',
            fix: 'Install Node.js 22.x LTS',
          },
        ],
        false
      )
    );

    const output = await captureStdout(async () => {
      await setupCommandAsync({
        nonInteractive: true,
        skipMcp: true,
        skipRules: true,
        skipHooks: true,
        skipConfig: true,
        skipOpencode: true,
        skipGemini: true,
        skipCodex: true,
      });
    });

    expect(output).toContain('Action required');
    expect(output).toContain('v18.0.0 (unsupported)');
    expect(output).toContain('→ Fix: Install Node.js 22.x LTS');
  });

  it('returns exit 0 when only warn-severity health checks failed', async () => {
    mockedRunVerify.mockResolvedValueOnce(
      makeVerifyResult(
        [
          { name: 'OK', passed: true, message: 'ok' },
          {
            name: 'Adapter Availability',
            passed: false,
            severity: 'warn',
            message: 'no API keys configured',
            fix: 'set ANTHROPIC_API_KEY',
          },
        ],
        true
      )
    );

    const exitCode = await setupCommandAsync({
      nonInteractive: true,
      skipMcp: true,
      skipRules: true,
      skipHooks: true,
      skipConfig: true,
      skipOpencode: true,
      skipGemini: true,
      skipCodex: true,
    });

    expect(exitCode).toBe(0);
  });

  it('prints the Getting Started banner after a successful setup (#2138)', async () => {
    mockedRunVerify.mockResolvedValueOnce(
      makeVerifyResult([{ name: 'OK', passed: true, message: 'ok' }], true)
    );

    const output = await captureStdout(async () => {
      await setupCommandAsync({
        nonInteractive: true,
        skipMcp: true,
        skipRules: true,
        skipHooks: true,
        skipConfig: true,
        skipOpencode: true,
        skipGemini: true,
        skipCodex: true,
      });
    });

    expect(output).toContain('Getting started');
    expect(output).toContain('1. nexus-agents hello');
    expect(output).toContain('3. nexus-agents workflow list');
    expect(output).toContain('Docs: https://github.com/williamzujkowski/nexus-agents');
    // Default (no MCP wired) → step 2 is the standalone orchestrate hint.
    expect(output).toContain('2. nexus-agents orchestrate');
    expect(output).not.toContain('Use through Claude Code');
  });

  it('omits the Getting Started banner in --dry-run mode (#2138)', async () => {
    const output = await captureStdout(async () => {
      await setupCommandAsync({
        nonInteractive: true,
        dryRun: true,
        skipMcp: true,
        skipRules: true,
        skipHooks: true,
        skipConfig: true,
        skipOpencode: true,
        skipGemini: true,
        skipCodex: true,
      });
    });

    expect(output).not.toContain('Getting started');
  });

  it('returns exit 1 when a hard-severity health check failed', async () => {
    mockedRunVerify.mockResolvedValueOnce(
      makeVerifyResult(
        [
          {
            name: 'Node.js Version',
            passed: false,
            severity: 'hard',
            message: 'v18 unsupported',
          },
        ],
        false
      )
    );

    const exitCode = await setupCommandAsync({
      nonInteractive: true,
      skipMcp: true,
      skipRules: true,
      skipHooks: true,
      skipConfig: true,
      skipOpencode: true,
      skipGemini: true,
      skipCodex: true,
    });

    expect(exitCode).toBe(1);
  });
});
