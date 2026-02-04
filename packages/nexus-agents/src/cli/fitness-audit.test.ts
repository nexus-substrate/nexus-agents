/**
 * nexus-agents/cli - Fitness Audit Command Tests
 * (Source: Issue #697 - Add test coverage for untested CLI commands)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FitnessAudit } from '../governance/fitness-score.js';

vi.mock('../governance/index.js', () => ({
  calculateFitnessScore: vi.fn().mockReturnValue({
    score: 92,
    version: 'v2.6.0-test',
    timestamp: '2026-02-04T00:00:00Z',
    dimensions: {
      canonicalPaths: 18,
      explicitBehavior: 14,
      determinism: 14,
      observability: 13,
      configSimplicity: 9,
      layerSeparation: 9,
      operatorErgonomics: 10,
      governanceIntegration: 5,
    },
    findings: [],
  }),
}));

vi.mock('../version.js', () => ({
  VERSION: '2.6.0-test',
}));

const writtenLines: string[] = [];
vi.mock('./ansi-output.js', () => ({
  colors: {
    reset: '',
    bold: '',
    dim: '',
    green: '',
    yellow: '',
    red: '',
    cyan: '',
  },
  writeLine: vi.fn((text?: string) => {
    writtenLines.push(text ?? '');
  }),
}));

import { fitnessAuditCommand } from './fitness-audit.js';
import { calculateFitnessScore } from '../governance/index.js';

const defaultAudit: FitnessAudit = {
  score: 92,
  version: 'v2.6.0-test',
  timestamp: '2026-02-04T00:00:00Z',
  dimensions: {
    canonicalPaths: 18,
    explicitBehavior: 14,
    determinism: 14,
    observability: 13,
    configSimplicity: 9,
    layerSeparation: 9,
    operatorErgonomics: 10,
    governanceIntegration: 5,
  },
  findings: [],
};

describe('fitnessAuditCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writtenLines.length = 0;
    vi.mocked(calculateFitnessScore).mockReturnValue({ ...defaultAudit });
  });

  it('should return 0 when score meets minimum threshold', () => {
    const exitCode = fitnessAuditCommand();
    expect(exitCode).toBe(0);
  });

  it('should return 1 when score is below minimum threshold', () => {
    vi.mocked(calculateFitnessScore).mockReturnValue({
      ...defaultAudit,
      score: 60,
    });
    const exitCode = fitnessAuditCommand();
    expect(exitCode).toBe(1);
  });

  it('should output JSON when json option is true', () => {
    const exitCode = fitnessAuditCommand({ json: true });
    expect(exitCode).toBe(0);
    const jsonOutput = writtenLines.find((l) => l.includes('"score"'));
    expect(jsonOutput).toBeDefined();
    const parsed = JSON.parse(jsonOutput!) as { score: number };
    expect(parsed.score).toBe(92);
  });

  it('should output formatted report when json option is false', () => {
    fitnessAuditCommand({ json: false });
    const output = writtenLines.join('\n');
    expect(output).toContain('FITNESS AUDIT');
    expect(output).toContain('92/100');
    expect(output).toContain('PASS');
  });

  it('should call calculateFitnessScore with version', () => {
    fitnessAuditCommand();
    expect(calculateFitnessScore).toHaveBeenCalledWith('v2.6.0-test');
  });

  it('should display FAIL message for low scores in text mode', () => {
    vi.mocked(calculateFitnessScore).mockReturnValue({
      ...defaultAudit,
      score: 50,
    });
    fitnessAuditCommand();
    const output = writtenLines.join('\n');
    expect(output).toContain('FAIL');
    expect(output).toContain('50');
  });

  it('should display findings when present', () => {
    vi.mocked(calculateFitnessScore).mockReturnValue({
      ...defaultAudit,
      findings: [
        {
          dimension: 'canonicalPaths',
          severity: 'warning' as const,
          description: 'Duplicate path found',
          pointsDeducted: 2,
          suggestion: 'Consolidate paths',
        },
      ],
    });
    fitnessAuditCommand();
    const output = writtenLines.join('\n');
    expect(output).toContain('Findings (1)');
    expect(output).toContain('Duplicate path found');
  });

  it('should display dimension scores', () => {
    fitnessAuditCommand();
    const output = writtenLines.join('\n');
    expect(output).toContain('Canonical Paths');
    expect(output).toContain('Explicit Behavior');
    expect(output).toContain('Determinism');
    expect(output).toContain('Observability');
  });
});
