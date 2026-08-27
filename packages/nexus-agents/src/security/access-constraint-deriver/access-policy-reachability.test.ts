/**
 * ClawGuard reachability contract (#5022).
 *
 * Every other test in this directory establishes the access policy itself,
 * with `withAccessPolicy(...)`, and then asserts what the enforcer decides.
 * That is the one input production never supplies: `withAccessPolicy` has
 * exactly two production callers, both wrapping in-process orchestrator /
 * expert execution, and an inbound MCP request is a SIBLING async context
 * rather than a descendant of either. So 124 tests passed over a subsystem
 * that was a pass-through for every real dispatch.
 *
 * These tests therefore assert REACHABILITY rather than verdicts: they run a
 * handler through the real middleware stack the way the server does, with no
 * policy in scope, and record what the guard actually does.
 *
 * WHY THIS PINS THE CURRENT (BROKEN) BEHAVIOUR ON PURPOSE. #5022 asks which
 * boundary ClawGuard should guard, and a 7-voter panel split 2-2-1-1 without
 * reaching the supermajority bar, so the question is open. Until it is
 * answered, the failure mode to prevent is a SILENT change: someone
 * establishing a policy at dispatch without deciding the boundary would flip
 * enforcement on for every registered tool. If a change here turns these red,
 * that is the signal — resolve #5022 and rewrite this file to state the new
 * contract. Do not relax an assertion to make it green.
 *
 * @module security/access-constraint-deriver/access-policy-reachability.test
 */

import { describe, it, expect, vi } from 'vitest';
import { withMiddleware } from '../../mcp/middleware/middleware-chain.js';
import { getActivePolicy, withAccessPolicy } from './mcp-guard.js';
import type { TaskAccessPolicy } from './types.js';

function policy(overrides: Partial<TaskAccessPolicy> = {}): TaskAccessPolicy {
  return {
    allowedTools: [],
    allowedPathPatterns: [],
    allowedOperations: '*',
    objectiveHash: 'reachability-fixture',
    derivedAt: '2026-08-27T00:00:00.000-04:00',
    source: 'llm',
    mode: 'enforce',
    ...overrides,
  };
}

function okResult(): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text' as const, text: 'handler-ran' }] };
}

describe('ClawGuard reachability at inbound MCP dispatch (#5022)', () => {
  it('observes no policy in scope when a wrapped tool is dispatched normally', async () => {
    const seen: Array<TaskAccessPolicy | undefined> = [];
    const wrapped = withMiddleware('exec_shell', () => {
      seen.push(getActivePolicy());
      return Promise.resolve(okResult());
    });

    await wrapped({});

    // This is the whole defect in one assertion. When it starts failing,
    // a policy reaches dispatch — which is a #5022 decision, not a refactor.
    expect(seen).toEqual([undefined]);
  });

  it('runs the handler for a tool that `enforce` would deny, because the guard never evaluates', async () => {
    const handler = vi.fn(() => Promise.resolve(okResult()));
    const wrapped = withMiddleware('exec_shell', handler);

    const result = (await wrapped({})) as { isError?: boolean };

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.isError).toBeUndefined();
  });

  it('does not gate an unbypassable denylisted tool at this boundary', async () => {
    const handler = vi.fn(() => Promise.resolve(okResult()));
    const wrapped = withMiddleware('git_push_force', handler);

    const result = (await wrapped({})) as { isError?: boolean };

    // `denylist.ts` calls these patterns unbypassable and `mcp-guard.ts` once
    // claimed even `off` mode denied them. Neither holds here: the denylist
    // lives inside `checkAccess`, which a missing policy short-circuits before.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.isError).toBeUndefined();
  });

  it('DOES gate that same tool once a policy is in scope — so the stack itself is wired', async () => {
    const handler = vi.fn(() => Promise.resolve(okResult()));
    const wrapped = withMiddleware('git_push_force', handler);

    const result = (await withAccessPolicy(policy(), () => wrapped({}))) as {
      isError?: boolean;
    };

    // The contrast with the previous test is the point: the middleware is
    // genuinely mounted and the enforcer genuinely works. Only the scope is
    // wrong. This also keeps the three tests above from passing for a boring
    // reason, such as the mount having been removed.
    expect(result.isError).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it('an empty allowlist is unmeasured, so a policy in scope does not deny everything', async () => {
    const handler = vi.fn(() => Promise.resolve(okResult()));
    const wrapped = withMiddleware('exec_shell', handler);

    const result = (await withAccessPolicy(policy({ mode: 'enforce' }), () => wrapped({}))) as {
      isError?: boolean;
    };

    // Before #5022, establishing a policy at dispatch would have denied every
    // guarded call under `enforce`, since no producer emits tool names. This
    // is the assertion that makes fixing the scope safe rather than an outage.
    expect(handler).toHaveBeenCalledTimes(1);
    expect(result.isError).toBeUndefined();
  });
});
