/**
 * Context Distillation Tests
 *
 * Tests for phase output distillation — extracting structured
 * summaries from verbose phase outputs.
 */

import { describe, it, expect } from 'vitest';
import {
  distillPhaseOutput,
  formatDistillation,
  compressionRatio,
  PhaseDistillationSchema,
} from './context-distillation.js';

describe('distillPhaseOutput', () => {
  it('extracts decisions from phase output', () => {
    const output = `After reviewing the options, I decided to use PostgreSQL for the
    database layer. We also chose TypeScript over JavaScript for type safety.
    The team selected Vitest as the testing framework.`;

    const result = distillPhaseOutput(output);
    expect(result.decisions.length).toBeGreaterThan(0);
    expect(result.decisions.some((d) => d.toLowerCase().includes('postgresql'))).toBe(true);
  });

  it('extracts artifacts from phase output', () => {
    const output = `Created file src/models/user.ts with the User schema.
    Generated the migration script at db/migrations/001_users.sql.
    Wrote tests in src/models/user.test.ts.`;

    const result = distillPhaseOutput(output);
    expect(result.artifacts.length).toBeGreaterThan(0);
    expect(result.artifacts.some((a) => a.includes('.ts') || a.includes('.sql'))).toBe(true);
  });

  it('extracts errors from phase output', () => {
    const output = `The build succeeded but encountered issues.
    Error: Cannot find module 'zod' in the test environment.
    Could not connect to the database on port 5432.`;

    const result = distillPhaseOutput(output);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('extracts findings from phase output', () => {
    const output = `During the security review, I found a SQL injection
    vulnerability in the login handler. Also discovered that the API
    endpoint lacks rate limiting. Detected an open redirect on /callback.`;

    const result = distillPhaseOutput(output);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.findings.some((f) => f.toLowerCase().includes('sql injection'))).toBe(true);
  });

  it('generates a summary from the first sentence', () => {
    const output = 'The implementation is complete and all tests pass. Here are the details...';
    const result = distillPhaseOutput(output);
    expect(result.summary).toContain('implementation is complete');
  });

  it('truncates summary for long outputs without sentences', () => {
    const output = 'A'.repeat(300);
    const result = distillPhaseOutput(output);
    expect(result.summary.length).toBeLessThanOrEqual(205);
    expect(result.summary.endsWith('...')).toBe(true);
  });

  it('respects maxItemsPerCategory', () => {
    const output = Array.from(
      { length: 10 },
      (_, i) => `Found vulnerability ${String(i + 1)} in module ${String(i + 1)}.`
    ).join(' ');

    const result = distillPhaseOutput(output, 3);
    expect(result.findings.length).toBeLessThanOrEqual(3);
  });

  it('returns empty arrays for clean output', () => {
    const output = 'Everything looks good. No issues to report.';
    const result = distillPhaseOutput(output);
    expect(result.errors).toHaveLength(0);
  });

  it('output matches PhaseDistillationSchema', () => {
    const output = 'Decided to use React. Created file app.tsx. Found a bug in routing.';
    const result = distillPhaseOutput(output);
    expect(PhaseDistillationSchema.safeParse(result).success).toBe(true);
  });
});

describe('formatDistillation', () => {
  it('formats distillation with phase label', () => {
    const distillation = {
      decisions: ['Use PostgreSQL'],
      artifacts: ['schema.sql'],
      findings: ['Missing index on users table'],
      errors: [],
      summary: 'Database design complete.',
    };

    const formatted = formatDistillation(distillation, 'Research Phase');
    expect(formatted).toContain('## Research Phase Summary');
    expect(formatted).toContain('### Decisions');
    expect(formatted).toContain('- Use PostgreSQL');
    expect(formatted).toContain('### Artifacts');
    expect(formatted).toContain('### Findings');
    expect(formatted).not.toContain('### Errors');
  });

  it('omits empty categories', () => {
    const distillation = {
      decisions: [],
      artifacts: [],
      findings: [],
      errors: [],
      summary: 'Nothing notable.',
    };

    const formatted = formatDistillation(distillation);
    expect(formatted).toContain('## Prior Phase Summary');
    expect(formatted).not.toContain('### Decisions');
    expect(formatted).not.toContain('### Artifacts');
  });

  it('uses default label when none provided', () => {
    const distillation = {
      decisions: ['Keep it simple'],
      artifacts: [],
      findings: [],
      errors: [],
      summary: 'Done.',
    };

    const formatted = formatDistillation(distillation);
    expect(formatted).toContain('## Prior Phase Summary');
  });
});

describe('compressionRatio', () => {
  it('returns 1 for empty input', () => {
    expect(compressionRatio(0, 0)).toBe(1);
  });

  it('calculates correct ratio', () => {
    expect(compressionRatio(1000, 200)).toBeCloseTo(0.2);
    expect(compressionRatio(1000, 500)).toBeCloseTo(0.5);
  });

  it('returns ratio > 1 if distilled is larger (edge case)', () => {
    expect(compressionRatio(100, 200)).toBeCloseTo(2.0);
  });
});
