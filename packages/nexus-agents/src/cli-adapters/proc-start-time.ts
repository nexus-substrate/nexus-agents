/**
 * A process's start time from `/proc/<pid>/stat` (Linux), used to tell a
 * process from a later one that reused its PID (#6714). Together, a PID and
 * its start time name one process for as long as the kernel is up.
 *
 * @module cli-adapters/proc-start-time
 */

import { readFileSync } from 'node:fs';

/** `/proc/<pid>/stat` field 22 is starttime; the split fields begin at field 3. */
const START_TIME_INDEX = 22 - 3;

/**
 * Field 22 (starttime) of a `/proc/<pid>/stat` line, or undefined when it
 * does not parse. Field 2 (comm) is parenthesised and may itself contain
 * spaces and `)`, so the fields are split after the LAST `)`. A zombie
 * (state `Z`) has already died and only awaits its reaper, so it reads as
 * gone too: signalling it does nothing, and waiting on it would keep an
 * escalation armed where PID 1 never reaps orphans.
 */
export function parseProcStatStartTime(stat: string): string | undefined {
  const close = stat.lastIndexOf(')');
  if (close === -1) return undefined;
  const fields = stat
    .slice(close + 1)
    .trim()
    .split(/\s+/);
  if (fields[0] === 'Z') return undefined;
  const startTime = fields[START_TIME_INDEX];
  return startTime !== undefined && /^\d+$/.test(startTime) ? startTime : undefined;
}

/** The start time of `pid`, or undefined when its stat cannot be read (it is gone). */
export function readProcStartTime(pid: number): string | undefined {
  try {
    return parseProcStatStartTime(readFileSync(`/proc/${String(pid)}/stat`, 'utf8'));
  } catch {
    // ENOENT/ESRCH: the process is gone.
    return undefined;
  }
}
