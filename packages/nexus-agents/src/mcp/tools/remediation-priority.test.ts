/**
 * Tests for the priority → consensus-rigor policy (#3653).
 * Security is always p0; the requirement table maps each tier to a real
 * ConsensusAlgorithm; p4 is file-only; p0 requires a dry-run.
 */

import { describe, it, expect } from 'vitest';
import {
  classifySignalPriority,
  consensusFor,
  priorityLabel,
  REMEDIATION_PRIORITIES,
} from './remediation-priority.js';
import type { ImprovementSignal } from './improvement-review.js';

function signal(over: Partial<ImprovementSignal> = {}): ImprovementSignal {
  return {
    category: 'routing',
    signalKey: 'routing:cli-floor:codex:docs',
    severity: 'warning',
    title: 'routing: codex 30% on docs',
    body: 'floor breach',
    evidence: {},
    ...over,
  };
}

describe('classifySignalPriority', () => {
  it('classifies any security signal as p0 (declared category)', () => {
    expect(classifySignalPriority(signal({ category: 'security', signalKey: 'sec-1' }))).toBe('p0');
  });

  it('classifies a keyword-detected security signal as p0 (fail-closed via #3615)', () => {
    expect(
      classifySignalPriority(
        signal({ category: 'bug', title: 'authentication bypass / injection' })
      )
    ).toBe('p0');
  });

  it('classifies a critical non-security signal as p0', () => {
    expect(classifySignalPriority(signal({ severity: 'critical' }))).toBe('p0');
  });

  it('classifies warning → p2, info → p3', () => {
    expect(classifySignalPriority(signal({ severity: 'warning' }))).toBe('p2');
    expect(classifySignalPriority(signal({ severity: 'info' }))).toBe('p3');
  });
});

describe('consensusFor', () => {
  it('p0 = unanimous + dry-run', () => {
    expect(consensusFor('p0')).toEqual({
      autoRemediate: true,
      algorithm: 'unanimous',
      requiresDryRun: true,
    });
  });

  it('rigor relaxes monotonically p0→p3, then p4 is file-only', () => {
    expect(consensusFor('p1').algorithm).toBe('supermajority');
    expect(consensusFor('p2').algorithm).toBe('higher_order');
    expect(consensusFor('p3').algorithm).toBe('simple_majority');
    expect(consensusFor('p4').autoRemediate).toBe(false);
    expect(consensusFor('p4').algorithm).toBeUndefined();
  });

  it('only p0 requires a dry-run', () => {
    const withDryRun = REMEDIATION_PRIORITIES.filter((p) => consensusFor(p).requiresDryRun);
    expect(withDryRun).toEqual(['p0']);
  });

  it('every auto-remediating tier names a real consensus algorithm', () => {
    for (const p of REMEDIATION_PRIORITIES) {
      const req = consensusFor(p);
      expect(req.autoRemediate ? req.algorithm !== undefined : req.algorithm === undefined).toBe(
        true
      );
    }
  });
});

describe('priorityLabel', () => {
  it('labels are the literal tier names', () => {
    for (const p of REMEDIATION_PRIORITIES) {
      expect(priorityLabel(p)).toBe(p);
    }
  });
});
