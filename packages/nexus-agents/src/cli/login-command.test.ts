/**
 * Tests for login-command (#2953).
 *
 * Pre-fix, this 142-LOC CLI command had zero tests against a 4-cell
 * truth table on `(anyAuthenticated, actionable.length)` — a refactor
 * flipping `||` to `&&` at the exit-code branch (line 86) would have
 * silently broken the script-detection contract from #2447.
 *
 * Coverage:
 *  - `orderForDisplay` (canonical sort)
 *  - `summarize` (status line + actionable list)
 *  - `handleLoginCommand` exit-code truth table (all 4 cells)
 *  - `handleLoginCommand` deprecation hint via the `login` command alias
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import type { AuthProbeResult } from './cli-auth-probe.js';
import type { CliName } from '../cli-adapters/types.js';
import type { ParsedCliArgs, CliCommand } from '../cli-types.js';
import { orderForDisplay, summarize } from './login-command.js';

/**
 * `handleLoginCommand` only reads `args.command`. Cast a minimal stub to
 * `ParsedCliArgs` to avoid filling in the full ~40-field interface.
 */
function makeArgs(command: CliCommand): ParsedCliArgs {
  return { command } as unknown as ParsedCliArgs;
}

// Mock the probe before importing handleLoginCommand. The test sets the
// mock return value per-test via probeAllClis.mockResolvedValue(...).
const probeAllClis = vi.fn<() => Promise<AuthProbeResult[]>>();
vi.mock('./cli-auth-probe.js', () => ({
  probeAllClis: () => probeAllClis(),
}));

import { handleLoginCommand } from './login-command.js';

function authed(cli: CliName): AuthProbeResult {
  return { cli, state: 'authenticated', via: 'cli-credentials' };
}

function needsLogin(cli: CliName, reason = 'no creds'): AuthProbeResult {
  return { cli, state: 'needs-login', reason, fixCommand: `${cli} login` };
}

function notInstalled(cli: CliName): AuthProbeResult {
  return { cli, state: 'not-installed', reason: 'binary missing' };
}

// ============================================================================
// orderForDisplay
// ============================================================================

describe('orderForDisplay', () => {
  it('sorts into canonical claude/gemini/codex/opencode order', () => {
    const input: AuthProbeResult[] = [
      notInstalled('opencode'),
      authed('codex'),
      needsLogin('gemini'),
      authed('claude'),
    ];
    const out = orderForDisplay(input);
    expect(out.map((r) => r.cli)).toEqual(['claude', 'gemini', 'codex', 'opencode']);
  });

  it('preserves identity (does not mutate the input)', () => {
    const input: AuthProbeResult[] = [authed('codex'), authed('claude')];
    const out = orderForDisplay(input);
    expect(input.map((r) => r.cli)).toEqual(['codex', 'claude']); // unchanged
    expect(out).not.toBe(input);
  });

  it('handles a single-element list', () => {
    expect(orderForDisplay([authed('gemini')]).map((r) => r.cli)).toEqual(['gemini']);
  });

  it('handles an empty list', () => {
    expect(orderForDisplay([])).toEqual([]);
  });
});

// ============================================================================
// summarize
// ============================================================================

describe('summarize', () => {
  it('returns anyAuthenticated=true and empty actionable when all authed', () => {
    const s = summarize([authed('claude'), authed('gemini')]);
    expect(s.anyAuthenticated).toBe(true);
    expect(s.actionable).toEqual([]);
    expect(s.line).toBe('Status: 2 authenticated');
  });

  it('returns anyAuthenticated=false and lists all CLIs that need login', () => {
    const s = summarize([needsLogin('claude'), needsLogin('codex')]);
    expect(s.anyAuthenticated).toBe(false);
    expect(s.actionable).toEqual(['claude', 'codex']);
    expect(s.line).toBe('Status: 2 need login');
  });

  it('mixes authed + needs-login + not-installed in the status line', () => {
    const s = summarize([authed('claude'), needsLogin('gemini'), notInstalled('opencode')]);
    expect(s.anyAuthenticated).toBe(true);
    expect(s.actionable).toEqual(['gemini']);
    expect(s.line).toBe('Status: 1 authenticated, 1 need login, 1 not installed');
  });

  it('returns the "no CLIs detected" line when input is empty', () => {
    const s = summarize([]);
    expect(s.anyAuthenticated).toBe(false);
    expect(s.actionable).toEqual([]);
    expect(s.line).toBe('Status: no CLIs detected');
  });

  it('reports anyAuthenticated=false when only not-installed entries exist', () => {
    const s = summarize([notInstalled('claude'), notInstalled('codex')]);
    expect(s.anyAuthenticated).toBe(false);
    expect(s.actionable).toEqual([]);
    expect(s.line).toBe('Status: 2 not installed');
  });
});

// ============================================================================
// handleLoginCommand — exit-code truth table (#2953 motivation)
// ============================================================================

describe('handleLoginCommand exit codes (#2953 truth table)', () => {
  let exitSpy: MockInstance;
  let consoleLogSpy: MockInstance;
  let consoleErrorSpy: MockInstance;

  beforeEach(() => {
    probeAllClis.mockReset();
    // process.exit throws to abort the function under test without
    // actually exiting the test runner. The test asserts via the mock
    // call record.
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null) => {
      throw new Error(`__test_exit:${String(code ?? 'undefined')}`);
    });
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  async function runAndCaptureExit(): Promise<number> {
    try {
      await handleLoginCommand(makeArgs('auth'));
      // process.exit was supposed to fire — if we get here, it didn't.
      throw new Error('handleLoginCommand returned without exiting');
    } catch (err) {
      const m = /^__test_exit:(\d+)$/.exec((err as Error).message);
      if (m === null) throw err;
      return Number(m[1]);
    }
  }

  // Cell 1: anyAuthenticated=true, actionable.length=0 → EXIT_OK
  it('exits 0 when all CLIs are authenticated', async () => {
    probeAllClis.mockResolvedValue([authed('claude'), authed('gemini')]);
    expect(await runAndCaptureExit()).toBe(0);
  });

  // Cell 2: anyAuthenticated=true, actionable.length>0 → EXIT_OK
  it('exits 0 when at least one CLI authenticated even if others need login', async () => {
    probeAllClis.mockResolvedValue([authed('claude'), needsLogin('gemini')]);
    expect(await runAndCaptureExit()).toBe(0);
  });

  // Cell 3: anyAuthenticated=false, actionable.length=0 → EXIT_OK
  // (no CLIs installed OR only error-state entries — no clear next action)
  it('exits 0 when no CLI is authenticated AND none has a clear next action', async () => {
    probeAllClis.mockResolvedValue([notInstalled('claude'), notInstalled('gemini')]);
    expect(await runAndCaptureExit()).toBe(0);
  });

  // Cell 4: anyAuthenticated=false, actionable.length>0 → EXIT_ERR (#2447 contract)
  it('exits 1 when NO CLI authenticated AND at least one has a clear next action', async () => {
    probeAllClis.mockResolvedValue([needsLogin('claude'), needsLogin('gemini')]);
    expect(await runAndCaptureExit()).toBe(1);
  });

  it('prints deprecation hint when invoked as the `login` alias (#2449)', async () => {
    probeAllClis.mockResolvedValue([authed('claude')]);
    try {
      await handleLoginCommand(makeArgs('login'));
    } catch {
      // expected — exit fires
    }
    const printed = consoleErrorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(printed).toContain("'nexus-agents login' is now 'nexus-agents auth status'");
  });

  it('does NOT print the deprecation hint for the canonical `auth` command', async () => {
    probeAllClis.mockResolvedValue([authed('claude')]);
    try {
      await handleLoginCommand(makeArgs('auth'));
    } catch {
      // expected
    }
    const printed = consoleErrorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(printed).not.toContain('login is now');
  });
});
