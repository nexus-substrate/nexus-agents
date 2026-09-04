/**
 * The collaboration event bus is internal, and the root `EventBus` is the
 * pipeline bus (#5224).
 *
 * The rename of the collaboration pair to `CollaborationEventBus` /
 * `ICollaborationEventBus` was accepted as a NON-breaking change on exactly
 * this basis: neither the old collaboration name nor the new one is importable
 * from the package root, so no consumer's import changes. That claim was
 * verified by hand at vote time; this pins it, so it is a test rather than an
 * incident of the current barrel layout.
 *
 * @module exports/collaboration-bus-not-public.test
 */
import { describe, expect, it } from 'vitest';

import * as root from '../index.js';

describe('collaboration event bus is not on the public surface (#5224)', () => {
  it('does not export the collaboration bus under its new names', () => {
    const surface = root as Record<string, unknown>;
    expect(surface['CollaborationEventBus']).toBeUndefined();
    expect(surface['ICollaborationEventBus']).toBeUndefined();
  });

  it('the root EventBus is the pipeline bus — it has the bounded query() the collaboration bus lacks', () => {
    // Structural fingerprint, not a name check: the pipeline bus exposes
    // `query(filter, limit)` over its CircularBuffer; the collaboration bus
    // exposes `getHistory` / `emitAsync` instead. If a future barrel change
    // swapped which class sits behind the root name, this is what would move.
    const bus = new root.EventBus();
    expect(typeof (bus as { query?: unknown }).query).toBe('function');
    expect(typeof (bus as { emitAsync?: unknown }).emitAsync).toBe('undefined');
  });
});
