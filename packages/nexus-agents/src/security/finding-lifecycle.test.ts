import { describe, it, expect, vi } from 'vitest';
import {
  recordDetected,
  recordTriaged,
  recordFixGenerated,
  recordScanResults,
  summarizeLifecycle,
} from './finding-lifecycle.js';
import type { FindingLifecycleEntry } from './finding-lifecycle.js';
import type { SecurityFinding } from './sarif-types.js';
import type { TriageVerdict } from './finding-triage.js';
import type { GeneratedFix } from './fix-generator.js';

function makeFinding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
  return {
    id: 'FIND-001',
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

describe('recordDetected', () => {
  it('creates a detected lifecycle entry', () => {
    const persist = vi.fn();
    const entry = recordDetected(makeFinding(), persist);

    expect(entry.stage).toBe('detected');
    expect(entry.findingId).toBe('FIND-001');
    expect(entry.confirmed).toBeNull();
    expect(entry.fixGenerated).toBe(false);
    expect(persist).toHaveBeenCalledWith(entry);
  });
});

describe('recordTriaged', () => {
  it('records confirmed finding as triaged', () => {
    const persist = vi.fn();
    const verdict: TriageVerdict = {
      confirmed: true,
      confidence: 0.9,
      reasoning: 'Exploitable',
      suggestedSeverity: 'critical',
    };

    const entry = recordTriaged(makeFinding(), verdict, persist);

    expect(entry.stage).toBe('triaged');
    expect(entry.confirmed).toBe(true);
    expect(entry.severity).toBe('critical');
    expect(persist).toHaveBeenCalledWith(entry);
  });

  it('records unconfirmed finding as dismissed', () => {
    const persist = vi.fn();
    const verdict: TriageVerdict = {
      confirmed: false,
      confidence: 0.3,
      reasoning: 'False positive',
      suggestedSeverity: 'low',
    };

    const entry = recordTriaged(makeFinding(), verdict, persist);

    expect(entry.stage).toBe('dismissed');
    expect(entry.confirmed).toBe(false);
  });
});

describe('recordFixGenerated', () => {
  it('records fix generation', () => {
    const persist = vi.fn();
    const fix: GeneratedFix = {
      diff: '--- a/x\n+++ b/x\n-bad\n+good',
      explanation: 'Fixed the thing',
      confidence: 0.85,
      caveats: ['Check tests'],
      requiresReview: true,
    };

    const entry = recordFixGenerated('FIND-001', makeFinding(), fix, persist);

    expect(entry.stage).toBe('fix_generated');
    expect(entry.fixGenerated).toBe(true);
    expect(entry.confirmed).toBe(true);
    expect(persist).toHaveBeenCalledWith(entry);
  });
});

describe('recordScanResults', () => {
  it('records all findings as detected', () => {
    const persist = vi.fn();
    const findings = [
      makeFinding({ id: 'F1' }),
      makeFinding({ id: 'F2' }),
      makeFinding({ id: 'F3' }),
    ];

    const entries = recordScanResults(findings, persist);

    expect(entries).toHaveLength(3);
    expect(persist).toHaveBeenCalledTimes(3);
    expect(entries.every((e) => e.stage === 'detected')).toBe(true);
  });
});

describe('summarizeLifecycle', () => {
  it('computes correct summary statistics', () => {
    const now = new Date();
    const later = new Date(now.getTime() + 5000);

    const entries: FindingLifecycleEntry[] = [
      {
        findingId: 'F1',
        rule: 'r1',
        file: 'a.ts:1',
        severity: 'high',
        stage: 'detected',
        timestamp: now.toISOString(),
        confirmed: null,
        fixGenerated: false,
        metadata: {},
      },
      {
        findingId: 'F2',
        rule: 'r2',
        file: 'b.ts:2',
        severity: 'medium',
        stage: 'detected',
        timestamp: now.toISOString(),
        confirmed: null,
        fixGenerated: false,
        metadata: {},
      },
      {
        findingId: 'F1',
        rule: 'r1',
        file: 'a.ts:1',
        severity: 'critical',
        stage: 'triaged',
        timestamp: later.toISOString(),
        confirmed: true,
        fixGenerated: false,
        metadata: {},
      },
      {
        findingId: 'F2',
        rule: 'r2',
        file: 'b.ts:2',
        severity: 'low',
        stage: 'dismissed',
        timestamp: later.toISOString(),
        confirmed: false,
        fixGenerated: false,
        metadata: {},
      },
      {
        findingId: 'F1',
        rule: 'r1',
        file: 'a.ts:1',
        severity: 'critical',
        stage: 'fix_generated',
        timestamp: later.toISOString(),
        confirmed: true,
        fixGenerated: true,
        metadata: {},
      },
    ];

    const summary = summarizeLifecycle(entries);

    expect(summary.totalDetected).toBe(2);
    expect(summary.totalTriaged).toBe(2);
    expect(summary.confirmedCount).toBe(2);
    expect(summary.falsePositiveCount).toBe(1);
    expect(summary.fixesGenerated).toBe(1);
    expect(summary.dismissed).toBe(1);
    expect(summary.falsePositiveRate).toBe(0.5);
    expect(summary.meanTimeToTriageMs).toBe(5000);
  });

  it('handles empty entries', () => {
    const summary = summarizeLifecycle([]);

    expect(summary.totalDetected).toBe(0);
    expect(summary.falsePositiveRate).toBe(0);
    expect(summary.meanTimeToTriageMs).toBeNull();
  });
});
