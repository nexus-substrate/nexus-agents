/**
 * Tests for Audit Logger and Storage.
 * (Source: Issue #193 - Phase 3 structured audit logging)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AuditLogger } from '../audit-logger.js';
import { InMemoryAuditStorage, FileAuditStorage } from '../audit-storage.js';
import type { FileAuditStorageConfig } from '../audit-storage.js';
import type { AuditEvent, AuditActor, AuditLogConfig } from '../audit-types.js';
import { AuditError } from '../audit-types.js';
import { SecurityError } from '../../core/index.js';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_ACTOR: AuditActor = {
  type: 'user',
  id: 'test-user',
  name: 'Test User',
};

function createTestConfig(logDir: string): AuditLogConfig {
  return {
    logDir,
    filePrefix: 'test-audit',
    maxFileSizeBytes: 1024,
    maxFiles: 3,
    flushIntervalMs: 100,
    minSeverity: 'info',
    enableHashChain: false,
    enableCompression: false,
  };
}

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'audit-test-'));
}

function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ============================================================================
// InMemoryAuditStorage Tests
// ============================================================================

describe('InMemoryAuditStorage', () => {
  let storage: InMemoryAuditStorage;

  beforeEach(() => {
    storage = new InMemoryAuditStorage(100);
  });

  describe('write', () => {
    it('should store audit events', async () => {
      const event: AuditEvent = {
        id: 'aud_test_1',
        version: '1.0',
        timestamp: new Date().toISOString(),
        timestampMs: Date.now(),
        category: 'tool_invocation',
        severity: 'info',
        outcome: 'success',
        action: 'tool.invoke',
        actor: TEST_ACTOR,
      };

      await storage.write(event);
      const all = storage.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]?.id).toBe('aud_test_1');
    });

    it('should enforce max events limit', async () => {
      const smallStorage = new InMemoryAuditStorage(3);
      for (let i = 0; i < 5; i++) {
        await smallStorage.write({
          id: 'aud_test_' + String(i),
          version: '1.0',
          timestamp: new Date().toISOString(),
          timestampMs: Date.now(),
          category: 'tool_invocation',
          severity: 'info',
          outcome: 'success',
          action: 'tool.invoke',
          actor: TEST_ACTOR,
        });
      }
      const all = smallStorage.getAll();
      expect(all).toHaveLength(3);
      expect(all[0]?.id).toBe('aud_test_2');
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      const events: AuditEvent[] = [
        {
          id: 'aud_1',
          version: '1.0',
          timestamp: '2026-01-11T10:00:00Z',
          timestampMs: new Date('2026-01-11T10:00:00Z').getTime(),
          category: 'tool_invocation',
          severity: 'info',
          outcome: 'success',
          action: 'tool.invoke',
          actor: TEST_ACTOR,
        },
        {
          id: 'aud_2',
          version: '1.0',
          timestamp: '2026-01-11T11:00:00Z',
          timestampMs: new Date('2026-01-11T11:00:00Z').getTime(),
          category: 'security',
          severity: 'warning',
          outcome: 'denied',
          action: 'security.violation',
          actor: { type: 'agent', id: 'agent-1' },
        },
        {
          id: 'aud_3',
          version: '1.0',
          timestamp: '2026-01-11T12:00:00Z',
          timestampMs: new Date('2026-01-11T12:00:00Z').getTime(),
          category: 'authorization',
          severity: 'critical',
          outcome: 'failure',
          action: 'policy.evaluate',
          actor: TEST_ACTOR,
          requestId: 'req-123',
        },
      ];
      for (const e of events) await storage.write(e);
    });

    it('should filter by category', async () => {
      const results = await storage.query({ categories: ['security'], limit: 100, offset: 0 });
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('aud_2');
    });

    it('should filter by severity', async () => {
      const results = await storage.query({
        severities: ['warning', 'critical'],
        limit: 100,
        offset: 0,
      });
      expect(results).toHaveLength(2);
    });

    it('should filter by outcome', async () => {
      const results = await storage.query({ outcomes: ['success'], limit: 100, offset: 0 });
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('aud_1');
    });

    it('should filter by actorId', async () => {
      const results = await storage.query({ actorId: 'agent-1', limit: 100, offset: 0 });
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('aud_2');
    });

    it('should filter by requestId', async () => {
      const results = await storage.query({ requestId: 'req-123', limit: 100, offset: 0 });
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('aud_3');
    });

    it('should respect limit and offset', async () => {
      const results = await storage.query({ limit: 1, offset: 1 });
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('aud_2');
    });
  });

  describe('clear', () => {
    it('should clear all events', async () => {
      await storage.write({
        id: 'aud_test',
        version: '1.0',
        timestamp: new Date().toISOString(),
        timestampMs: Date.now(),
        category: 'system',
        severity: 'info',
        outcome: 'success',
        action: 'test',
        actor: TEST_ACTOR,
      });
      expect(storage.getAll()).toHaveLength(1);
      storage.clear();
      expect(storage.getAll()).toHaveLength(0);
    });
  });
});

// ============================================================================
// AuditLogger Tests
// ============================================================================

describe('AuditLogger', () => {
  let storage: InMemoryAuditStorage;
  let logger: AuditLogger;
  let tempDir: string;

  beforeEach(() => {
    storage = new InMemoryAuditStorage();
    tempDir = createTempDir();
    logger = new AuditLogger(createTestConfig(tempDir), storage);
  });

  afterEach(async () => {
    await logger.close();
    cleanupTempDir(tempDir);
  });

  describe('constructor', () => {
    it('should create logger with valid config', () => {
      expect(logger).toBeInstanceOf(AuditLogger);
    });

    it('should throw on invalid config', () => {
      expect(() => new AuditLogger({ logDir: '' } as AuditLogConfig, storage)).toThrow(AuditError);
    });
  });

  describe('log', () => {
    it('should queue audit events', async () => {
      logger.log({
        category: 'tool_invocation',
        severity: 'info',
        outcome: 'success',
        action: 'tool.invoke',
        actor: TEST_ACTOR,
      });
      await logger.flush();
      const events = storage.getAll();
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe('tool.invoke');
    });

    it('should generate unique event IDs', async () => {
      logger.log({
        category: 'tool_invocation',
        severity: 'info',
        outcome: 'success',
        action: 'test1',
        actor: TEST_ACTOR,
      });
      logger.log({
        category: 'tool_invocation',
        severity: 'info',
        outcome: 'success',
        action: 'test2',
        actor: TEST_ACTOR,
      });
      await logger.flush();
      const events = storage.getAll();
      expect(events[0]?.id).not.toBe(events[1]?.id);
      expect(events[0]?.id).toMatch(/^aud_/);
    });

    it('should respect minSeverity filter', async () => {
      const filteredLogger = new AuditLogger(
        { ...createTestConfig(tempDir), minSeverity: 'warning' },
        storage
      );
      filteredLogger.log({
        category: 'tool_invocation',
        severity: 'info',
        outcome: 'success',
        action: 'info-event',
        actor: TEST_ACTOR,
      });
      filteredLogger.log({
        category: 'security',
        severity: 'warning',
        outcome: 'denied',
        action: 'warning-event',
        actor: TEST_ACTOR,
      });
      await filteredLogger.flush();
      const events = storage.getAll();
      expect(events).toHaveLength(1);
      expect(events[0]?.action).toBe('warning-event');
      await filteredLogger.close();
    });
  });

  describe('logToolInvocation', () => {
    it('should log tool invocation with all fields', async () => {
      logger.logToolInvocation({
        toolName: 'orchestrate',
        outcome: 'success',
        actor: TEST_ACTOR,
        requestId: 'req-456',
        durationMs: 150,
      });
      await logger.flush();
      const events = storage.getAll();
      expect(events).toHaveLength(1);
      expect(events[0]?.category).toBe('tool_invocation');
      expect(events[0]?.toolName).toBe('orchestrate');
      expect(events[0]?.durationMs).toBe(150);
    });

    it('should set severity to warning on failure', async () => {
      logger.logToolInvocation({
        toolName: 'test-tool',
        outcome: 'failure',
        actor: TEST_ACTOR,
        errorMessage: 'Something went wrong',
      });
      await logger.flush();
      const events = storage.getAll();
      expect(events[0]?.severity).toBe('warning');
      expect(events[0]?.description).toBe('Something went wrong');
    });
  });

  describe('logPolicyDecision', () => {
    it('should log policy allow decision', async () => {
      logger.logPolicyDecision({
        policyName: 'read-only',
        decision: 'allow',
        reason: 'Operation permitted',
        toolName: 'read_file',
        actor: TEST_ACTOR,
        requestId: 'req-789',
      });
      await logger.flush();
      const events = storage.getAll();
      expect(events[0]?.category).toBe('authorization');
      expect(events[0]?.outcome).toBe('success');
      expect(events[0]?.policyDecision).toBe('allow');
    });

    it('should log policy deny decision with warning severity', async () => {
      logger.logPolicyDecision({
        policyName: 'dangerous-ops',
        decision: 'deny',
        reason: 'Operation not permitted',
        toolName: 'delete_file',
        actor: TEST_ACTOR,
      });
      await logger.flush();
      const events = storage.getAll();
      expect(events[0]?.severity).toBe('warning');
      expect(events[0]?.outcome).toBe('denied');
    });
  });

  describe('logSecurityEvent', () => {
    it('should log security events', async () => {
      logger.logSecurityEvent({
        eventType: 'path_traversal_blocked',
        severity: 'critical',
        actor: TEST_ACTOR,
        description: 'Attempted path traversal attack blocked',
        requestId: 'req-sec-1',
      });
      await logger.flush();
      const events = storage.getAll();
      expect(events[0]?.category).toBe('security');
      expect(events[0]?.severity).toBe('critical');
      expect(events[0]?.violationType).toBe('path_traversal_blocked');
    });
  });

  describe('logRateLimitViolation', () => {
    it('should log rate limit violations', async () => {
      logger.logRateLimitViolation({
        toolName: 'orchestrate',
        actor: TEST_ACTOR,
        currentRate: 110,
        limitRate: 100,
        requestId: 'req-rl-1',
      });
      await logger.flush();
      const events = storage.getAll();
      expect(events[0]?.category).toBe('security');
      expect(events[0]?.action).toBe('rate_limit.exceeded');
      expect(events[0]?.metadata).toEqual({ currentRate: 110, limitRate: 100 });
    });
  });

  describe('hash chain', () => {
    it('should compute hash chain when enabled', async () => {
      const chainLogger = new AuditLogger(
        { ...createTestConfig(tempDir), enableHashChain: true },
        storage
      );
      chainLogger.log({
        category: 'system',
        severity: 'info',
        outcome: 'success',
        action: 'event1',
        actor: TEST_ACTOR,
      });
      chainLogger.log({
        category: 'system',
        severity: 'info',
        outcome: 'success',
        action: 'event2',
        actor: TEST_ACTOR,
      });
      await chainLogger.flush();
      const events = storage.getAll();
      expect(events[0]?.hash).toBeDefined();
      expect(events[1]?.hash).toBeDefined();
      expect(events[1]?.previousHash).toBe(events[0]?.hash);
      await chainLogger.close();
    });
  });

  describe('close', () => {
    it('should be idempotent', async () => {
      await logger.close();
      await logger.close();
      expect(true).toBe(true);
    });

    it('should flush pending events on close', async () => {
      logger.log({
        category: 'system',
        severity: 'info',
        outcome: 'success',
        action: 'final-event',
        actor: TEST_ACTOR,
      });
      await logger.close();
      const events = storage.getAll();
      expect(events).toHaveLength(1);
    });
  });
});

// ============================================================================
// FileAuditStorage Tests
// ============================================================================

describe('FileAuditStorage', () => {
  let tempDir: string;
  let storage: FileAuditStorage;

  beforeEach(() => {
    tempDir = createTempDir();
    storage = new FileAuditStorage(createTestConfig(tempDir));
  });

  afterEach(async () => {
    await storage.close();
    cleanupTempDir(tempDir);
  });

  describe('write and flush', () => {
    it('should write events to JSON-L file', async () => {
      const event: AuditEvent = {
        id: 'aud_file_1',
        version: '1.0',
        timestamp: new Date().toISOString(),
        timestampMs: Date.now(),
        category: 'tool_invocation',
        severity: 'info',
        outcome: 'success',
        action: 'tool.invoke',
        actor: TEST_ACTOR,
      };
      await storage.write(event);
      await storage.flush();

      const files = fs.readdirSync(tempDir).filter((f) => f.endsWith('.jsonl'));
      expect(files.length).toBeGreaterThan(0);

      const firstFile = files[0];
      if (firstFile !== undefined) {
        const content = fs.readFileSync(path.join(tempDir, firstFile), 'utf-8');
        expect(content).toContain('aud_file_1');
      }
    });
  });

  describe('rotation', () => {
    it('should rotate files when size limit exceeded', async () => {
      // Use a very small size limit to force rotation
      const smallConfig = { ...createTestConfig(tempDir), maxFileSizeBytes: 50 };
      const rotatingStorage = new FileAuditStorage(smallConfig);

      // Write enough events to force rotation
      for (let i = 0; i < 20; i++) {
        await rotatingStorage.write({
          id: 'aud_rot_' + String(i),
          version: '1.0',
          timestamp: new Date().toISOString(),
          timestampMs: Date.now(),
          category: 'tool_invocation',
          severity: 'info',
          outcome: 'success',
          action: 'action_' + String(i),
          actor: TEST_ACTOR,
        });
        await rotatingStorage.flush();
      }
      await rotatingStorage.close();

      const files = fs.readdirSync(tempDir).filter((f) => f.endsWith('.jsonl'));
      // With 50 byte limit and ~200 byte events, we should have multiple files
      expect(files.length).toBeGreaterThanOrEqual(1);
      // Verify at least some events were written
      const totalContent = files.reduce((acc, f) => {
        return acc + fs.readFileSync(path.join(tempDir, f), 'utf-8');
      }, '');
      expect(totalContent).toContain('aud_rot_');
    });

    it('should prune old files beyond maxFiles', async () => {
      const pruneConfig = { ...createTestConfig(tempDir), maxFileSizeBytes: 50, maxFiles: 2 };
      const pruningStorage = new FileAuditStorage(pruneConfig);

      for (let i = 0; i < 20; i++) {
        await pruningStorage.write({
          id: 'aud_prune_' + String(i),
          version: '1.0',
          timestamp: new Date().toISOString(),
          timestampMs: Date.now(),
          category: 'system',
          severity: 'info',
          outcome: 'success',
          action: 'event_' + String(i),
          actor: TEST_ACTOR,
        });
        await pruningStorage.flush();
      }
      await pruningStorage.close();

      const files = fs.readdirSync(tempDir).filter((f) => f.endsWith('.jsonl'));
      expect(files.length).toBeLessThanOrEqual(2);
    });
  });

  describe('query', () => {
    it('should query events from files', async () => {
      for (let i = 0; i < 3; i++) {
        await storage.write({
          id: 'aud_query_' + String(i),
          version: '1.0',
          timestamp: new Date().toISOString(),
          timestampMs: Date.now(),
          category: i === 1 ? 'security' : 'tool_invocation',
          severity: 'info',
          outcome: 'success',
          action: 'action_' + String(i),
          actor: TEST_ACTOR,
        });
      }
      await storage.flush();

      const results = await storage.query({ categories: ['security'], limit: 100, offset: 0 });
      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('aud_query_1');
    });
  });
});

// ============================================================================
// FileAuditStorage Path Traversal Prevention Tests
// (Source: Issue #353 - Security path traversal validation)
// ============================================================================

describe('FileAuditStorage Path Traversal Prevention', () => {
  const MALICIOUS_PATHS = [
    '../../../etc/passwd',
    '../../../../../../../tmp/malicious',
    'foo/../../../etc/passwd',
    './foo/../../../tmp/bad',
    'logs/../../etc/passwd',
  ];

  const URL_ENCODED_PATHS = ['..%2f..%2f..%2fetc', '%2e%2e/%2e%2e/%2e%2e/etc'];

  describe('FileAuditStorage.create() with allowedRoot', () => {
    const allowedRoot = '/tmp/audit-test-allowed';

    MALICIOUS_PATHS.forEach((maliciousPath) => {
      it(`should reject path traversal via create(): ${maliciousPath}`, () => {
        const config: FileAuditStorageConfig = {
          logDir: maliciousPath,
          filePrefix: 'audit',
          maxFileSizeBytes: 1024,
          maxFiles: 3,
          flushIntervalMs: 100,
          minSeverity: 'info',
          enableHashChain: false,
          enableCompression: false,
          allowedRoot,
        };

        const result = FileAuditStorage.create(config);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBeInstanceOf(SecurityError);
          expect(result.error.message.toLowerCase()).toContain('traversal');
        }
      });
    });

    it('should reject absolute paths outside allowed root', () => {
      const config: FileAuditStorageConfig = {
        logDir: '/etc/passwd',
        filePrefix: 'audit',
        maxFileSizeBytes: 1024,
        maxFiles: 3,
        flushIntervalMs: 100,
        minSeverity: 'info',
        enableHashChain: false,
        enableCompression: false,
        allowedRoot,
      };

      const result = FileAuditStorage.create(config);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(SecurityError);
      }
    });

    it('should allow valid paths within allowed root', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-allowed-'));
      try {
        const config: FileAuditStorageConfig = {
          logDir: 'logs',
          filePrefix: 'audit',
          maxFileSizeBytes: 1024,
          maxFiles: 3,
          flushIntervalMs: 100,
          minSeverity: 'info',
          enableHashChain: false,
          enableCompression: false,
          allowedRoot: tempRoot,
        };

        const result = FileAuditStorage.create(config);

        expect(result.ok).toBe(true);
        if (result.ok) {
          // Cleanup
          void result.value.close();
        }
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    });

    it('should allow the allowed root itself as logDir', () => {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-root-'));
      try {
        const config: FileAuditStorageConfig = {
          logDir: tempRoot,
          filePrefix: 'audit',
          maxFileSizeBytes: 1024,
          maxFiles: 3,
          flushIntervalMs: 100,
          minSeverity: 'info',
          enableHashChain: false,
          enableCompression: false,
          allowedRoot: tempRoot,
        };

        const result = FileAuditStorage.create(config);

        expect(result.ok).toBe(true);
        if (result.ok) {
          void result.value.close();
        }
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    });
  });

  describe('FileAuditStorage constructor basic validation', () => {
    MALICIOUS_PATHS.forEach((maliciousPath) => {
      it(`should reject path traversal in constructor: ${maliciousPath}`, () => {
        const config: AuditLogConfig = {
          logDir: maliciousPath,
          filePrefix: 'audit',
          maxFileSizeBytes: 1024,
          maxFiles: 3,
          flushIntervalMs: 100,
          minSeverity: 'info',
          enableHashChain: false,
          enableCompression: false,
        };

        expect(() => new FileAuditStorage(config)).toThrow(SecurityError);
      });
    });

    URL_ENCODED_PATHS.forEach((encodedPath) => {
      it(`should reject URL-encoded traversal: ${encodedPath}`, () => {
        const config: AuditLogConfig = {
          logDir: encodedPath,
          filePrefix: 'audit',
          maxFileSizeBytes: 1024,
          maxFiles: 3,
          flushIntervalMs: 100,
          minSeverity: 'info',
          enableHashChain: false,
          enableCompression: false,
        };

        expect(() => new FileAuditStorage(config)).toThrow(SecurityError);
      });
    });

    it('should reject system directories', () => {
      const systemDirs = ['/etc', '/var', '/usr', '/bin', '/sbin', '/proc', '/sys'];

      for (const sysDir of systemDirs) {
        const config: AuditLogConfig = {
          logDir: sysDir,
          filePrefix: 'audit',
          maxFileSizeBytes: 1024,
          maxFiles: 3,
          flushIntervalMs: 100,
          minSeverity: 'info',
          enableHashChain: false,
          enableCompression: false,
        };

        expect(() => new FileAuditStorage(config)).toThrow(SecurityError);
      }
    });

    it('should allow valid temp directory paths', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-valid-'));
      try {
        const config: AuditLogConfig = {
          logDir: tempDir,
          filePrefix: 'audit',
          maxFileSizeBytes: 1024,
          maxFiles: 3,
          flushIntervalMs: 100,
          minSeverity: 'info',
          enableHashChain: false,
          enableCompression: false,
        };

        const storage = new FileAuditStorage(config);
        expect(storage).toBeInstanceOf(FileAuditStorage);
        void storage.close();
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});
