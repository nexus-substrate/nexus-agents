/**
 * Tests for Research Index Helpers
 * @module cli/research-index-helpers.test
 */

import { describe, it, expect } from 'vitest';
import {
  parseActionArg,
  parseBooleanFlags,
  parseValueArg,
  buildOptionsFromState,
  createInitialParseState,
  parseResearchIndexArgs,
  getResearchIndexHelp,
} from './research-index-helpers.js';

// ============================================================================
// createInitialParseState
// ============================================================================

describe('createInitialParseState', () => {
  it('returns correct defaults', () => {
    const state = createInitialParseState();
    expect(state.action).toBe('check');
    expect(state.output).toBeUndefined();
    expect(state.format).toBe('text');
    expect(state.strict).toBe(false);
    expect(state.checkFiles).toBe(true);
    expect(state.silent).toBe(false);
  });
});

// ============================================================================
// parseActionArg
// ============================================================================

describe('parseActionArg', () => {
  it('parses --generate flag', () => {
    const state = createInitialParseState();
    expect(parseActionArg('--generate', state)).toBe(true);
    expect(state.action).toBe('generate');
  });

  it('parses -g shorthand', () => {
    const state = createInitialParseState();
    expect(parseActionArg('-g', state)).toBe(true);
    expect(state.action).toBe('generate');
  });

  it('parses --validate flag', () => {
    const state = createInitialParseState();
    expect(parseActionArg('--validate', state)).toBe(true);
    expect(state.action).toBe('validate');
  });

  it('parses -v shorthand', () => {
    const state = createInitialParseState();
    expect(parseActionArg('-v', state)).toBe(true);
    expect(state.action).toBe('validate');
  });

  it('parses --check flag', () => {
    const state = createInitialParseState();
    expect(parseActionArg('--check', state)).toBe(true);
    expect(state.action).toBe('check');
  });

  it('parses -c shorthand', () => {
    const state = createInitialParseState();
    expect(parseActionArg('-c', state)).toBe(true);
    expect(state.action).toBe('check');
  });

  it('returns false for unknown flags', () => {
    const state = createInitialParseState();
    expect(parseActionArg('--unknown', state)).toBe(false);
  });
});

// ============================================================================
// parseBooleanFlags
// ============================================================================

describe('parseBooleanFlags', () => {
  it('parses --strict flag', () => {
    const state = createInitialParseState();
    expect(parseBooleanFlags('--strict', state)).toBe(true);
    expect(state.strict).toBe(true);
  });

  it('parses --no-check-files flag', () => {
    const state = createInitialParseState();
    expect(parseBooleanFlags('--no-check-files', state)).toBe(true);
    expect(state.checkFiles).toBe(false);
  });

  it('parses --silent flag', () => {
    const state = createInitialParseState();
    expect(parseBooleanFlags('--silent', state)).toBe(true);
    expect(state.silent).toBe(true);
  });

  it('parses -s shorthand', () => {
    const state = createInitialParseState();
    expect(parseBooleanFlags('-s', state)).toBe(true);
    expect(state.silent).toBe(true);
  });

  it('returns false for unknown flags', () => {
    const state = createInitialParseState();
    expect(parseBooleanFlags('--unknown', state)).toBe(false);
  });
});

// ============================================================================
// parseValueArg
// ============================================================================

describe('parseValueArg', () => {
  it('parses --output flag', () => {
    const state = createInitialParseState();
    const consumed = parseValueArg('--output', ['--output', '/tmp/out.md'], 0, state);
    expect(consumed).toBe(2);
    expect(state.output).toBe('/tmp/out.md');
  });

  it('parses -o shorthand', () => {
    const state = createInitialParseState();
    const consumed = parseValueArg('-o', ['-o', 'output.md'], 0, state);
    expect(consumed).toBe(2);
    expect(state.output).toBe('output.md');
  });

  it('parses --format json', () => {
    const state = createInitialParseState();
    const consumed = parseValueArg('--format', ['--format', 'json'], 0, state);
    expect(consumed).toBe(2);
    expect(state.format).toBe('json');
  });

  it('parses -f shorthand', () => {
    const state = createInitialParseState();
    const consumed = parseValueArg('-f', ['-f', 'json'], 0, state);
    expect(consumed).toBe(2);
    expect(state.format).toBe('json');
  });

  it('ignores non-json format', () => {
    const state = createInitialParseState();
    parseValueArg('--format', ['--format', 'text'], 0, state);
    expect(state.format).toBe('text');
  });

  it('returns 0 for unknown flags', () => {
    const state = createInitialParseState();
    expect(parseValueArg('--unknown', ['--unknown', 'val'], 0, state)).toBe(0);
  });
});

// ============================================================================
// buildOptionsFromState
// ============================================================================

describe('buildOptionsFromState', () => {
  it('builds options from default state', () => {
    const state = createInitialParseState();
    const options = buildOptionsFromState(state);
    expect(options.action).toBe('check');
    expect(options.format).toBe('text');
    expect(options.strict).toBe(false);
    expect(options.checkFiles).toBe(true);
    expect(options.silent).toBe(false);
  });

  it('includes output when set', () => {
    const state = createInitialParseState();
    state.output = '/tmp/out.md';
    const options = buildOptionsFromState(state);
    expect(options.output).toBe('/tmp/out.md');
  });

  it('omits output when undefined', () => {
    const state = createInitialParseState();
    const options = buildOptionsFromState(state);
    expect('output' in options).toBe(false);
  });
});

// ============================================================================
// parseResearchIndexArgs
// ============================================================================

describe('parseResearchIndexArgs', () => {
  it('parses empty args to defaults', () => {
    const options = parseResearchIndexArgs([]);
    expect(options.action).toBe('check');
    expect(options.format).toBe('text');
    expect(options.strict).toBe(false);
  });

  it('parses generate with output', () => {
    const options = parseResearchIndexArgs(['--generate', '--output', '/tmp/index.md']);
    expect(options.action).toBe('generate');
    expect(options.output).toBe('/tmp/index.md');
  });

  it('parses validate with strict and json', () => {
    const options = parseResearchIndexArgs(['--validate', '--strict', '--format', 'json']);
    expect(options.action).toBe('validate');
    expect(options.strict).toBe(true);
    expect(options.format).toBe('json');
  });

  it('parses check with silent', () => {
    const options = parseResearchIndexArgs(['--check', '--silent']);
    expect(options.action).toBe('check');
    expect(options.silent).toBe(true);
  });

  it('parses shorthand flags', () => {
    const options = parseResearchIndexArgs(['-g', '-o', 'out.md', '-s']);
    expect(options.action).toBe('generate');
    expect(options.output).toBe('out.md');
    expect(options.silent).toBe(true);
  });

  it('handles --no-check-files', () => {
    const options = parseResearchIndexArgs(['--validate', '--no-check-files']);
    expect(options.checkFiles).toBe(false);
  });
});

// ============================================================================
// getResearchIndexHelp
// ============================================================================

describe('getResearchIndexHelp', () => {
  it('returns help text with usage', () => {
    const help = getResearchIndexHelp();
    expect(help).toContain('Usage:');
    expect(help).toContain('--generate');
    expect(help).toContain('--validate');
    expect(help).toContain('--check');
  });

  it('includes options section', () => {
    const help = getResearchIndexHelp();
    expect(help).toContain('Options:');
    expect(help).toContain('--output');
    expect(help).toContain('--format');
    expect(help).toContain('--strict');
  });

  it('includes examples', () => {
    const help = getResearchIndexHelp();
    expect(help).toContain('Examples:');
  });
});
