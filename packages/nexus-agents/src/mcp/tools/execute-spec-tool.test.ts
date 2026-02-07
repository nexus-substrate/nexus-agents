/**
 * Tests for execute_spec MCP tool.
 *
 * (Source: Issue #853 — Phase 5 of AI Software Factory Epic #843)
 */

import { describe, it, expect } from 'vitest';
import { ExecuteSpecInputSchema } from './execute-spec-tool.js';

// ============================================================================
// Schema Validation
// ============================================================================

describe('ExecuteSpecInputSchema', () => {
  it('accepts valid spec input', () => {
    const result = ExecuteSpecInputSchema.safeParse({
      spec: '# Feature\n\n## Requirements\n- Build it',
    });
    expect(result.success).toBe(true);
  });

  it('accepts spec with dryRun flag', () => {
    const result = ExecuteSpecInputSchema.safeParse({
      spec: '# Feature',
      dryRun: true,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.dryRun).toBe(true);
  });

  it('defaults dryRun to false', () => {
    const result = ExecuteSpecInputSchema.safeParse({
      spec: '# Feature',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.dryRun).toBe(false);
  });

  it('rejects empty spec', () => {
    const result = ExecuteSpecInputSchema.safeParse({ spec: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing spec', () => {
    const result = ExecuteSpecInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects spec exceeding max length', () => {
    const result = ExecuteSpecInputSchema.safeParse({
      spec: 'x'.repeat(50_001),
    });
    expect(result.success).toBe(false);
  });
});
