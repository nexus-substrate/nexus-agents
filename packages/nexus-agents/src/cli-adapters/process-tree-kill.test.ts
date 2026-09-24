/**
 * Real-process tests: a CLI spawned in its own process group must still die
 * when the MCP server shuts down (#6680).
 *
 * A child process stands in for the server. It spawns a fake CLI through the
 * REAL `SubprocessCliAdapter`, and the test then SIGTERMs the server's whole
 * process group — what a Ctrl-C or a harness closing the session does. The CLI
 * is not in that group any more, so only the server's own handlers can end it.
 *
 * @module cli-adapters/process-tree-kill.test
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPAWN_IN_OWN_PROCESS_GROUP } from './process-tree-kill.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..');

/** Only ESRCH proves a process is gone; EPERM means it exists but is not ours. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

async function waitFor(predicate: () => boolean, what: string, limitMs: number): Promise<void> {
  const deadline = Date.now() + limitMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

/**
 * The stand-in server. `shutdown` wires SIGTERM to the real graceful-shutdown
 * path with an exit seam that does NOT exit, so only the shutdown's own signal
 * can end the CLI. `exit` wires SIGTERM to `process.exit`, so only the exit
 * hook can.
 */
function serverScript(pidFile: string): string {
  const imp = (rel: string): string => JSON.stringify(join(SRC, rel));
  const cliScript =
    `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));` +
    'setInterval(() => {}, 1000);';
  return `
import { SubprocessCliAdapter } from ${imp('cli-adapters/subprocess-adapter.ts')};
import { ClaudeResponseParser } from ${imp('cli-adapters/parsers/claude-parser.ts')};
import { createGracefulShutdown } from ${imp('cli-server-lifecycle.ts')};
import { createLogger } from ${imp('core/index.ts')};

class FakeCli extends SubprocessCliAdapter {
  name = 'claude';
  version = '1.0.0';
  transientRetry = { enabled: false };
  parser = new ClaudeResponseParser();
  getCommand() {
    return { command: process.execPath, args: ['-e', ${JSON.stringify(cliScript)}] };
  }
  initialize() {
    this.initialized = true;
    return Promise.resolve();
  }
  getModelInfo() {
    return { id: 'm', name: 'm', contextWindow: 1, maxOutput: 1, costPerMillionInput: 0, costPerMillionOutput: 0 };
  }
}

if (process.argv[2] === 'shutdown') {
  const shutdown = createGracefulShutdown({
    cleanup: () => Promise.resolve(),
    logger: createLogger({ component: 'fixture-server' }),
    exit: () => undefined,
  });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
} else {
  process.on('SIGTERM', () => process.exit(0));
}
setInterval(() => {}, 1000);
void new FakeCli().execute({ content: 'x' }, { timeoutMs: 60_000, allowRetry: false });
`;
}

describe.skipIf(!SPAWN_IN_OWN_PROCESS_GROUP)(
  'CLI process groups at server shutdown (#6680)',
  () => {
    let tmpDir: string;
    let server: ChildProcess | undefined;
    const pids: number[] = [];

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'nexus-tree-kill-'));
    });

    afterEach(() => {
      for (const pid of [...pids.splice(0), server?.pid]) {
        if (pid === undefined) continue;
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Already gone.
        }
      }
      server = undefined;
      rmSync(tmpDir, { recursive: true, force: true });
    });

    async function startServerWithCli(mode: 'shutdown' | 'exit'): Promise<number> {
      const pidFile = join(tmpDir, 'cli.pid');
      const script = join(tmpDir, 'server.mts');
      writeFileSync(script, serverScript(pidFile));
      // Its own group, standing in for the MCP server's group under the harness.
      server = spawn(process.execPath, ['--import', 'tsx', script, mode], {
        cwd: join(SRC, '..'),
        detached: true,
        stdio: 'ignore',
      });
      await waitFor(
        () => existsSync(pidFile) && readFileSync(pidFile, 'utf8') !== '',
        'the CLI to start',
        30_000
      );
      const cliPid = Number(readFileSync(pidFile, 'utf8'));
      pids.push(cliPid);
      expect(isAlive(cliPid)).toBe(true);
      return cliPid;
    }

    function sigtermServerGroup(): void {
      const pid = server?.pid;
      if (pid === undefined) throw new Error('server not started');
      process.kill(-pid, 'SIGTERM');
    }

    it('the graceful-shutdown path ends the CLI even while the server stays up', async () => {
      const cliPid = await startServerWithCli('shutdown');
      sigtermServerGroup();
      await waitFor(() => !isAlive(cliPid), `CLI pid ${String(cliPid)} to exit`, 5_000);
      // The exit seam never exits: the shutdown path alone ended the CLI.
      expect(isAlive(server?.pid ?? -1)).toBe(true);
    }, 45_000);

    it('the exit hook ends the CLI when the server exits without the shutdown path', async () => {
      const cliPid = await startServerWithCli('exit');
      sigtermServerGroup();
      await waitFor(() => !isAlive(cliPid), `CLI pid ${String(cliPid)} to exit`, 5_000);
    }, 45_000);
  }
);
