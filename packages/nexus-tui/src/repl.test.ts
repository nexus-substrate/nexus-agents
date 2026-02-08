import { describe, it, expect } from 'vitest';
import { createRepl, processLine } from './repl.js';
import { createCommandRegistry } from './commands/index.js';

describe('createRepl', () => {
  it('creates with defaults', () => {
    const repl = createRepl();
    expect(repl.prompt).toBe('nexus> ');
    expect(repl.jsonMode).toBe(false);
    expect(repl.registry.size).toBeGreaterThan(0);
  });

  it('accepts custom prompt', () => {
    const repl = createRepl({ prompt: '$ ' });
    expect(repl.prompt).toBe('$ ');
  });

  it('accepts json mode', () => {
    const repl = createRepl({ jsonMode: true });
    expect(repl.jsonMode).toBe(true);
  });
});

describe('processLine', () => {
  const registry = createCommandRegistry();

  it('returns null for empty input', async () => {
    const result = await processLine('', registry, false);
    expect(result).toBeNull();
  });

  it('returns null for exit command', async () => {
    const result = await processLine('exit', registry, false);
    expect(result).toBeNull();
  });

  it('returns null for quit command', async () => {
    const result = await processLine('quit', registry, false);
    expect(result).toBeNull();
  });

  it('returns null for q command', async () => {
    const result = await processLine('q', registry, false);
    expect(result).toBeNull();
  });

  it('returns error for unknown command', async () => {
    const result = await processLine('nonexistent', registry, false);
    expect(result).toContain('Unknown command');
  });

  it('dispatches help command', async () => {
    const result = await processLine('help', registry, false);
    expect(result).toContain('Nexus TUI');
    expect(result).toContain('help');
  });

  it('dispatches help for specific command', async () => {
    const result = await processLine('help vote', registry, false);
    expect(result).toContain('vote');
    expect(result).toContain('Usage');
  });

  it('returns JSON format in jsonMode', async () => {
    const result = await processLine('nonexistent', registry, true);
    const parsed = JSON.parse(result!);
    expect(parsed.isError).toBe(true);
    expect(parsed.output).toContain('Unknown command');
  });
});

describe('command registry', () => {
  const registry = createCommandRegistry();

  it('registers all expected commands', () => {
    const expected = [
      'orchestrate',
      'vote',
      'weather',
      'workflow',
      'delegate',
      'expert',
      'status',
      'help',
    ];
    for (const name of expected) {
      expect(registry.has(name)).toBe(true);
    }
  });

  it('each handler has required fields', () => {
    for (const [, handler] of registry) {
      expect(handler.name).toBeTruthy();
      expect(handler.description).toBeTruthy();
      expect(handler.usage).toBeTruthy();
      expect(typeof handler.execute).toBe('function');
    }
  });
});
