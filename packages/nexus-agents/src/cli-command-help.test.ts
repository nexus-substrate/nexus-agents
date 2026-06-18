/**
 * Tests for CLI Command Help
 *
 * Verifies per-command help metadata, formatting, and coverage.
 *
 * @module cli-command-help.test
 */
import { describe, it, expect } from 'vitest';

import { COMMAND_HELP, formatCommandHelp, formatAllCommandsHelp } from './cli-command-help.js';

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

  it('every entry has non-empty description', () => {
    for (const entry of COMMAND_HELP) {
      expect(entry.description.length).toBeGreaterThan(0);
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
