/**
 * Integration test for the ClawGuard ↔ MCP middleware chain bridge (#1977).
 *
 * Verifies that when `withAccessPolicy(...)` is active:
 * - `allow` decisions forward to the downstream handler
 * - `deny` decisions short-circuit with an `isError` ToolResult
 * - `log-and-allow` decisions forward AND emit a warning
 * - No active policy → handler runs normally (pass-through)
 * - `mode: 'off'` policy → handler runs normally (pass-through)
 */

import { describe, it, expect, vi } from 'vitest';
import type { ILogger } from '../../core/index.js';
import { createAccessPolicyChainMiddleware } from './chain-adapter.js';
import { withAccessPolicy, withAuditTrail } from './mcp-guard.js';
import type { AuditEvent, AuditTrail } from '../audit-trail.js';
import type { TaskAccessPolicy } from './types.js';
import type { MiddlewareContext } from '../../mcp/middleware/middleware-chain.js';
import type { RequestContext } from '../../mcp/middleware/request-context.js';

type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function makeRequestContext(toolName: string): RequestContext {
  return {
    requestId: 'req-test-1',
    timestamp: '2026-04-19T00:00:00.000-05:00',
    toolName,
    caller: { clientId: 'test' },
    trustTier: '1',
  };
}

function makeLogger(): ILogger {
  const logger: Record<string, unknown> = {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    setLevel: vi.fn(),
  };
  logger['child'] = vi.fn(() => logger as unknown as ILogger);
  return logger as unknown as ILogger;
}

function makeCtx(toolName = 'read_file'): MiddlewareContext {
  return {
    requestContext: makeRequestContext(toolName),
    logger: makeLogger(),
  };
}

function makeHandler(): (args: unknown, ctx: MiddlewareContext) => Promise<ToolResult> {
  return vi.fn((_args: unknown, _ctx: MiddlewareContext) =>
    Promise.resolve({ content: [{ type: 'text' as const, text: 'handler-ran' }] })
  );
}

function policy(overrides: Partial<TaskAccessPolicy>): TaskAccessPolicy {
  return {
    mode: 'enforce',
    source: 'llm',
    allowedTools: ['read_file', 'search'],
    allowedPathPatterns: ['src/**'],
    allowedOperations: ['read'],
    objectiveHash: 'test-hash',
    derivedAt: '2026-04-19T00:00:00Z',
    ...overrides,
  };
}

describe('createAccessPolicyChainMiddleware', () => {
  it('passes through when no policy is active', async () => {
    const mw = createAccessPolicyChainMiddleware('read_file');
    const ctx = makeCtx();
    const handler = makeHandler();

    const result = await mw({ path: 'src/index.ts' }, ctx, handler);

    expect(result.content[0]?.text).toBe('handler-ran');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('passes through when policy mode is off', async () => {
    const mw = createAccessPolicyChainMiddleware('read_file');
    const ctx = makeCtx();
    const handler = makeHandler();

    const result = await withAccessPolicy(policy({ mode: 'off' }), () =>
      mw({ path: 'anywhere' }, ctx, handler)
    );

    expect(result.content[0]?.text).toBe('handler-ran');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('forwards on allow decision and invokes handler', async () => {
    const mw = createAccessPolicyChainMiddleware('read_file');
    const ctx = makeCtx();
    const handler = makeHandler();

    const result = await withAccessPolicy(policy({ mode: 'enforce' }), () =>
      mw({ path: 'src/index.ts' }, ctx, handler)
    );

    expect(result.content[0]?.text).toBe('handler-ran');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('denies ~/.ssh/** paths via the hardcoded unbypassable denylist', async () => {
    const mw = createAccessPolicyChainMiddleware('read_file');
    const ctx = makeCtx();
    const handler = makeHandler();

    // Unbypassable path denylist ALWAYS wins, even when tool itself is allowed.
    const result = await withAccessPolicy(
      policy({ mode: 'enforce', allowedTools: ['read_file'] }),
      () => mw({ path: '~/.ssh/id_rsa' }, ctx, handler)
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('access denied');
    expect(handler).not.toHaveBeenCalled();
    expect(ctx.logger.warn).toHaveBeenCalledWith(
      'access-policy: tool call denied',
      expect.objectContaining({ tool: 'read_file', requestId: 'req-test-1' })
    );
  });

  it('denies destructive tools via the hardcoded unbypassable tool list', async () => {
    const mw = createAccessPolicyChainMiddleware('git_push_force');
    const ctx = makeCtx();
    const handler = makeHandler();

    // Even with allowedTools='*', git_push_force is in the unbypassable list.
    const result = await withAccessPolicy(policy({ mode: 'enforce', allowedTools: '*' }), () =>
      mw({}, ctx, handler)
    );

    expect(result.isError).toBe(true);
    expect(handler).not.toHaveBeenCalled();
  });

  it('forwards on log-and-allow AND emits warning (audit mode)', async () => {
    const mw = createAccessPolicyChainMiddleware('exec_shell');
    const ctx = makeCtx();
    const handler = makeHandler();

    // Audit mode + tool not in allowedTools → log-and-allow
    const result = await withAccessPolicy(
      policy({ mode: 'audit', allowedTools: ['read_file'] }),
      () => mw({}, ctx, handler)
    );

    expect(result.content[0]?.text).toBe('handler-ran');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(ctx.logger.warn).toHaveBeenCalledWith(
      'access-policy: audit violation',
      expect.objectContaining({ tool: 'exec_shell' })
    );
  });

  it('omits path from guard args when arg is not a string', async () => {
    const mw = createAccessPolicyChainMiddleware('read_file');
    const ctx = makeCtx();
    const handler = makeHandler();

    // Non-string path — guard must not attempt path-match; tool must still be allowed.
    const result = await withAccessPolicy(
      policy({ mode: 'enforce', allowedTools: ['read_file'] }),
      () => mw({ path: 42 }, ctx, handler)
    );

    expect(result.content[0]?.text).toBe('handler-ran');
  });

  it('records an audit-mode violation durably on the log-and-allow branch', async () => {
    const events: AuditEvent[] = [];
    const trail = { append: (e: AuditEvent) => void events.push(e) } as unknown as AuditTrail;
    const mw = createAccessPolicyChainMiddleware('exec_shell');

    await withAccessPolicy(policy({ mode: 'audit', allowedTools: ['read_file'] }), () =>
      withAuditTrail(trail, () => mw({}, makeCtx(), makeHandler()))
    );

    expect(events).toHaveLength(1);
  });

  it('logs a denial at warn, not below the audit-mode observation (#5022)', async () => {
    const mw = createAccessPolicyChainMiddleware('exec_shell');
    const ctx = makeCtx();

    await withAccessPolicy(policy({ mode: 'enforce', allowedTools: ['read_file'] }), () =>
      mw({}, ctx, makeHandler())
    );

    // A denial previously used logger.info while an audit-mode violation used
    // logger.warn — the blocking mode logged BELOW the observing one.
    expect(ctx.logger.warn).toHaveBeenCalledWith(
      'access-policy: tool call denied',
      expect.objectContaining({ tool: 'exec_shell' })
    );
    expect(ctx.logger.info).not.toHaveBeenCalled();
  });

  describe('empty allowedTools is unmeasured, not a blanket deny (#5022)', () => {
    // Every production producer of allowedTools emits `[]` or `'*'`, never a
    // tool name. Before #5022 that made `[].includes(name)` false for every
    // call, so the verdict was a constant function of (mode, isRiskyTool) —
    // and under `enforce` it would have denied EVERY guarded call the moment
    // the check became reachable.
    const empty = { allowedTools: [] as readonly string[] };

    it.each(['enforce', 'confirm_risky', 'audit'] as const)(
      'runs the handler in %s mode rather than denying on an empty allowlist',
      async (mode) => {
        const mw = createAccessPolicyChainMiddleware('exec_shell');
        const handler = makeHandler();

        const result = await withAccessPolicy(policy({ mode, ...empty }), () =>
          mw({}, makeCtx(), handler)
        );

        expect(handler).toHaveBeenCalledTimes(1);
        expect(result.isError).toBeUndefined();
      }
    );

    it('logs the unmeasured verdict — the log IS the disclosure', async () => {
      const mw = createAccessPolicyChainMiddleware('exec_shell');
      const ctx = makeCtx();

      await withAccessPolicy(policy({ mode: 'enforce', ...empty }), () =>
        mw({}, ctx, makeHandler())
      );

      // The verdict ALLOWS the call and records nothing durable, so this line
      // is the only trace that a check did not run. Without this assertion,
      // deleting the log leaves the whole suite green.
      expect(ctx.logger.info).toHaveBeenCalledWith(
        'access-policy: allowlist unmeasured',
        expect.objectContaining({ tool: 'exec_shell' })
      );
    });

    it('does NOT record a violation for a check that never ran', async () => {
      const events: AuditEvent[] = [];
      const trail = { append: (e: AuditEvent) => void events.push(e) } as unknown as AuditTrail;
      const mw = createAccessPolicyChainMiddleware('exec_shell');

      await withAccessPolicy(policy({ mode: 'audit', ...empty }), () =>
        withAuditTrail(trail, () => mw({}, makeCtx(), makeHandler()))
      );

      // Recording this as a violation would give the #2077 enforce-flip
      // denominator a definitionally 100% violation rate carrying no
      // information about precision. The sibling test above proves the same
      // harness DOES capture a real violation, so this is not a dead assertion.
      expect(events).toEqual([]);
    });

    it('still denies an unbypassable tool when the allowlist is empty', async () => {
      const mw = createAccessPolicyChainMiddleware('git_push_force');
      const handler = makeHandler();

      const result = await withAccessPolicy(policy({ mode: 'audit', ...empty }), () =>
        mw({}, makeCtx(), handler)
      );

      // `unmeasured` must not swallow the denylist, which runs first.
      expect(result.isError).toBe(true);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('#4097 regression: audit mode always ALLOWS', () => {
    it('returns the handler result when no trail is present', async () => {
      const mw = createAccessPolicyChainMiddleware('exec_shell');
      const handler = makeHandler();

      const result = await withAccessPolicy(
        policy({ mode: 'audit', allowedTools: ['read_file'] }),
        () => mw({}, makeCtx(), handler)
      );

      expect(handler).toHaveBeenCalledTimes(1);
      expect(result.content[0]?.text).toBe('handler-ran');
    });

    it('returns the handler result and does not throw when the sink throws', async () => {
      const throwingTrail = {
        append: () => {
          throw new Error('sink exploded');
        },
      } as unknown as AuditTrail;
      const mw = createAccessPolicyChainMiddleware('exec_shell');
      const handler = makeHandler();

      const result = await withAccessPolicy(
        policy({ mode: 'audit', allowedTools: ['read_file'] }),
        () => withAuditTrail(throwingTrail, () => mw({}, makeCtx(), handler))
      );

      expect(handler).toHaveBeenCalledTimes(1);
      expect(result.content[0]?.text).toBe('handler-ran');
    });
  });
});
