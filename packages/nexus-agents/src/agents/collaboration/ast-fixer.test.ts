/**
 * AST Fixer Tests
 *
 * Tests for AST-based code transformations in constitutional critic.
 *
 * @module agents/collaboration/ast-fixer.test
 * @see Issue #459 - AST-based code fixing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AstFixer, createAstFixer } from './ast-fixer.js';
import type { Violation } from './constitutional-types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const createViolation = (
  principleId: string,
  location?: string,
  suggestedFix = 'Fix this issue'
): Violation => {
  const base: Violation = {
    principleId,
    principleName: principleId.replace(/-/g, ' '),
    severity: 'high',
    explanation: 'Test violation',
    suggestedFix,
    confidence: 0.9,
  };
  if (location !== undefined) {
    return { ...base, location };
  }
  return base;
};

// =============================================================================
// Constructor Tests
// =============================================================================

describe('AstFixer', () => {
  let fixer: AstFixer;

  beforeEach(() => {
    fixer = new AstFixer();
  });

  describe('constructor', () => {
    it('creates instance', () => {
      expect(fixer).toBeDefined();
    });

    it('createAstFixer factory works', () => {
      const instance = createAstFixer();
      expect(instance).toBeInstanceOf(AstFixer);
    });
  });

  // ===========================================================================
  // no-console Fixes
  // ===========================================================================

  describe('no-console fixes', () => {
    it('comments out console.log statement', () => {
      const code = `const x = 1;\nconsole.log(x);\nconst y = 2;`;
      const violation = createViolation('no-console', 'line 2');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code).toContain('// console.log(x);');
      expect(result.changeDescription).toContain('console');
    });

    it('comments out console.error statement', () => {
      const code = `console.error('error');`;
      const violation = createViolation('no-console', 'line 1');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code).toContain('// ');
    });

    it('preserves surrounding code', () => {
      const code = `const a = 1;\nconsole.log(a);\nconst b = 2;`;
      const violation = createViolation('no-console', 'line 2');

      const result = fixer.applyFix(code, violation);

      expect(result.code).toContain('const a = 1;');
      expect(result.code).toContain('const b = 2;');
    });
  });

  // ===========================================================================
  // type-safety Fixes
  // ===========================================================================

  describe('type-safety fixes', () => {
    it('replaces any with unknown', () => {
      const code = `function test(x: any): void { }`;
      const violation = createViolation('type-safety', 'line 1');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code).toContain('x: unknown');
      expect(result.code).not.toContain(': any');
    });

    it('handles multiple any types when no specific line', () => {
      const code = `const a: any = 1;\nconst b: any = 2;`;
      const violation = createViolation('type-safety');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      // At least one should be changed
      expect(result.code).toContain(': unknown');
    });
  });

  // ===========================================================================
  // no-eval Fixes
  // ===========================================================================

  describe('no-eval fixes', () => {
    it('disables eval call in expression statement', () => {
      // eval as statement (typical violation pattern)
      const code = `eval(userCode);`;
      const violation = createViolation('no-eval', 'line 1');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code).toContain('SECURITY');
      expect(result.code).toContain('throw new Error');
    });

    it('falls back to comment for eval in variable declaration', () => {
      // eval in variable declaration falls back to comment
      const code = `const result = eval('1 + 1');`;
      const violation = createViolation('no-eval', 'line 1');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code).toContain('TODO');
      expect(result.code).toContain('no-eval');
    });

    it('RED: does not over-match a *Function-suffixed identifier like setupFunction()', () => {
      // The old `expressionText.endsWith('Function')` check over-matched
      // ordinary calls; the exact-callee ast-grep pattern must not.
      const code = `setupFunction();`;
      const violation = createViolation('no-eval', 'line 1');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code).not.toContain('SECURITY: eval disabled');
      expect(result.code).not.toContain('eval() is not allowed');
      // Falls back to the TODO-comment fixer instead.
      expect(result.code).toContain('TODO');
    });

    it('green: Function(...) call is rewritten', () => {
      const code = `Function('return 1');`;
      const violation = createViolation('no-eval', 'line 1');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code).toContain('SECURITY: eval disabled');
      expect(result.code).toContain(
        `throw new Error('eval() is not allowed for security reasons');`
      );
    });

    it('green: new Function(...) call is rewritten', () => {
      const code = `new Function('return 1');`;
      const violation = createViolation('no-eval', 'line 1');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code).toContain('SECURITY: eval disabled');
      expect(result.code).toContain(
        `throw new Error('eval() is not allowed for security reasons');`
      );
    });

    it('green: an unrelated call, myFunction(), is left untouched', () => {
      const code = `myFunction();`;
      const violation = createViolation('no-eval', 'line 1');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code).not.toContain('SECURITY: eval disabled');
      expect(result.code).toContain('TODO');
    });
  });

  // ===========================================================================
  // input-validation Fixes
  // ===========================================================================

  describe('input-validation fixes', () => {
    it('wraps JSON.parse expression statement in try-catch', () => {
      // JSON.parse as expression statement (typical inline parsing)
      const code = `JSON.parse(userInput);`;
      const violation = createViolation('input-validation', 'line 1');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code).toContain('try {');
      expect(result.code).toContain('catch');
      expect(result.code).toContain('JSON.parse');
    });

    it('falls back to comment for JSON.parse in variable declaration', () => {
      const code = `const data = JSON.parse(userInput);`;
      const violation = createViolation('input-validation', 'line 1');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code).toContain('TODO');
      expect(result.code).toContain('input-validation');
    });

    it('does not double-wrap existing try-catch', () => {
      const code = `try { JSON.parse(input); } catch (e) { }`;
      const violation = createViolation('input-validation', 'line 1');

      const result = fixer.applyFix(code, violation);

      // Should fall back to comment since already in try-catch
      expect(result.code).not.toContain('try {\n  try {');
    });
  });

  // ===========================================================================
  // error-handling Fixes
  // ===========================================================================

  describe('error-handling fixes', () => {
    it('adds catch to simple promise chain', () => {
      const code = `promise.then(() => console.log('done'));`;
      const violation = createViolation('error-handling', 'line 1');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code).toContain('.catch');
    });

    it('leaves chains with existing catch alone', () => {
      const code = `promise.then(() => {}).catch(() => {});`;
      const violation = createViolation('error-handling', 'line 1');

      const result = fixer.applyFix(code, violation);

      // Should not add duplicate catch
      expect(result.code.match(/\.catch/g)?.length ?? 0).toBeLessThanOrEqual(1);
    });

    it('fixes #4243: semicolon-terminated .then() chain gets .catch (not a TODO fallback)', () => {
      // Regression: the old regex only matched a trailing `)` with no
      // semicolon, so `p.then(f);` silently fell back to a TODO comment.
      const code = `p.then(f);`;
      const violation = createViolation('error-handling', 'line 1');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code).toContain('p.then(f).catch(');
      expect(result.code).not.toContain('TODO');
    });

    it('adds exactly one .catch to the outermost .then() of a multi-line chain', () => {
      const code = `a\n  .then(f)\n  .then(g);`;
      const violation = createViolation('error-handling', 'line 1');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code.match(/\.catch/g)?.length ?? 0).toBe(1);
      expect(result.code.trimEnd().endsWith('.catch((err) => { console.error(err); });')).toBe(
        true
      );
    });

    it('inner-then guard: a.then(f).then(g) gets exactly one .catch at the end', () => {
      const code = `a.then(f).then(g);`;
      const violation = createViolation('error-handling', 'line 1');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code.match(/\.catch/g)?.length ?? 0).toBe(1);
      expect(result.code).toBe(`a.then(f).then(g).catch((err) => { console.error(err); });`);
    });

    it('regression green: .then() with no trailing semicolon still gets .catch', () => {
      const code = `p.then(f)`;
      const violation = createViolation('error-handling', 'line 1');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code).toContain('p.then(f).catch(');
    });

    it('regression green: chain with existing .catch gets no duplicate .catch', () => {
      // No qualifying unhandled `.then()` remains, so this falls back to the
      // TODO-comment fixer (same fallback contract as every other fixer) —
      // the original statement text itself is not rewritten.
      const code = `promise.then(() => {}).catch(() => {});`;
      const violation = createViolation('error-handling', 'line 1');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code).toContain(code);
      expect(result.code.match(/\.catch/g)?.length ?? 0).toBe(1);
    });
  });

  // ===========================================================================
  // no-secrets Fixes
  // ===========================================================================

  describe('no-secrets fixes', () => {
    it('replaces hardcoded secret with env var', () => {
      const code = `const apiKey = 'sk-TESTFAKE_not_real_0';`;
      const violation = createViolation('no-secrets', 'line 1');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code).toContain('process.env');
      expect(result.code).toContain('API_KEY');
    });
  });

  // ===========================================================================
  // Fallback Behavior
  // ===========================================================================

  describe('fallback behavior', () => {
    it('adds TODO comment for unknown principle', () => {
      const code = `const x = 1;`;
      const violation = createViolation('unknown-principle', 'line 1', 'Fix the issue');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code).toContain('// TODO');
      expect(result.code).toContain('unknown-principle');
    });

    it('adds comment at file start when no location', () => {
      const code = `const x = 1;`;
      const violation = createViolation('some-principle', undefined, 'General fix');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(true);
      expect(result.code.startsWith('// TODO')).toBe(true);
    });

    it('handles invalid line numbers gracefully', () => {
      const code = `const x = 1;`;
      const violation = createViolation('some-principle', 'line 999');

      const result = fixer.applyFix(code, violation);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid line');
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe('error handling', () => {
    it('handles malformed code gracefully', () => {
      const code = `const x = {{{`;
      const violation = createViolation('no-console', 'line 1');

      const result = fixer.applyFix(code, violation);

      // Should not throw, returns original code
      expect(result.code).toBeDefined();
    });
  });
});

// =============================================================================
// Integration with applyFix helper
// =============================================================================

describe('applyFix helper integration', () => {
  it('exports from helpers work', async () => {
    const { applyFix, applyFixWithResult, resetAstFixer } =
      await import('./constitutional-critic-helpers.js');

    expect(typeof applyFix).toBe('function');
    expect(typeof applyFixWithResult).toBe('function');
    expect(typeof resetAstFixer).toBe('function');
  });
});
