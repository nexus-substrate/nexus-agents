/**
 * Tests for repl-formatters.ts
 *
 * Covers banner printing, help text, status display,
 * history output, and screen clearing functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  printBanner,
  printReplHelp,
  printStatus,
  printHistory,
  clearScreen,
} from './repl-formatters.js';
import type { ReplSession } from './repl-types.js';
import * as coreModule from '../core/index.js';

// ============================================================================
// Setup
// ============================================================================

let stdoutOutput: string[];
let originalStdoutWrite: typeof process.stdout.write;

beforeEach(() => {
  stdoutOutput = [];
  originalStdoutWrite = process.stdout.write;
  // Mock process.stdout.write to capture output
  process.stdout.write = vi.fn((chunk: string | Uint8Array): boolean => {
    if (typeof chunk === 'string') {
      stdoutOutput.push(chunk);
    }
    return true;
  }) as typeof process.stdout.write;
});

afterEach(() => {
  process.stdout.write = originalStdoutWrite;
  vi.restoreAllMocks();
});

// ============================================================================
// printBanner
// ============================================================================

describe('printBanner', () => {
  it('prints welcome banner with version', () => {
    printBanner();
    const output = stdoutOutput.join('');
    expect(output).toContain('Nexus Agents');
    expect(output).toContain('Multi-agent orchestration interactive mode');
  });

  it('includes help instructions', () => {
    printBanner();
    const output = stdoutOutput.join('');
    expect(output).toContain("Type 'help' for available commands");
    expect(output).toContain("Type 'exit' or press Ctrl+C to quit");
  });

  it('uses box drawing characters', () => {
    printBanner();
    const output = stdoutOutput.join('');
    expect(output).toContain('╔');
    expect(output).toContain('╚');
    expect(output).toContain('║');
  });

  it('outputs to stdout', () => {
    printBanner();
    expect(process.stdout.write).toHaveBeenCalled();
  });
});

// ============================================================================
// printReplHelp
// ============================================================================

describe('printReplHelp', () => {
  it('prints available commands section', () => {
    printReplHelp();
    const output = stdoutOutput.join('');
    expect(output).toContain('Available Commands:');
  });

  it('lists basic commands', () => {
    printReplHelp();
    const output = stdoutOutput.join('');
    expect(output).toContain('help');
    expect(output).toContain('exit');
    expect(output).toContain('clear');
    expect(output).toContain('history');
    expect(output).toContain('status');
  });

  it('lists expert commands section', () => {
    printReplHelp();
    const output = stdoutOutput.join('');
    expect(output).toContain('Expert Commands:');
    expect(output).toContain('experts');
    expect(output).toContain('create <role>');
  });

  it('lists workflow commands section', () => {
    printReplHelp();
    const output = stdoutOutput.join('');
    expect(output).toContain('Workflow Commands:');
    expect(output).toContain('workflows');
    expect(output).toContain('run <name>');
  });

  it('includes task orchestration description', () => {
    printReplHelp();
    const output = stdoutOutput.join('');
    expect(output).toContain('Task Orchestration:');
    expect(output).toContain('TechLead agent');
  });

  it('provides usage example', () => {
    printReplHelp();
    const output = stdoutOutput.join('');
    expect(output).toContain('Review the authentication module for security issues');
  });

  it('outputs to stdout', () => {
    printReplHelp();
    expect(process.stdout.write).toHaveBeenCalled();
  });
});

// ============================================================================
// printStatus
// ============================================================================

describe('printStatus', () => {
  const createMockSession = (overrides?: Partial<ReplSession>): ReplSession => {
    const session: ReplSession = {
      sessionId: 'test-session-123',
      startTime: new Date('2024-01-15T10:00:00Z'),
      history: ['task 1', 'task 2'],
      verbose: false,
      ...overrides,
    };
    return session;
  };

  beforeEach(() => {
    vi.spyOn(coreModule, 'getTimeProvider').mockReturnValue({
      now: () => new Date('2024-01-15T10:05:30Z').getTime(),
      nowIso: () => '2024-01-15T10:05:30.000Z',
      nowDate: () => new Date('2024-01-15T10:05:30Z'),
      nowDateString: () => '2024-01-15',
    });
  });

  it('prints session ID', () => {
    const session = createMockSession();
    printStatus(session);
    const output = stdoutOutput.join('');
    expect(output).toContain('test-session-123');
  });

  it('prints start time', () => {
    const session = createMockSession();
    printStatus(session);
    const output = stdoutOutput.join('');
    expect(output).toContain('Started:');
  });

  it('calculates and displays uptime', () => {
    const session = createMockSession();
    printStatus(session);
    const output = stdoutOutput.join('');
    expect(output).toContain('Uptime:');
    expect(output).toContain('5m 30s');
  });

  it('shows command count', () => {
    const session = createMockSession();
    printStatus(session);
    const output = stdoutOutput.join('');
    expect(output).toContain('Commands run:');
    expect(output).toContain('2');
  });

  it('shows verbose status when disabled', () => {
    const session = createMockSession({ verbose: false });
    printStatus(session);
    const output = stdoutOutput.join('');
    expect(output).toContain('Verbose:');
    expect(output).toContain('disabled');
  });

  it('shows verbose status when enabled', () => {
    const session = createMockSession({ verbose: true });
    printStatus(session);
    const output = stdoutOutput.join('');
    expect(output).toContain('Verbose:');
    expect(output).toContain('enabled');
  });

  it('handles zero uptime', () => {
    vi.spyOn(coreModule, 'getTimeProvider').mockReturnValue({
      now: () => new Date('2024-01-15T10:00:00Z').getTime(),
      nowIso: () => '2024-01-15T10:00:00.000Z',
      nowDate: () => new Date('2024-01-15T10:00:00Z'),
      nowDateString: () => '2024-01-15',
    });
    const session = createMockSession();
    printStatus(session);
    const output = stdoutOutput.join('');
    expect(output).toContain('0m 0s');
  });

  it('handles uptime over 60 minutes', () => {
    vi.spyOn(coreModule, 'getTimeProvider').mockReturnValue({
      now: () => new Date('2024-01-15T11:30:45Z').getTime(),
      nowIso: () => '2024-01-15T11:30:45.000Z',
      nowDate: () => new Date('2024-01-15T11:30:45Z'),
      nowDateString: () => '2024-01-15',
    });
    const session = createMockSession();
    printStatus(session);
    const output = stdoutOutput.join('');
    expect(output).toContain('90m 45s');
  });

  it('outputs to stdout', () => {
    const session = createMockSession();
    printStatus(session);
    expect(process.stdout.write).toHaveBeenCalled();
  });
});

// ============================================================================
// printHistory
// ============================================================================

describe('printHistory', () => {
  const createMockSession = (history: string[]): ReplSession => ({
    sessionId: 'test-session',
    startTime: new Date(),
    history,
    verbose: false,
  });

  it('shows message when history is empty', () => {
    const session = createMockSession([]);
    printHistory(session);
    const output = stdoutOutput.join('');
    expect(output).toContain('No commands in history');
  });

  it('prints command history header', () => {
    const session = createMockSession(['task 1']);
    printHistory(session);
    const output = stdoutOutput.join('');
    expect(output).toContain('Command History:');
  });

  it('lists all history commands', () => {
    const session = createMockSession(['task 1', 'task 2', 'task 3']);
    printHistory(session);
    const output = stdoutOutput.join('');
    expect(output).toContain('task 1');
    expect(output).toContain('task 2');
    expect(output).toContain('task 3');
  });

  it('numbers commands sequentially', () => {
    const session = createMockSession(['first', 'second']);
    printHistory(session);
    const output = stdoutOutput.join('');
    // Check for sequential numbering (note: padded)
    expect(output).toMatch(/1.*first/);
    expect(output).toMatch(/2.*second/);
  });

  it('handles single command', () => {
    const session = createMockSession(['only one']);
    printHistory(session);
    const output = stdoutOutput.join('');
    expect(output).toContain('only one');
  });

  it('outputs to stdout', () => {
    const session = createMockSession(['task']);
    printHistory(session);
    expect(process.stdout.write).toHaveBeenCalled();
  });
});

// ============================================================================
// clearScreen
// ============================================================================

describe('clearScreen', () => {
  it('outputs ANSI escape codes for clearing', () => {
    clearScreen();
    const output = stdoutOutput.join('');
    expect(output).toContain('\x1b[2J');
  });

  it('outputs ANSI escape code for cursor home', () => {
    clearScreen();
    const output = stdoutOutput.join('');
    expect(output).toContain('\x1b[0f');
  });

  it('calls stdout.write exactly once', () => {
    clearScreen();
    expect(process.stdout.write).toHaveBeenCalledTimes(1);
  });

  it('outputs correct sequence', () => {
    clearScreen();
    expect(process.stdout.write).toHaveBeenCalledWith('\x1b[2J\x1b[0f');
  });
});
