/** Actual readiness entry/import boundaries and pre-import guard controls (#7680). */
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ScriptEntryFixture, type EntryResult } from './fixtures/script-entry-fixture.js';

const paths = ['plain', 'with space', 'with#hash', 'with%percent', 'with-雪'];
const scenarios = [
  ['claims-check.ts', 'Claims registry failed to load/validate:', []],
  ['check-strategy-manifest-drift.ts', 'Strategy-manifest registry not found:', []],
  ['check-authority-tier-drift.ts', '[evidence-ledger-invalid]', []],
  ['check-model-string-drift.ts', 'Model-string drift: scanned 0 files', []],
  ['generate-strategy-reference.ts', 'Strategy reference drift (1):', ['--check']],
] as const;
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

const pipeSetup =
  "import net from 'node:net'; import {join} from 'node:path'; const endpoint=join(process.env.TMPDIR, 'tsx-'+process.geteuid(), process.ppid+'.pipe'); ";
const canonicalClient = realpathSync(
  fileURLToPath(new URL('../node_modules/tsx/dist/client-XItNFmsq.cjs', import.meta.url))
);

describe('startup seal regression', () => {
  it('records a caught canonical-filename VM counterfeit as an ordinary subject attempt', () => {
    fixture = new ScriptEntryFixture('claims-check.ts', 'plain');
    const source =
      pipeSetup +
      `import vm from 'node:vm';
globalThis.__entryNet=net;
const expression='globalThis.__entryNet.createConnection('+JSON.stringify(endpoint)+',()=>{});';
const code=' '.repeat(430-expression.indexOf('createConnection'))+expression;
try {new vm.Script(code,{filename:${JSON.stringify(canonicalClient)}}).runInThisContext();} catch {}
console.log('VM_COUNTERFEIT_CAUGHT');`;
    const result = fixture.probe(source);
    envelope(result);
    expect(result.process.error).toBeUndefined();
    expect(result.process.status).toBe(0);
    expect(result.process.stdout).toBe('VM_COUNTERFEIT_CAUGHT\n');
    expect(result.blocked).toEqual(['net.createConnection']);
    expect(result.loaderIpcBlocked).toHaveLength(2);
  });

  it('rejects a second seal without reopening subject classification', () => {
    fixture = new ScriptEntryFixture('claims-check.ts', 'plain');
    const boundary = pathToFileURL(join(fixture.directory, 'boundary.mjs')).href;
    const result = fixture.probe(
      pipeSetup +
        `const b=await import(${JSON.stringify(boundary)}); let message; try {b.sealLoaderClassification();} catch(e) {message=e.message;} try {net.createConnection(endpoint,()=>{});} catch {} console.log(message);`
    );
    envelope(result);
    expect(result.process.status).toBe(0);
    expect(result.process.stdout).toBe('SEAL_ALREADY_CLOSED\n');
    expect(result.blocked).toEqual(['net.createConnection']);
    expect(
      result.timeline.filter((event) => event.name === 'bootstrap:repeat-seal-rejected')
    ).toHaveLength(1);
  });

  it('preserves native probe argv, lexical URL and relative ESM resolution', () => {
    fixture = new ScriptEntryFixture('claims-check.ts', 'plain');
    writeFileSync(
      join(fixture.directory, 'relative-sentinel.mjs'),
      "export const value='RELATIVE_OK';\n"
    );
    const filename = 'probe with#%雪.mjs';
    const result = fixture.probe(
      "import {value} from './relative-sentinel.mjs'; console.log(JSON.stringify({argv:process.argv.slice(1), url:import.meta.url, value}));",
      filename,
      ['--sentinel']
    );
    envelope(result);
    expect(result.process.status).toBe(0);
    expect(result.blocked).toEqual([]);
    expect(JSON.parse(String(result.process.stdout))).toEqual({
      argv: [join(fixture.directory, filename), '--sentinel'],
      url: pathToFileURL(join(fixture.directory, filename)).href,
      value: 'RELATIVE_OK',
    });
    const relativeUrl = pathToFileURL(join(fixture.directory, 'relative-sentinel.mjs')).href;
    expect(result.timeline.filter((event) => event.url === relativeUrl).length).toBeGreaterThan(0);
  });
});

describe('fixture amendment controls', () => {
  it('separately records nonempty genuine loader IPC denials without compiler-start attribution', () => {
    fixture = new ScriptEntryFixture('generate-strategy-reference.ts', 'plain');
    const result = fixture.run('import');
    envelope(result);
    expect(result.process.status).toBe(0);
    expect(result.process.stdout).toBe('TEST_IMPORT_COMPLETE\n');
    expect(Reflect.get(result, 'loaderIpcBlocked')).toHaveLength(2);
    expect(result.blocked).toEqual([]);
    // A cached transform may start no compiler; blocked IPC is never a compiler start.
    expect(result.loaderStarts).not.toContain('loader:tsx-ipc-BLOCKED');
  });

  it.each([
    ['net.createConnection(endpoint);', 'net.createConnection'],
    ['net.createConnection(endpoint, () => {});', 'net.createConnection'],
    ["net.createConnection(1, '127.0.0.1');", 'net.createConnection'],
    ["net.createConnection({port:1, host:'127.0.0.1'});", 'net.createConnection'],
    ["net.createConnection('/entry-boundary-outside.pipe');", 'net.createConnection'],
    ["net.createConnection(join(process.env.TMPDIR, 'wrong.pipe'));", 'net.createConnection'],
    ['new net.Socket().connect(endpoint);', 'net.Socket.connect'],
    [
      "Error.prepareStackTrace=()=> 'client-XItNFmsq.cjs:1:431'; net.createConnection(endpoint,()=>{});",
      'net.createConnection',
    ],
  ])('keeps subject attempts forbidden: %s', (source, name) => {
    fixture = new ScriptEntryFixture('claims-check.ts', 'plain');
    const result = fixture.probe(pipeSetup + source);
    envelope(result);
    expect(result.process.status).toBe(1);
    // A deliberately replaced formatter controls stderr, not persistent attempt evidence.
    if (!source.startsWith('Error.prepareStackTrace')) {
      expect(result.process.stderr).toContain(`ENTRY_BOUNDARY_BLOCKED:${name}`);
    }
    expect(result.blocked).toEqual([name]);
  });

  it('rejects the same pipe from a lookalike loader filename', () => {
    fixture = new ScriptEntryFixture('claims-check.ts', 'plain');
    const result = fixture.probe(
      "const net=require('node:net'); const path=require('node:path'); net.createConnection(path.join(process.env.TMPDIR,'tsx-'+process.geteuid(),process.ppid+'.pipe'),()=>{});",
      'client-XItNFmsq.cjs'
    );
    envelope(result);
    expect(result.process.status).toBe(1);
    expect(result.blocked).toEqual(['net.createConnection']);
  });

  it('persists a caught same-pipe attempt despite subject exit zero', () => {
    fixture = new ScriptEntryFixture('claims-check.ts', 'plain');
    const result = fixture.probe(
      pipeSetup + "try {net.createConnection(endpoint,()=>{});} catch {} console.log('caught');"
    );
    envelope(result);
    expect(result.process.status).toBe(0);
    expect(result.process.stdout).toBe('caught\n');
    expect(result.blocked).toEqual(['net.createConnection']);
  });

  it.each(['spawnSync', 'execFileSync', 'fork'])('denies ordinary subprocess %s', (method) => {
    fixture = new ScriptEntryFixture('claims-check.ts', 'plain');
    const result = fixture.probe(
      `import cp from 'node:child_process'; cp.${method}(process.execPath, ['--version']);`
    );
    envelope(result);
    expect(result.process.status).toBe(1);
    expect(result.blocked).toEqual([`child_process.${method}`]);
  });

  it('denies a wrong executable and a near-match compiler argument vector', () => {
    fixture = new ScriptEntryFixture('claims-check.ts', 'plain');
    for (const [command, args] of [
      [process.execPath, ['--version']],
      [fixture.compiler.binary, ['--service=' + fixture.compiler.version, '--wrong']],
    ] as const) {
      const result = fixture.probe(
        `import cp from 'node:child_process'; cp.spawn(${JSON.stringify(command)},${JSON.stringify(args)});`
      );
      envelope(result);
      expect(result.process.status).toBe(1);
      expect(result.blocked).toEqual(['child_process.spawn']);
    }
  });
});

describe('boundary qualification', () => {
  it.each(scenarios)('qualifies plain direct/import setup for %s', (script, diagnostic, args) => {
    fixture = new ScriptEntryFixture(script, 'plain');
    const direct = fixture.run('direct', [...args]);
    valid(direct, 'direct');
    expect(direct.process.status).toBe(1);
    expect(direct.process.stderr).toContain(diagnostic);
    expect(direct.process.stdout).toBe('');
    const imported = fixture.run('import', [...args]);
    valid(imported, 'import');
    expect(imported.process.status).toBe(0);
    expect(imported.process.stderr).toBe('');
    expect(imported.process.stdout).toBe('TEST_IMPORT_COMPLETE\n');
  });
  it.each([
    [
      "import { spawnSync } from 'node:child_process'; spawnSync(process.execPath, ['--version']);",
      'child_process.spawnSync',
    ],
    [
      "import { execFileSync } from 'node:child_process'; execFileSync(process.execPath, ['--version']);",
      'child_process.execFileSync',
    ],
    ["await fetch('https://example.invalid');", 'fetch'],
    ["import { connect } from 'node:net'; connect(1, '127.0.0.1');", 'net.connect'],
    ["import { get } from 'node:https'; get('https://example.invalid');", 'https.get'],
    [
      "import { writeFileSync } from 'node:fs'; writeFileSync('/entry-boundary-outside-probe', 'blocked');",
      'fs.writeFileSync',
    ],
  ])('records forbidden pre-import operation %s', (source, name) => {
    fixture = new ScriptEntryFixture('claims-check.ts', 'plain');
    const result = fixture.probe(source);
    envelope(result);
    expect(result.process.error).toBeUndefined();
    expect(result.process.status).toBe(1);
    expect(result.process.stderr).toContain(`ENTRY_BOUNDARY_BLOCKED:${name}`);
    expect(result.blocked).toEqual([name]);
  });

  it('retains evidence when a module catches a blocked attempt', () => {
    fixture = new ScriptEntryFixture('claims-check.ts', 'plain');
    const result = fixture.probe(
      "try { await fetch('https://example.invalid'); } catch {} console.log('caught');"
    );
    envelope(result);
    expect(result.process.status).toBe(0);
    expect(result.process.stdout).toBe('caught\n');
    expect(result.blocked).toEqual(['fetch']);
  });

  it('qualifies generator --check at an empty owned root before production edits', () => {
    fixture = new ScriptEntryFixture('generate-strategy-reference.ts', 'plain');
    const result = fixture.run('direct', ['--check']);
    valid(result, 'direct');
    expect(result.process.status).toBe(1);
    expect(result.process.stderr).toContain('Strategy reference drift (1):');
    expect(result.process.stderr).toContain('missing:');
    expect(result.process.stdout).toBe('');
    expect(readdirSync(fixture.policyRoot)).toEqual([]);
    expect(existsSync(join(fixture.policyRoot, 'docs/reference/strategies'))).toBe(false);
  });
});

describe.each(scenarios)('actual readiness entry %s', (script, diagnostic, args) => {
  it.each(paths)('reaches the real diagnostic under %s', (component) => {
    fixture = new ScriptEntryFixture(script, component);
    const result = fixture.run('direct', [...args]);
    valid(result, 'direct');
    expect(result.process.status).toBe(1);
    expect(result.process.stderr).toContain(diagnostic);
    expect(result.process.stdout).toBe('');
  });

  it.each(paths)('imports without executing under %s', (component) => {
    fixture = new ScriptEntryFixture(script, component);
    const result = fixture.run('import', [...args]);
    valid(result, 'import');
    expect(result.process.status).toBe(0);
    expect(result.process.stderr).toBe('');
    expect(result.process.stdout).toBe('TEST_IMPORT_COMPLETE\n');
  });
});
