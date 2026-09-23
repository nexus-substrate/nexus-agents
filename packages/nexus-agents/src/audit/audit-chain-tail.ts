/**
 * Read the head of an on-disk audit hash chain (#6546).
 *
 * A process that appends to an existing log must link its first event to the
 * last event already persisted — which another process may have written. This
 * finds that event the way `verify_audit_chain` would see it: files in
 * lexicographic order, lines that do not parse as an `AuditEvent` skipped.
 * Chaining to a line the verifier skips would itself be a break.
 *
 * @module audit/audit-chain-tail
 */

import { open } from 'node:fs/promises';
import * as path from 'node:path';

import { AuditEventSchema } from './audit-types.js';

/** First read window from the end of a file; doubled until a line fits. */
const TAIL_CHUNK_BYTES = 64 * 1024;

/**
 * The last `AuditEvent` in `filePath`, parsed from the end backwards. Returns
 * `null` when the file holds no valid event (empty, or only malformed lines).
 */
async function lastEventIn(filePath: string): Promise<{ hash: string | undefined } | null> {
  const handle = await open(filePath, 'r');
  try {
    const { size } = await handle.stat();
    for (let window = TAIL_CHUNK_BYTES; ; window *= 2) {
      const start = Math.max(0, size - window);
      const buffer = Buffer.alloc(size - start);
      await handle.read(buffer, 0, buffer.length, start);
      const lines = buffer.toString('utf-8').split('\n');
      // Unless the window reaches the start of the file, its first line may
      // be cut mid-way; it is re-read whole by the next, larger window.
      const whole = start === 0 ? lines : lines.slice(1);
      for (let i = whole.length - 1; i >= 0; i--) {
        const event = parseEvent(whole[i] ?? '');
        if (event !== null) return event;
      }
      if (start === 0) return null;
    }
  } finally {
    await handle.close();
  }
}

function parseEvent(line: string): { hash: string | undefined } | null {
  if (line.trim().length === 0) return null;
  try {
    const parsed = AuditEventSchema.safeParse(JSON.parse(line));
    return parsed.success ? { hash: parsed.data.hash } : null;
  } catch {
    return null;
  }
}

/**
 * Hash of the last persisted event across `fileNamesNewestFirst` in `logDir`,
 * walking back past files with no valid event (a file another process rotated
 * to but has not written yet).
 *
 * `undefined` — the empty case — when no file holds an event, or when the last
 * event is un-hashed (a log written with the chain disabled): the next event
 * is then a genesis event, exactly as in a fresh directory.
 */
export async function readChainTailHash(
  logDir: string,
  fileNamesNewestFirst: readonly string[]
): Promise<string | undefined> {
  for (const name of fileNamesNewestFirst) {
    const last = await lastEventIn(path.join(logDir, name));
    if (last !== null) return last.hash;
  }
  return undefined;
}
