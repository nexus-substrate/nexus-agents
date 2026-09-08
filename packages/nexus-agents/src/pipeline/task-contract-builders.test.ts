/**
 * Tests for `buildBaseTaskContract`.
 * (Source: Issue #2343, audit-epic #2337)
 */

import { describe, it, expect } from 'vitest';
import { buildBaseTaskContract } from './task-contract-builders.js';
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

  it('returns empty defaults for constraints / capabilities / capability gaps / artifacts', () => {
    const contract = buildBaseTaskContract(baseInput);
    expect(contract.constraints.scope).toEqual([]);
    expect(contract.requiredCapabilities).toEqual({ tools: [], experts: [] });
    expect(contract.capabilityGaps.gaps).toEqual([]);
    // `allSatisfied: true` here is NOT a verdict — no detector ran (#5919).
    // This test used to assert only the `true`, which read as "the builder
    // checked and everything was satisfied". `gapsMeasured` is what makes the
    // difference visible, so it is asserted in the same breath.
    expect(contract.capabilityGaps.gapsMeasured).toBe(false);
    expect(contract.capabilityGaps.allSatisfied).toBe(true);
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
// The unmeasured capability-gap verdict is labelled as such (#5919)
// ============================================================================

describe('capabilityGaps is not a measurement here (#5919)', () => {
  const baseInput = {
    idPrefix: 'orchestrate',
    task: 'Implement feature X',
    analysis: { complexity: 'high', taskType: 'orchestration', ambiguityScore: 0.3 },
    metadata: { source: 'orchestrate', extra: 'value' },
  } as const;

  it('never claims a gap detector ran', () => {
    // `gaps: []` with an empty `available` from a detector that ran and one
    // from a builder that never called one are byte-identical on the wire.
    // The only thing separating them is this flag, so a consumer branching on
    // `allSatisfied` alone would be reading a fabricated verdict.
    const contract = buildBaseTaskContract(baseInput);
    expect(contract.capabilityGaps.gapsMeasured).toBe(false);
  });

  it('the empty available set is what makes allSatisfied meaningless', () => {
    // The precondition that makes the flag necessary rather than decorative:
    // `allSatisfied` is computed elsewhere as `gaps.length === 0` over a
    // MEASURED `available` set. Here `available` is empty because nothing
    // looked, not because nothing is available.
    const contract = buildBaseTaskContract(baseInput);
    expect(contract.capabilityGaps.available).toEqual({ tools: [], experts: [] });
    expect(contract.capabilityGaps.gapsMeasured).toBe(false);
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
