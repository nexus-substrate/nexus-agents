/**
 * Tests for FileAuditStorage and path validation helpers
 * @module audit/audit-storage.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { FixedTimeProvider, setTimeProvider, resetTimeProvider } from '../core/time-provider.js';
import { SecurityError } from '../core/index.js';
import { FileAuditStorage } from './audit-storage.js';
import type { FileAuditStorageConfig } from './audit-storage.js';
import type { AuditEvent, AuditLogConfig } from './audit-types.js';

vi.mock('node:fs');
vi.mock('./audit-storage-queries.js', () => ({
  matchesCriteria: vi.fn(() => true),
  matchesTimeRange: vi.fn(() => true),
  matchesClassification: vi.fn(() => true),
  matchesIdentifiers: vi.fn(() => true),
  InMemoryAuditStorage: vi.fn(),
  readAuditFile: vi.fn(() => Promise.resolve([])),
}));

// ============================================================================
// Test Helpers
// ============================================================================

const FIXED_TIME = new Date('2025-06-15T10:30:45.000Z').getTime();

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeConfig(overrides?: Partial<AuditLogConfig>) {
  return {
    logDir: '/tmp/test-audit-logs',
    filePrefix: 'audit',
    maxFileSizeBytes: 1024 * 1024,
    maxFiles: 5,
    enableHashChain: false,
    enableCompression: false,
    flushIntervalMs: 1000,
    minSeverity: 'info' as const,
    ...overrides,
  };
}

function makeEvent(overrides?: Partial<AuditEvent>): AuditEvent {
  return {
    id: 'evt-1',
    version: '1.0',
    timestamp: '2025-06-15T10:30:45.000Z',
    timestampMs: FIXED_TIME,
    category: 'tool_invocation',
    severity: 'info',
    outcome: 'success',
    action: 'tool.invoke',
    actor: { type: 'agent', id: 'agent-1' },
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setupFsMocks() {
  const mockStream = {
    write: vi.fn((_data: string, cb: (err?: Error | null) => void) => {
      cb(null);
    }),
    end: vi.fn((cb?: () => void) => {
      if (cb) cb();
    }),
    on: vi.fn(),
  };

  vi.mocked(fs.existsSync).mockReturnValue(true);
  vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
  vi.mocked(fs.readdirSync).mockReturnValue([]);
  vi.mocked(fs.createWriteStream).mockReturnValue(mockStream as unknown as fs.WriteStream);

  return mockStream;
}

beforeEach(() => {
  vi.clearAllMocks();
  setTimeProvider(new FixedTimeProvider(FIXED_TIME));
});

afterEach(() => {
  resetTimeProvider();
});

// ============================================================================
// FileAuditStorage.create() - Path Validation with allowedRoot
// ============================================================================

describe('FileAuditStorage.create()', () => {
  it('returns ok for a valid logDir within allowedRoot', () => {
    setupFsMocks();
    const config: FileAuditStorageConfig = {
      ...makeConfig(),
      logDir: 'logs/audit',
      allowedRoot: '/tmp/safe',
    };

    const result = FileAuditStorage.create(config);

    expect(result.ok).toBe(true);
  });

  it('returns error for path traversal escaping allowedRoot', () => {
    const config: FileAuditStorageConfig = {
      ...makeConfig(),
      logDir: '../../../etc/evil',
      allowedRoot: '/tmp/safe',
    };

    const result = FileAuditStorage.create(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(SecurityError);
      expect(result.error.message).toContain('Path traversal detected');
    }
  });

  it('returns error for encoded path traversal (%2e%2e)', () => {
    const config: FileAuditStorageConfig = {
      ...makeConfig(),
      logDir: '%2e%2e/escape',
    };

    const result = FileAuditStorage.create(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(SecurityError);
    }
  });

  it('returns error for double-encoded traversal (%252e%252e)', () => {
    const config: FileAuditStorageConfig = {
      ...makeConfig(),
      logDir: '%252e%252e/escape',
    };

    const result = FileAuditStorage.create(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(SecurityError);
    }
  });

  it('returns error for system directory /etc', () => {
    const config: FileAuditStorageConfig = {
      ...makeConfig(),
      logDir: '/etc/audit',
    };

    const result = FileAuditStorage.create(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(SecurityError);
      expect(result.error.message).toContain('system directory');
    }
  });

  it('returns error for system directory /var', () => {
    const config: FileAuditStorageConfig = {
      ...makeConfig(),
      logDir: '/var/log/audit',
    };

    const result = FileAuditStorage.create(config);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(SecurityError);
    }
  });

  it('accepts allowedRoot equal to logDir (root itself)', () => {
    setupFsMocks();
    const config: FileAuditStorageConfig = {
      ...makeConfig(),
      logDir: '.',
      allowedRoot: '/tmp/safe',
    };

    const result = FileAuditStorage.create(config);

    // logDir resolves to allowedRoot itself, which is allowed
    expect(result.ok).toBe(true);
  });

  it('accepts valid subdirectory of allowedRoot', () => {
    setupFsMocks();
    const config: FileAuditStorageConfig = {
      ...makeConfig(),
      logDir: 'sub/dir/logs',
      allowedRoot: '/tmp/safe',
    };

    const result = FileAuditStorage.create(config);

    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// FileAuditStorage constructor - Direct Instantiation
// ============================================================================

describe('FileAuditStorage constructor', () => {
  it('creates log directory if it does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.createWriteStream).mockReturnValue({
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    } as unknown as fs.WriteStream);

    new FileAuditStorage(makeConfig());

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
  });

  it('does not create directory if it already exists', () => {
    setupFsMocks();

    new FileAuditStorage(makeConfig());

    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });

  it('throws SecurityError for path traversal in constructor', () => {
    expect(() => {
      new FileAuditStorage(makeConfig({ logDir: '../../../etc/evil' }));
    }).toThrow(SecurityError);
  });

  it('skips validation when skipValidation is true', () => {
    setupFsMocks();

    // skipValidation = true (third arg), used internally by create()
    const storage = new FileAuditStorage(makeConfig(), undefined, true);

    expect(storage).toBeDefined();
  });

  it('resumes existing file below max size', () => {
    const mockStream = setupFsMocks();
    vi.mocked(fs.readdirSync).mockReturnValue(['audit-2025-06-15-10-30-45.jsonl'] as never);
    vi.mocked(fs.statSync).mockReturnValue({ size: 100 } as fs.Stats);

    new FileAuditStorage(makeConfig());

    expect(fs.createWriteStream).toHaveBeenCalledWith(
      expect.stringContaining('audit-2025-06-15-10-30-45.jsonl'),
      { flags: 'a' }
    );
    expect(mockStream.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('rotates when existing file exceeds max size', () => {
    setupFsMocks();
    vi.mocked(fs.readdirSync).mockReturnValue(['audit-2025-06-15-10-30-45.jsonl'] as never);
    vi.mocked(fs.statSync).mockReturnValue({
      size: 2 * 1024 * 1024,
    } as fs.Stats);

    new FileAuditStorage(makeConfig());

    // Should have created a new file (rotated)
    expect(fs.createWriteStream).toHaveBeenCalled();
  });
});

// ============================================================================
// FileAuditStorage.write()
// ============================================================================

describe('FileAuditStorage.write()', () => {
  it('buffers an event as JSON-L line', async () => {
    setupFsMocks();
    const storage = new FileAuditStorage(makeConfig(), undefined, true);

    await storage.write(makeEvent());

    // Buffer is internal; verify via flush behavior
    expect(storage).toBeDefined();
  });

  it('triggers rotation when buffer exceeds maxFileSizeBytes', async () => {
    const mockStream = setupFsMocks();
    const config = makeConfig({ maxFileSizeBytes: 50 });
    const storage = new FileAuditStorage(config, undefined, true);

    const event = makeEvent({ description: 'A'.repeat(100) });
    await storage.write(event);

    // Rotation triggers end() on previous stream
    expect(mockStream.end).toHaveBeenCalled();
  });

  it('handles multiple writes without error', async () => {
    setupFsMocks();
    const storage = new FileAuditStorage(makeConfig(), undefined, true);

    await storage.write(makeEvent({ id: 'evt-1' }));
    await storage.write(makeEvent({ id: 'evt-2' }));
    await storage.write(makeEvent({ id: 'evt-3' }));

    expect(storage).toBeDefined();
  });
});

// ============================================================================
// FileAuditStorage.flush()
// ============================================================================

describe('FileAuditStorage.flush()', () => {
  it('resolves immediately when buffer is empty', async () => {
    setupFsMocks();
    const storage = new FileAuditStorage(makeConfig(), undefined, true);

    await expect(storage.flush()).resolves.toBeUndefined();
  });

  it('writes buffered data to stream on flush', async () => {
    const mockStream = setupFsMocks();
    const storage = new FileAuditStorage(makeConfig(), undefined, true);

    await storage.write(makeEvent());
    await storage.flush();

    expect(mockStream.write).toHaveBeenCalledWith(
      expect.stringContaining('"id":"evt-1"'),
      expect.any(Function)
    );
  });

  it('rejects when stream write fails', async () => {
    const writeError = new Error('disk full');
    const mockStream = setupFsMocks();
    mockStream.write.mockImplementation((_data: string, cb: (err?: Error | null) => void) => {
      cb(writeError);
    });
    const storage = new FileAuditStorage(makeConfig(), undefined, true);

    await storage.write(makeEvent());

    await expect(storage.flush()).rejects.toThrow('Failed to flush audit log');
  });

  it('clears write buffer after successful flush', async () => {
    const mockStream = setupFsMocks();
    const storage = new FileAuditStorage(makeConfig(), undefined, true);

    await storage.write(makeEvent());
    await storage.flush();

    // Second flush should be a no-op (empty buffer)
    mockStream.write.mockClear();
    await storage.flush();
    expect(mockStream.write).not.toHaveBeenCalled();
  });
});

// ============================================================================
// FileAuditStorage.close()
// ============================================================================

describe('FileAuditStorage.close()', () => {
  it('flushes and closes the write stream', async () => {
    const mockStream = setupFsMocks();
    const storage = new FileAuditStorage(makeConfig(), undefined, true);

    await storage.write(makeEvent());
    await storage.close();

    expect(mockStream.write).toHaveBeenCalled();
    expect(mockStream.end).toHaveBeenCalled();
  });

  it('resolves when writeStream is already null', async () => {
    setupFsMocks();
    const storage = new FileAuditStorage(makeConfig(), undefined, true);

    // Close twice - second time stream should be null
    await storage.close();
    await expect(storage.close()).resolves.toBeUndefined();
  });
});

// ============================================================================
// FileAuditStorage.query()
// ============================================================================

describe('FileAuditStorage.query()', () => {
  it('returns empty array when no log files exist', async () => {
    setupFsMocks();
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    const storage = new FileAuditStorage(makeConfig(), undefined, true);

    const results = await storage.query({ limit: 10, offset: 0 });

    expect(results).toEqual([]);
  });

  it('delegates to readAuditFile for each log file', async () => {
    setupFsMocks();
    const { readAuditFile } = await import('./audit-storage-queries.js');
    const event = makeEvent();
    vi.mocked(readAuditFile).mockImplementation(() => Promise.resolve([event]));
    // Return files for query but not for constructor init
    let callCount = 0;
    vi.mocked(fs.readdirSync).mockImplementation((() => {
      callCount++;
      if (callCount <= 1) return [];
      return ['audit-2025-06-15.jsonl'];
    }) as unknown as typeof fs.readdirSync);

    const storage = new FileAuditStorage(makeConfig(), undefined, true);
    const results = await storage.query({ limit: 10, offset: 0 });

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(event);
  });

  it('respects offset and skips events', async () => {
    setupFsMocks();
    const { readAuditFile } = await import('./audit-storage-queries.js');
    const events = [
      makeEvent({ id: 'evt-1' }),
      makeEvent({ id: 'evt-2' }),
      makeEvent({ id: 'evt-3' }),
    ];
    vi.mocked(readAuditFile).mockImplementation(() => Promise.resolve(events));
    let callCount = 0;
    vi.mocked(fs.readdirSync).mockImplementation((() => {
      callCount++;
      if (callCount <= 1) return [];
      return ['audit-2025-06-15.jsonl'];
    }) as unknown as typeof fs.readdirSync);

    const storage = new FileAuditStorage(makeConfig(), undefined, true);
    const results = await storage.query({ limit: 10, offset: 2 });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe('evt-3');
  });

  it('respects limit and stops collecting', async () => {
    setupFsMocks();
    const { readAuditFile } = await import('./audit-storage-queries.js');
    const events = [
      makeEvent({ id: 'evt-1' }),
      makeEvent({ id: 'evt-2' }),
      makeEvent({ id: 'evt-3' }),
    ];
    vi.mocked(readAuditFile).mockImplementation(() => Promise.resolve(events));
    let callCount = 0;
    vi.mocked(fs.readdirSync).mockImplementation((() => {
      callCount++;
      if (callCount <= 1) return [];
      return ['audit-2025-06-15.jsonl'];
    }) as unknown as typeof fs.readdirSync);

    const storage = new FileAuditStorage(makeConfig(), undefined, true);
    const results = await storage.query({ limit: 2, offset: 0 });

    expect(results).toHaveLength(2);
  });
});

// ============================================================================
// Pruning Old Files
// ============================================================================

describe('file pruning', () => {
  it('deletes files exceeding maxFiles on rotation', async () => {
    setupFsMocks();
    const config = makeConfig({ maxFiles: 2, maxFileSizeBytes: 10 });

    // Constructor init: no files, creates new one
    let callCount = 0;
    vi.mocked(fs.readdirSync).mockImplementation((() => {
      callCount++;
      // First call (initCurrentFile): no files
      if (callCount <= 1) return [];
      // Subsequent calls (pruneOldFiles after rotation): 3 files
      return ['audit-2025-06-15-c.jsonl', 'audit-2025-06-15-b.jsonl', 'audit-2025-06-15-a.jsonl'];
    }) as unknown as typeof fs.readdirSync);

    const storage = new FileAuditStorage(config, undefined, true);

    // Write enough to trigger rotation
    const bigEvent = makeEvent({ description: 'X'.repeat(200) });
    await storage.write(bigEvent);

    expect(fs.unlinkSync).toHaveBeenCalledWith(expect.stringContaining('audit-2025-06-15-a.jsonl'));
  });
});

// ============================================================================
// File Name Generation
// ============================================================================

describe('file name generation', () => {
  it('uses fixed time provider for deterministic file names', () => {
    setupFsMocks();

    new FileAuditStorage(makeConfig(), undefined, true);

    // The createWriteStream call should use the date from fixed time
    expect(fs.createWriteStream).toHaveBeenCalledWith(
      expect.stringContaining('audit-2025-06-15-10-30-45.jsonl'),
      expect.any(Object)
    );
  });

  it('uses configured filePrefix in file name', () => {
    setupFsMocks();

    new FileAuditStorage(makeConfig({ filePrefix: 'security' }), undefined, true);

    expect(fs.createWriteStream).toHaveBeenCalledWith(
      expect.stringContaining('security-2025-06-15'),
      expect.any(Object)
    );
  });
});

// ============================================================================
// Re-exports
// ============================================================================

describe('re-exports from audit-storage-queries', () => {
  it('exports matchesCriteria', async () => {
    const mod = await import('./audit-storage.js');
    expect(mod.matchesCriteria).toBeDefined();
  });

  it('exports matchesTimeRange', async () => {
    const mod = await import('./audit-storage.js');
    expect(mod.matchesTimeRange).toBeDefined();
  });

  it('exports matchesClassification', async () => {
    const mod = await import('./audit-storage.js');
    expect(mod.matchesClassification).toBeDefined();
  });

  it('exports matchesIdentifiers', async () => {
    const mod = await import('./audit-storage.js');
    expect(mod.matchesIdentifiers).toBeDefined();
  });

  it('exports InMemoryAuditStorage', async () => {
    const mod = await import('./audit-storage.js');
    expect(mod.InMemoryAuditStorage).toBeDefined();
  });
});
