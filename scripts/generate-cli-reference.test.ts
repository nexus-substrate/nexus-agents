import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderCliReference } from './generate-cli-reference.js';
import { parseCommandCatalog } from './parse-cli-command-catalog.js';

const ROOT = join(import.meta.dirname, '..');
const SOURCE_PATH = 'packages/nexus-agents/src/cli-command-catalog.ts';
const OUTPUT_PATH = 'docs/reference/cli.md';
const SOURCE = `export const COMMAND_CATALOG = [
  { command: 'server', audience: 'internal', description: 'Start server' },
  { command: '(default)', audience: 'essential', description: 'Default invocation' },
  { command: 'hello', audience: 'essential', description: 'Say hello' },
] as const;`;
const sandboxes: string[] = [];

function sandbox(source = SOURCE): string {
  const root = mkdtempSync(join(tmpdir(), 'nexus-cli-reference-'));
  sandboxes.push(root);
  const catalog = join(root, SOURCE_PATH);
  mkdirSync(dirname(catalog), { recursive: true });
  writeFileSync(catalog, source);
  return root;
}

function run(root: string, ...args: string[]): SpawnSyncReturns<string> {
  return spawnSync(
    process.execPath,
    ['--import', 'tsx', join(ROOT, 'scripts/generate-cli-reference.ts'), ...args],
    {
      cwd: ROOT,
      env: { ...process.env, NEXUS_SCRIPT_ROOT: root },
      encoding: 'utf8',
      timeout: 20_000,
    }
  );
}

afterEach(() => {
  for (const root of sandboxes.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('generate-cli-reference', () => {
  it('sorts commands by codepoint rather than locale', () => {
    const output = renderCliReference(`export const COMMAND_CATALOG = [
      { command: 'a', audience: 'essential', description: 'Lowercase' },
      { command: 'Z', audience: 'essential', description: 'Uppercase' },
      { command: 'A_', audience: 'essential', description: 'Underscore' },
      { command: 'A0', audience: 'essential', description: 'Digit' },
    ];`);
    expect(output.match(/^\| `[^`]+`/gm)).toEqual(['| `A0`', '| `A_`', '| `Z`', '| `a`']);
  });
  it('renders angle-bracket placeholders as text rather than inline HTML', () => {
    const output = renderCliReference(`export const COMMAND_CATALOG = [
      { command: 'init', audience: 'essential', description: 'Initialize <repo> at <path>' },
    ];`);
    expect(output).toContain('Initialize &lt;repo&gt; at &lt;path&gt;');
  });

  it('renders every catalog entry, including default and internal entries', () => {
    const source = readFileSync(join(ROOT, SOURCE_PATH), 'utf8');
    const entries = parseCommandCatalog(source);
    const output = renderCliReference(source);
    const rows = output.split('\n').filter((line) => line.startsWith('| `'));
    expect(rows).toHaveLength(entries.length);
    for (const entry of entries) {
      expect(output).toContain(`| \`${entry.command}\` | ${entry.audience} |`);
    }
    expect(output).toContain('| `(default)` | essential |');
    expect(output).toContain('| `server` | internal |');
  });

  it('renders reference metadata and exact source provenance without volatile data', () => {
    const output = renderCliReference(SOURCE);
    expect(output).toMatch(
      /^---\ntitle: .+\ndescription: .+\ndiataxis: reference\naudience: user\n/
    );
    expect(output).toContain('tier: 1');
    expect(output).toContain('keywords: [');
    expect(output).toContain('related_files: [');
    expect(output).toContain(`Generated from ${SOURCE_PATH} — do not edit by hand`);
    expect(renderCliReference(SOURCE)).toBe(output);
  });

  it('sorts rows deterministically and escapes table delimiters and multiline descriptions', () => {
    const source = `export const COMMAND_CATALOG = [
      { command: 'z-last', audience: 'internal', description: 'Path \\\\root | choices\\nNext line' },
      { command: 'a-first', audience: 'essential', description: 'First' },
    ];`;
    const output = renderCliReference(source);
    expect(output.indexOf('| `a-first`')).toBeLessThan(output.indexOf('| `z-last`'));
    expect(output).toContain('| `z-last` | internal | Path \\\\root \\| choices Next line |');
  });

  it.each([
    'export const COMMAND_CATALOG = [];',
    'export const COMMAND_CATALOG = OTHER;',
    'export const OTHER = [];',
  ])('rejects a missing or empty catalog instead of generating an empty page: %s', (source) => {
    expect(() => renderCliReference(source)).toThrow(/empty|ZERO|no entries/i);
  });

  it.each([
    "export const COMMAND_CATALOG = [{ command: 'hello', audience: 'essential' }];",
    'export const COMMAND_CATALOG = [...OTHER];',
  ])('rejects unreadable entries rather than silently omitting them: %s', (source) => {
    expect(() => renderCliReference(source)).toThrow(/COMMAND_CATALOG/);
  });

  it('committed reference matches the live catalog', () => {
    const source = readFileSync(join(ROOT, SOURCE_PATH), 'utf8');
    expect(readFileSync(join(ROOT, OUTPUT_PATH), 'utf8')).toBe(renderCliReference(source));
  });
});

describe('generate-cli-reference CLI', () => {
  it('fails check on a missing page without writing, then generates and checks successfully', () => {
    const root = sandbox();
    const target = join(root, OUTPUT_PATH);
    const missing = run(root, '--check');
    expect(missing.status).toBe(1);
    expect(missing.stderr).toMatch(/missing/i);
    expect(existsSync(target)).toBe(false);
    expect(run(root).status).toBe(0);
    const generated = readFileSync(target, 'utf8');
    expect(generated).toBe(renderCliReference(SOURCE));
    expect(run(root, '--check').status).toBe(0);
    expect(readFileSync(target, 'utf8')).toBe(generated);
  });

  it('fails check on drift without modifying the existing page', () => {
    const root = sandbox();
    const target = join(root, OUTPUT_PATH);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, 'hand edited\n');
    const result = run(root, '--check');
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/out of date|drift/i);
    expect(readFileSync(target, 'utf8')).toBe('hand edited\n');
  });

  it.each(['export const COMMAND_CATALOG = [];', 'export const COMMAND_CATALOG = [...OTHER];'])(
    'fails generation and check for an invalid catalog without writing: %s',
    (source) => {
      const root = sandbox(source);
      expect(run(root).status).toBe(1);
      expect(run(root, '--check').status).toBe(1);
      expect(existsSync(join(root, OUTPUT_PATH))).toBe(false);
    }
  );
});
