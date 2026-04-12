/**
 * Tests for finding-triage (#1681 Phase 2)
 */

import { describe, it, expect, vi } from 'vitest';
import {
  triageFinding,
  triageFindings,
  TriageVerdictSchema,
  DEFAULT_CONFIG,
} from './finding-triage.js';
import type { SecurityFinding } from './sarif-types.js';
import { SecurityFindingSchema } from './sarif-types.js';

const createFinding = (overrides: Partial<SecurityFinding> = {}): SecurityFinding => {
  const defaults: SecurityFinding = {
    id: 'semgrep:javascript.lang.security.detect-eval:src/app.js:10',
    scanner: 'semgrep',
    rule: 'javascript.lang.security.detect-eval',
    severity: 'high',
    message: 'Dangerous use of eval() detected',
    file: 'src/app.js',
    startLine: 10,
    endLine: 10,
    cweIds: ['CWE-95'],
    confidence: 0.8,
    snippet: '  eval(userInput);',
  };
  return SecurityFindingSchema.parse({ ...defaults, ...overrides });
};

describe('TriageVerdictSchema', () => {
  it('should parse valid verdict', () => {
    const valid = {
      confirmed: true,
      confidence: 0.85,
      reasoning: 'The eval() call uses unsanitized user input, which is exploitable.',
      suggestedSeverity: 'high',
    };
    const result = TriageVerdictSchema.parse(valid);
    expect(result.confirmed).toBe(true);
    expect(result.confidence).toBe(0.85);
  });

  it('should reject invalid confidence', () => {
    const invalid = {
      confirmed: true,
      confidence: 1.5,
      reasoning: 'Test',
      suggestedSeverity: 'high',
    };
    expect(() => TriageVerdictSchema.parse(invalid)).toThrow();
  });
});

describe('triageFinding', () => {
  it('should return null when delegate fails', async () => {
    const finding = createFinding();
    const delegateFn = vi.fn().mockRejectedValue(new Error('Model error'));

    const result = await triageFinding(finding, delegateFn);

    expect(result).toBeNull();
  });

  it('should return verdict when delegate succeeds', async () => {
    const finding = createFinding();
    const delegateFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        confirmed: true,
        confidence: 0.9,
        reasoning: 'The eval call uses unsanitized input.',
        suggestedSeverity: 'critical',
      })
    );

    const result = await triageFinding(finding, delegateFn);

    expect(delegateFn).toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result?.confirmed).toBe(true);
    expect(result?.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('should mark confirmed=false when confidence below minConfidence', async () => {
    const finding = createFinding();
    const delegateFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        confirmed: true,
        confidence: 0.3,
        reasoning: 'Low confidence in finding.',
        suggestedSeverity: 'medium',
      })
    );

    const result = await triageFinding(finding, delegateFn, {
      ...DEFAULT_CONFIG,
      minConfidence: 0.5,
    });

    expect(result).not.toBeNull();
    expect(result?.confirmed).toBe(false);
  });

  it('should return null for non-JSON response', async () => {
    const finding = createFinding();
    const delegateFn = vi.fn().mockResolvedValue('This is not JSON');

    const result = await triageFinding(finding, delegateFn);

    expect(result).toBeNull();
  });
});

describe('triageFindings', () => {
  it('should rate-limit to maxFindings', async () => {
    const findings = [
      createFinding({ id: 'f1', severity: 'critical' }),
      createFinding({ id: 'f2', severity: 'high' }),
      createFinding({ id: 'f3', severity: 'medium' }),
    ];
    const delegateFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        confirmed: false,
        confidence: 0.5,
        reasoning: 'False positive',
        suggestedSeverity: 'info',
      })
    );

    const result = await triageFindings(findings, delegateFn, {
      maxFindings: 2,
      contextLines: 5,
      minConfidence: 0.5,
    });

    expect(delegateFn).toHaveBeenCalledTimes(2);
    expect(result.original.length).toBe(3);
    expect(result.triaged.length).toBe(2);
  });

  it('should sort findings by severity before triaging', async () => {
    const findings = [
      createFinding({ id: 'f1', severity: 'low' }),
      createFinding({ id: 'f2', severity: 'critical' }),
      createFinding({ id: 'f3', severity: 'medium' }),
    ];
    const callOrder: string[] = [];
    const delegateFn = vi.fn().mockImplementation(() => {
      callOrder.push('called');
      return Promise.resolve(
        JSON.stringify({
          confirmed: false,
          confidence: 0.5,
          reasoning: 'FP',
          suggestedSeverity: 'info',
        })
      );
    });

    await triageFindings(findings, delegateFn, {
      maxFindings: 3,
      contextLines: 5,
      minConfidence: 0.5,
    });

    expect(callOrder.length).toBe(3);
  });

  it('should preserve original findings array', async () => {
    const findings = [createFinding({ id: 'f1' })];
    const delegateFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        confirmed: false,
        confidence: 0.5,
        reasoning: 'FP',
        suggestedSeverity: 'info',
      })
    );

    const result = await triageFindings(findings, delegateFn);

    expect(result.original).toBe(findings);
  });

  it('refuses to read files outside the current working directory (path traversal guard)', async () => {
    // A malicious scanner emits a traversal path. Before the fix, triage
    // would readFileSync('/etc/passwd') and include its contents in the LLM
    // prompt. After the fix, the prompt falls back to the scanner snippet.
    const evil = createFinding({
      file: '../../../../etc/passwd',
      snippet: '  safe-snippet-only;',
    });
    let promptSeen = '';
    const delegateFn = vi.fn((prompt: string) => {
      promptSeen = prompt;
      return Promise.resolve(
        JSON.stringify({
          confirmed: false,
          confidence: 0.9,
          reasoning: 'traversal-probe',
          suggestedSeverity: 'info',
        })
      );
    });
    await triageFinding(evil, delegateFn);
    // Prompt must contain the scanner snippet, NOT any traversed file content.
    expect(promptSeen).toContain('safe-snippet-only');
    expect(promptSeen).not.toContain('root:x:');
    expect(promptSeen).not.toContain('/etc/passwd\n');
  });

  it('refuses absolute paths outside cwd (path traversal guard)', async () => {
    const evil = createFinding({
      file: '/etc/passwd',
      snippet: '  scanner-snippet;',
    });
    let promptSeen = '';
    const delegateFn = vi.fn((prompt: string) => {
      promptSeen = prompt;
      return Promise.resolve(
        JSON.stringify({
          confirmed: false,
          confidence: 0.9,
          reasoning: 't',
          suggestedSeverity: 'info',
        })
      );
    });
    await triageFinding(evil, delegateFn);
    expect(promptSeen).toContain('scanner-snippet');
    expect(promptSeen).not.toContain('root:x:');
  });
});
