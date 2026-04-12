import { describe, it, expect, vi } from 'vitest';
import { generateFix, generateFixBatch, GeneratedFixSchema } from './fix-generator.js';
import type { SecurityFinding } from './sarif-types.js';
import type { TriageVerdict } from './finding-triage.js';

function makeFinding(overrides: Partial<SecurityFinding> = {}): SecurityFinding {
  return {
    id: 'TEST-001',
    scanner: 'semgrep',
    rule: 'javascript.lang.security.detect-eval',
    severity: 'high',
    message: 'Use of eval() detected',
    file: '/nonexistent/test.ts',
    startLine: 10,
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

const VALID_FIX_JSON = JSON.stringify({
  diff: '--- a/src/index.ts\n+++ b/src/index.ts\n@@ -10 +10 @@\n-eval(input)\n+safeEval(input)',
  explanation: 'Replace eval() with a safe alternative',
  confidence: 0.85,
  caveats: ['Verify safeEval is imported'],
  requiresReview: true,
});

describe('GeneratedFixSchema', () => {
  it('validates a correct fix', () => {
    const fix = GeneratedFixSchema.parse(JSON.parse(VALID_FIX_JSON));
    expect(fix.requiresReview).toBe(true);
    expect(fix.confidence).toBe(0.85);
  });

  it('rejects fix without requiresReview=true', () => {
    expect(() =>
      GeneratedFixSchema.parse({ ...JSON.parse(VALID_FIX_JSON), requiresReview: false })
    ).toThrow();
  });
});

describe('generateFix', () => {
  it('returns fix when delegate returns valid JSON', async () => {
    const delegateFn = vi.fn().mockResolvedValue(VALID_FIX_JSON);
    const result = await generateFix(makeFinding(), makeVerdict(), delegateFn);

    expect(result).not.toBeNull();
    expect(result?.diff).toContain('safeEval');
    expect(result?.requiresReview).toBe(true);
  });

  it('returns null for unconfirmed verdict', async () => {
    const delegateFn = vi.fn();
    const result = await generateFix(makeFinding(), makeVerdict({ confirmed: false }), delegateFn);

    expect(result).toBeNull();
    expect(delegateFn).not.toHaveBeenCalled();
  });

  it('returns null when delegate returns invalid JSON', async () => {
    const delegateFn = vi.fn().mockResolvedValue('not json');
    const result = await generateFix(makeFinding(), makeVerdict(), delegateFn);

    expect(result).toBeNull();
  });

  it('returns null when delegate throws', async () => {
    const delegateFn = vi.fn().mockRejectedValue(new Error('timeout'));
    const result = await generateFix(makeFinding(), makeVerdict(), delegateFn);

    expect(result).toBeNull();
  });

  it('includes source context in prompt', async () => {
    const delegateFn = vi.fn().mockResolvedValue(VALID_FIX_JSON);
    await generateFix(makeFinding(), makeVerdict(), delegateFn);

    const prompt = delegateFn.mock.calls[0]?.[0] as string;
    expect(prompt).toContain('detect-eval');
    expect(prompt).toContain('CWE-94');
  });

  it('refuses relative path traversal via finding.file (cwd guard)', async () => {
    const delegateFn = vi.fn().mockResolvedValue(VALID_FIX_JSON);
    await generateFix(
      makeFinding({ file: '../../../../etc/passwd' }),
      makeVerdict({ confirmed: true }),
      delegateFn
    );
    const prompt = delegateFn.mock.calls[0]?.[0] as string;
    expect(prompt).toContain('(source unavailable)');
    expect(prompt).not.toContain('root:x:');
  });

  it('refuses absolute path traversal via finding.file (cwd guard)', async () => {
    const delegateFn = vi.fn().mockResolvedValue(VALID_FIX_JSON);
    await generateFix(
      makeFinding({ file: '/etc/passwd' }),
      makeVerdict({ confirmed: true }),
      delegateFn
    );
    const prompt = delegateFn.mock.calls[0]?.[0] as string;
    expect(prompt).toContain('(source unavailable)');
    expect(prompt).not.toContain('root:x:');
  });
});

describe('generateFixBatch', () => {
  it('only processes confirmed findings', async () => {
    const delegateFn = vi.fn().mockResolvedValue(VALID_FIX_JSON);
    const findings = [
      { finding: makeFinding({ id: 'F1' }), verdict: makeVerdict({ confirmed: true }) },
      { finding: makeFinding({ id: 'F2' }), verdict: makeVerdict({ confirmed: false }) },
      { finding: makeFinding({ id: 'F3' }), verdict: makeVerdict({ confirmed: true }) },
    ];

    const results = await generateFixBatch(findings, delegateFn);

    expect(results).toHaveLength(2);
    expect(results[0]?.findingId).toBe('F1');
    expect(results[1]?.findingId).toBe('F3');
    expect(delegateFn).toHaveBeenCalledTimes(2);
  });

  it('returns null fix when generation fails', async () => {
    const delegateFn = vi.fn().mockResolvedValue('invalid');
    const findings = [{ finding: makeFinding(), verdict: makeVerdict({ confirmed: true }) }];

    const results = await generateFixBatch(findings, delegateFn);

    expect(results).toHaveLength(1);
    expect(results[0]?.fix).toBeNull();
  });
});
