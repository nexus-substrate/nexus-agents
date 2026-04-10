/**
 * Tests for Task Specialization Matrix.
 *
 * (Source: Issue #858 — Multi-model task specialization)
 */

import { describe, it, expect } from 'vitest';
import {
  TASK_SPECIALIZATION_MATRIX,
  TASK_CATEGORIES,
  getSpecialization,
  detectTaskCategory,
  getTaskCategories,
} from './task-specialization.js';

// ============================================================================
// Matrix Integrity
// ============================================================================

describe('TASK_SPECIALIZATION_MATRIX', () => {
  it('has one entry per task category', () => {
    expect(TASK_SPECIALIZATION_MATRIX.length).toBe(TASK_CATEGORIES.length);
  });

  it('covers all defined task categories', () => {
    const matrixCategories = TASK_SPECIALIZATION_MATRIX.map((s) => s.category);
    for (const category of TASK_CATEGORIES) {
      expect(matrixCategories).toContain(category);
    }
  });

  it('has non-empty keywords for every entry', () => {
    for (const spec of TASK_SPECIALIZATION_MATRIX) {
      expect(spec.keywords.length).toBeGreaterThan(0);
    }
  });

  it('has valid CLI names for primary and secondary', () => {
    const validClis = new Set(['claude', 'gemini', 'codex']);
    for (const spec of TASK_SPECIALIZATION_MATRIX) {
      expect(validClis.has(spec.primaryCli)).toBe(true);
      expect(validClis.has(spec.secondaryCli)).toBe(true);
    }
  });

  it('uses all three CLIs as primary for at least one category', () => {
    const primaries = new Set(TASK_SPECIALIZATION_MATRIX.map((s) => s.primaryCli));
    expect(primaries).toContain('claude');
    expect(primaries).toContain('codex');
    expect(primaries).toContain('gemini');
  });

  it('has bonus values between 0 and 20', () => {
    for (const spec of TASK_SPECIALIZATION_MATRIX) {
      expect(spec.bonus).toBeGreaterThanOrEqual(0);
      expect(spec.bonus).toBeLessThanOrEqual(20);
    }
  });

  it('aligns bonuses with empirical weather data (#1454)', () => {
    // Categories with n>=50 empirical evidence get bonus=15
    const codeGen = TASK_SPECIALIZATION_MATRIX.find((s) => s.category === 'code_generation')!;
    expect(codeGen.bonus).toBe(15);
    expect(codeGen.primaryCli).toBe('codex'); // 91.9%, n=408

    const codeReview = TASK_SPECIALIZATION_MATRIX.find((s) => s.category === 'code_review')!;
    expect(codeReview.bonus).toBe(15);
    expect(codeReview.primaryCli).toBe('codex'); // 88.3%, n=94

    const testing = TASK_SPECIALIZATION_MATRIX.find((s) => s.category === 'testing')!;
    expect(testing.bonus).toBe(15);
    expect(testing.primaryCli).toBe('codex'); // 91.6%, n=143

    const exploration = TASK_SPECIALIZATION_MATRIX.find((s) => s.category === 'exploration')!;
    expect(exploration.bonus).toBe(15);
    expect(exploration.primaryCli).toBe('gemini'); // 98.5%, n=202

    const planning = TASK_SPECIALIZATION_MATRIX.find((s) => s.category === 'planning')!;
    expect(planning.bonus).toBe(10);
    expect(planning.primaryCli).toBe('claude'); // 92.0%, n=274
  });

  it('keeps low-sample categories unchanged (#1454)', () => {
    // Categories with n<50 keep original bonus=10
    const research = TASK_SPECIALIZATION_MATRIX.find((s) => s.category === 'research')!;
    expect(research.bonus).toBe(15); // n=38, but was already 15 pre-#1454

    const documentation = TASK_SPECIALIZATION_MATRIX.find((s) => s.category === 'documentation')!;
    expect(documentation.bonus).toBe(10); // n=35, kept as-is

    const architecture = TASK_SPECIALIZATION_MATRIX.find((s) => s.category === 'architecture')!;
    expect(architecture.bonus).toBe(10); // n=24, kept as-is

    const securityReview = TASK_SPECIALIZATION_MATRIX.find(
      (s) => s.category === 'security_review'
    )!;
    expect(securityReview.bonus).toBe(5); // codex 60% (n=5) primary, low confidence
  });
});

// ============================================================================
// getSpecialization
// ============================================================================

describe('getSpecialization', () => {
  it('returns specialization for architecture', () => {
    const spec = getSpecialization('architecture');
    expect(spec.primaryCli).toBe('gemini');
    expect(spec.category).toBe('architecture');
  });

  it('returns specialization for code_generation', () => {
    const spec = getSpecialization('code_generation');
    expect(spec.primaryCli).toBe('codex');
  });

  it('returns specialization for research', () => {
    const spec = getSpecialization('research');
    expect(spec.primaryCli).toBe('gemini');
  });

  it('throws for unknown category', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    expect(() => getSpecialization('unknown' as any)).toThrow();
  });
});

// ============================================================================
// detectTaskCategory
// ============================================================================

describe('detectTaskCategory', () => {
  it('detects architecture from task description', () => {
    const match = detectTaskCategory('Design the system architecture for auth');
    expect(match).not.toBeNull();
    expect(match?.category).toBe('architecture');
    expect(match?.primaryCli).toBe('gemini');
  });

  it('detects code_generation from task description', () => {
    const match = detectTaskCategory('Implement user login endpoint');
    expect(match).not.toBeNull();
    expect(match?.category).toBe('code_generation');
    expect(match?.primaryCli).toBe('codex');
  });

  it('detects research from task description', () => {
    const match = detectTaskCategory('Research best practices for caching');
    expect(match).not.toBeNull();
    expect(match?.category).toBe('research');
    expect(match?.primaryCli).toBe('gemini');
  });

  it('detects security_review from task description', () => {
    const match = detectTaskCategory('Audit security of the API endpoints');
    expect(match).not.toBeNull();
    expect(match?.category).toBe('security_review');
    expect(match?.primaryCli).toBe('codex');
  });

  it('detects devops for security scanning tasks (#1421)', () => {
    const match = detectTaskCategory('Run a security scan on the Docker images');
    expect(match).not.toBeNull();
    expect(match?.category).toBe('devops');
  });

  it('detects devops for vulnerability scanning (#1421)', () => {
    const match = detectTaskCategory('Run vulnerability scan with grype');
    expect(match).not.toBeNull();
    expect(match?.category).toBe('devops');
  });

  it('detects security_review for code-level security analysis (#1421)', () => {
    const match = detectTaskCategory('Perform a security audit for XSS and CSRF injection');
    expect(match).not.toBeNull();
    expect(match?.category).toBe('security_review');
  });

  it('detects devops for SAST/DAST tooling (#1421)', () => {
    const match = detectTaskCategory('Set up semgrep SAST pipeline');
    expect(match).not.toBeNull();
    expect(match?.category).toBe('devops');
  });

  it('detects testing from task description', () => {
    const match = detectTaskCategory('Write tests for the auth module');
    expect(match).not.toBeNull();
    expect(match?.category).toBe('testing');
    expect(match?.primaryCli).toBe('codex');
  });

  it('detects documentation from task description', () => {
    const match = detectTaskCategory('Write documentation for the API');
    expect(match).not.toBeNull();
    expect(match?.category).toBe('documentation');
    expect(match?.primaryCli).toBe('gemini');
  });

  it('returns null for unrecognized task', () => {
    const match = detectTaskCategory('hello world');
    expect(match).toBeNull();
  });

  it('is case-insensitive', () => {
    const match = detectTaskCategory('ARCHITECT the new payment system');
    expect(match).not.toBeNull();
    expect(match?.category).toBe('architecture');
  });

  it('includes bonus in match result', () => {
    const match = detectTaskCategory('Design the system architecture');
    expect(match?.bonus).toBeGreaterThan(0);
  });
});

// ============================================================================
// getTaskCategories
// ============================================================================

describe('getTaskCategories', () => {
  it('returns all categories', () => {
    const categories = getTaskCategories();
    expect(categories.length).toBe(10);
    expect(categories).toContain('architecture');
    expect(categories).toContain('research');
  });
});
