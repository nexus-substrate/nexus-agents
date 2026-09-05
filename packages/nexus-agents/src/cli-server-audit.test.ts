/**
 * CLI Server Audit Integration Tests
 *
 * Tests for audit logger initialization from security configuration.
 * (Source: Issue #740 Phase 2)
 */

import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeAuditLogger, logSecurityConfig } from './cli-server-audit.js';
import type { ILogger } from './core/index.js';

function createMockLogger(): ILogger {
  const mock: ILogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  };
  (mock.child as ReturnType<typeof vi.fn>).mockReturnValue(mock);
  return mock;
}

describe('initializeAuditLogger', () => {
  it('should return null when security config is undefined', () => {
    const logger = createMockLogger();
    const result = initializeAuditLogger(undefined, logger);
    expect(result).toBeNull();
  });

  it('should return null when audit config is not present', () => {
    const logger = createMockLogger();
    const result = initializeAuditLogger(
      {
        allowedPaths: ['./'],
        blockedPatterns: [],
        rateLimit: { enabled: true, requestsPerMinute: 60 },
      },
      logger
    );
    expect(result).toBeNull();
  });

  it('should return null when audit is disabled', () => {
    const logger = createMockLogger();
    const result = initializeAuditLogger(
      {
        allowedPaths: ['./'],
        blockedPatterns: [],
        rateLimit: { enabled: true, requestsPerMinute: 60 },
        audit: {
          enabled: false,
          minSeverity: 'info',
          enableHashChain: false,
          maxFileSizeBytes: 10 * 1024 * 1024,
          maxFiles: 10,
        },
      },
      logger
    );
    expect(result).toBeNull();
  });

  // The directory was previously `/tmp/nexus-audit-test-<pid>`, hardcoded and
  // never removed. Closing the logger is not the same as deleting what it
  // wrote into, and the pid meant runs never reused a path — so the directory
  // count grew once per test run, forever. 73 had accumulated on the dev box
  // before anyone noticed (#4603). `mkdtempSync` makes the path unique by
  // construction rather than by pid, and the `finally` removes it on every
  // path including a failing assertion.
  it('should return AuditLogger when audit is enabled', async () => {
    const logger = createMockLogger();
    const tmpDir = mkdtempSync(join(tmpdir(), 'nexus-audit-test-'));
    try {
      const result = initializeAuditLogger(
        {
          allowedPaths: ['./'],
          blockedPatterns: [],
          rateLimit: { enabled: true, requestsPerMinute: 60 },
          audit: {
            enabled: true,
            logDir: tmpDir,
            minSeverity: 'info',
            enableHashChain: false,
            maxFileSizeBytes: 10 * 1024 * 1024,
            maxFiles: 10,
          },
        },
        logger
      );
      expect(result).not.toBeNull();

      // Awaited, not fire-and-forget. `void result.close()` returned before
      // the log stream had flushed; removing the directory underneath it then
      // surfaced as an unhandled `AuditError: Failed to flush audit log`. The
      // old code never deleted the directory, so this race was invisible —
      // the leak was hiding a second defect (#4603).
      if (result !== null) {
        await result.close();
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('logSecurityConfig', () => {
  it('names the policy mode as configured, not as applied (#4888)', () => {
    // This runs at startup, before `stagePolicyFirewallForRollout` picks the
    // mode that actually applies — `warn` unless the operator opted in. A field
    // called `policyMode` reading `enforce` here would claim an enforcement the
    // staged rollout does not perform, which is the same false claim the
    // tool-registration line had to drop.
    const logger = createMockLogger();

    logSecurityConfig(logger);

    const line = (logger.info as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => call[0] === 'Security configuration'
    );
    expect(line).toBeDefined();
    expect((line as unknown[])[1]).toHaveProperty('configuredPolicyMode');
    expect((line as unknown[])[1]).not.toHaveProperty('policyMode');
  });

  it('reports whether audit logging is on, alongside the other controls (#4990)', () => {
    // Audit was the only security control missing from this line. Its absence
    // was announced at `debug`, which the default `info` level drops — so a
    // startup log that confirmed four controls and said nothing about the
    // tamper-evident chain read as "fine" rather than "not running".
    const logger = createMockLogger();

    logSecurityConfig(logger);

    const line = (logger.info as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => call[0] === 'Security configuration'
    );
    expect((line as unknown[])[1]).toMatchObject({ auditEnabled: false });
  });

  it('warns when the audit chain is not being written', () => {
    // The same treatment auth already gets. A boolean on an info line is easy
    // to scroll past; the control being absent deserves the same visibility as
    // authentication being absent.
    const logger = createMockLogger();

    logSecurityConfig(logger);

    const warned = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.some((call: unknown[]) =>
      String(call[0]).includes('Audit logging is disabled')
    );
    expect(warned).toBe(true);
  });

  it('reports auth the way initializeAuth resolves it: on by default, token method (#5663)', () => {
    // Two resolvers disagreed about the default: this line said auth was off
    // and warned about unprotected endpoints, while initializeAuth — five
    // lines later in startServer — defaulted to enabled + token and enforced it.
    const saved = process.env['NEXUS_AUTH_ENABLED'];
    delete process.env['NEXUS_AUTH_ENABLED'];
    try {
      const logger = createMockLogger();

      logSecurityConfig(logger);

      const line = (logger.info as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: unknown[]) => call[0] === 'Security configuration'
      );
      expect((line as unknown[])[1]).toMatchObject({ authEnabled: true, authMethod: 'token' });
      const warned = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.some((call: unknown[]) =>
        String(call[0]).includes('Authentication explicitly disabled')
      );
      expect(warned).toBe(false);
    } finally {
      if (saved === undefined) delete process.env['NEXUS_AUTH_ENABLED'];
      else process.env['NEXUS_AUTH_ENABLED'] = saved;
    }
  });

  it('reports auth off, and warns, when NEXUS_AUTH_ENABLED=false (#5663)', () => {
    const saved = process.env['NEXUS_AUTH_ENABLED'];
    process.env['NEXUS_AUTH_ENABLED'] = 'false';
    try {
      const logger = createMockLogger();

      logSecurityConfig(logger);

      const line = (logger.info as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: unknown[]) => call[0] === 'Security configuration'
      );
      expect((line as unknown[])[1]).toMatchObject({ authEnabled: false });
      const warned = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.some((call: unknown[]) =>
        String(call[0]).includes('Authentication explicitly disabled')
      );
      expect(warned).toBe(true);
    } finally {
      if (saved === undefined) delete process.env['NEXUS_AUTH_ENABLED'];
      else process.env['NEXUS_AUTH_ENABLED'] = saved;
    }
  });

  it('says audit is on, and does not warn, when it is enabled', () => {
    // The pair. A hardcoded `false` plus an unconditional warning would pass
    // both tests above while reporting a running audit chain as absent.
    const logger = createMockLogger();

    logSecurityConfig(logger, {
      security: { audit: { enabled: true } },
    } as unknown as Parameters<typeof logSecurityConfig>[1]);

    const line = (logger.info as ReturnType<typeof vi.fn>).mock.calls.find(
      (call: unknown[]) => call[0] === 'Security configuration'
    );
    expect((line as unknown[])[1]).toMatchObject({ auditEnabled: true });
    const warned = (logger.warn as ReturnType<typeof vi.fn>).mock.calls.some((call: unknown[]) =>
      String(call[0]).includes('Audit logging is disabled')
    );
    expect(warned).toBe(false);
  });
});
