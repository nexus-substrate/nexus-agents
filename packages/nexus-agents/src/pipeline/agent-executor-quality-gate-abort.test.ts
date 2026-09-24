/**
 * The quality-gate stage stops its subprocesses on abort (#6747).
 *
 * Real processes: a fixture project whose `test` script is a `sleep 30` plus a
 * grandchild that ignores SIGTERM, run through `npm run` by the real stage.
 * Before #6747 the stage took no signal, so a deadline or a `cancel_job`
 * failed the stage while `npm`, the shell and both sleeps ran on.
 *
 * @module pipeline/agent-executor-quality-gate-abort.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { recordOutcomeMock } = vi.hoisted(() => ({ recordOutcomeMock: vi.fn() }));
vi.mock('./agent-executor-core.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./agent-executor-core.js')>()),
  recordOutcome: recordOutcomeMock,
}));

import { createAgentStages } from './agent-executor.js';
import {
  DevPipelineCancelledError,
  DevPipelineStageTimeoutError,
  guardDevPipelineStages,
} from './dev-pipeline-deadlines.js';
import { SIGKILL_GRACE_MS } from '../cli-adapters/process-tree-kill.js';

/** Only ESRCH proves a process is gone; a zombie (dead, unreaped) counts as gone. */
function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch (error: unknown) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
  try {
    const stat = readFileSync(`/proc/${String(pid)}/stat`, 'utf8');
    return !stat
      .slice(stat.lastIndexOf(')') + 1)
      .trim()
      .startsWith('Z');
  } catch {
    return false;
  }
}

async function waitFor(check: () => boolean, what: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Slack on top of the grace period for process teardown on a loaded CI box. */
const TEARDOWN_SLACK_MS = 3_000;

describe.skipIf(process.platform !== 'linux')(
  'quality-gate stage stops its process tree on abort (#6747)',
  () => {
    let project: string;
    let pidFile: string;

    beforeEach(() => {
      recordOutcomeMock.mockClear();
      project = mkdtempSync(join(tmpdir(), 'nexus-qg-abort-'));
      pidFile = join(project, 'pids');
      // No lockfile → npm. Only `test` is declared, so typecheck and lint skip
      // and the gate reaches the test script at once. The second sleep runs in
      // a shell that ignores SIGTERM (the disposition survives `exec`), so only
      // the SIGKILL escalation ends it.
      const script =
        `sleep 30 & echo $! >> ${pidFile}; ` +
        `sh -c 'trap "" TERM; echo $$ >> ${pidFile}; exec sleep 30'`;
      writeFileSync(
        join(project, 'package.json'),
        JSON.stringify({ name: 'qg-abort-fixture', version: '1.0.0', scripts: { test: script } })
      );
    });

    afterEach(() => {
      for (const pid of readPids()) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Already gone.
        }
      }
      rmSync(project, { recursive: true, force: true });
    });

    function readPids(): number[] {
      if (!existsSync(pidFile)) return [];
      return readFileSync(pidFile, 'utf8')
        .split(/\s+/)
        .filter((t) => t !== '')
        .map(Number);
    }

    /** Wait until both sleeps have started, and return their PIDs. */
    async function sleeperPids(): Promise<number[]> {
      await waitFor(() => readPids().length === 2, 'both sleeps to start', 20_000);
      const pids = readPids();
      expect(pids.every(isAlive)).toBe(true);
      return pids;
    }

    async function expectAllGone(pids: readonly number[]): Promise<void> {
      await waitFor(
        () => pids.every((pid) => !isAlive(pid)),
        `sleeps ${pids.join(', ')} to die`,
        SIGKILL_GRACE_MS + TEARDOWN_SLACK_MS
      );
    }

    it('a deadline abort ends the tree and the stage reports a timeout', async () => {
      const stages = createAgentStages({ scanTarget: project });
      const controller = new AbortController();
      const settled = stages.qualityGate?.(controller.signal).catch((e: unknown) => e);
      const pids = await sleeperPids();

      controller.abort(
        new DOMException('Dev pipeline qualityGate stage timed out', 'TimeoutError')
      );
      const abortedAt = Date.now();
      const error = await settled;
      // Settles on the abort, not when the 30 s script would have ended.
      expect(Date.now() - abortedAt).toBeLessThan(SIGKILL_GRACE_MS);
      expect((error as Error).name).toBe('TimeoutError');
      await expectAllGone(pids);
      // An aborted gate is not a measured failure of the project.
      expect(recordOutcomeMock).not.toHaveBeenCalled();
    }, 40_000);

    it('a cancel ends the tree and the stage reports a cancel', async () => {
      const stages = createAgentStages({ scanTarget: project });
      const controller = new AbortController();
      const settled = stages.qualityGate?.(controller.signal).catch((e: unknown) => e);
      const pids = await sleeperPids();

      controller.abort('cancel_job');
      const abortedAt = Date.now();
      const error = await settled;
      expect(Date.now() - abortedAt).toBeLessThan(SIGKILL_GRACE_MS);
      expect(error).toBeInstanceOf(DevPipelineCancelledError);
      await expectAllGone(pids);
      expect(recordOutcomeMock).not.toHaveBeenCalled();
    }, 40_000);

    it('the pipeline stage deadline reaches the subprocesses', async () => {
      const guarded = guardDevPipelineStages(createAgentStages({ scanTarget: project }), {
        stageTimeoutMs: 4_000,
      });
      const settled = guarded.qualityGate?.().catch((e: unknown) => e);
      const pids = await sleeperPids();

      expect(await settled).toBeInstanceOf(DevPipelineStageTimeoutError);
      await expectAllGone(pids);
    }, 40_000);
  }
);
