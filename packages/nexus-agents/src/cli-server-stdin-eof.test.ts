/**
 * Real-process reproduction for #6560: a stdio MCP host stops the server by
 * closing its stdin. Before the fix that path called `process.exit(0)` without
 * flushing the audit logger, so a short session left a 0-byte audit file — no
 * startup records and no `system.shutdown.begin`.
 *
 * Spawns `tsx src/cli.ts --mode=server` (the same shape as
 * `cli-direct-run.test.ts`) in a temp dir whose `nexus-agents.yaml` enables
 * audit logging, writes one `initialize` line, closes stdin and reads the log.
 *
 * @module cli-server-stdin-eof.test
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const cliSource = resolve(here, 'cli.ts');
const tsxCli = createRequire(import.meta.url).resolve('tsx/cli');

/** Generous: cold tsx transpilation of the server dominates, not the shutdown. */
const EXIT_WAIT_MS = 90_000;

const INITIALIZE_LINE = `${JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'stdin-eof-test', version: '1.0.0' },
  },
})}\n`;

/** The child's env: no test-runner markers, so the server runs as in production. */
function productionLikeEnv(dataDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('VITEST') || key === 'NODE_ENV') continue;
    env[key] = value;
  }
  env['NEXUS_DATA_DIR'] = dataDir;
  env['NEXUS_LOG_LEVEL'] = 'warn';
  return env;
}

function readAuditActions(dir: string): string[] {
  const actions: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
    for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
      if (line.trim() === '') continue;
      const record = JSON.parse(line) as { action?: unknown };
      if (typeof record.action === 'string') actions.push(record.action);
    }
  }
  return actions;
}

describe('server mode: host closes stdin (#6560 reproduction)', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'nexus-6560-e2e-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('flushes startup and shutdown.begin audit records before exiting', async () => {
    const auditDir = join(workDir, 'audit');
    writeFileSync(
      join(workDir, 'nexus-agents.yaml'),
      `security:\n  audit:\n    enabled: true\n    logDir: ${auditDir}\n`
    );

    const child = spawn(process.execPath, [tsxCli, cliSource, '--mode=server'], {
      cwd: workDir,
      env: productionLikeEnv(join(workDir, 'data')),
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const exited = new Promise<number | null>((resolveExit, rejectExit) => {
      const guard = setTimeout(() => {
        child.kill('SIGKILL');
        rejectExit(new Error(`server did not exit after stdin closed:\n${stderr.slice(-2000)}`));
      }, EXIT_WAIT_MS);
      child.on('exit', (code) => {
        clearTimeout(guard);
        resolveExit(code);
      });
    });

    child.stdin.end(INITIALIZE_LINE);
    const code = await exited;

    expect(code, stderr.slice(-2000)).toBe(0);
    expect(stderr).toContain('Parent process closed stdin, shutting down');
    expect(readAuditActions(auditDir)).toEqual([
      'system.startup.begin',
      'system.startup',
      'system.shutdown.begin',
    ]);
  }, 120_000);
});
