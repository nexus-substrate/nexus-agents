import { describe, it, expect } from 'vitest';
import { parseInput } from './parse-input.js';

describe('parseInput', () => {
  it('parses empty input', () => {
    const result = parseInput('');
    expect(result.command).toBe('');
    expect(result.args).toEqual([]);
    expect(result.flags.size).toBe(0);
  });

  it('parses simple command', () => {
    const result = parseInput('help');
    expect(result.command).toBe('help');
    expect(result.args).toEqual([]);
  });

  it('lowercases command name', () => {
    const result = parseInput('WEATHER');
    expect(result.command).toBe('weather');
  });

  it('parses command with positional args', () => {
    const result = parseInput('delegate analyze code');
    expect(result.command).toBe('delegate');
    expect(result.args).toEqual(['analyze', 'code']);
  });

  it('parses quoted strings as single arg', () => {
    const result = parseInput('orchestrate "build auth module"');
    expect(result.command).toBe('orchestrate');
    expect(result.args).toEqual(['build auth module']);
  });

  it('parses single-quoted strings', () => {
    const result = parseInput("vote 'Should we use Ink?'");
    expect(result.command).toBe('vote');
    expect(result.args).toEqual(['Should we use Ink?']);
  });

  it('parses key=value flags', () => {
    const result = parseInput('weather --cli=claude --category=testing');
    expect(result.command).toBe('weather');
    expect(result.flags.get('cli')).toBe('claude');
    expect(result.flags.get('category')).toBe('testing');
  });

  it('parses boolean flags', () => {
    const result = parseInput('vote --quick');
    expect(result.flags.get('quick')).toBe('true');
  });

  it('handles mixed args and flags', () => {
    const result = parseInput('delegate "complex task" --prefer=reasoning');
    expect(result.command).toBe('delegate');
    expect(result.args).toEqual(['complex task']);
    expect(result.flags.get('prefer')).toBe('reasoning');
  });

  it('handles whitespace-only input', () => {
    const result = parseInput('   ');
    expect(result.command).toBe('');
  });

  it('handles tabs between tokens', () => {
    const result = parseInput('help\tweather');
    expect(result.command).toBe('help');
    expect(result.args).toEqual(['weather']);
  });
});
