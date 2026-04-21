/**
 * Tests for the commit-before-generate pre-phase (#1827).
 *
 * The orchestrator's ANALYSIS_PROMPT requires a `commitment` object with
 * {purpose, approach, differentiation, constraints} before dispatching.
 * These tests lock the schema acceptance (optional for backward compat)
 * and prompt content (must mention all four fields).
 */

import { describe, it, expect } from 'vitest';
import { TaskAnalysisSchema } from './tech-lead-types.js';

// Read ANALYSIS_PROMPT from the module by importing the source as text — tests
// from the tech-lead implementation are not exported directly, so we check via
// file read to lock prompt content.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const TECH_LEAD_SRC = readFileSync(join(__dirname, 'tech-lead.ts'), 'utf-8');

describe('TaskAnalysis commitment (#1827)', () => {
  it('parses analysis output without commitment (backward compat)', () => {
    const legacy: unknown = {
      taskId: 't1',
      complexity: 5,
      taskType: 'code',
      requirements: ['a'],
      risks: ['b'],
      needsDecomposition: false,
      approach: 'direct implementation',
      estimatedEffort: 3,
    };
    const result = TaskAnalysisSchema.safeParse(legacy);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.commitment).toBeUndefined();
    }
  });

  it('parses analysis output with valid commitment', () => {
    const withCommit: unknown = {
      taskId: 't1',
      complexity: 5,
      taskType: 'code',
      requirements: ['a'],
      risks: ['b'],
      needsDecomposition: false,
      approach: 'direct',
      estimatedEffort: 3,
      commitment: {
        purpose: 'Fix the memory leak in the worker pool',
        approach: 'Instrument GC pressure, not refactor the whole pool',
        differentiation:
          'Default refactor would fragment the pool; instead target the specific retain cycle',
        constraints: ['No API break', 'Must land before sprint cutoff'],
      },
    };
    const result = TaskAnalysisSchema.safeParse(withCommit);
    expect(result.success).toBe(true);
    if (result.success) {
      const commit = result.data.commitment;
      expect(commit?.purpose).toContain('memory leak');
      expect(commit?.constraints).toHaveLength(2);
    }
  });

  it('rejects commitment with missing required fields', () => {
    const invalid: unknown = {
      taskId: 't1',
      complexity: 5,
      taskType: 'code',
      requirements: [],
      risks: [],
      needsDecomposition: false,
      approach: 'x',
      estimatedEffort: 1,
      commitment: {
        purpose: 'x',
        // approach missing
        differentiation: 'y',
        constraints: [],
      },
    };
    const result = TaskAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});

describe('ANALYSIS_PROMPT (#1827)', () => {
  it('includes all four commitment field names', () => {
    expect(TECH_LEAD_SRC).toContain('commitment.purpose');
    expect(TECH_LEAD_SRC).toContain('commitment.approach');
    expect(TECH_LEAD_SRC).toContain('commitment.differentiation');
    expect(TECH_LEAD_SRC).toContain('commitment.constraints');
  });

  it('instructs the orchestrator to commit before decomposing', () => {
    expect(TECH_LEAD_SRC).toMatch(/commit to a direction/i);
  });

  it('names failure modes as anti-patterns (frontend-design pattern)', () => {
    expect(TECH_LEAD_SRC).toMatch(/anti-patterns/i);
  });
});
