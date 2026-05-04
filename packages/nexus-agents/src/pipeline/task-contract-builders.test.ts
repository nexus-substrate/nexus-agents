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
    expect(contract.capabilityGaps.allSatisfied).toBe(true);
    expect(contract.capabilityGaps.gaps).toEqual([]);
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
