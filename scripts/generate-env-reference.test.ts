/** Tests for the schema-derived environment reference (#7200). */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { parseEnvFamilies, parseEnvSchema, renderEnvReference } from './generate-env-reference.js';
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
});
const DYNAMIC_FAMILIES = [
  { prefix: 'NEXUS_VOTER_MODEL_', suffixes: Object.keys(VOTER_ROLES).map((r) => r.toUpperCase()) },
  { prefix: 'NEXUS_JOB_MAX_CONCURRENT_', suffixes: 'any-identifier' },
];`;
const scratchDirs: string[] = [];
afterEach(() => {
  for (const dir of scratchDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('generate-env-reference', () => {
  it('omits group comments and only attributes comments to isolated keys', () => {
    const entries = parseEnvSchema(`const NexusEnvSchema = z.object({
      // All three use parseBoolEnv.
      NEXUS_A: z.string().optional(),
      NEXUS_B: z.string().optional(),
      NEXUS_C: z.string().optional(),

      // A single setting.
      NEXUS_SINGLE: z.string().optional(),

      // Still a group even with another ordinary comment.
      NEXUS_D: z.string().optional(),
      // Another setting.
      NEXUS_E: z.string().optional(),
      // --- Next section ---
      // The final setting.
      NEXUS_FINAL: z.string().optional(),
    });`);
    expect(entries.map((entry) => entry.description)).toEqual([
      'Not described in schema',
      'Not described in schema',
      'Not described in schema',
      'A single setting.',
      'Not described in schema',
      'Another setting.',
      'The final setting.',
    ]);
  });

  it('retains removed prose unless it names a removed variable absent from the schema', () => {
    const entries = parseEnvSchema(`const NexusEnvSchema = z.object({
      // Controls whether temporary files are removed.
      NEXUS_CLEANUP: z.string().optional(),

      // Removed temporary files are copied to NEXUS_ARCHIVE.
      NEXUS_COPY: z.string().optional(),

      // NEXUS_LIVE: removed values are rejected.
      NEXUS_LIVE: z.string().optional(),

      // NEXUS_GONE removed in #1234.
      NEXUS_NEW: z.string().optional(),

      // NEXUS_LATER: removed values are rejected.
      NEXUS_EARLIER: z.string().optional(),

      NEXUS_LATER: z.string().optional(),
    });`);
    expect(entries.map((entry) => entry.description)).toEqual([
      'Controls whether temporary files are removed.',
      'Removed temporary files are copied to NEXUS_ARCHIVE.',
      'NEXUS_LIVE: removed values are rejected.',
      'Not described in schema',
      'NEXUS_LATER: removed values are rejected.',
      'Not described in schema',
    ]);
  });

  it('renders each enum value as code with unambiguous pipes', () => {
    const entries = parseEnvSchema(`const NexusEnvSchema = z.object({
      NEXUS_MODE: z.enum(['a|b', 'c']).optional(),
    });`);
    expect(renderEnvReference(entries)).toContain('| `a\\|b` \\| `c` |');
  });

  it('parses family rules without evaluating runtime dependencies', () => {
    const families = parseEnvFamilies(fixture);
    expect(families).toEqual([
      {
        prefix: 'NEXUS_VOTER_MODEL_',
        suffixes: 'Object.keys(VOTER_ROLES).map((r) => r.toUpperCase())',
      },
      { prefix: 'NEXUS_JOB_MAX_CONCURRENT_', suffixes: 'any-identifier' },
    ]);
    const output = renderEnvReference(parseEnvSchema(fixture), families);
    expect(output).toBe(renderEnvReference(parseEnvSchema(fixture), [...families].reverse()));
    expect(output.indexOf('| `NEXUS_JOB_MAX_CONCURRENT_`')).toBeLessThan(
      output.indexOf('| `NEXUS_VOTER_MODEL_`')
    );
  });

  it('names the empty family case and rejects missing or unreadable declarations', () => {
    expect(parseEnvFamilies('const DYNAMIC_FAMILIES = [];')).toEqual([]);
    expect(renderEnvReference(parseEnvSchema(fixture), [])).toContain(
      'No variable families registered.'
    );
    for (const content of [
      '',
      'const DYNAMIC_FAMILIES = unknown;',
      'const DYNAMIC_FAMILIES = [...hidden];',
      "const DYNAMIC_FAMILIES = [{ prefix: 'NEXUS_X_' }];",
      "const DYNAMIC_FAMILIES = [{ prefix: '', suffixes: 'any-identifier' }];",
    ])
      expect(() => parseEnvFamilies(content)).toThrow(/family|families/i);
  });

  it('sorts environment names by codepoint rather than locale', () => {
    const entries = parseEnvSchema(`const NexusEnvSchema = z.object({
      NEXUS_a: z.string(), NEXUS_Z: z.string(), NEXUS_A_: z.string(), NEXUS_A0: z.string(),
    });`);
    expect(renderEnvReference(entries).match(/^\| `NEXUS_[^`]+`/gm)).toEqual([
      '| `NEXUS_A0`',
      '| `NEXUS_A_`',
      '| `NEXUS_Z`',
      '| `NEXUS_a`',
    ]);
  });
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
      acceptedValues: '`true` | `false`',
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
    expect(output).toContain('`true` \\| `false`');
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
      renderEnvReference(entries, parseEnvFamilies(source))
    );
  });

  it('documents variable families and detects prefix and suffix drift', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexus-env-families-'));
    scratchDirs.push(dir);
    const input = join(dir, schemaPath);
    mkdirSync(join(dir, 'packages/nexus-agents/src/config'), { recursive: true });
    writeFileSync(input, fixture);
    const run = (check: boolean): SpawnSyncReturns<string> =>
      spawnSync(
        process.execPath,
        [
          '--import',
          'tsx',
          join(ROOT, 'scripts/generate-env-reference.ts'),
          ...(check ? ['--check'] : []),
        ],
        {
          cwd: ROOT,
          encoding: 'utf8',
          env: { ...process.env, NEXUS_SCRIPT_ROOT: dir },
          timeout: 20_000,
        }
      );
    expect(run(false).status).toBe(0);
    const output = join(dir, 'docs/reference/environment.md');
    expect(run(true).status).toBe(0);
    const generated = readFileSync(output, 'utf8');
    expect(generated).toContain('## Variable families');
    expect(generated).toContain('`NEXUS_VOTER_MODEL_`');
    expect(generated).toContain('`Object.keys(VOTER_ROLES).map((r) => r.toUpperCase())`');
    expect(generated).toContain('`NEXUS_JOB_MAX_CONCURRENT_`');
    expect(generated).toContain('`any-identifier`');
    writeFileSync(input, fixture.replace('NEXUS_VOTER_MODEL_', 'NEXUS_REVIEW_MODEL_'));
    expect(run(true).status).toBe(1);
    expect(readFileSync(output, 'utf8')).toBe(generated);
    writeFileSync(input, fixture.replace("suffixes: 'any-identifier'", "suffixes: ['TOOL']"));
    expect(run(true).status).toBe(1);
    expect(readFileSync(output, 'utf8')).toBe(generated);
    writeFileSync(input, fixture);
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
    const missing = run(true);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('Environment reference drift: docs/reference/environment.md');
    expect(missing.stderr).not.toContain(dir);
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
