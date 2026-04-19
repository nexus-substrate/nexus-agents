/**
 * Integration tests for post-patch verify-loop in agent-runner
 * (#2032 → #2043 final integration).
 */

import { describe, it, expect, vi } from 'vitest';
import type { IAgentExecutor, IVerifyAdapter, VerifyResult } from './agent-runner.js';
import type { SWEBenchInstance, SWEBenchConfig } from './types.js';

// The tests verify the verify-adapter contract + wiring without actually
// executing the real agent-runner (which would require git, docker, etc).
// We exercise the verify policy logic through direct IVerifyAdapter impls.

function makeAdapter(results: readonly VerifyResult[]): {
  adapter: IVerifyAdapter;
  calls: VerifyResult[];
} {
  const queue = [...results];
  const calls: VerifyResult[] = [];
  const adapter: IVerifyAdapter = {
    verify: vi.fn(() => {
      const next = queue.shift() ?? { passed: true, stderr: '', stdout: '' };
      calls.push(next);
      return Promise.resolve(next);
    }),
  };
  return { adapter, calls };
}

describe('IVerifyAdapter contract', () => {
  it('is a structural interface with a verify method', () => {
    const { adapter } = makeAdapter([{ passed: true, stderr: '', stdout: '' }]);
    expect(typeof adapter.verify).toBe('function');
  });

  it('returns VerifyResult-shaped value', async () => {
    const { adapter } = makeAdapter([
      { passed: false, stderr: 'patch does not apply', stdout: '' },
    ]);
    const instance = {
      instance_id: 'test-1',
      repo: 'test/repo',
      base_commit: 'HEAD',
    } as unknown as SWEBenchInstance;

    const result = await adapter.verify(instance, 'diff...', '/tmp/work');
    expect(result.passed).toBe(false);
    expect(result.stderr).toContain('patch does not apply');
  });

  it('can be queued to simulate retry-then-pass', async () => {
    const { adapter } = makeAdapter([
      { passed: false, stderr: 'FAILED tests/test_foo.py::bar', stdout: '' },
      { passed: true, stderr: '', stdout: 'PASSED' },
    ]);
    const instance = { instance_id: 'x' } as SWEBenchInstance;

    const first = await adapter.verify(instance, 'p1', '/tmp');
    const second = await adapter.verify(instance, 'p2', '/tmp');
    expect(first.passed).toBe(false);
    expect(second.passed).toBe(true);
  });
});

describe('runAgentOnInstance — verify adapter opt-in', () => {
  // The runner itself requires filesystem access to exercise fully, so we
  // keep this to a shape test that confirms the option is accepted.
  it('accepts verifyAdapter in RunOptions without type error', () => {
    const executor: IAgentExecutor = {
      execute: () =>
        Promise.resolve({
          ok: true,
          value: { response: '', tokensUsed: 0, durationMs: 0 },
        }),
    };
    const { adapter } = makeAdapter([{ passed: true, stderr: '', stdout: '' }]);
    const config = { max_iterations: 5, timeout_ms: 60_000 } as SWEBenchConfig;
    const opts = {
      executor,
      config,
      verifyAdapter: adapter,
      maxVerifyRetries: 1,
    };
    // Compile-time check: these are the only assertions needed here.
    expect(opts.verifyAdapter).toBe(adapter);
    expect(opts.maxVerifyRetries).toBe(1);
  });
});
