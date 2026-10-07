/** Tests for the schema-derived environment reference (#7200). */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { parseEnvSchema, renderEnvReference } from './generate-env-reference.js';
import { ROOT } from './script-paths.js';

const schemaPath = 'packages/nexus-agents/src/config/env-schema.ts';
const fixture = `
const enabled = z.enum(['true', 'false']);
const count = z.string().regex(/^\\d+$/, 'Must be an integer string');
const loose = z.string().refine(v => ['true', '1'].includes(v), {message: 'Must be true or 1'});
const NexusEnvSchema = z.object({
  // Toggle the feature.
  NEXUS_ENABLED: enabled.optional().default('false'),
  NEXUS_COUNT: count.optional().describe('Number of workers'),
  NEXUS_LOOSE: loose.optional(),
  NEXUS_PATH: z.string().optional(),
  NEXUS_CUSTOM: z.string().superRefine(validate).optional(),
});`;
const scratchDirs: string[] = [];
afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('generate-env-reference', () => {
  it('does not attach comments across sections or removed-variable notes to neighboring entries', () => {
    const entries = parseEnvSchema(`const NexusEnvSchema = z.object({
      // An older setting used a boolean.
      // --- Workers ---
      NEXUS_WORKERS: z.string().optional(),
      // NEXUS_OLD removed in #1234 — it has no reader.
      NEXUS_MODE: z.enum(['off', 'on']).optional(),
    });`);
    expect(entries.map((entry) => entry.description)).toEqual([
      'Not described in schema',
      'Not described in schema',
    ]);
  });

  it('escapes source prose without corrupting its inline code', () => {
    const output = renderEnvReference([
      {
        name: 'NEXUS_X',
        acceptedValues: 'string',
        defaultValue: 'Not declared in schema',
        description: 'Set <root> with a * literal or _ marker; `NEXUS_X` stays code.',
      },
    ]);
    expect(output).toContain(
      'Set &lt;root&gt; with a \\* literal or \\_ marker; `NEXUS_X` stays code.'
    );
  });

  it('resolves helper validators, defaults, descriptions and custom validation honestly', () => {
    const entries = parseEnvSchema(fixture);
    expect(entries).toHaveLength(5);
    expect(entries.find((e) => e.name === 'NEXUS_ENABLED')).toMatchObject({
      acceptedValues: 'true | false',
      defaultValue: 'false',
      description: 'Toggle the feature.',
    });
    expect(entries.find((e) => e.name === 'NEXUS_COUNT')).toMatchObject({
      acceptedValues: 'string; pattern /^\\d+$/',
      description: 'Number of workers',
    });
    expect(entries.find((e) => e.name === 'NEXUS_LOOSE')?.acceptedValues).toContain(
      'Must be true or 1'
    );
    expect(entries.find((e) => e.name === 'NEXUS_PATH')).toMatchObject({
      defaultValue: 'Not declared in schema',
      description: 'Not described in schema',
    });
    expect(entries.find((e) => e.name === 'NEXUS_CUSTOM')?.acceptedValues).toContain(
      'custom validation'
    );
  });

  it('fails loudly on empty, missing or unreadable schemas and unresolved helpers', () => {
    for (const source of [
      'const NexusEnvSchema = z.object({});',
      '',
      'const NexusEnvSchema = z.object({ NEXUS_X: unknownHelper.optional() });',
      'const NexusEnvSchema = z.object({ ...hidden });',
    ])
      expect(() => parseEnvSchema(source)).toThrow();
  });

  it('renders stable rows, frontmatter and provenance with escaped cells', () => {
    const entries = parseEnvSchema(fixture);
    const output = renderEnvReference(entries);
    expect(output).toBe(renderEnvReference([...entries].reverse()));
    expect(output).toContain('diataxis: reference');
    expect(output).toContain(`Generated from ${schemaPath} — do not edit by hand`);
    expect(output).toContain('true \\| false');
    expect(output.match(/^\| `NEXUS_/gm)).toHaveLength(entries.length);
    expect(output).toContain('runtime defaults');
    expect(() => renderEnvReference([])).toThrow();
    const escaped = renderEnvReference([
      { name: 'NEXUS_X', acceptedValues: 'string', defaultValue: 'a|b', description: 'A|B\nC\\D' },
    ]);
    expect(escaped).toContain('a\\|b');
    expect(escaped).toContain('A\\|B C\\\\D');
  });

  it('documents exactly the registered names and matches the committed generated page', () => {
    const source = readFileSync(join(ROOT, schemaPath), 'utf8');
    const entries = parseEnvSchema(source);
    const registered = source.slice(
      source.indexOf('const NexusEnvSchema'),
      source.indexOf('const KNOWN_NAMES')
    );
    const names = [...registered.matchAll(/^\s+(NEXUS_[A-Z_0-9]+):/gm)].map((m) => m[1]);
    expect(entries.map((e) => e.name).sort()).toEqual(names.sort());
    expect(readFileSync(join(ROOT, 'docs/reference/environment.md'), 'utf8')).toBe(
      renderEnvReference(entries)
    );
  });

  it('generates and checks real files; missing and changed output fail without overwriting', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexus-env-reference-'));
    scratchDirs.push(dir);
    const input = join(dir, schemaPath);
    mkdirSync(join(dir, 'packages/nexus-agents/src/config'), { recursive: true });
    writeFileSync(input, fixture);
    const run = (check: boolean): SpawnSyncReturns<string> =>
      spawnSync(
        join(ROOT, 'node_modules/.bin/tsx'),
        [join(ROOT, 'scripts/generate-env-reference.ts'), ...(check ? ['--check'] : [])],
        { encoding: 'utf8', env: { ...process.env, NEXUS_SCRIPT_ROOT: dir } }
      );
    expect(run(true).status).toBe(1);
    expect(run(false).status).toBe(0);
    const output = join(dir, 'docs/reference/environment.md');
    expect(run(true).status).toBe(0);
    writeFileSync(output, 'stale');
    expect(run(true).status).toBe(1);
    expect(readFileSync(output, 'utf8')).toBe('stale');
    writeFileSync(input, 'const NexusEnvSchema = z.object({});');
    const failed = run(false);
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain('empty');
    expect(readFileSync(output, 'utf8')).toBe('stale');
  });
});
