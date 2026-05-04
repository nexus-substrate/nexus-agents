/**
 * Builders for `TaskContract` instances.
 *
 * Extracted from `v2-orchestrate.ts` and `v2-delegate.ts`, which previously
 * each had their own near-identical converter. The shared scaffolding (id
 * template, status, empty-default constraints/capabilities/artifacts,
 * timestamps) lives here; callers supply only the fields that genuinely
 * differ between entry points (idPrefix, task description, analysis summary,
 * metadata).
 *
 * (Source: Issue #2343, audit-epic #2337)
 *
 * @module pipeline/task-contract-builders
 */

import { randomUUID } from 'node:crypto';
import type { TaskContract } from './task-contract.js';

/** Inputs needed to build a fresh `'approved'` `TaskContract`. */
export interface BaseTaskContractInput {
  /** Prefix for the auto-generated id (e.g., `'orchestrate'`, `'delegate'`). */
  readonly idPrefix: string;
  /** The task description (free-text). */
  readonly task: string;
  /** Lightweight analysis summary (complexity / taskType / ambiguityScore). */
  readonly analysis: TaskContract['analysis'];
  /** Caller-controlled metadata (source tag + entry-point-specific fields). */
  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * Build a fresh `TaskContract` in the `'approved'` status with empty-default
 * constraints, required capabilities, capability gaps, and artifacts.
 *
 * The two MCP entrypoints (`orchestrate`, `delegate_to_model`) build their
 * task contracts via this helper rather than copy-pasting the full shape.
 * Adding a new field to `TaskContractSchema` only requires updating this one
 * place.
 */
export function buildBaseTaskContract(input: BaseTaskContractInput): TaskContract {
  const now = Date.now();
  return {
    id: `${input.idPrefix}-${randomUUID().slice(0, 8)}`,
    description: input.task,
    status: 'approved',
    analysis: input.analysis,
    constraints: { scope: [] },
    requiredCapabilities: { tools: [], experts: [] },
    capabilityGaps: {
      available: { tools: [], experts: [] },
      gaps: [],
      allSatisfied: true,
    },
    artifacts: [],
    metadata: { ...input.metadata },
    createdAt: now,
    updatedAt: now,
  };
}
