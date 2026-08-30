/**
 * Tests for AuditLogger and createAuditLogger
 * @module audit/audit-logger.test
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IAuditStorage, AuditEvent, AuditLogConfig } from './audit-types.js';
import type { ILogger } from '../core/logger.js';

vi.mock('../core/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));
vi.mock('../core/index.js', () => ({
  getTimeProvider: () => ({ now: () => 1718444445000 }),
}));
vi.mock('node:crypto', () => ({
  randomBytes: vi.fn(() => Buffer.from('aabbccddeeff', 'hex')),
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => 'fakehash256'),
  })),
}));
vi.mock('./audit-storage.js', () => ({ FileAuditStorage: vi.fn() }));

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeConfig(overrides?: Partial<AuditLogConfig>) {
  return {
    logDir: '/tmp/test-audit',
    filePrefix: 'audit',
    maxFileSizeBytes: 10 * 1024 * 1024,
    maxFiles: 10,
    enableHashChain: false,
    enableCompression: false,
    flushIntervalMs: 1000,
    maxQueueDepth: 10_000,
    minSeverity: 'info' as const,
    ...overrides,
  };
}
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeMockStorage() {
  return {
    write: vi.fn(() => Promise.resolve()),
    flush: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    query: vi.fn(() => Promise.resolve([])),
  } satisfies IAuditStorage;
}
/** Extract the first argument from a mock call at the given index. */
function callArg(mock: ReturnType<typeof vi.fn>, callIndex: number): AuditEvent {
  return (mock.mock.calls as unknown[][])[callIndex]![0] as AuditEvent;
}
const A = { type: 'agent' as const, id: 'agent-1', name: 'Test Agent' };
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function ev(
  action: string,
  extra?: Partial<Parameters<InstanceType<typeof AuditLogger>['log']>[0]>
) {
  return {
    category: 'system' as const,
    severity: 'info' as const,
    outcome: 'success' as const,
    action,
    actor: A,
    ...extra,
  };
}

const { AuditLogger, createAuditLogger } = await import('./audit-logger.js');

describe('AuditLogger', () => {
  let s: ReturnType<typeof makeMockStorage>;
  beforeEach(() => {
    vi.useFakeTimers();
    s = makeMockStorage();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('initializes with valid config and custom storage', () => {
      expect(new AuditLogger(makeConfig(), s)).toBeDefined();
    });
    it('throws AuditError for empty logDir', () => {
      expect(() => new AuditLogger({ logDir: '' } as AuditLogConfig, s)).toThrow(
        'Invalid AuditLogConfig'
      );
    });
    it('throws AuditError for bad minSeverity', () => {
      expect(() => new AuditLogger(makeConfig({ minSeverity: 'extreme' as 'info' }), s)).toThrow(
        'Invalid AuditLogConfig'
      );
    });
    it('starts flush timer on construction', () => {
      const l = new AuditLogger(makeConfig({ flushIntervalMs: 500 }), s);
      l.log(ev('timer-test'));
      vi.advanceTimersByTime(600);
      expect(s.write).toHaveBeenCalled();
    });
  });

  describe('log', () => {
    it('queues and flushes a valid event with correct fields', async () => {
      const l = new AuditLogger(makeConfig(), s);
      l.log(ev('tool.invoke', { category: 'tool_invocation' }));
      await l.flush();
      expect(s.write).toHaveBeenCalledTimes(1);
      const e = callArg(s.write, 0);
      expect(e.category).toBe('tool_invocation');
      expect(e.version).toBe('1.0');
      expect(e.id).toMatch(/^aud_/);
    });
    it('does not log after close', async () => {
      const l = new AuditLogger(makeConfig(), s);
      await l.close();
      l.log(ev('post-close'));
      s.write.mockClear();
      await l.flush();
      expect(s.write).not.toHaveBeenCalled();
    });
    it('filters events below minSeverity', async () => {
      const l = new AuditLogger(makeConfig({ minSeverity: 'warning' }), s);
      l.log(ev('low-sev'));
      await l.flush();
      expect(s.write).not.toHaveBeenCalled();
    });
    it('allows events at minSeverity', async () => {
      const l = new AuditLogger(makeConfig({ minSeverity: 'warning' }), s);
      l.log(ev('warn-sev', { severity: 'warning' }));
      await l.flush();
      expect(s.write).toHaveBeenCalledTimes(1);
    });
    it('allows events above minSeverity', async () => {
      const l = new AuditLogger(makeConfig({ minSeverity: 'warning' }), s);
      l.log(ev('crit', { severity: 'critical', outcome: 'failure' }));
      await l.flush();
      expect(s.write).toHaveBeenCalledTimes(1);
    });
    it('filters events outside configured categories', async () => {
      const l = new AuditLogger(makeConfig({ categories: ['security'] }), s);
      l.log(ev('test', { category: 'tool_invocation' }));
      await l.flush();
      expect(s.write).not.toHaveBeenCalled();
    });
    it('allows events within configured categories', async () => {
      const l = new AuditLogger(makeConfig({ categories: ['security', 'system'] }), s);
      l.log(ev('test', { category: 'security' }));
      await l.flush();
      expect(s.write).toHaveBeenCalledTimes(1);
    });
    it('passes all categories when categories config is undefined', async () => {
      const l = new AuditLogger(makeConfig(), s);
      l.log(ev('test', { category: 'data_access' }));
      await l.flush();
      expect(s.write).toHaveBeenCalledTimes(1);
    });
    it('includes hash chain fields when enableHashChain is true', async () => {
      const l = new AuditLogger(makeConfig({ enableHashChain: true }), s);
      l.log(ev('hashed'));
      await l.flush();
      const e = callArg(s.write, 0);
      expect(e.hash).toBe('fakehash256');
    });
    it('chains hashes across multiple events', async () => {
      const l = new AuditLogger(makeConfig({ enableHashChain: true }), s);
      l.log(ev('first'));
      l.log(ev('second'));
      await l.flush();
      const first = callArg(s.write, 0);
      const second = callArg(s.write, 1);
      expect(first.previousHash).toBeUndefined();
      expect(second.previousHash).toBe('fakehash256');
    });
    it('does not include hash fields when enableHashChain is false', async () => {
      const l = new AuditLogger(makeConfig(), s);
      l.log(ev('no-hash'));
      await l.flush();
      const e = callArg(s.write, 0);
      expect(e.hash).toBeUndefined();
      expect(e.previousHash).toBeUndefined();
    });
    it('includes optional fields from input', async () => {
      const l = new AuditLogger(makeConfig(), s);
      l.log(
        ev('tool.invoke', {
          category: 'tool_invocation',
          requestId: 'req-1',
          traceId: 'tr-1',
          sessionId: 'ss-1',
          toolName: 'myTool',
          durationMs: 42,
          metadata: { k: 'v' },
          description: 'desc',
        })
      );
      await l.flush();
      const e = callArg(s.write, 0);
      expect(e.requestId).toBe('req-1');
      expect(e.toolName).toBe('myTool');
      expect(e.durationMs).toBe(42);
      expect(e.metadata).toEqual({ k: 'v' });
    });
  });

  describe('logToolInvocation', () => {
    it('logs success as info severity', async () => {
      const l = new AuditLogger(makeConfig(), s);
      l.logToolInvocation({
        toolName: 'orchestrate',
        outcome: 'success',
        actor: A,
        durationMs: 100,
      });
      await l.flush();
      const e = callArg(s.write, 0);
      expect(e.category).toBe('tool_invocation');
      expect(e.severity).toBe('info');
      expect(e.action).toBe('tool.invoke');
    });
    it('logs failure as warning with errorMessage', async () => {
      const l = new AuditLogger(makeConfig(), s);
      l.logToolInvocation({
        toolName: 'orchestrate',
        outcome: 'failure',
        actor: A,
        errorMessage: 'Timeout',
      });
      await l.flush();
      const e = callArg(s.write, 0);
      expect(e.severity).toBe('warning');
      expect(e.description).toBe('Timeout');
    });
    it('logs error outcome as warning severity', async () => {
      const l = new AuditLogger(makeConfig(), s);
      l.logToolInvocation({ toolName: 'run_workflow', outcome: 'error', actor: A });
      await l.flush();
      expect(callArg(s.write, 0).severity).toBe('warning');
    });
  });

  describe('logPolicyDecision', () => {
    it('logs allow decision as info/success', async () => {
      const l = new AuditLogger(makeConfig(), s);
      l.logPolicyDecision({
        policyName: 'rl',
        decision: 'allow',
        reason: 'ok',
        toolName: 'o',
        actor: A,
      });
      await l.flush();
      const e = callArg(s.write, 0);
      expect(e.category).toBe('authorization');
      expect(e.severity).toBe('info');
      expect(e.outcome).toBe('success');
      expect(e.policyDecision).toBe('allow');
    });
    it('logs deny decision as warning/denied', async () => {
      const l = new AuditLogger(makeConfig(), s);
      l.logPolicyDecision({
        policyName: 'sb',
        decision: 'deny',
        reason: 'Forbidden',
        toolName: 'x',
        actor: A,
      });
      await l.flush();
      const e = callArg(s.write, 0);
      expect(e.severity).toBe('warning');
      expect(e.outcome).toBe('denied');
      expect(e.description).toBe('Forbidden');
    });

    // #4991: warn mode allows the call but a rule DID fire. The chain must be
    // able to say so. Recording it as `deny` would claim an enforcement that
    // never happened; recording it as `allow` erases the signal the warn-mode
    // soak exists to collect, which is the measurement #4988 rests on.
    it('logs would_deny as warning severity, not info', async () => {
      const l = new AuditLogger(makeConfig(), s);
      l.logPolicyDecision({
        policyName: 'sb',
        decision: 'would_deny',
        reason: 'Would be denied: path outside allowlist',
        toolName: 'x',
        actor: A,
      });
      await l.flush();
      const e = callArg(s.write, 0);
      // The old ternary was `decision === 'deny' ? 'warning' : 'info'`, so a
      // third value fell silently to info — understating the exact signal.
      expect(e.severity).toBe('warning');
    });

    it('logs would_deny with outcome success, because the call actually ran', async () => {
      const l = new AuditLogger(makeConfig(), s);
      l.logPolicyDecision({
        policyName: 'sb',
        decision: 'would_deny',
        reason: 'Would be denied: path outside allowlist',
        toolName: 'x',
        actor: A,
      });
      await l.flush();
      const e = callArg(s.write, 0);
      // The sharper half of the defect, and one the panel did not flag: the old
      // mapping was `decision === 'allow' ? 'success' : 'denied'`, so would_deny
      // would have been recorded as outcome 'denied' — the chain asserting the
      // call was blocked when it ran to completion. `outcome` describes what
      // happened to the OPERATION; `policyDecision` carries the policy verdict.
      expect(e.outcome).toBe('success');
      expect(e.policyDecision).toBe('would_deny');
    });
  });

  describe('logSecurityEvent', () => {
    it('logs with correct category, outcome, and action', async () => {
      const l = new AuditLogger(makeConfig(), s);
      l.logSecurityEvent({
        eventType: 'path_traversal_blocked',
        severity: 'critical',
        actor: A,
        description: 'blocked',
      });
      await l.flush();
      const e = callArg(s.write, 0);
      expect(e.category).toBe('security');
      expect(e.outcome).toBe('failure');
      expect(e.action).toBe('security.path_traversal_blocked');
      expect(e.violationType).toBe('path_traversal_blocked');
    });
  });

  describe('logRateLimitViolation', () => {
    it('logs rate limit with correct metadata and description', async () => {
      const l = new AuditLogger(makeConfig(), s);
      l.logRateLimitViolation({
        toolName: 'orchestrate',
        actor: A,
        currentRate: 120,
        limitRate: 100,
      });
      await l.flush();
      const e = callArg(s.write, 0);
      expect(e.category).toBe('security');
      expect(e.outcome).toBe('denied');
      expect(e.action).toBe('rate_limit.exceeded');
      expect(e.description).toContain('120');
      expect(e.metadata).toEqual({ currentRate: 120, limitRate: 100 });
    });
  });

  describe('logSystemStartup', () => {
    it('logs with system actor and metadata', async () => {
      const l = new AuditLogger(makeConfig(), s);
      l.logSystemStartup({ version: '2.3.0' });
      await l.flush();
      const e = callArg(s.write, 0);
      expect(e.action).toBe('system.startup');
      expect(e.actor).toEqual({ type: 'system', id: 'nexus-agents', name: 'Nexus Agents System' });
      expect(e.metadata).toEqual({ version: '2.3.0' });
    });
    it('logs without metadata', async () => {
      const l = new AuditLogger(makeConfig(), s);
      l.logSystemStartup();
      await l.flush();
      expect(callArg(s.write, 0).metadata).toBeUndefined();
    });
  });

  describe('logSystemShutdown', () => {
    it('logs with system actor and metadata', async () => {
      const l = new AuditLogger(makeConfig(), s);
      l.logSystemShutdown({ reason: 'graceful' });
      await l.flush();
      const e = callArg(s.write, 0);
      expect(e.action).toBe('system.shutdown');
      expect(e.metadata).toEqual({ reason: 'graceful' });
    });
  });

  describe('flush', () => {
    it('writes all queued events then calls storage.flush', async () => {
      const l = new AuditLogger(makeConfig(), s);
      l.log(ev('a'));
      l.log(ev('b'));
      await l.flush();
      expect(s.write).toHaveBeenCalledTimes(2);
      expect(s.flush).toHaveBeenCalled();
    });
    it('skips write when queue is empty', async () => {
      const l = new AuditLogger(makeConfig(), s);
      await l.flush();
      expect(s.write).not.toHaveBeenCalled();
      expect(s.flush).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('flushes remaining events and closes storage', async () => {
      const l = new AuditLogger(makeConfig(), s);
      l.log(ev('final'));
      await l.close();
      expect(s.write).toHaveBeenCalledTimes(1);
      expect(s.close).toHaveBeenCalled();
    });
    it('is idempotent', async () => {
      const l = new AuditLogger(makeConfig(), s);
      await l.close();
      await l.close();
      expect(s.close).toHaveBeenCalledTimes(1);
    });
    it('clears the flush timer', async () => {
      const l = new AuditLogger(makeConfig(), s);
      await l.close();
      vi.advanceTimersByTime(5000);
      expect(s.write).not.toHaveBeenCalled();
    });
  });

  describe('flush timer error handling', () => {
    it('catches errors from periodic flush without crashing', () => {
      s.write.mockRejectedValueOnce(new Error('disk full'));
      const l = new AuditLogger(makeConfig({ flushIntervalMs: 100 }), s);
      l.log(ev('test'));
      expect(() => vi.advanceTimersByTime(200)).not.toThrow();
    });
  });

  describe('fail-loud on persist failure (#3916 / ADR-0017)', () => {
    it('surfaces a failed flush — NOT silent: error-logged + counted + thrown', async () => {
      // A failed audit persist undermines the tamper-evident hash chain, so it
      // must fail loud rather than be swallowed like the best-effort cost path.
      const errLog = vi.fn();
      const failLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: errLog,
        debug: vi.fn(),
        child: vi.fn(),
        setLevel: vi.fn(),
      } as unknown as ILogger;
      s.flush.mockRejectedValueOnce(new Error('disk full'));
      const l = new AuditLogger(makeConfig(), s, failLogger);
      l.log(ev('governance-critical'));

      // (a) the awaited manual flush() rethrows (fail-loud to the caller)
      await expect(l.flush()).rejects.toThrow('disk full');
      // (b) prominent error log fired (not a quiet debug/warn)
      expect(errLog).toHaveBeenCalledTimes(1);
      expect(errLog.mock.calls[0]![0]).toContain('AUDIT PERSIST FAILURE');
      // (c) the failure is counted/observable
      expect(l.getPersistFailureCount()).toBe(1);
    });

    it('invokes the onPersistFailure escalation hook with the error', async () => {
      const onFail = vi.fn();
      s.flush.mockRejectedValueOnce(new Error('eio'));
      const l = new AuditLogger(makeConfig(), s, undefined, onFail);
      l.log(ev('tier-transition'));
      await expect(l.flush()).rejects.toThrow('eio');
      expect(onFail).toHaveBeenCalledTimes(1);
      expect((onFail.mock.calls[0]![0] as Error).message).toBe('eio');
    });

    it('isolates a throwing onPersistFailure hook — original audit error still rethrown + counted', async () => {
      // A throwing escalation hook must NOT mask the real I/O error or break the
      // record-then-rethrow path (and on a timer tick could risk an unhandled
      // rejection). The hook's own failure is logged, not propagated.
      const errLog = vi.fn();
      const failLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: errLog,
        debug: vi.fn(),
        child: vi.fn(),
        setLevel: vi.fn(),
      } as unknown as ILogger;
      const onFail = vi.fn(() => {
        throw new Error('hook boom');
      });
      s.flush.mockRejectedValueOnce(new Error('eio'));
      const l = new AuditLogger(makeConfig(), s, failLogger, onFail);
      l.log(ev('tier-transition'));
      // The ORIGINAL audit error rethrows (not the hook's 'hook boom').
      await expect(l.flush()).rejects.toThrow('eio');
      expect(onFail).toHaveBeenCalledTimes(1);
      // Counter intact; both the audit failure and the hook failure are logged.
      expect(l.getPersistFailureCount()).toBe(1);
      const msgs = errLog.mock.calls.map((c) => String(c[0]));
      expect(msgs.some((m) => m.includes('AUDIT PERSIST FAILURE — audit event'))).toBe(true);
      expect(msgs.some((m) => m.includes('onPersistFailure hook threw'))).toBe(true);
    });

    it('counts a flush failure that arrives via the periodic timer (not silent)', async () => {
      s.write.mockRejectedValueOnce(new Error('disk full'));
      const l = new AuditLogger(makeConfig({ flushIntervalMs: 100 }), s);
      l.log(ev('via-timer'));
      await vi.advanceTimersByTimeAsync(150);
      expect(l.getPersistFailureCount()).toBe(1);
    });

    it('does not count or escalate a successful flush', async () => {
      const onFail = vi.fn();
      const l = new AuditLogger(makeConfig(), s, undefined, onFail);
      l.log(ev('ok'));
      await l.flush();
      expect(l.getPersistFailureCount()).toBe(0);
      expect(onFail).not.toHaveBeenCalled();
    });
  });

  describe('flush timer drains storage buffer (#2979)', () => {
    it('calls storage.flush() on each interval tick — not just storage.write()', async () => {
      const l = new AuditLogger(makeConfig({ flushIntervalMs: 100 }), s);
      l.log(ev('drain-me'));
      // Advance just past one tick, letting the queued microtasks from the
      // async timer callback settle without re-firing the timer indefinitely.
      await vi.advanceTimersByTimeAsync(150);
      expect(s.write).toHaveBeenCalledTimes(1);
      expect(s.flush).toHaveBeenCalled();
    });
  });

  describe('concurrent flush coalescing (#2979)', () => {
    it('coalesces concurrent flush() calls into a single in-flight promise', async () => {
      const resolvers: Array<() => void> = [];
      s.write.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolvers.push(resolve);
          })
      );
      const l = new AuditLogger(makeConfig(), s);
      l.log(ev('coalesce-1'));
      l.log(ev('coalesce-2'));

      // Kick off two concurrent flushes while the first storage.write() is in flight.
      const p1 = l.flush();
      const p2 = l.flush();
      // Drain in-flight write, then resolve.
      expect(resolvers).toHaveLength(1);
      resolvers[0]?.();
      await Promise.all([p1, p2]);

      // Both events should have been written exactly once (no double-drain) and
      // storage.flush should have been called once for the coalesced batch.
      expect(s.write).toHaveBeenCalledTimes(2);
      expect(s.flush).toHaveBeenCalledTimes(1);
    });

    it('serializes a follow-up flush after the in-flight one completes', async () => {
      const l = new AuditLogger(makeConfig(), s);
      l.log(ev('first'));
      await l.flush();
      l.log(ev('second'));
      await l.flush();
      expect(s.write).toHaveBeenCalledTimes(2);
      expect(s.flush).toHaveBeenCalledTimes(2);
    });
  });

  describe('maxQueueDepth backpressure (#2979)', () => {
    it('drops oldest events when queue exceeds maxQueueDepth', async () => {
      const l = new AuditLogger(makeConfig({ maxQueueDepth: 3 }), s);
      l.log(ev('oldest'));
      l.log(ev('second'));
      l.log(ev('third'));
      l.log(ev('fourth')); // should evict 'oldest'
      l.log(ev('fifth')); // should evict 'second'
      await l.flush();

      expect(s.write).toHaveBeenCalledTimes(3);
      const actions = (s.write.mock.calls as unknown[][]).map(
        (call) => (call[0] as AuditEvent).action
      );
      expect(actions).toEqual(['third', 'fourth', 'fifth']);
    });

    it('uses a sane default maxQueueDepth when not configured', async () => {
      // The default cap should be well above this small batch.
      const l = new AuditLogger(makeConfig(), s);
      for (let i = 0; i < 50; i++) l.log(ev('e' + String(i)));
      await l.flush();
      expect(s.write).toHaveBeenCalledTimes(50);
    });
  });
});

describe('createAuditLogger', () => {
  it('returns an AuditLogger instance', () => {
    const logger = createAuditLogger(makeConfig(), makeMockStorage());
    expect(logger).toBeInstanceOf(AuditLogger);
  });
});
