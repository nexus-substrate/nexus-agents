/**
 * `consensus/decision/quorum` (#6180) — the engine's quorum predicate and its
 * default bar, imported DIRECTLY from the governed module.
 *
 * The identity assertions mirror `thresholds.test.ts`: the engine config's
 * default and the schema default must be the SAME value as the governed
 * constant, not a copy, or a future edit to the governed module would leave
 * `DEFAULT_CONSENSUS_CONFIG` serving a stale bar.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_MIN_VOTERS_FOR_QUORUM, isQuorumReached } from './quorum.js';
import { ConsensusEngineConfigSchema, DEFAULT_CONSENSUS_CONFIG } from '../types-core.js';

describe('consensus/decision/quorum (#6180)', () => {
  it('pins the default quorum bar', () => {
    expect(DEFAULT_MIN_VOTERS_FOR_QUORUM).toBe(2);
  });

  it('reaches quorum at the bar and above, not below', () => {
    expect(isQuorumReached(DEFAULT_MIN_VOTERS_FOR_QUORUM - 1, DEFAULT_MIN_VOTERS_FOR_QUORUM)).toBe(
      false
    );
    expect(isQuorumReached(DEFAULT_MIN_VOTERS_FOR_QUORUM, DEFAULT_MIN_VOTERS_FOR_QUORUM)).toBe(
      true
    );
    expect(isQuorumReached(DEFAULT_MIN_VOTERS_FOR_QUORUM + 1, DEFAULT_MIN_VOTERS_FOR_QUORUM)).toBe(
      true
    );
  });

  it('the empty case: zero votes never reach a positive bar', () => {
    expect(isQuorumReached(0, DEFAULT_MIN_VOTERS_FOR_QUORUM)).toBe(false);
    expect(isQuorumReached(0, 1)).toBe(false);
  });

  it('the engine config default and the schema default are the governed bar', () => {
    expect(DEFAULT_CONSENSUS_CONFIG.minVotersForQuorum).toBe(DEFAULT_MIN_VOTERS_FOR_QUORUM);
    expect(ConsensusEngineConfigSchema.parse({}).minVotersForQuorum).toBe(
      DEFAULT_MIN_VOTERS_FOR_QUORUM
    );
  });
});
