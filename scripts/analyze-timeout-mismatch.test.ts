import { describe, it, expect } from 'vitest';
import {
  buildReport,
  isTimeoutShaped,
  summariseByTool,
  type MismatchEvent,
  GATE_MIN_EVENTS_PER_TOOL,
  GATE_MIN_TIMEOUT_ERROR_PCT,
  GATE_MIN_WINDOW_DAYS,
} from './analyze-timeout-mismatch.js';

function makeEvent(overrides: Partial<MismatchEvent> = {}): MismatchEvent {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2)}`,
    toolName: 'run_workflow',
    configuredTimeoutMs: 900_000,
    mcpSdkDefaultMs: 60_000,
    startedAt: '2026-05-10T00:00:00.000Z',
    endedAt: '2026-05-10T00:00:01.000Z',
    durationMs: 1_000,
    outcome: 'success',
    ...overrides,
  };
}

describe('isTimeoutShaped', () => {
  it('matches errorCategory === "timeout"', () => {
    expect(isTimeoutShaped(makeEvent({ outcome: 'error', errorCategory: 'timeout' }))).toBe(true);
  });

  it('matches "timed out" in errorMessage', () => {
    expect(
      isTimeoutShaped(
        makeEvent({ outcome: 'error', errorMessage: 'Request timed out after 60000ms' })
      )
    ).toBe(true);
  });

  it('matches MCP error -32001 in errorMessage', () => {
    expect(
      isTimeoutShaped(
        makeEvent({ outcome: 'error', errorMessage: 'MCP error -32001: Request timed out' })
      )
    ).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(
      isTimeoutShaped(
        makeEvent({
          outcome: 'error',
          errorCategory: 'internal',
          errorMessage: 'Validation failed',
        })
      )
    ).toBe(false);
  });

  it('does not match successful events even with timeout-shaped message', () => {
    // success outcome wins — the event completed.
    expect(
      isTimeoutShaped(makeEvent({ outcome: 'success', errorMessage: 'timed out (recovered)' }))
    ).toBe(false);
  });
});

describe('summariseByTool', () => {
  it('groups events by toolName and computes percentile timing', () => {
    const events = [
      makeEvent({ toolName: 'orchestrate', durationMs: 100 }),
      makeEvent({ toolName: 'orchestrate', durationMs: 200 }),
      makeEvent({ toolName: 'orchestrate', durationMs: 1000 }),
      makeEvent({ toolName: 'consensus_vote', durationMs: 500 }),
    ];
    const summary = summariseByTool(events);

    expect(summary).toHaveLength(2);
    const orch = summary.find((s) => s.toolName === 'orchestrate');
    expect(orch?.events).toBe(3);
    expect(orch?.p50DurationMs).toBe(200);
    expect(orch?.p95DurationMs).toBe(1000);
  });

  it('sets gateFires only when both event count and timeout-error % thresholds met', () => {
    const enough = Array.from({ length: GATE_MIN_EVENTS_PER_TOOL }, (_, i) =>
      makeEvent({
        toolName: 'run_workflow',
        outcome: 'error',
        errorCategory: i < 5 ? 'timeout' : 'internal',
      })
    );
    const summary = summariseByTool(enough);
    const wf = summary.find((s) => s.toolName === 'run_workflow');
    // 5 of 10 errors are timeouts → 50%, well above the 20% threshold
    expect(wf?.gateFires).toBe(true);
    expect(wf?.timeoutErrorPct).toBeGreaterThanOrEqual(GATE_MIN_TIMEOUT_ERROR_PCT);
  });

  it('does NOT fire the gate when sample size is below floor', () => {
    const tooFew = Array.from({ length: GATE_MIN_EVENTS_PER_TOOL - 1 }, () =>
      makeEvent({ toolName: 'run_workflow', outcome: 'error', errorCategory: 'timeout' })
    );
    const summary = summariseByTool(tooFew);
    expect(summary.find((s) => s.toolName === 'run_workflow')?.gateFires).toBe(false);
  });

  it('does NOT fire the gate when timeout-error % is below threshold', () => {
    const events = Array.from({ length: 20 }, (_, i) =>
      makeEvent({
        toolName: 'run_workflow',
        outcome: 'error',
        // Only 10% timeout-shaped
        errorCategory: i < 2 ? 'timeout' : 'internal',
      })
    );
    const summary = summariseByTool(events);
    expect(summary.find((s) => s.toolName === 'run_workflow')?.gateFires).toBe(false);
  });
});

describe('buildReport verdicts', () => {
  it('returns insufficient-data with empty events', () => {
    const report = buildReport('test.jsonl', []);
    expect(report.verdict).toBe('insufficient-data');
    expect(report.totalEvents).toBe(0);
  });

  it('returns insufficient-data when window is below the minimum even if per-tool gate would fire', () => {
    // Lots of timeout-shaped events, all on the same day → window=0 → gate cannot fire.
    const sameDay = Array.from({ length: 20 }, () =>
      makeEvent({
        toolName: 'run_workflow',
        outcome: 'error',
        errorCategory: 'timeout',
        startedAt: '2026-05-10T00:00:00.000Z',
      })
    );
    const report = buildReport('test.jsonl', sameDay);
    expect(report.verdict).toBe('insufficient-data');
    expect(report.verdictReason).toContain(`≥${String(GATE_MIN_WINDOW_DAYS)} days`);
  });

  it('returns gate-fires when window ≥ minimum AND per-tool criteria met', () => {
    const wideWindow: MismatchEvent[] = [];
    const start = Date.parse('2026-05-01T00:00:00.000Z');
    for (let i = 0; i < 20; i++) {
      wideWindow.push(
        makeEvent({
          toolName: 'run_workflow',
          outcome: 'error',
          errorCategory: 'timeout',
          startedAt: new Date(start + i * 86_400_000 * 0.5).toISOString(),
        })
      );
    }
    const report = buildReport('test.jsonl', wideWindow);
    expect(report.windowDays).toBeGreaterThanOrEqual(GATE_MIN_WINDOW_DAYS);
    expect(report.verdict).toBe('gate-fires');
    expect(report.verdictReason).toContain('run_workflow');
  });

  it('returns no-mismatch-signal when sample is sufficient but errors are not timeout-shaped', () => {
    const wideWindow: MismatchEvent[] = [];
    const start = Date.parse('2026-05-01T00:00:00.000Z');
    for (let i = 0; i < 20; i++) {
      wideWindow.push(
        makeEvent({
          toolName: 'run_workflow',
          outcome: 'error',
          errorCategory: 'internal', // not timeout
          startedAt: new Date(start + i * 86_400_000 * 0.5).toISOString(),
        })
      );
    }
    const report = buildReport('test.jsonl', wideWindow);
    expect(report.verdict).toBe('no-mismatch-signal');
  });
});
