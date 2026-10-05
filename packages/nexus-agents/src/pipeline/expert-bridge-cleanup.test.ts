/** Regression coverage for expert-owned MCP config lifetimes (#4631). */
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileTree } from '../cli-adapters/exec-file-tree.js';
import { mkdtempOutsideRepo } from '../testing/non-repo-temp-dir.js';

const { executeTask } = vi.hoisted(() => ({ executeTask: vi.fn() }));
vi.mock('../cli-adapters/factory.js', () => ({
  createAllAdapters: () => new Map([['claude', {}]]),
}));
vi.mock('../cli-adapters/composite-router.js', () => ({
  createCompositeRouter: () => ({ executeTask }),
}));
vi.mock('../cli-adapters/cli-circuit-breaker.js', () => ({
  createCliCircuitBreakerIntegration: () => ({
    getHealthStatus: () => ({ systemHealthy: true, healthyCount: 1, clis: [] }),
  }),
}));
import { executeExpert, shutdownExpertBridge } from './expert-bridge.js';

let fixture: string;
let repo: string;
let scratch: string;
const READ_CONFIG =
  "require('node:fs').readFileSync(process.argv[1], 'utf8'); process.stdout.write('done');";
const EXIT_ERRORS = {
  'spawn throw': 'spawn threw',
  timeout: 'timed out',
  abort: 'aborted',
  'child error': 'ENOENT',
  'pre-abort': 'aborted before it started',
};
interface Task {
  options: { mcpConfigPath: string };
}

beforeEach(() => {
  fixture = mkdtempOutsideRepo('expert-mcp-cleanup-');
  repo = join(fixture, 'repo');
  scratch = join(fixture, 'tmp');
  mkdirSync(join(repo, '.git'), { recursive: true });
  mkdirSync(scratch);
  vi.stubEnv('NEXUS_TMPDIR', scratch);
  executeTask.mockReset();
});
afterEach(async () => {
  await shutdownExpertBridge();
  vi.unstubAllEnvs();
  rmSync(fixture, { recursive: true, force: true });
});

describe('expert MCP config cleanup (#4631)', () => {
  it.each(['success', 'spawn throw', 'timeout', 'abort', 'child error', 'pre-abort'] as const)(
    'leaves no directory after %s',
    async (exit) => {
      const controller = new AbortController();
      if (exit === 'pre-abort') controller.abort();
      executeTask.mockImplementation(async (task: Task) => {
        expect(existsSync(task.options.mcpConfigPath)).toBe(true);
        const abortTimer =
          exit === 'abort'
            ? setTimeout(() => {
                controller.abort();
              }, 50)
            : undefined;
        try {
          const output = await execFileTree(
            exit === 'child error' ? join(fixture, 'missing-command') : process.execPath,
            [
              '-e',
              exit === 'timeout' || exit === 'abort' ? 'setInterval(() => {}, 1000)' : READ_CONFIG,
              task.options.mcpConfigPath,
            ],
            {
              cwd: repo,
              timeoutMs: exit === 'timeout' ? 50 : 5000,
              graceMs: 0,
              signal: controller.signal,
              ...(exit === 'spawn throw'
                ? {
                    wrapper: () => {
                      throw new Error('spawn threw');
                    },
                  }
                : {}),
            }
          );
          return { ok: true, value: { text: output.stdout } };
        } finally {
          clearTimeout(abortTimer);
        }
      });
      const result = await executeExpert('code', 'read config', {
        workDir: repo,
        signal: controller.signal,
      });
      expect(result.success).toBe(exit === 'success');
      if (exit !== 'success') expect(result.error).toContain(EXIT_ERRORS[exit]);
      expect(executeTask).toHaveBeenCalledTimes(1);
      expect(readdirSync(scratch)).toEqual([]);
    }
  );

  it('keeps concurrent calls isolated until each routed lifetime ends', async () => {
    const paths: string[] = [];
    let finishFirst: (() => void) | undefined;
    let finishSecond: (() => void) | undefined;
    executeTask.mockImplementation(async (task: Task) => {
      paths.push(task.options.mcpConfigPath);
      await new Promise<void>((resolve) => {
        if (paths.length === 1) finishFirst = resolve;
        else finishSecond = resolve;
      });
      expect(existsSync(task.options.mcpConfigPath)).toBe(true);
      return { ok: true, value: { text: 'done' } };
    });
    const first = executeExpert('code', 'first');
    await vi.waitFor(() => {
      expect(finishFirst).toBeDefined();
    });
    const second = executeExpert('code', 'second');
    await vi.waitFor(() => {
      expect(finishSecond).toBeDefined();
    });
    finishFirst?.();
    await first;
    expect(existsSync(paths[0] ?? '')).toBe(false);
    expect(existsSync(paths[1] ?? '')).toBe(true);
    finishSecond?.();
    await second;
    expect(readdirSync(scratch)).toEqual([]);
  });
});
