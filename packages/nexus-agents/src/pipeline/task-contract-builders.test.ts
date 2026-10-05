/**
 * Tests for `buildBaseTaskContract`.
 * (Source: Issue #2343, audit-epic #2337)
 */

import { describe, it, expect } from 'vitest';
import { analyzeForContract, buildBaseTaskContract } from './task-contract-builders.js';
import { createSharedTaskAnalyzer } from '../core/task-analysis/shared-task-analyzer.js';
import { detectCapabilityGaps } from '../core/task-analysis/capability-gap-detector.js';
import { TaskContractSchema } from './task-contract.js';

describe('buildBaseTaskContract', () => {
  const baseInput = {
    idPrefix: 'orchestrate',
    task: 'Implement feature X',
    analysis: { complexity: 'high', taskType: 'orchestration', ambiguityScore: 0.3 },
    metadata: { source: 'orchestrate', extra: 'value' },
  } as const;

  it('produces a TaskContract that validates against the canonical schema', () => {
    const result = TaskContractSchema.safeParse(buildBaseTaskContract(baseInput));
    expect(result.success).toBe(true);
  });

  it('id is prefixed and includes a uuid suffix', () => {
    const contract = buildBaseTaskContract(baseInput);
    expect(contract.id).toMatch(/^orchestrate-[0-9a-f]{8}$/);
  });

  it('createdAt and updatedAt are equal at construction time', () => {
    const contract = buildBaseTaskContract(baseInput);
    expect(contract.createdAt).toBe(contract.updatedAt);
  });

  it('metadata is copied (not aliased) so callers cannot mutate stored state', () => {
    const metadata: Record<string, unknown> = { source: 'orchestrate' };
    const contract = buildBaseTaskContract({ ...baseInput, metadata });
    metadata['after'] = 'mutated';
    expect(contract.metadata).not.toHaveProperty('after');
  });

  it('measures capabilities while retaining empty artifacts and unrecognized scope', () => {
    const contract = buildBaseTaskContract(baseInput);
    const analysis = createSharedTaskAnalyzer().analyze(baseInput.task);
    expect(contract.constraints).toEqual({ scope: [] });
    expect(contract.requiredCapabilities).toEqual(analysis.requiredCapabilities);
    expect(contract.capabilityGaps).toEqual({
      ...detectCapabilityGaps(analysis.requiredCapabilities),
      gapsMeasured: true,
    });
    expect(contract.artifacts).toEqual([]);
  });

  it("status is 'approved' (skips intake/clarifying/planning per V2 entrypoint convention)", () => {
    const contract = buildBaseTaskContract(baseInput);
    expect(contract.status).toBe('approved');
  });

  it('preserves the analysis summary verbatim', () => {
    const contract = buildBaseTaskContract({
      ...baseInput,
      analysis: { complexity: 'low', taskType: 'routing', ambiguityScore: 0.1 },
    });
    expect(contract.analysis).toEqual({
      complexity: 'low',
      taskType: 'routing',
      ambiguityScore: 0.1,
    });
  });
});

// ============================================================================
// Capability-gap verdicts are measured (#5923)
// ============================================================================

describe('capabilityGaps is measured (#5923)', () => {
  const baseInput = {
    idPrefix: 'orchestrate',
    task: 'Implement feature X',
    analysis: { complexity: 'high', taskType: 'orchestration', ambiguityScore: 0.3 },
    metadata: { source: 'orchestrate', extra: 'value' },
  } as const;

  it('reports a missing capability even when given only a legacy analysis summary', () => {
    const contract = buildBaseTaskContract({
      ...baseInput,
      task: 'Extract class and function symbols from src/parser.py',
    });
    expect(contract.capabilityGaps.allSatisfied).toBe(false);
    expect(contract.capabilityGaps.gapsMeasured).toBe(true);
    expect(contract.capabilityGaps.gaps).toEqual([
      expect.objectContaining({ name: 'extract_symbols:.py', origin: 'inferred' }),
    ]);
  });

  it('reports availability for inferred requirements instead of the old empty literal', () => {
    const contract = buildBaseTaskContract(baseInput);
    expect(contract.capabilityGaps.available.tools.length).toBeGreaterThan(0);
    expect(contract.capabilityGaps.gapsMeasured).toBe(true);
  });

  it('the schema requires the flag, so a contract cannot omit it', () => {
    // Optional would let a producer stay silent, which is the state this
    // change exists to remove.
    const contract = buildBaseTaskContract(baseInput);
    const withoutFlag = {
      ...contract,
      capabilityGaps: {
        available: contract.capabilityGaps.available,
        gaps: contract.capabilityGaps.gaps,
        allSatisfied: contract.capabilityGaps.allSatisfied,
      },
    };
    expect(TaskContractSchema.safeParse(withoutFlag).success).toBe(false);
    expect(TaskContractSchema.safeParse(contract).success).toBe(true);
  });
});

// ============================================================================
// analysis is derived from the task, not asserted (#5924)
// ============================================================================

describe('analyzeForContract (#5924)', () => {
  // `v2-orchestrate.ts` recorded EVERY task as
  // `{ complexity: 'high', taskType: 'orchestration', ambiguityScore: 0.3 }`
  // and `v2-delegate.ts` every task as
  // `{ complexity: 'moderate', taskType: 'routing', ambiguityScore: 0.1 }`.
  // A fixed ambiguityScore that no task can move is a constant wearing the
  // name of a measurement — the shape that inflated the metric it fed in
  // #5812.

  it('gives different tasks different analyses', () => {
    // The assertion the old literal could never satisfy.
    const trivial = analyzeForContract('fix a typo in README.md');
    const hard = analyzeForContract(
      'Design and implement a distributed consensus protocol with Byzantine fault tolerance, ' +
        'formal verification of the safety properties, and a migration path for existing nodes'
    );
    expect(trivial).not.toEqual(hard);
  });

  it('does not report the old orchestrate literal for a trivial task', () => {
    const analysis = analyzeForContract('fix a typo in README.md');
    expect(analysis).not.toEqual({
      complexity: 'high',
      taskType: 'orchestration',
      ambiguityScore: 0.3,
    });
  });

  it('produces an ambiguityScore the task can actually move', () => {
    // Not just "different objects" — the specific field that was frozen.
    const a = analyzeForContract('x');
    const b = analyzeForContract(
      'Refactor the authentication middleware to support OAuth2 device flow, keeping the ' +
        'existing token-file fallback and adding tests for the expiry path'
    );
    expect(a.ambiguityScore).not.toBe(b.ambiguityScore);
  });

  it('stays within the schema the contract declares', () => {
    // ambiguityScore is z.number().min(0).max(1); complexity/taskType are
    // z.string().min(1). A derived value has to satisfy what a literal did.
    for (const task of ['x', 'fix a typo', 'implement a feature with tests and docs']) {
      const a = analyzeForContract(task);
      expect(a.ambiguityScore).toBeGreaterThanOrEqual(0);
      expect(a.ambiguityScore).toBeLessThanOrEqual(1);
      expect(a.complexity.length).toBeGreaterThan(0);
      expect(a.taskType.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic for the same task', () => {
    expect(analyzeForContract('implement a feature')).toEqual(
      analyzeForContract('implement a feature')
    );
  });
});
