import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  chmodSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function runMcpPhase(
  mode:
    | 'valid'
    | 'truncated'
    | 'absent'
    | 'requires-open-stdin'
    | 'silent'
    | 'empty-initialize'
    | 'result-and-error'
    | 'initialize-null-error'
    | 'tools-null-error'
    | 'paginated-tools'
    | 'duplicate-tools'
): SpawnSyncReturns<string> {
  const root = mkdtempSync(join(tmpdir(), 'nexus-mcp-smoke-'));
  roots.push(root);
  const fakeCli = join(root, 'nexus-agents');
  writeFileSync(
    fakeCli,
    `#!/usr/bin/env node
const mode = process.env.MCP_FIXTURE_MODE;
let input = '';
let ended = false;
process.stdin.setEncoding('utf8');
process.stdin.on('end', () => { ended = true; });
process.stdin.on('data', (chunk) => {
  input += chunk;
  if (input.split('\\n').length < 4) return;
  process.stdin.removeAllListeners('data');
  if (mode === 'absent') { process.exit(0); }
  if (mode === 'silent') { setInterval(() => {}, 1000); return; }
  setTimeout(() => {
    if (mode === 'requires-open-stdin' && ended) { process.exit(0); }
    const tools = [{ name: 'orchestrate' }, ...Array.from({ length: 30 }, (_, i) => ({ name: 'tool_' + String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + i % 26) }))];
    const init = mode === 'empty-initialize' ? {} : { protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 'fake', version: '1' } };
    const initResponse = { jsonrpc: '2.0', id: 1, result: init };
    if (mode === 'initialize-null-error') initResponse.error = null;
    process.stdout.write(JSON.stringify(initResponse) + '\\n');
    if (mode === 'truncated') {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools } }).slice(0, -4));
      process.exit(0);
    }
    if (mode === 'duplicate-tools') tools.push({ name: 'orchestrate' });
    const response = { jsonrpc: '2.0', id: 2, result: { tools } };
    if (mode === 'result-and-error') response.error = { code: -32603, message: 'server failed' };
    if (mode === 'tools-null-error') response.error = null;
    if (mode === 'paginated-tools') response.result.nextCursor = 'another-page';
    process.stdout.write(JSON.stringify(response) + '\\n');
    setTimeout(() => process.exit(0), 100);
  }, 20);
});
`
  );
  chmodSync(fakeCli, 0o755);
  const script = readFileSync(join(import.meta.dirname, 'verify-npm-install.sh'), 'utf8');
  const start = script.indexOf('step "Phase 6: MCP stdio server starts + responds to tools/list"');
  const end = script.indexOf('step "Phase 7: SQLite is actually usable', start);
  if (start < 0 || end < 0) throw new Error('MCP smoke phase markers not found');
  const phase = script.slice(start, end);
  return spawnSync(
    'bash',
    [
      '-c',
      `set -euo pipefail\nstep() { :; }\nok() { printf '%s\\n' "$*"; }\nfail() { printf '%s\\n' "$1" >&2; exit "$2"; }\n${phase}`,
    ],
    {
      env: { ...process.env, PATH: `${root}:${process.env.PATH ?? ''}`, MCP_FIXTURE_MODE: mode },
      encoding: 'utf8',
      timeout: 12_000,
    }
  );
}

describe('npm install MCP smoke phase', () => {
  it('rejects a truncated tools/list body even when 25 tool names are present', () => {
    const result = runMcpPhase('truncated');
    expect(result.status).toBe(6);
    expect(result.stderr).toMatch(/invalid|incomplete|malformed/i);
  });

  it('accepts a complete JSON-RPC tools/list response', () => {
    const result = runMcpPhase('valid');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('31 distinct tools');
  });

  it('rejects a server that exits without a tools/list response', () => {
    const result = runMcpPhase('absent');
    expect(result.status).toBe(6);
  });

  it('keeps stdin open until the tools/list response is received', () => {
    const result = runMcpPhase('requires-open-stdin');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('31 distinct tools');
  });

  it('bounds a silent server and reports a timeout', () => {
    const result = runMcpPhase('silent');
    expect(result.status).toBe(6);
    expect(result.stderr).toContain('MCP tools/list timed out');
  }, 15_000);

  it('rejects an initialize response without the required fields', () => {
    const result = runMcpPhase('empty-initialize');
    expect(result.status).toBe(6);
    expect(result.stderr).toContain('MCP initialize failed');
  });

  it('rejects a tools/list response containing both result and error', () => {
    const result = runMcpPhase('result-and-error');
    expect(result.status).toBe(6);
    expect(result.stderr).toContain('MCP tools/list failed');
  });

  it('rejects initialize result plus an explicit null error field', () => {
    const result = runMcpPhase('initialize-null-error');
    expect(result.status).toBe(6);
    expect(result.stderr).toContain('MCP initialize failed');
  });

  it('rejects tools/list result plus an explicit null error field', () => {
    const result = runMcpPhase('tools-null-error');
    expect(result.status).toBe(6);
    expect(result.stderr).toContain('MCP tools/list failed');
  });

  it('rejects a partial tools/list page rather than reporting its count as complete', () => {
    const result = runMcpPhase('paginated-tools');
    expect(result.status).toBe(6);
    expect(result.stderr).toMatch(/partial|paginated/i);
  });

  it('rejects duplicate tool names', () => {
    const result = runMcpPhase('duplicate-tools');
    expect(result.status).toBe(6);
    expect(result.stderr).toContain('duplicate names');
  });
});

// These recorders prove the permanent shell phase wiring/failure behavior only.
// Actual TypeScript and the canonical packed artifact are separate evidence.
interface TypePhaseResult {
  result: SpawnSyncReturns<string>;
  records: Array<{
    command: string;
    args: string[];
    cwd: string;
    source?: string;
    manifest?: { private?: boolean; type?: string };
  }>;
  remainingConsumers: string[];
}
function runTypePhase(mode = 'valid', installMode = 'ignore-scripts'): TypePhaseResult {
  const root = mkdtempSync(join(tmpdir(), 'nexus-type-smoke-'));
  roots.push(root);
  const parent = join(
    root,
    installMode === 'pnpm' ? '.pnpm/package/node_modules' : 'lib/node_modules'
  );
  const packageRoot = join(parent, 'nexus-agents');
  const bin = join(root, 'bin');
  mkdirSync(packageRoot, { recursive: true });
  mkdirSync(bin);
  const records = join(root, 'calls.jsonl');
  writeFileSync(records, '');
  const recorder = `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const command = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const entry = { command, args, cwd: process.cwd() };
if (command === 'npm') {
  entry.manifest = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  if (process.env.TYPE_FIXTURE_MODE !== 'tooling-failure') {
    fs.mkdirSync('node_modules/typescript/bin', { recursive: true });
    fs.mkdirSync('node_modules/@types/node', { recursive: true });
    fs.mkdirSync('node_modules/undici', { recursive: true });
    fs.writeFileSync('node_modules/typescript/bin/tsc', 'FAKE compiler boundary');
    for (const [name, version] of [['typescript','6.0.3'], ['@types/node','24.19.2'], ['undici','6.29.1']]) {
      fs.writeFileSync('node_modules/' + name + '/package.json', JSON.stringify({ name, version }));
    }
  }
}
const fixture = args[args.length - 1];
if (command === 'node' && fixture?.endsWith('.ts')) entry.source = fs.readFileSync(fixture, 'utf8');
fs.appendFileSync(process.env.TYPE_RECORDS, JSON.stringify(entry) + '\\n');
if (command === 'npm' && process.env.TYPE_FIXTURE_MODE === 'tooling-failure') { console.error('FAKE pinned tooling install failure'); process.exit(1); }
if (command === 'node' && args.includes('--input-type=module') && process.env.TYPE_FIXTURE_MODE === 'identity-failure') {
  console.error('FAKE installed package identity mismatch'); process.exit(1);
}
if (command === 'node' && args.includes('--version')) console.log('Version 6.0.3');
if (command === 'node' && fixture?.endsWith('.ts') && process.env.TYPE_FIXTURE_MODE === 'compiler-failure') {
  console.error('FAKE compiler diagnostic (unit wiring only)'); process.exit(1);
}
`;
  for (const command of ['node', 'npm']) {
    writeFileSync(join(bin, command), recorder, { mode: 0o755 });
  }
  const script = readFileSync(join(import.meta.dirname, 'verify-npm-install.sh'), 'utf8');
  const start = script.indexOf(
    'step "Public TypeScript declarations: installed package consumer (#7576)"'
  );
  const end = script.indexOf('step "Phase 4: --help lists core commands"', start);
  if (start < 0 || end < 0) throw new Error('Permanent installed TypeScript phase is missing');
  const result = spawnSync(
    '/bin/bash',
    [
      '-c',
      `set -euo pipefail\nstep() { :; }\nok() { printf '%s\\n' "$*"; }\nfail() { printf '%s\\n' "$1" >&2; exit "$2"; }\n${script.slice(start, end)}`,
    ],
    {
      env: {
        PATH: `${bin}:/usr/bin:/bin`,
        PACKAGE_ROOT: packageRoot,
        ACTUAL_VERSION: '12.8.0',
        INSTALL_MODE: installMode,
        TYPE_FIXTURE_MODE: mode,
        TYPE_RECORDS: records,
      },
      encoding: 'utf8',
      timeout: 10000,
    }
  );
  return {
    result,
    records: readFileSync(records, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TypePhaseResult['records'][number]),
    remainingConsumers: readdirSync(parent).filter((name) => name.startsWith('.nexus-types.')),
  };
}

describe('permanent installed package TypeScript phase (unit wiring only)', () => {
  it('keeps the patched Undici install and installed-version gate aligned', () => {
    const script = readFileSync(join(import.meta.dirname, 'verify-npm-install.sh'), 'utf8');
    const start = script.indexOf(
      'step "Public TypeScript declarations: installed package consumer (#7576)"'
    );
    const end = script.indexOf('step "Phase 4: --help lists core commands"', start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const phase = script.slice(start, end);
    expect(phase).toContain('typescript@6.0.3 @types/node@24.19.2 undici@6.29.1');
    expect(phase).toContain("['undici', '6.29.1']");
    expect(phase).not.toContain('6.29.0');
  });

  it.each(['ignore-scripts', 'default', 'npm12', 'npm12-strict', 'update', 'pnpm'])(
    'uses the installed package and pinned private tooling under %s',
    (installMode) => {
      const { result, records, remainingConsumers } = runTypePhase('valid', installMode);
      expect(result.status, result.stderr).toBe(0);
      const installs = records.filter((record) => record.command === 'npm');
      expect(installs).toHaveLength(1);
      const install = installs[0];
      if (install === undefined) throw new Error('Pinned tooling install was not invoked');
      expect(install.args).toEqual([
        'install',
        '--prefix',
        install.cwd,
        '--ignore-scripts',
        '--save-dev',
        '--save-exact',
        'typescript@6.0.3',
        '@types/node@24.19.2',
        'undici@6.29.1',
      ]);
      expect(install.manifest).toMatchObject({ private: true, type: 'module' });
      expect(install.cwd).toMatch(/node_modules\/\.nexus-types\./);
      const compiles = records.filter(
        (record) => record.command === 'node' && record.source !== undefined
      );
      expect(compiles).toHaveLength(2);
      for (const compile of compiles) {
        expect(compile.args).toContain('--strict');
        expect(compile.args).toContain('--ignoreConfig');
        expect(compile.args).toContain('--noEmit');
        expect(compile.args).toContain('NodeNext');
        expect(compile.args).toContain('ES2022');
        expect(compile.args).toContain('--types');
        expect(compile.args).toContain('--typeRoots');
        expect(compile.args).not.toContain('--lib');
        expect(compile.args).not.toContain('--skipLibCheck');
        expect(compile.args).not.toContain('--paths');
      }
      const bare = compiles[0];
      const controls = compiles[1];
      if (bare === undefined || controls === undefined)
        throw new Error('Both consumers must reach the compiler');
      expect(bare.source).toContain("import { EventBus } from 'nexus-agents'");
      expect(controls.source).toContain("from 'undici'");
      expect(controls.source).toContain('new ProxyAgent(');
      expect(controls.source?.match(/@ts-expect-error/g)).toHaveLength(3);
      expect(controls.source).toContain('FAKE_INVALID_DISPATCHER');
      expect(controls.source).toContain('notADispatcher');
      expect(controls.source).toContain('headers:');
      expect(remainingConsumers).toEqual([]);
    }
  );

  it('fails closed on unavailable pinned tooling and cleans its owned consumer', () => {
    const { result, records, remainingConsumers } = runTypePhase('tooling-failure');
    expect(result.status).toBe(11);
    expect(result.stderr).toContain('FAKE pinned tooling install failure');
    expect(records.filter((record) => record.command === 'npm')).toHaveLength(1);
    expect(records.some((record) => record.source !== undefined)).toBe(false);
    expect(remainingConsumers).toEqual([]);
  });

  it('fails closed when the bare specifier resolves to a different installed package', () => {
    const { result, records, remainingConsumers } = runTypePhase('identity-failure');
    expect(result.status).toBe(11);
    expect(result.stderr).toContain('FAKE installed package identity mismatch');
    expect(
      records.filter(
        (record) => record.command === 'node' && record.args.includes('--input-type=module')
      )
    ).toHaveLength(1);
    expect(records.some((record) => record.command === 'npm')).toBe(false);
    expect(remainingConsumers).toEqual([]);
  });

  it('propagates actual compiler failure before dispatcher controls and cleans its consumer', () => {
    const { result, records, remainingConsumers } = runTypePhase('compiler-failure');
    expect(result.status).toBe(11);
    expect(result.stderr).toContain('FAKE compiler diagnostic');
    expect(records.filter((record) => record.source !== undefined)).toHaveLength(1);
    expect(remainingConsumers).toEqual([]);
  });
});
