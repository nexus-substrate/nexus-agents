/**
 * Real-process reproduction for #6573 item 3: when the host dies, the server's
 * stderr pipe loses its reader. The shutdown path logs to stderr ("Parent
 * process closed stdin, shutting down"), the write fails with EPIPE, and the
 * stream's `'error'` event — with no listener — became an `uncaughtException`.
 * That handler exits with SERVER_START_FAILED (3) before the audit flush
 * resumes, so `system.shutdown.begin` was never written.
 *
 * Same spawn shape as `cli-server-stdin-eof.test.ts`, except the parent closes
 * the stderr read end BEFORE closing stdin, as a dead parent does.
 *
 * @module cli-server-stderr-epipe.test
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
    clientInfo: { name: 'stderr-epipe-test', version: '1.0.0' },
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
  // `warn` so the shutdown path's own warning is what hits the dead pipe.
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

describe('server mode: host dies, closing stderr before stdin (#6573 item 3)', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), 'nexus-6573-epipe-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('writes system.shutdown.begin and exits 0 despite EPIPE on stderr', async () => {
    const auditDir = join(workDir, 'audit');
    writeFileSync(
      join(workDir, 'nexus-agents.yaml'),
      `security:\n  audit:\n    enabled: true\n    logDir: ${auditDir}\n`
    );

    const child = spawn(process.execPath, [tsxCli, cliSource, '--mode=server'], {
      cwd: workDir,
      env: productionLikeEnv(join(workDir, 'data')),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderrBeforeClose = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBeforeClose += chunk.toString();
    });

    const exited = new Promise<number | null>((resolveExit, rejectExit) => {
      const guard = setTimeout(() => {
        child.kill('SIGKILL');
        rejectExit(new Error(`server did not exit:\n${stderrBeforeClose.slice(-2000)}`));
      }, EXIT_WAIT_MS);
      child.on('exit', (code) => {
        clearTimeout(guard);
        resolveExit(code);
      });
    });

    // Ready = the initialize response arrived, so the server is fully up.
    const initialized = new Promise<void>((resolveInit) => {
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
        if (stdout.includes('"id":1')) resolveInit();
      });
    });
    child.stdin.write(INITIALIZE_LINE);
    await initialized;

    // The dead parent: the stderr reader goes first, then stdin reaches EOF.
    child.stderr.destroy();
    child.stdin.end();
    const code = await exited;

    // Exit 3 (SERVER_START_FAILED) is the uncaughtException handler firing on EPIPE.
    expect(code, stderrBeforeClose.slice(-2000)).toBe(0);
    expect(readAuditActions(auditDir)).toContain('system.shutdown.begin');
  }, 120_000);
});
