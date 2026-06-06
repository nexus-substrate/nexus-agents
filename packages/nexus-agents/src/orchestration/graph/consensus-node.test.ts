/**
 * Tests for the in-graph consensus gate primitive (#3267).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  runConsensusGate,
  createConsensusGateNode,
  runGraphWithConsensus,
  type ConsensusVoter,
} from './consensus-node.js';

const approveVoter: ConsensusVoter = () =>
  Promise.resolve({ outcome: 'approved', feedback: '', detail: { approvalPercentage: 83 } });
const rejectVoter: ConsensusVoter = () =>
  Promise.resolve({ outcome: 'rejected', feedback: 'missing error handling' });

describe('runConsensusGate', () => {
  it('returns the voter verdict on success', async () => {
    const v = await runConsensusGate(approveVoter, { proposal: 'plan' });
    expect(v.outcome).toBe('approved');
  });

  it('fails CLOSED to a rejected verdict when the voter throws', async () => {
    const throwing: ConsensusVoter = () => Promise.reject(new Error('adapter offline'));
    const v = await runConsensusGate(throwing, { proposal: 'plan' });
    expect(v.outcome).toBe('rejected');
    expect(v.feedback).toContain('adapter offline');
    expect(v.detail?.['error']).toBe('adapter offline');
  });

  it('passes only the proposal/context to the voter (no ambient state)', async () => {
    const spy = vi.fn(approveVoter);
    await runConsensusGate(spy, { proposal: 'p', context: 'c' });
    expect(spy).toHaveBeenCalledWith({ proposal: 'p', context: 'c' });
  });
});

describe('createConsensusGateNode', () => {
  it('writes the typed verdict to the verdict key', async () => {
    const node = createConsensusGateNode({
      voter: rejectVoter,
      verdictKey: 'verdict',
      proposalFrom: (state) => ({
        proposal: typeof state['plan'] === 'string' ? state['plan'] : '',
      }),
    });
    const out = await node({ plan: 'do X' });
    expect(out).toEqual({ verdict: { outcome: 'rejected', feedback: 'missing error handling' } });
  });

  it('fails closed when proposalFrom throws (does not crash the node)', async () => {
    const node = createConsensusGateNode({
      voter: approveVoter,
      verdictKey: 'verdict',
      proposalFrom: () => {
        throw new Error('bad state');
      },
    });
    const out = (await node({})) as { verdict: { outcome: string; feedback: string } };
    expect(out.verdict.outcome).toBe('rejected');
    expect(out.verdict.feedback).toContain('bad state');
  });
});

describe('runGraphWithConsensus', () => {
  it('runs produce → gate and returns the approved verdict', async () => {
    const produce = (): Promise<{ proposal: string }> =>
      Promise.resolve({ proposal: 'a sound plan' });
    const result = await runGraphWithConsensus({ produce, voter: approveVoter });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.verdict?.outcome).toBe('approved');
      expect(result.value.execution.finalState['consensusVerdict']).toBeDefined();
    }
  });

  it('surfaces a rejected verdict from the gate', async () => {
    const produce = (): Promise<{ proposal: string }> =>
      Promise.resolve({ proposal: 'a weak plan' });
    const result = await runGraphWithConsensus({ produce, voter: rejectVoter });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.verdict?.outcome).toBe('rejected');
  });

  it('fails the gate closed when the voter throws — verdict is rejected, not a crash', async () => {
    const produce = (): Promise<{ proposal: string }> => Promise.resolve({ proposal: 'x' });
    const throwing: ConsensusVoter = () => Promise.reject(new Error('boom'));
    const result = await runGraphWithConsensus({ produce, voter: throwing });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.verdict?.outcome).toBe('rejected');
      expect(result.value.verdict?.feedback).toContain('boom');
    }
  });
});
