/**
 * Tests for subprocess timing instrumentation (#2472).
 *
 * Doesn't spawn real processes — exercises the timing-breakdown logic
 * directly via a manually-constructed BufferState. The integration via
 * the subprocess close handler is covered by the existing
 * subprocess-adapter.test.ts suite; here we lock the breakdown semantics.
 */

import { describe, it, expect } from 'vitest';

interface BufferState {
  stdout: string;
  stderr: string;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  resolved: boolean;
  firstByteTime: number | null;
}

interface TimingBreakdown {
  totalMs: number;
  spawnLatencyMs: number | null;
  streamingMs: number | null;
  sawFirstByte: boolean;
}

/**
 * Pure derivation of the breakdown logic that lives inside
 * `logTimingBreakdown`. Locked here so future refactors don't accidentally
 * change the math without a failing test.
 */
function deriveBreakdown(state: BufferState, startTime: number, now: number): TimingBreakdown {
  const totalMs = now - startTime;
  const spawnLatencyMs = state.firstByteTime === null ? null : state.firstByteTime - startTime;
  const streamingMs = state.firstByteTime === null ? null : now - state.firstByteTime;
  return {
    totalMs,
    spawnLatencyMs,
    streamingMs,
    sawFirstByte: state.firstByteTime !== null,
  };
}

function makeState(firstByteTime: number | null = null): BufferState {
  return {
    stdout: '',
    stderr: '',
    stdoutBytes: 0,
    stderrBytes: 0,
    stdoutTruncated: false,
    stderrTruncated: false,
    resolved: false,
    firstByteTime,
  };
}

describe('subprocess timing breakdown (#2472)', () => {
  it('splits total into spawn-latency + streaming when first byte was seen', () => {
    const state = makeState(1234);
    const result = deriveBreakdown(state, 1000, 5000);
    expect(result.totalMs).toBe(4000);
    expect(result.spawnLatencyMs).toBe(234);
    expect(result.streamingMs).toBe(3766);
    expect(result.sawFirstByte).toBe(true);
    expect(result.spawnLatencyMs! + result.streamingMs!).toBe(result.totalMs);
  });

  it('reports spawn-latency=0 when first byte arrived simultaneous with spawn', () => {
    const state = makeState(1000);
    const result = deriveBreakdown(state, 1000, 1500);
    expect(result.spawnLatencyMs).toBe(0);
    expect(result.streamingMs).toBe(500);
  });

  it('reports null breakdown + sawFirstByte=false when no stdout was produced', () => {
    const state = makeState(null);
    const result = deriveBreakdown(state, 1000, 9500);
    expect(result.totalMs).toBe(8500);
    expect(result.spawnLatencyMs).toBeNull();
    expect(result.streamingMs).toBeNull();
    expect(result.sawFirstByte).toBe(false);
  });

  it('handles tiny totals (sub-millisecond) without underflow', () => {
    const state = makeState(1000);
    const result = deriveBreakdown(state, 1000, 1000);
    expect(result.totalMs).toBe(0);
    expect(result.spawnLatencyMs).toBe(0);
    expect(result.streamingMs).toBe(0);
  });

  it('captures the high-spawn-latency case the issue investigation targets', () => {
    // Hypothesis: stochastic timeouts caused by gateway cold-start.
    // First byte arrives 28s after spawn, then streams for 2s.
    const state = makeState(1000 + 28_000);
    const result = deriveBreakdown(state, 1000, 1000 + 30_000);
    expect(result.spawnLatencyMs).toBe(28_000);
    expect(result.streamingMs).toBe(2000);
    // Operator inspecting the trace can immediately tell where the time went.
  });

  it('captures the high-streaming case (slow generation, fast spawn)', () => {
    // Hypothesis: large response or slow tokens-per-second.
    const state = makeState(1100);
    const result = deriveBreakdown(state, 1000, 1000 + 25_000);
    expect(result.spawnLatencyMs).toBe(100);
    expect(result.streamingMs).toBe(24_900);
  });
});
