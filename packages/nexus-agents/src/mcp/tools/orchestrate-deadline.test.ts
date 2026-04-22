/**
 * Tests for the orchestrate wall-clock deadline safeguard (sub-issue B of #2104).
 *
 * The full handler is exercised in orchestrate.test.ts; this file narrowly
 * covers the timeout-path helper that shapes the partial OrchestrateOutput
 * returned when the outer race fires before executeOrchestration settles.
 */

import { describe, it, expect } from 'vitest';
import { buildTimeoutOrchestrationResult, OrchestrateOutputSchema } from './orchestrate.js';

describe('buildTimeoutOrchestrationResult (#2104 sub-issue B)', () => {
  it('returns an ok Result with a schema-valid OrchestrateOutput', () => {
    const result = buildTimeoutOrchestrationResult(
      'task-timeout-1',
      590_000,
      'orchestration overall deadline exceeded'
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return; // type narrow

    const parsed = OrchestrateOutputSchema.safeParse(result.value);
    if (!parsed.success) {
      throw new Error(`Schema validation failed: ${JSON.stringify(parsed.error.issues)}`);
    }
    expect(parsed.success).toBe(true);
  });

  it('populates metadata.timeoutReason so clients can distinguish truncated runs', () => {
    const result = buildTimeoutOrchestrationResult('task-1', 1_234, 'deadline reached');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.metadata.timeoutReason).toBe('deadline reached');
  });

  it('records the elapsed ms in metadata.durationMs', () => {
    const result = buildTimeoutOrchestrationResult('task-2', 42_000, 'reason');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.metadata.durationMs).toBe(42_000);
  });

  it('leaves result undefined and stepsCompleted at 0 (explicit truncation signal)', () => {
    const result = buildTimeoutOrchestrationResult('task-3', 500, 'reason');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.result).toBeUndefined();
    expect(result.value.stepsCompleted).toBe(0);
  });

  it("echoes the reason into analysis.approach so it's surfaced even if a client ignores metadata", () => {
    const result = buildTimeoutOrchestrationResult('task-4', 1, 'overall deadline exceeded');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.analysis.approach).toContain('overall deadline exceeded');
  });

  it('uses the minimum-allowed complexity (1) and taskType "unknown" as truncated-run sentinels', () => {
    // Schema min for complexity is 1; the distinguishing signal for a
    // truncated run is metadata.timeoutReason, not a 0 complexity.
    const result = buildTimeoutOrchestrationResult('task-5', 100, 'x');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.analysis.complexity).toBe(1);
    expect(result.value.analysis.taskType).toBe('unknown');
  });

  it('carries the taskId through to both the output root and analysis.taskId', () => {
    const result = buildTimeoutOrchestrationResult('task-trace-me', 100, 'x');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.taskId).toBe('task-trace-me');
    expect(result.value.analysis.taskId).toBe('task-trace-me');
  });
});
