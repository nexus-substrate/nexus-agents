/**
 * A workflow whose steps failed must not report `status: 'completed'` (#4351).
 *
 * `run-workflow.ts` sets `status: 'completed'` unconditionally once the runner
 * returns, and `WorkflowResult` carries no overall success field — only
 * per-step `status: 'success' | 'failed' | 'skipped'`. So a run in which every
 * step failed is surfaced to the caller as a completed workflow, and an
 * operator (or an agent) scanning the top-level status sees success.
 *
 * That is the fail-closed gap #4351 reported from a live session: "the MCP
 * orchestration surfaces can report a successful/complete outer job even when
 * no model work completed".
 *
 * @module mcp/tools/run-workflow-failed-status.test
 */

import { describe, it, expect } from 'vitest';
import { deriveWorkflowStatus } from './run-workflow-helpers.js';

describe('deriveWorkflowStatus (#4351)', () => {
  it('reports failed when every step failed', () => {
    expect(deriveWorkflowStatus([{ status: 'failed' }, { status: 'failed' }])).toBe('failed');
  });

  it('reports failed when any step failed', () => {
    // Partial success is not success at the job boundary — a caller that reads
    // only the top-level status would otherwise act on incomplete work.
    expect(deriveWorkflowStatus([{ status: 'success' }, { status: 'failed' }])).toBe('failed');
  });

  it('reports completed when every step succeeded', () => {
    expect(deriveWorkflowStatus([{ status: 'success' }, { status: 'success' }])).toBe('completed');
  });

  it('treats skipped steps as non-failing', () => {
    // A skipped step is a deliberate control-flow outcome, not an error.
    expect(deriveWorkflowStatus([{ status: 'success' }, { status: 'skipped' }])).toBe('completed');
  });

  it('reports failed for an empty step list', () => {
    // No steps ran at all. #4351's live case: a panel that produced nothing
    // must not read as a completed job.
    expect(deriveWorkflowStatus([])).toBe('failed');
  });
});

describe('graph workflow status derivation (#4351)', () => {
  // Same defect in run-graph-workflow: the executor returns ok() even when
  // nodes failed (its err() paths cover checkpoint/validation/timeout only),
  // and the tool reported 'completed' regardless.
  const derive = (
    nodes: readonly { status: 'success' | 'failed' | 'skipped' | 'interrupted' }[]
  ): string => (nodes.some((n) => n.status === 'failed') ? 'failed' : 'completed');

  it('reports failed when a node failed', () => {
    expect(derive([{ status: 'success' }, { status: 'failed' }])).toBe('failed');
  });

  it('reports completed when nodes succeeded or skipped', () => {
    expect(derive([{ status: 'success' }, { status: 'skipped' }])).toBe('completed');
  });

  it('does not treat interrupted as failed', () => {
    // The executor signals interrupts separately via `halted`; conflating them
    // would change interrupt semantics this change did not study.
    expect(derive([{ status: 'interrupted' }])).toBe('completed');
  });
});
