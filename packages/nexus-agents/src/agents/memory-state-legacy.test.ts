/**
 * Legacy persisted records must survive the removal of `successRate` (#5261).
 *
 * The field was deleted because both production writers hardcoded `1.0` and
 * nothing could ever lower it — a published, persisted field that never carried
 * information. But records already on disk carry it, and a cleanup that cannot
 * read existing state is a data-loading failure wearing the shape of a tidy-up.
 *
 * `loadMemoryState` reconstructs structurally (`as Partial<AgentMemoryState>`,
 * then per-field defaults) with no schema validation, so an extra property
 * rides along harmlessly today. This test pins that: a later move to a Zod
 * `.strict()` schema would otherwise start rejecting every pre-existing record
 * with no failing test to catch it.
 *
 * Required by the ratifying panel as a binding condition.
 */

import { describe, it, expect, vi } from 'vitest';

import { loadMemoryState } from './memory-operations.js';
import type { IContextMemoryBackend } from '../context/memory-backend-types.js';
import type { ILogger } from '../core/index.js';

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
  setLevel: vi.fn(),
} as unknown as ILogger;

/** A backend returning one pre-#5261 record, `successRate` and all. */
function legacyBackend(): IContextMemoryBackend {
  return {
    retrieve: () =>
      Promise.resolve({
        ok: true,
        value: {
          agentId: 'a1',
          role: 'coder',
          persistedAt: new Date(0),
          taskLearnings: [],
          errorResolutions: [],
          executionPatterns: [
            {
              id: 'pattern_legacy',
              pattern: 'bugfix',
              occurrences: 4,
              lastSeen: new Date(0),
              // The removed field, exactly as older records carry it.
              successRate: 1,
            },
          ],
        },
      }),
    store: () => Promise.resolve({ ok: true, value: undefined }),
    search: () => Promise.resolve({ ok: true, value: [] }),
    prune: () => Promise.resolve({ ok: true, value: 0 }),
  } as unknown as IContextMemoryBackend;
}

describe('legacy records survive the successRate removal (#5261)', () => {
  it('loads a record carrying the removed field without dropping the pattern', async () => {
    const result = await loadMemoryState(legacyBackend(), 'a1', 'coder' as never, logger);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.executionPatterns).toHaveLength(1);
    expect(result.value.executionPatterns[0]?.pattern).toBe('bugfix');
    expect(result.value.executionPatterns[0]?.occurrences).toBe(4);
  });

  it('preserves the fields that remain, so this is not passing on an empty state', async () => {
    // The control. Without it, a loader that returned a fresh empty state on
    // any unrecognised shape would satisfy the assertion above.
    const result = await loadMemoryState(legacyBackend(), 'a1', 'coder' as never, logger);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.agentId).toBe('a1');
    expect(result.value.executionPatterns[0]?.id).toBe('pattern_legacy');
  });
});
