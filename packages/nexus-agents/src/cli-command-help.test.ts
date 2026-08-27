/**
 * Tests for CLI Command Help
 *
 * Verifies per-command help metadata, formatting, and coverage.
 *
 * @module cli-command-help.test
 */
import { describe, it, expect } from 'vitest';

import { COMMAND_HELP, formatCommandHelp, formatAllCommandsHelp } from './cli-command-help.js';
import { getCommandDescription } from './cli-command-catalog.js';
import { VOTE_TIMEOUTS } from './config/timeouts.js';

// ============================================================================
// Help metadata registry
// ============================================================================

describe('COMMAND_HELP', () => {
  it('contains 11 command entries', () => {
    expect(COMMAND_HELP).toHaveLength(11);
  });

  it('has unique command names', () => {
    const names = COMMAND_HELP.map((e) => e.command);
    expect(new Set(names).size).toBe(names.length);
  });

  // #3209: the one-line description is no longer stored on the entry — it is
  // single-sourced from COMMAND_CATALOG. Assert every command resolves to a
  // non-empty catalog description (so per-command help is never blank).
  it('every command resolves a non-empty catalog description (single-sourced #3209)', () => {
    for (const entry of COMMAND_HELP) {
      const description = getCommandDescription(entry.command);
      expect(description, `no COMMAND_CATALOG description for "${entry.command}"`).toBeDefined();
      expect((description ?? '').length).toBeGreaterThan(0);
    }
  });

  it('every entry has at least one example', () => {
    for (const entry of COMMAND_HELP) {
      expect(entry.examples.length).toBeGreaterThan(0);
    }
  });

  it('no example contains secret-like strings', () => {
    const secretPatterns = /sk-[a-zA-Z0-9]{20}|api[_-]?key\s*=\s*["'][^"']+/i;
    for (const entry of COMMAND_HELP) {
      for (const example of entry.examples) {
        expect(example).not.toMatch(secretPatterns);
      }
    }
  });

  it('examples start with nexus-agents command', () => {
    for (const entry of COMMAND_HELP) {
      for (const example of entry.examples) {
        expect(example.startsWith('nexus-agents ')).toBe(true);
      }
    }
  });
});

// ============================================================================
// formatCommandHelp
// ============================================================================

describe('formatCommandHelp', () => {
  it('returns formatted help for known command', () => {
    const help = formatCommandHelp('orchestrate');
    expect(help).toBeDefined();
    expect(help).toContain('orchestrate');
    expect(help).toContain('FLAGS:');
    expect(help).toContain('EXAMPLES:');
    expect(help).toContain('REQUIRES:');
  });

  it('returns undefined for unknown command', () => {
    expect(formatCommandHelp('nonexistent')).toBeUndefined();
  });

  it('shows flags with descriptions', () => {
    const help = formatCommandHelp('orchestrate')!;
    expect(help).toContain('--engine');
    expect(help).toContain('--model');
    expect(help).toContain('--max-tokens');
  });

  it('shows API key requirements', () => {
    const help = formatCommandHelp('vote')!;
    expect(help).toContain('ANTHROPIC_API_KEY');
  });

  it('omits REQUIRES section when no API keys needed', () => {
    const help = formatCommandHelp('doctor')!;
    expect(help).not.toContain('REQUIRES:');
  });

  it('omits FLAGS section when no flags defined', () => {
    // All current entries have flags, but test the format structure
    const help = formatCommandHelp('doctor')!;
    expect(help).toContain('FLAGS:');
    expect(help).toContain('EXAMPLES:');
  });

  it('formats doctor command correctly', () => {
    const help = formatCommandHelp('doctor')!;
    expect(help).toContain('--deep');
    expect(help).toContain('--fix');
    expect(help).toContain('nexus-agents doctor');
  });

  it('formats setup command with all skip flags', () => {
    const help = formatCommandHelp('setup')!;
    expect(help).toContain('--skip-mcp');
    expect(help).toContain('--skip-hooks');
    expect(help).toContain('--interactive');
  });
});

// ============================================================================
// formatAllCommandsHelp
// ============================================================================

describe('formatAllCommandsHelp', () => {
  it('lists all 10 commands', () => {
    const output = formatAllCommandsHelp();
    for (const entry of COMMAND_HELP) {
      expect(output).toContain(entry.command);
    }
  });

  it('includes usage hint', () => {
    const output = formatAllCommandsHelp();
    expect(output).toContain('nexus-agents <command> --help');
  });

  it('includes descriptions', () => {
    const output = formatAllCommandsHelp();
    expect(output).toContain('Execute a task');
    expect(output).toContain('consensus vote');
  });
});

// =============================================================================
// Documented defaults match the code (#4965)
// =============================================================================

describe('vote --timeout documents the real default (#4965)', () => {
  // The help said 90; `VOTE_TIMEOUTS.defaultMs` has been 300 since #1640 raised
  // it from 180, noting architecture and security voters average 315s. An
  // operator reading 90 would conclude a 250s vote had hung.
  it('matches VOTE_TIMEOUTS.defaultMs', () => {
    const vote = COMMAND_HELP.find((c) => c.command === 'vote');
    const flag = vote?.flags?.find((f) => f.flag.startsWith('--timeout'));

    expect(flag).toBeDefined();
    expect(flag?.defaultValue).toBe(String(VOTE_TIMEOUTS.defaultMs / 1000));
  });
});
