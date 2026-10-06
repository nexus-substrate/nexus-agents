/**
 * The generated child MCP config marks its server as a child (#6795), so the
 * child records its model-driven stdio caller as unmeasured, not tier 1.
 */

import * as fs from 'node:fs/promises';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileTree } from './exec-file-tree.js';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateMcpConfig } from './child-mcp-config.js';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, writeFile: vi.fn(actual.writeFile) };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, writeFileSync: vi.fn(actual.writeFileSync) };
});

const MCP_CHILD_ENV = 'NEXUS_MCP_CHILD';

interface ConfigShape {
  mcpServers: Record<string, { env?: Record<string, string> }>;
}

async function readEnv(
  options?: Parameters<typeof generateMcpConfig>[0]
): Promise<Record<string, string> | undefined> {
  const generated = await generateMcpConfig({ cliPath: '/x/cli.js', ...options });
  try {
    const parsed = JSON.parse(await fs.readFile(generated.configPath, 'utf-8')) as ConfigShape;
    return parsed.mcpServers['nexus-agents']?.env;
  } finally {
    await generated.cleanup();
  }
}

describe('child MCP config marker (#6795)', () => {
  it('sets the child marker with no caller env', async () => {
    expect(await readEnv()).toEqual({ [MCP_CHILD_ENV]: '1' });
  });

  it('keeps caller env and does not let it unset the marker', async () => {
    const env = await readEnv({ env: { FOO: 'bar', [MCP_CHILD_ENV]: '0' } });
    expect(env).toEqual({ FOO: 'bar', [MCP_CHILD_ENV]: '1' });
  });
});

let fixture: string;
let scratch: string;
beforeEach(() => {
  fixture = mkdtempOutsideRepo('child-mcp-cleanup-');
  mkdirSync(join(fixture, 'repo', '.git'), { recursive: true });
  scratch = join(fixture, 'tmp');
  mkdirSync(scratch);
  vi.stubEnv('NEXUS_TMPDIR', scratch);
});
afterEach(() => {
  vi.mocked(fs.writeFile).mockReset();
  vi.mocked(writeFileSync).mockReset();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(fixture, { recursive: true, force: true });
});

describe('child MCP config cleanup (#4631)', () => {
  it('removes its directory when writing the config fails', async () => {
    vi.mocked(fs.writeFile).mockRejectedValueOnce(new Error('config write failed'));
    vi.mocked(writeFileSync).mockImplementationOnce(() => {
      throw new Error('config write failed');
    });
    await expect(generateMcpConfig({ cliPath: '/x/cli.js' })).rejects.toThrow(
      'config write failed'
    );
    expect(readdirSync(scratch)).toEqual([]);
  });

  it('removes active configs on ordinary process.exit', async () => {
    const script = join(fixture, 'repo', 'exit.mts');
    const moduleUrl = new URL('./child-mcp-config.ts', import.meta.url).href;
    await fs.writeFile(
      script,
      `
      import { generateMcpConfig } from ${JSON.stringify(moduleUrl)};
      import { existsSync } from 'node:fs';
      const configs = await Promise.all([
        generateMcpConfig({ cliPath: '/x/cli.js' }),
        generateMcpConfig({ cliPath: '/x/cli.js' }),
      ]);
      if (configs.length !== 2 || !configs.every(config => existsSync(config.configPath))) process.exit(1);
      process.exit(0);
    `
    );
    const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
    await execFileTree(process.execPath, ['--import', tsx, script], {
      cwd: join(fixture, 'repo'),
      timeoutMs: 10_000,
    });
    expect(readdirSync(scratch)).toEqual([]);
  });

  it('removes a directory when process.exit interrupts config creation', async () => {
    const script = join(fixture, 'repo', 'exit-during-create.mts');
    const moduleUrl = new URL('./child-mcp-config.ts', import.meta.url).href;
    await fs.writeFile(
      script,
      `
      import { generateMcpConfig } from ${JSON.stringify(moduleUrl)};
      import fs from 'node:fs';
      import promises from 'node:fs/promises';
      import { syncBuiltinESMExports } from 'node:module';
      const readdirSync = fs.readdirSync;
      const rmSync = fs.rmSync;
      let pendingWrite;
      promises.writeFile = (...args) => {
        // Hold the asynchronous open until exit cleanup snapshots the directory.
        return new Promise(() => {
          pendingWrite = () => fs.writeFileSync(...args);
        });
      };
      fs.rmSync = (dir, options) => {
        if (pendingWrite !== undefined) {
          // Replay the native rmSync race with real filesystem operations:
          // empty listing -> worker open(O_CREAT) -> rmdir throws ENOTEMPTY.
          if (readdirSync(dir).length !== 0) throw new Error('expected an empty directory');
          pendingWrite();
          pendingWrite = undefined;
          fs.rmdirSync(dir);
          return;
        }
        rmSync(dir, options);
      };
      syncBuiltinESMExports();
      void generateMcpConfig({ cliPath: '/x/cli.js' });
      const dirs = readdirSync(process.env.NEXUS_TMPDIR);
      if (dirs.length !== 1 || !dirs[0].startsWith('nexus-mcp-')) process.exit(2);
      process.exit(0);
    `
    );
    const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
    await execFileTree(process.execPath, ['--import', tsx, script], {
      cwd: join(fixture, 'repo'),
      timeoutMs: 10_000,
    });
    expect(readdirSync(scratch)).toEqual([]);
  });

  it('shares one exit listener across configs and releases it after cleanup', async () => {
    const listeners = process.listenerCount('exit');
    const configs = await Promise.all(
      Array.from({ length: 12 }, () => generateMcpConfig({ cliPath: '/x/cli.js' }))
    );
    try {
      expect(process.listenerCount('exit')).toBe(listeners + 1);
    } finally {
      await Promise.all(configs.map((config) => config.cleanup()));
    }
    expect(process.listenerCount('exit')).toBe(listeners);
    expect(readdirSync(scratch)).toEqual([]);
  });
});
