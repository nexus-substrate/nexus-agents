/**
 * Tests for Security Expert Helpers
 * @module agents/experts/security-expert-helpers.test
 */

import { describe, it, expect } from 'vitest';
import type { Vulnerability } from './expert-types.js';
import {
  VULNERABILITY_PATTERNS,
  detectHeuristicVulnerabilities,
  calculateSecurityScore,
  generateHeuristicRecommendations,
  generateSecurityWarnings,
  parseSecurityResult,
} from './security-expert-helpers.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeVuln(overrides: Partial<Vulnerability> = {}): Vulnerability {
  return {
    id: 'VULN-001',
    severity: 'high',
    type: 'A03:2021 - Injection',
    description: 'Test vulnerability',
    remediation: 'Fix it',
    ...overrides,
  };
}

// ============================================================================
// VULNERABILITY_PATTERNS
// ============================================================================

describe('VULNERABILITY_PATTERNS', () => {
  it('has patterns defined', () => {
    expect(VULNERABILITY_PATTERNS.length).toBeGreaterThan(0);
  });

  it('each pattern has required fields', () => {
    for (const p of VULNERABILITY_PATTERNS) {
      expect(p.pattern).toBeInstanceOf(RegExp);
      expect(p.severity).toBeDefined();
      expect(p.type).toBeDefined();
      expect(p.description).toBeDefined();
      expect(p.remediation).toBeDefined();
    }
  });
});

// ============================================================================
// detectHeuristicVulnerabilities
// ============================================================================

describe('detectHeuristicVulnerabilities', () => {
  it('detects SQL injection patterns', () => {
    const vulns = detectHeuristicVulnerabilities('query user database input');
    expect(vulns.some((v) => v.type.includes('Injection'))).toBe(true);
  });

  it('detects credential exposure', () => {
    const vulns = detectHeuristicVulnerabilities('store password in config');
    expect(vulns.some((v) => v.type.includes('Cryptographic'))).toBe(true);
  });

  it('detects code injection', () => {
    const vulns = detectHeuristicVulnerabilities('eval user input in shell');
    expect(vulns.some((v) => v.description.includes('injection'))).toBe(true);
  });

  it('detects auth issues', () => {
    const vulns = detectHeuristicVulnerabilities('login session management');
    expect(vulns.some((v) => v.type.includes('Authentication'))).toBe(true);
  });

  it('detects access control', () => {
    const vulns = detectHeuristicVulnerabilities('check admin permission role');
    expect(vulns.some((v) => v.type.includes('Access Control'))).toBe(true);
  });

  it('returns empty for safe description', () => {
    const vulns = detectHeuristicVulnerabilities('compute fibonacci numbers');
    expect(vulns).toEqual([]);
  });

  it('assigns sequential IDs', () => {
    const vulns = detectHeuristicVulnerabilities('sql query with password in eval shell');
    if (vulns.length >= 2) {
      expect(vulns[0]!.id).toBe('VULN-001');
      expect(vulns[1]!.id).toBe('VULN-002');
    }
  });

  it('includes CWE when enabled', () => {
    const vulns = detectHeuristicVulnerabilities('sql query database', {
      enableCweMapping: true,
    });
    const sqlVuln = vulns.find((v) => v.type.includes('Injection'));
    expect(sqlVuln?.cweId).toBe('CWE-89');
  });

  it('excludes CWE when not enabled', () => {
    const vulns = detectHeuristicVulnerabilities('sql query database', {
      enableCweMapping: false,
    });
    const sqlVuln = vulns.find((v) => v.type.includes('Injection'));
    expect(sqlVuln?.cweId).toBeUndefined();
  });

  it('filters by minimum severity', () => {
    const vulns = detectHeuristicVulnerabilities('sql query with password and access control', {
      minSeverity: 'critical',
    });
    expect(vulns.every((v) => v.severity === 'critical')).toBe(true);
  });
});

// ============================================================================
// calculateSecurityScore
// ============================================================================

describe('calculateSecurityScore', () => {
  it('returns 100 for no vulnerabilities', () => {
    expect(calculateSecurityScore([])).toBe(100);
  });

  it('deducts 25 for critical', () => {
    expect(calculateSecurityScore([makeVuln({ severity: 'critical' })])).toBe(75);
  });

  it('deducts 15 for high', () => {
    expect(calculateSecurityScore([makeVuln({ severity: 'high' })])).toBe(85);
  });

  it('deducts 8 for medium', () => {
    expect(calculateSecurityScore([makeVuln({ severity: 'medium' })])).toBe(92);
  });

  it('deducts 3 for low', () => {
    expect(calculateSecurityScore([makeVuln({ severity: 'low' })])).toBe(97);
  });

  it('deducts 1 for info', () => {
    expect(calculateSecurityScore([makeVuln({ severity: 'info' })])).toBe(99);
  });

  it('clamps at 0', () => {
    const vulns = Array(5).fill(makeVuln({ severity: 'critical' })) as Vulnerability[];
    expect(calculateSecurityScore(vulns)).toBe(0);
  });

  it('accumulates deductions', () => {
    const vulns = [makeVuln({ severity: 'critical' }), makeVuln({ severity: 'high' })];
    // 100 - 25 - 15 = 60
    expect(calculateSecurityScore(vulns)).toBe(60);
  });
});

// ============================================================================
// generateHeuristicRecommendations
// ============================================================================

describe('generateHeuristicRecommendations', () => {
  it('returns base recommendations for no vulnerabilities', () => {
    const recs = generateHeuristicRecommendations([]);
    expect(recs).toContain('Perform regular security audits');
    expect(recs).toContain('Keep dependencies updated');
    expect(recs).toContain('Implement security headers');
  });

  it('prepends urgent for critical', () => {
    const recs = generateHeuristicRecommendations([makeVuln({ severity: 'critical' })]);
    expect(recs[0]).toContain('URGENT');
  });

  it('appends remediation for high', () => {
    const recs = generateHeuristicRecommendations([makeVuln({ severity: 'high' })]);
    expect(recs.some((r) => r.includes('remediation'))).toBe(true);
  });
});

// ============================================================================
// generateSecurityWarnings
// ============================================================================

describe('generateSecurityWarnings', () => {
  it('returns empty for no vulnerabilities', () => {
    expect(generateSecurityWarnings([])).toEqual([]);
  });

  it('warns about critical count', () => {
    const warnings = generateSecurityWarnings([
      makeVuln({ severity: 'critical' }),
      makeVuln({ severity: 'critical' }),
    ]);
    expect(warnings.some((w) => w.includes('2 critical'))).toBe(true);
  });

  it('warns about high count', () => {
    const warnings = generateSecurityWarnings([makeVuln({ severity: 'high' })]);
    expect(warnings.some((w) => w.includes('1 high'))).toBe(true);
  });

  it('does not warn about medium or lower', () => {
    const warnings = generateSecurityWarnings([makeVuln({ severity: 'medium' })]);
    expect(warnings).toEqual([]);
  });
});

// ============================================================================
// parseSecurityResult
// ============================================================================

describe('parseSecurityResult', () => {
  const mockScorer = (vulns: Vulnerability[]): number => (vulns.length === 0 ? 100 : 50);
  const mockValidator = (v: unknown): { success: boolean; data?: Vulnerability } => {
    const vuln = v as Vulnerability;
    if (vuln?.id && vuln?.severity) {
      return { success: true, data: vuln };
    }
    return { success: false };
  };

  it('parses valid JSON result', () => {
    const json = JSON.stringify({
      content: 'Analysis done',
      vulnerabilities: [makeVuln()],
      securityScore: 80,
      confidence: 0.9,
    });
    const result = parseSecurityResult(json, mockScorer, mockValidator);
    expect(result.content).toBe('Analysis done');
    expect(result.vulnerabilities).toHaveLength(1);
    expect(result.securityScore).toBe(80);
    expect(result.findingsCoverage).toBe('complete');
    expect(result.confidence).toBe(0.9);
  });

  it('marks rejected-only findings unmeasured with a fail-closed zero score', () => {
    const json = JSON.stringify({
      content: 'Analysis done',
      vulnerabilities: [{ invalid: 'data' }],
    });

    const result = parseSecurityResult(json, mockScorer, mockValidator);

    expect(result.vulnerabilities).toEqual([]);
    expect(result.findingsCoverage).toBe('unmeasured');
    expect(result.securityScore).toBe(0);
  });

  it('marks mixed validation partial and scores only validated findings', () => {
    const json = JSON.stringify({
      content: 'Analysis done',
      vulnerabilities: [{ invalid: 'data' }, makeVuln({ severity: 'low' })],
      securityScore: 5,
    });

    const result = parseSecurityResult(json, mockScorer, mockValidator);

    expect(result.vulnerabilities).toHaveLength(1);
    expect(result.findingsCoverage).toBe('partial');
    expect(result.securityScore).toBe(50);
  });

  it('parses JSON from markdown code block', () => {
    const text = '```json\n{"content":"test","vulnerabilities":[]}\n```';
    const result = parseSecurityResult(text, mockScorer, mockValidator);
    expect(result.content).toBe('test');
    expect(result.vulnerabilities).toEqual([]);
  });

  it('reports an unparseable answer as unmeasured, not a clean review', () => {
    // This test previously asserted `securityScore` 100 on this path, pinning
    // the defect as intended behaviour: the branch is reached only when the
    // model's answer could not be parsed at all, so nothing was measured, and
    // `calculateSecurityScore([])` returns 100. An adapter answering
    // "I could not complete this review." was recorded as a clean review.
    const result = parseSecurityResult('not valid json', mockScorer, mockValidator);

    expect(result.content).toBe('not valid json');
    // Heuristic fallback: no vulnerability patterns matched in plain text
    expect(result.vulnerabilities).toEqual([]);
    expect(result.findingsCoverage).toBe('unmeasured');
    expect(result.securityScore).toBe(0);
    expect(result.confidence).toBe(0.3);
  });

  it('reports a prose-only heuristic hit as partial, scored on what it found', () => {
    // The pair that keeps the assertion above from passing for the wrong
    // reason: a heuristic hit IS evidence of something, so it must not collapse
    // to `unmeasured` — but it is still not a parsed review, so never
    // `complete`.
    const text = 'The handler builds a query with string concatenation: SQL injection risk.';
    const result = parseSecurityResult(text, mockScorer, mockValidator);

    expect(result.vulnerabilities.length).toBeGreaterThan(0);
    expect(result.findingsCoverage).toBe('partial');
    expect(result.securityScore).toBeLessThan(100);
    expect(result.confidence).toBe(0.5);
  });

  it('never reports an unparseable answer as complete', () => {
    // The property that matters downstream: `parseExpertReview` maps
    // `unmeasured` to verdict `errored`, and treats `complete` as a real
    // review. Both fallback shapes must stay out of `complete`.
    for (const text of ['not valid json', 'SQL injection risk in the handler']) {
      expect(parseSecurityResult(text, mockScorer, mockValidator).findingsCoverage).not.toBe(
        'complete'
      );
    }
  });

  it('uses calculator when score not provided', () => {
    const json = JSON.stringify({ content: 'test', vulnerabilities: [] });
    const result = parseSecurityResult(json, mockScorer, mockValidator);
    expect(result.securityScore).toBe(100);
    expect(result.findingsCoverage).toBe('complete');
  });

  it('preserves optional fields', () => {
    const json = JSON.stringify({
      content: 'test',
      vulnerabilities: [],
      compliance: { framework: 'OWASP', status: 'compliant', findings: [] },
      recommendations: ['rec1'],
      warnings: ['warn1'],
    });
    const result = parseSecurityResult(json, mockScorer, mockValidator);
    expect(result.compliance).toBeDefined();
    expect(result.recommendations).toEqual(['rec1']);
    expect(result.warnings).toEqual(['warn1']);
  });
});
