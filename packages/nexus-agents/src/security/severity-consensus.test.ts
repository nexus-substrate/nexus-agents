import { describe, it, expect, vi } from 'vitest';
import { assessSeverity, assessSeverityBatch } from './severity-consensus.js';
import type { TriagedFinding, ConsensusFn } from './severity-consensus.js';
import type { SecurityFinding } from './sarif-types.js';
import type { TriageVerdict } from './finding-triage.js';

function makeFinding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
  return {
    id: 'TEST-001',
    scanner: 'semgrep',
    rule: 'javascript.lang.security.detect-eval',
    severity: 'high',
    message: 'Use of eval() detected',
    file: 'src/index.ts',
    startLine: 42,
    cweIds: ['CWE-94'],
    confidence: 0.8,
    ...overrides,
  };
}

function makeVerdict(overrides: Partial<TriageVerdict> = {}): TriageVerdict {
  return {
    confirmed: true,
    confidence: 0.9,
    reasoning: 'Eval used with user input',
    suggestedSeverity: 'critical',
    ...overrides,
  };
}

function makeTriaged(
  overrides: {
    finding?: Partial<SecurityFinding>;
    verdict?: Partial<TriageVerdict>;
  } = {}
): TriagedFinding {
  return {
    finding: makeFinding(overrides.finding),
    verdict: makeVerdict(overrides.verdict),
  };
}

describe('assessSeverity', () => {
  it('returns consensus severity when approved', async () => {
    const consensusFn: ConsensusFn = vi.fn().mockResolvedValue({
      approved: true,
      approvalPercentage: 83,
    });

    const result = await assessSeverity(makeTriaged(), consensusFn);

    expect(result.approved).toBe(true);
    expect(result.consensusSeverity).toBe('critical');
    expect(result.approvalPercentage).toBe(83);
    expect(result.originalSeverity).toBe('high');
  });

  it('retains scanner severity when rejected', async () => {
    const consensusFn: ConsensusFn = vi.fn().mockResolvedValue({
      approved: false,
      approvalPercentage: 33,
    });

    const result = await assessSeverity(makeTriaged(), consensusFn);

    expect(result.approved).toBe(false);
    expect(result.consensusSeverity).toBe('high');
    expect(result.originalSeverity).toBe('high');
  });

  it('returns fallback on consensus failure', async () => {
    const consensusFn: ConsensusFn = vi.fn().mockRejectedValue(new Error('timeout'));

    const result = await assessSeverity(makeTriaged(), consensusFn);

    expect(result.approved).toBe(false);
    expect(result.consensusSeverity).toBe('high');
    expect(result.reasoning).toContain('failed');
  });
});

describe('assessSeverityBatch', () => {
  it('only processes confirmed critical/high findings', async () => {
    const consensusFn: ConsensusFn = vi.fn().mockResolvedValue({
      approved: true,
      approvalPercentage: 80,
    });

    const findings = [
      makeTriaged({ verdict: { suggestedSeverity: 'critical', confirmed: true } }),
      makeTriaged({ verdict: { suggestedSeverity: 'medium', confirmed: true } }),
      makeTriaged({ verdict: { suggestedSeverity: 'high', confirmed: true } }),
      makeTriaged({ verdict: { suggestedSeverity: 'low', confirmed: true } }),
      makeTriaged({ verdict: { suggestedSeverity: 'high', confirmed: false } }),
    ];

    const results = await assessSeverityBatch(findings, consensusFn);

    expect(results).toHaveLength(2);
    expect(consensusFn).toHaveBeenCalledTimes(2);
  });

  it('rate-limits to maxFindings', async () => {
    const consensusFn: ConsensusFn = vi.fn().mockResolvedValue({
      approved: true,
      approvalPercentage: 90,
    });

    const findings = Array.from({ length: 10 }, () =>
      makeTriaged({ verdict: { suggestedSeverity: 'critical', confirmed: true } })
    );

    const results = await assessSeverityBatch(findings, consensusFn, { maxFindings: 3 });

    expect(results).toHaveLength(3);
    expect(consensusFn).toHaveBeenCalledTimes(3);
  });

  it('returns empty array when no critical/high findings', async () => {
    const consensusFn: ConsensusFn = vi.fn();

    const findings = [makeTriaged({ verdict: { suggestedSeverity: 'medium', confirmed: true } })];

    const results = await assessSeverityBatch(findings, consensusFn);

    expect(results).toHaveLength(0);
    expect(consensusFn).not.toHaveBeenCalled();
  });
});
