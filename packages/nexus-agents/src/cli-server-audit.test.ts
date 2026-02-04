/**
 * CLI Server Audit Integration Tests
 *
 * Tests for audit logger initialization from security configuration.
 * (Source: Issue #740 Phase 2)
 */

import { describe, it, expect, vi } from 'vitest';
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

  it('should return AuditLogger when audit is enabled', () => {
    const logger = createMockLogger();
    const tmpDir = '/tmp/nexus-audit-test-' + String(process.pid);
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

    // Clean up
    if (result !== null) {
      void result.close();
    }
  });
});
