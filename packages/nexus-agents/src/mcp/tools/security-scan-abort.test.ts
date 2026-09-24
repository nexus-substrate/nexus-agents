/**
 * `executeSecurityScan` stops the scanner's process tree on abort (#6747).
 *
 * Real processes: a stand-in `semgrep` on PATH answers `--version`, then runs
 * a `sleep 30` plus a grandchild that ignores SIGTERM. Before #6747 the scan
 * took no signal, so the scanner ran to its 5-minute guard behind a stage the
 * pipeline had already failed.
 *
 * @module mcp/tools/security-scan-abort.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { executeSecurityScan } from './security-scan.js';
import { SIGKILL_GRACE_MS } from '../../cli-adapters/process-tree-kill.js';

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

describe.skipIf(process.platform !== 'linux')(
  'executeSecurityScan stops the scanner tree on abort (#6747)',
  () => {
    let binDir: string;
    let pidFile: string;
    let savedPath: string | undefined;

    beforeEach(() => {
      binDir = mkdtempSync(join(tmpdir(), 'nexus-scan-abort-'));
      pidFile = join(binDir, 'pids');
      const semgrep = join(binDir, 'semgrep');
      writeFileSync(
        semgrep,
        [
          '#!/bin/sh',
          'if [ "$1" = "--version" ]; then echo 1.0.0; exit 0; fi',
          `sh -c 'trap "" TERM; echo $$ >> ${pidFile}; exec sleep 30' &`,
          `echo $$ >> ${pidFile}`,
          'exec sleep 30',
          '',
        ].join('\n')
      );
      chmodSync(semgrep, 0o755);
      savedPath = process.env['PATH'];
      process.env['PATH'] = `${binDir}${delimiter}${savedPath ?? ''}`;
    });

    afterEach(() => {
      process.env['PATH'] = savedPath;
      for (const pid of readPids()) {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Already gone.
        }
      }
      rmSync(binDir, { recursive: true, force: true });
    });

    function readPids(): number[] {
      if (!existsSync(pidFile)) return [];
      return readFileSync(pidFile, 'utf8')
        .split(/\s+/)
        .filter((t) => t !== '')
        .map(Number);
    }

    it('an abort ends the scanner and its grandchild, and the scan reports it did not run', async () => {
      const controller = new AbortController();
      const scan = executeSecurityScan(
        { target: '.', scanner: 'auto', rulesets: ['p/default'], maxFindings: 10 },
        controller.signal
      );
      await waitFor(() => readPids().length === 2, 'the scanner tree to start', 15_000);
      const pids = readPids();
      expect(pids.every(isAlive)).toBe(true);

      controller.abort('cancel_job');
      const result = await scan;
      expect('error' in result && result.error).toMatch(/aborted/);
      await waitFor(
        () => pids.every((pid) => !isAlive(pid)),
        'the scanner tree to die',
        SIGKILL_GRACE_MS + 3_000
      );
    }, 30_000);

    it('never starts the scanner once the signal has fired', async () => {
      const controller = new AbortController();
      controller.abort('cancel_job');
      const result = await executeSecurityScan(
        { target: '.', scanner: 'auto', rulesets: ['p/default'], maxFindings: 10 },
        controller.signal
      );
      // An abort, not a missing scanner.
      expect('error' in result && result.error).toMatch(/aborted/);
      await new Promise((r) => setTimeout(r, 300));
      expect(readPids()).toEqual([]);
    });
  }
);
