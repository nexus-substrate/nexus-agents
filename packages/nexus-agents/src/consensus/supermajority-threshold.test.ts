/**
 * Parity test for the centralized supermajority threshold (#3571).
 *
 * `SUPERMAJORITY_THRESHOLD` (types-core.ts) is the single source for the 2/3
 * governance threshold. This asserts every consumer resolves to it — so the
 * threshold can never silently drift between consensus modules again.
 */

import { describe, it, expect } from 'vitest';
import { SUPERMAJORITY_THRESHOLD, VOTING_THRESHOLDS } from './types-core.js';
import { DEFAULT_QUORUM_THRESHOLDS } from './quorum-validator.js';
import {
  DEFAULT_VOTING_PROTOCOL_CONFIG,
  VotingProtocolConfigSchema,
} from './types-voting-protocol.js';
import {
  DEFAULT_WEIGHTED_VOTING_CONFIG,
  WeightedVotingConfigSchema,
} from './types-weighted-voting.js';

describe('SUPERMAJORITY_THRESHOLD centralization (#3571)', () => {
  it('pins the governance value at 2/3', () => {
    expect(SUPERMAJORITY_THRESHOLD).toBe(0.67);
  });

  it('VOTING_THRESHOLDS.supermajority resolves to the constant', () => {
    expect(VOTING_THRESHOLDS.supermajority).toBe(SUPERMAJORITY_THRESHOLD);
  });

  it('DEFAULT_QUORUM_THRESHOLDS supermajority + weighted_byzantine resolve to the constant', () => {
    expect(DEFAULT_QUORUM_THRESHOLDS.supermajority).toBe(SUPERMAJORITY_THRESHOLD);
    expect(DEFAULT_QUORUM_THRESHOLDS.weighted_byzantine).toBe(SUPERMAJORITY_THRESHOLD);
  });

  it('voting-protocol agreement default (object + Zod) resolves to the constant', () => {
    expect(DEFAULT_VOTING_PROTOCOL_CONFIG.agreementThreshold).toBe(SUPERMAJORITY_THRESHOLD);
    expect(VotingProtocolConfigSchema.parse({}).agreementThreshold).toBe(SUPERMAJORITY_THRESHOLD);
  });

  it('weighted-voting quorum default (object + Zod) resolves to the constant', () => {
    expect(DEFAULT_WEIGHTED_VOTING_CONFIG.quorumThreshold).toBe(SUPERMAJORITY_THRESHOLD);
    expect(WeightedVotingConfigSchema.parse({}).quorumThreshold).toBe(SUPERMAJORITY_THRESHOLD);
  });
});
