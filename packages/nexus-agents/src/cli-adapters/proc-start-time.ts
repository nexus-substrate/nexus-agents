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

/** Lossless identity evidence; unreadable is never a proof of absence. */
export type ProcIdentityObservation =
  | { readonly state: 'present'; readonly startTime: string; readonly processState: string }
  | { readonly state: 'absent' }
  | { readonly state: 'unknown'; readonly reason: 'malformed-stat' | 'unreadable-stat' };

function procStatFields(stat: string): string[] | undefined {
  const close = stat.lastIndexOf(')');
  return close === -1
    ? undefined
    : stat
        .slice(close + 1)
        .trim()
        .split(/\s+/);
}

/** Unlike the kill compatibility helper, retain zombie identity separately. */
export function parseProcIdentityObservation(stat: string): ProcIdentityObservation {
  if (!/^\d+ \(/.test(stat)) return { state: 'unknown', reason: 'malformed-stat' };
  const fields = procStatFields(stat);
  const startTime = fields?.[START_TIME_INDEX];
  const processState = fields?.[0];
  if (
    startTime === undefined ||
    !/^\d+$/.test(startTime) ||
    processState === undefined ||
    !/^[RSDZTtXxKWPI]$/.test(processState)
  ) {
    return { state: 'unknown', reason: 'malformed-stat' };
  }
  return { state: 'present', startTime, processState };
}

/** Only explicit kernel absence ends an identity; permissions/errors stay unknown. */
export function readProcIdentity(pid: number): ProcIdentityObservation {
  try {
    return parseProcIdentityObservation(readFileSync(`/proc/${String(pid)}/stat`, 'utf8'));
  } catch (error: unknown) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    return code === 'ENOENT' || code === 'ESRCH'
      ? { state: 'absent' }
      : { state: 'unknown', reason: 'unreadable-stat' };
  }
}

/**
 * Field 22 (starttime) of a `/proc/<pid>/stat` line, or undefined when it
 * does not parse. Field 2 (comm) is parenthesised and may itself contain
 * spaces and `)`, so the fields are split after the LAST `)`. A zombie
 * (state `Z`) has already died and only awaits its reaper, so it reads as
 * gone too: signalling it does nothing, and waiting on it would keep an
 * escalation armed where PID 1 never reaps orphans.
 */
export function parseProcStatStartTime(stat: string): string | undefined {
  const fields = procStatFields(stat);
  if (fields === undefined) return undefined;
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
