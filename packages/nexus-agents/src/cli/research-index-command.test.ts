/**
 * nexus-agents/cli - Research Index Command Tests
 *
 * Tests for the research index CLI command.
 *
 * @see Issue #367 - Deterministic RESEARCH_INDEX.md generation
 */

import { describe, it, expect } from 'vitest';
import { parseResearchIndexArgs, getResearchIndexHelp } from './research-index-command.js';
import type { ResearchIndexOptions } from './research-index-command.js';

// ============================================================================
// Argument Parsing Tests
// ============================================================================

describe('parseResearchIndexArgs', () => {
  it('should default to check action', () => {
    const result = parseResearchIndexArgs([]);
    expect(result.action).toBe('check');
  });

  it('should parse --generate flag', () => {
    const result = parseResearchIndexArgs(['--generate']);
    expect(result.action).toBe('generate');
  });

  it('should parse -g shorthand', () => {
    const result = parseResearchIndexArgs(['-g']);
    expect(result.action).toBe('generate');
  });

  it('should parse --validate flag', () => {
    const result = parseResearchIndexArgs(['--validate']);
    expect(result.action).toBe('validate');
  });

  it('should parse -v shorthand', () => {
    const result = parseResearchIndexArgs(['-v']);
    expect(result.action).toBe('validate');
  });

  it('should parse --check flag', () => {
    const result = parseResearchIndexArgs(['--check']);
    expect(result.action).toBe('check');
  });

  it('should parse -c shorthand', () => {
    const result = parseResearchIndexArgs(['-c']);
    expect(result.action).toBe('check');
  });

  it('should parse --output option', () => {
    const result = parseResearchIndexArgs(['--generate', '--output', '/tmp/index.md']);
    expect(result.action).toBe('generate');
    expect(result.output).toBe('/tmp/index.md');
  });

  it('should parse -o shorthand', () => {
    const result = parseResearchIndexArgs(['-g', '-o', '/tmp/index.md']);
    expect(result.output).toBe('/tmp/index.md');
  });

  it('should parse --format option', () => {
    const result = parseResearchIndexArgs(['--validate', '--format', 'json']);
    expect(result.action).toBe('validate');
    expect(result.format).toBe('json');
  });

  it('should default format to text', () => {
    const result = parseResearchIndexArgs(['--validate']);
    expect(result.format).toBe('text');
  });

  it('should parse --strict flag', () => {
    const result = parseResearchIndexArgs(['--validate', '--strict']);
    expect(result.strict).toBe(true);
  });

  it('should default strict to false', () => {
    const result = parseResearchIndexArgs(['--validate']);
    expect(result.strict).toBe(false);
  });

  it('should parse --no-check-files flag', () => {
    const result = parseResearchIndexArgs(['--validate', '--no-check-files']);
    expect(result.checkFiles).toBe(false);
  });

  it('should default checkFiles to true', () => {
    const result = parseResearchIndexArgs(['--validate']);
    expect(result.checkFiles).toBe(true);
  });

  it('should parse --silent flag', () => {
    const result = parseResearchIndexArgs(['--check', '--silent']);
    expect(result.silent).toBe(true);
  });

  it('should parse -s shorthand', () => {
    const result = parseResearchIndexArgs(['-c', '-s']);
    expect(result.silent).toBe(true);
  });

  it('should default silent to false', () => {
    const result = parseResearchIndexArgs(['--check']);
    expect(result.silent).toBe(false);
  });

  it('should handle multiple flags', () => {
    const result = parseResearchIndexArgs([
      '--validate',
      '--format',
      'json',
      '--strict',
      '--no-check-files',
    ]);
    expect(result.action).toBe('validate');
    expect(result.format).toBe('json');
    expect(result.strict).toBe(true);
    expect(result.checkFiles).toBe(false);
  });

  it('should use last action when multiple specified', () => {
    const result = parseResearchIndexArgs(['--generate', '--validate', '--check']);
    expect(result.action).toBe('check');
  });
});

// ============================================================================
// Help Text Tests
// ============================================================================

describe('getResearchIndexHelp', () => {
  it('should return help text', () => {
    const help = getResearchIndexHelp();
    expect(help).toContain('Usage:');
    expect(help).toContain('nexus-agents research index');
  });

  it('should document all options', () => {
    const help = getResearchIndexHelp();
    expect(help).toContain('--generate');
    expect(help).toContain('--validate');
    expect(help).toContain('--check');
    expect(help).toContain('--output');
    expect(help).toContain('--format');
    expect(help).toContain('--strict');
    expect(help).toContain('--no-check-files');
    expect(help).toContain('--silent');
  });

  it('should include examples', () => {
    const help = getResearchIndexHelp();
    expect(help).toContain('Examples:');
  });
});

// ============================================================================
// Type Tests
// ============================================================================

describe('ResearchIndexOptions type', () => {
  it('should accept valid options', () => {
    const options: ResearchIndexOptions = {
      action: 'generate',
      output: '/tmp/index.md',
      format: 'text',
      strict: false,
      checkFiles: true,
      silent: false,
    };

    expect(options.action).toBe('generate');
    expect(options.output).toBe('/tmp/index.md');
  });

  it('should accept minimal options', () => {
    const options: ResearchIndexOptions = {
      action: 'check',
    };

    expect(options.action).toBe('check');
    expect(options.output).toBeUndefined();
    expect(options.format).toBeUndefined();
  });
});
