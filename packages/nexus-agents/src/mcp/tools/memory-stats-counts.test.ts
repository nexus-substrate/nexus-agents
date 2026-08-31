/**
 * `memory_stats` must report real session task and error counts (#5269).
 *
 * `memory-stats.ts` initialised `{ learningsCount: 0, tasksCount: 0,
 * errorsCount: 0 }` and only ever assigned `learningsCount`. The other two were
 * returned as `0` on every call, forever — and the sibling field in the same
 * response asserts `session: true, // Always available`, so a caller read
 * "session memory is healthy, and it holds 0 tasks and 0 errors."
 *
 * That positive backend assertion CORROBORATED the fabricated zeros rather than
 * qualifying them — the same shape as #5252, where "Total Decisions: 412" sat
 * beside a rate computed over zero.
 *
 * The counts were never absent: the session episode has held `tasksCompleted`
 * and `errorsResolved` all along (visible in `tool-memory.ts`'s own
 * `endSession` log), they were simply not exposed mid-session.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SessionMemory } from '../../context/session-memory.js';

describe('session counts are readable mid-session (#5269)', () => {
  let memory: SessionMemory;

  beforeEach(() => {
    memory = new SessionMemory({ memoryDir: mkdtempSync(join(tmpdir(), 'nx-sess-')) });
    memory.startSession('s1');
  });

  it('reports zero counts before anything is recorded', () => {
    // The honest zero: a live session that genuinely holds nothing. This is
    // what the old code returned unconditionally, and it is only correct here.
    expect(memory.getCurrentSessionTasks()).toHaveLength(0);
    expect(memory.getCurrentSessionErrors()).toHaveLength(0);
  });

  it('reports the real task count after tasks are recorded', () => {
    // The discriminator. Without this, the hardcoded 0 passes the test above.
    memory.recordTask({ approach: 'a', challenges: [], durationMs: 1 });
    memory.recordTask({ approach: 'b', challenges: [], durationMs: 2 });
    expect(memory.getCurrentSessionTasks()).toHaveLength(2);
  });

  it('reports the real error count after errors are recorded', () => {
    memory.recordError({ error: 'boom', solution: 'fixed' });
    expect(memory.getCurrentSessionErrors()).toHaveLength(1);
  });

  it('returns empty rather than throwing when no session is active', () => {
    // Name the empty case: no session is not the same as a session with zero
    // items, but both are legitimately empty lists here — what matters is that
    // it does not throw and does not invent a count.
    const fresh = new SessionMemory({ memoryDir: mkdtempSync(join(tmpdir(), 'nx-sess2-')) });
    expect(fresh.getCurrentSessionTasks()).toHaveLength(0);
    expect(fresh.getCurrentSessionErrors()).toHaveLength(0);
  });
});
