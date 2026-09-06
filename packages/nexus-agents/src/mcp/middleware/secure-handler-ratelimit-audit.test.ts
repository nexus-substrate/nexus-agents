/**
 * A rate-limit audit record must carry the limiter state that produced the
 * denial (#5577).
 *
 * `checkRateLimit` reads `rateLimiter.getState()` for `nextTokenMs` and throws
 * the rest away; `emitRateLimitAudit` then passed literal `currentRate: 0,
 * limitRate: 0`. Every rate-limited MCP call persisted "Rate limit exceeded:
 * 0/0 requests" into the durable chain, so a reviewer reading the audit log
 * could not tell what limit was hit — or that any limit was configured.
 */
import { describe, it, expect, vi } from 'vitest';

import { createSecureHandler } from './secure-handler.js';
import { RateLimiter } from './rate-limiter.js';
import type { IAuditLogger } from '../../audit/audit-types.js';

function mockAuditLogger(): IAuditLogger {
  return {
    log: vi.fn(),
    logToolInvocation: vi.fn(),
    logPolicyDecision: vi.fn(),
    logSecurityEvent: vi.fn(),
    logRateLimitViolation: vi.fn(),
    logTierTransition: vi.fn(),
    flush: vi.fn(() => Promise.resolve()),
  } as unknown as IAuditLogger;
}

const okHandler = (): Promise<{ content: { type: 'text'; text: string }[] }> =>
  Promise.resolve({ content: [{ type: 'text' as const, text: 'ok' }] });

describe('rate-limit audit records the measured limiter state (#5577)', () => {
  it('reports the configured capacity as the limit, not zero', async () => {
    const auditLogger = mockAuditLogger();
    // Capacity 2, refilling far slower than the test runs: the third call is
    // denied with the bucket empty.
    const rateLimiter = new RateLimiter({ capacity: 2, refillRate: 1, refillIntervalMs: 600_000 });
    const handler = createSecureHandler(okHandler, {
      toolName: 'limited',
      rateLimiter,
      auditLogger,
    });

    await handler({});
    await handler({});
    await handler({});

    const emit = vi.mocked(auditLogger.logRateLimitViolation);
    expect(emit).toHaveBeenCalledTimes(1);
    const opts = emit.mock.calls[0]?.[0];
    expect(opts?.limitRate).toBe(2);
    // The bucket is empty at denial time, so every token in it has been spent.
    expect(opts?.currentRate).toBe(2);
    expect(opts?.toolName).toBe('limited');
  });

  it('does not report a limit of zero when the limiter has capacity configured', async () => {
    const auditLogger = mockAuditLogger();
    const rateLimiter = new RateLimiter({ capacity: 10, refillRate: 1, refillIntervalMs: 600_000 });
    const handler = createSecureHandler(okHandler, {
      toolName: 'limited',
      rateLimiter,
      auditLogger,
    });

    for (let i = 0; i < 11; i++) await handler({});

    const emit = vi.mocked(auditLogger.logRateLimitViolation);
    const opts = emit.mock.calls[0]?.[0];
    expect(opts?.limitRate).toBe(10);
    expect(opts?.limitRate).not.toBe(0);
  });
});
