import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
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
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: init }) + '\\n');
    if (mode === 'truncated') {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools } }).slice(0, -4));
      process.exit(0);
    }
    if (mode === 'duplicate-tools') tools.push({ name: 'orchestrate' });
    const response = { jsonrpc: '2.0', id: 2, result: { tools } };
    if (mode === 'result-and-error') response.error = { code: -32603, message: 'server failed' };
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

  it('rejects duplicate tool names', () => {
    const result = runMcpPhase('duplicate-tools');
    expect(result.status).toBe(6);
    expect(result.stderr).toContain('duplicate names');
  });
});
