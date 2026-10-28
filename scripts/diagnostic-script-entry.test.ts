/** Actual diagnostic entry/import boundaries; safe empty-data branches (#7681). */
import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ScriptEntryFixture, type EntryResult } from './fixtures/script-entry-fixture.js';

const paths = ['plain', 'with space', 'with#hash', 'with%percent', 'with-雪'];
const scripts = [
  'analyze-timeout-mismatch.ts',
  'undeclared-options-precision.ts',
  'build-model-registry.ts',
  'check-registry-diff.ts',
] as const;
type Script = (typeof scripts)[number];
let fixture: ScriptEntryFixture | undefined;
afterEach(() => fixture?.close());

function envelope(result: EntryResult): void {
  expect(result.process.error).toBeUndefined();
  expect(result.process.signal).toBeNull();
  expect(result.loaderIpcBlocked).toHaveLength(2);
  const sealed = result.timeline.map((event) => event.name).indexOf('bootstrap:sealed');
  expect(sealed).toBeGreaterThan(0);
  expect(result.timeline.filter((event) => event.name === 'bootstrap:sealed')).toHaveLength(1);
  expect(result.timeline[0]?.name).toBe('boundary:installed');
  const startup = result.timeline.filter((event) => event.name === 'loader:tsx-ipc-BLOCKED');
  expect(startup).toHaveLength(2);
  for (const event of startup) {
    expect(event.phase).toBe('startup');
    expect(result.timeline.indexOf(event)).toBeLessThan(sealed);
  }
  const subjects = result.timeline.filter((event) => event.name === 'subject:resolved');
  expect(subjects.length).toBeGreaterThan(0);
  for (const event of subjects) {
    expect(event.phase).toBe('sealed');
    expect(result.timeline.indexOf(event)).toBeGreaterThan(sealed);
  }
  for (const event of result.timeline) expect(event.pid).toBe(result.process.pid);
  for (const event of result.ipc) expect(event.pid).toBe(result.process.pid);
  const ipc = result.ipc.filter((event) => event.classification === 'loader:tsx-ipc-BLOCKED');
  expect(ipc).toHaveLength(2);
  expect(new Set(ipc.map((event) => event.caller?.file)).size).toBe(2);
  for (const event of ipc) expect(event.phase).toBe('startup');
}

function valid(result: EntryResult, mode: 'direct' | 'import'): void {
  envelope(result);
  expect(result.blocked).toEqual([]);
  if (fixture === undefined) throw new Error('Missing owned entry fixture');
  // This is observed Node resolution, not a claim to read the source's lexical import.meta.
  const events = result.timeline.filter((event) => event.name === 'subject:resolved');
  expect(events.map((event) => event.url)).toContain(pathToFileURL(fixture.entry).href);
  if (mode === 'direct') expect(events[0]?.argv[1]).toBe(fixture.entry);
}

function sourceHash(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function argumentsFor(script: Script, missing: string): string[] {
  if (script === 'analyze-timeout-mismatch.ts') return ['--json', missing];
  if (script === 'undeclared-options-precision.ts') return ['--file', missing];
  if (script === 'build-model-registry.ts') return ['--offline'];
  return [];
}

function diagnostic(script: Script, result: EntryResult, missing: string): void {
  const { status, stdout, stderr } = result.process;
  if (script === 'analyze-timeout-mismatch.ts') {
    expect(status).toBe(0);
    expect(stderr).toBe('');
    expect(String(stdout).trim().length).toBeGreaterThan(0);
    const report: unknown = JSON.parse(String(stdout));
    expect(report).toMatchObject({
      source: missing,
      totalEvents: 0,
      perTool: [],
      verdict: 'insufficient-data',
    });
  } else if (script === 'undeclared-options-precision.ts') {
    expect(status).toBe(2);
    expect(stderr).toBe('');
    expect(stdout).toBe(`store: ${missing}\nprecision: unmeasured (no store file at that path)\n`);
  } else if (script === 'build-model-registry.ts') {
    expect(status).toBe(1);
    expect(stdout).toBe(
      '[registry-build] starting build-model-registry\n[registry-build] dry=false offline=true\n'
    );
    expect(stderr).toBe(
      '[registry-build] both upstream sources unavailable and no existing snapshot to retain\n'
    );
  } else {
    expect(status).toBe(2);
    expect(stdout).toBe('');
    expect(stderr).toBe('usage: check-registry-diff <old.json> <new.json> [--json]\n');
  }
}

function actualCase(script: Script, component: string, mode: 'direct' | 'import'): void {
  fixture = new ScriptEntryFixture(script, component);
  const missing = join(fixture.directory, 'missing-owned-data.jsonl');
  const original = fileURLToPath(new URL(script, import.meta.url));
  const before = sourceHash(original);
  const result = fixture.run(mode, argumentsFor(script, missing));
  valid(result, mode);
  expect(sourceHash(original)).toBe(before);
  expect(sourceHash(fixture.entry)).toBe(before);
  expect(readdirSync(fixture.policyRoot)).toEqual([]);
  expect(existsSync(missing)).toBe(false);
  expect(existsSync(join(fixture.directory, 'data'))).toBe(false);
  if (mode === 'direct') diagnostic(script, result, missing);
  else {
    expect(result.process.status).toBe(0);
    expect(result.process.stdout).toBe('TEST_IMPORT_COMPLETE\n');
    expect(result.process.stderr).toBe('');
  }
}

describe('diagnostic instrumentation qualification', () => {
  it.each(scripts)('qualifies plain direct/import safe branch for %s', (script) => {
    actualCase(script, 'plain', 'direct');
    fixture?.close();
    actualCase(script, 'plain', 'import');
  });
});

describe('actual diagnostic module boundaries', () => {
  for (const script of scripts) {
    for (const component of paths) {
      for (const mode of ['direct', 'import'] as const) {
        it(`${script} ${mode} in ${component}`, () => {
          actualCase(script, component, mode);
        });
      }
    }
  }
});
