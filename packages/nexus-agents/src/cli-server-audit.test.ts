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
import { initializeAuditLogger } from './cli-server-audit.js';
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
