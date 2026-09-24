/**
 * Real-process tests: a CLI and the grandchild it spawns must die with the
 * MCP server, however the server is stopped (#6680, #6701).
 *
 * A child process stands in for the server, in its own process group as the
 * MCP server is under a harness. It spawns a fake CLI through the REAL
 * `SubprocessCliAdapter`, and that CLI relaunches itself as a grandchild the
 * way gemini-cli does. The CLI stays in the server's group, so a signal to the
 * group reaches it directly; a signal to the server's PID alone reaches it
 * only through the server's shutdown path or its exit hook.
 *
 * @module cli-adapters/process-tree-kill.test
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

type ServerMode = 'shutdown' | 'exit' | 'none';

/**
 * The stand-in server. `shutdown` wires SIGTERM to the real graceful-shutdown
 * path with an exit seam that does NOT exit, so only the shutdown's own signal
 * can end the CLI. `exit` wires SIGTERM to `process.exit`, so only the exit
 * hook can. `none` installs no handler, so only a signal the CLI receives
 * itself can.
 */
function serverScript(pidFile: string, grandchildPidFile: string): string {
  const imp = (rel: string): string => JSON.stringify(join(SRC, rel));
  const grandchild = 'setInterval(() => {}, 1000);';
  const cliScript =
    `const g = require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'inherit' });` +
    `require('fs').writeFileSync(${JSON.stringify(grandchildPidFile)}, String(g.pid));` +
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

const mode = process.argv[2];
if (mode === 'shutdown') {
  const shutdown = createGracefulShutdown({
    cleanup: () => Promise.resolve(),
    logger: createLogger({ component: 'fixture-server' }),
    exit: () => undefined,
  });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
} else if (mode === 'exit') {
  process.on('SIGTERM', () => process.exit(0));
}
setInterval(() => {}, 1000);
void new FakeCli().execute({ content: 'x' }, { timeoutMs: 60_000, allowRetry: false });
`;
}

describe.skipIf(process.platform === 'win32')('CLI process trees at server stop (#6680)', () => {
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

  /** Start the server and wait for its CLI and the CLI's grandchild; returns both PIDs. */
  async function startServerWithCli(
    mode: ServerMode
  ): Promise<{ cli: number; grandchild: number }> {
    const pidFile = join(tmpDir, 'cli.pid');
    const grandchildPidFile = join(tmpDir, 'grandchild.pid');
    const script = join(tmpDir, 'server.mts');
    writeFileSync(script, serverScript(pidFile, grandchildPidFile));
    // Its own group, standing in for the MCP server's group under the harness.
    server = spawn(process.execPath, ['--import', 'tsx', script, mode], {
      cwd: join(SRC, '..'),
      detached: true,
      stdio: 'ignore',
    });
    // The CLI writes its PID after the grandchild's, so both exist once it does.
    await waitFor(
      () => existsSync(pidFile) && readFileSync(pidFile, 'utf8') !== '',
      'the CLI to start',
      30_000
    );
    const cli = Number(readFileSync(pidFile, 'utf8'));
    const grandchild = Number(readFileSync(grandchildPidFile, 'utf8'));
    pids.push(cli, grandchild);
    expect(isAlive(cli)).toBe(true);
    expect(isAlive(grandchild)).toBe(true);
    return { cli, grandchild };
  }

  function serverPid(): number {
    const pid = server?.pid;
    if (pid === undefined) throw new Error('server not started');
    return pid;
  }

  async function expectBothDead(tree: { cli: number; grandchild: number }): Promise<void> {
    await waitFor(() => !isAlive(tree.cli), `CLI pid ${String(tree.cli)} to exit`, 5_000);
    await waitFor(
      () => !isAlive(tree.grandchild),
      `grandchild pid ${String(tree.grandchild)} to exit`,
      5_000
    );
  }

  it('a SIGTERM to the server alone ends both through the graceful-shutdown path', async () => {
    const tree = await startServerWithCli('shutdown');
    process.kill(serverPid(), 'SIGTERM');
    await expectBothDead(tree);
    // The exit seam never exits: the shutdown path alone ended the tree.
    expect(isAlive(serverPid())).toBe(true);
  }, 45_000);

  it('a SIGTERM to the server alone ends both through the exit hook', async () => {
    const tree = await startServerWithCli('exit');
    process.kill(serverPid(), 'SIGTERM');
    await expectBothDead(tree);
  }, 45_000);

  it("a SIGTERM to the server's group ends both", async () => {
    const tree = await startServerWithCli('none');
    process.kill(-serverPid(), 'SIGTERM');
    await expectBothDead(tree);
  }, 45_000);

  it("a SIGKILL to the server's group ends both — no handler can run (#6701)", async () => {
    const tree = await startServerWithCli('none');
    process.kill(-serverPid(), 'SIGKILL');
    await expectBothDead(tree);
  }, 45_000);
});
