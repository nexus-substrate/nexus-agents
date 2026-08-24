/**
 * Trust-tier recording on the shared executor path (#4694).
 *
 * RECORD-ONLY by design. The consensus vote (7-0, option D, 6/7 selections)
 * established that enforcement cannot land yet: the tier was unreachable at
 * every candidate guard site, so a fail-closed guard would have blocked every
 * `pipeline` and `research` run rather than only untrusted ones.
 *
 * The property these tests protect is that the record is HONEST — an
 * unmeasured tier must be recorded as unmeasured, never as a trusted default.
 * Four voters made that an explicit condition of approving the record-first
 * approach.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./expert-bridge.js', () => ({
  executeExpert: vi.fn(() =>
    Promise.resolve({ success: true, text: 'ok', expertType: 'code', durationMs: 1, tokensUsed: 1 })
  ),
}));

const { emitMock } = vi.hoisted(() => ({ emitMock: vi.fn() }));
vi.mock('./pipeline-observability.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pipeline-observability.js')>();
  return { ...actual, emitPipelineStageEvent: emitMock };
});

import { createAgentStages, UNMEASURED_TRUST_TIER } from './agent-executor.js';

beforeEach(() => {
  emitMock.mockClear();
});

/** Trust tiers recorded on every `started` event emitted so far. */
function recordedTiers(): unknown[] {
  return emitMock.mock.calls
    .filter((c) => c[2] === 'started')
    .map((c) => (c[3] as Record<string, unknown> | undefined)?.['trustTier']);
}

describe('trust tier is recorded at stage entry (#4694)', () => {
  it('records the tier the caller supplied', async () => {
    const stages = createAgentStages({ trustTier: '3' });
    await stages.implement({ id: 't1', title: 'x', description: 'y' } as never);
    expect(recordedTiers()).toContain('3');
  });

  it('records an ABSENT tier as unmeasured, never as a trusted default', async () => {
    // The named empty case. Omitting the field, or defaulting it to '1', would
    // make an unmeasured run indistinguishable from a trusted one in the
    // record — and the record is the artifact a later human spot-check trusts.
    const stages = createAgentStages({});
    await stages.implement({ id: 't2', title: 'x', description: 'y' } as never);

    const tiers = recordedTiers();
    expect(tiers).toContain(UNMEASURED_TRUST_TIER);
    expect(tiers).not.toContain('1');
    expect(tiers).not.toContain(undefined);
  });

  it('the unmeasured sentinel is not a valid trust tier', () => {
    // Guards against someone "tidying" this into '1'..'4'. If the sentinel ever
    // becomes a real tier value, absence starts reading as a measurement.
    expect(['1', '2', '3', '4']).not.toContain(UNMEASURED_TRUST_TIER);
  });

  it('stamps EVERY stage entry, including the consensus path', async () => {
    // runExpert and executeVoting are parallel model paths — a guard on
    // runExpert alone would have missed the whole consensus voter fan-out.
    // Stage entry is the point both pass through, which is why the tier is
    // recorded here rather than at the expert call.
    const stages = createAgentStages({ trustTier: '2' });
    await stages.qaReview({ id: 't3', title: 'x', description: 'y' } as never, 'impl');

    const started = emitMock.mock.calls.filter((c) => c[2] === 'started');
    expect(started.length).toBeGreaterThan(0);
    for (const call of started) {
      const details = call[3] as Record<string, unknown> | undefined;
      expect(details?.['trustTier'], `stage '${String(call[1])}' recorded no tier`).toBe('2');
    }
  });
});
