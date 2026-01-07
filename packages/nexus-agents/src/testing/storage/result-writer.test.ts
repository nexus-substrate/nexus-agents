/**
 * Tests for ResultWriter
 *
 * Tests file operations using temporary directories.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  ResultWriter,
  createResultWriter,
  generateTimestamp,
  getETDisplayTime,
  ResultWriterError,
  ResultWriterErrorCode,
} from './result-writer.js';
import type { TestRunResult } from '../schemas.js';

/**
 * Create a valid test run result for testing
 */
function createTestRunResult(overrides: Partial<TestRunResult> = {}): TestRunResult {
  const timestamp = overrides.timestamp ?? new Date().toISOString();
  return {
    id: 'test-run-001',
    timestamp,
    timezone: 'America/New_York',
    suites: [
      {
        name: 'Example Suite',
        adapter: 'claude',
        testCases: [
          {
            name: 'should pass',
            status: 'passed',
            durationMs: 100,
            assertions: [{ name: 'equals', passed: true }],
          },
          {
            name: 'should fail',
            status: 'failed',
            durationMs: 50,
            assertions: [{ name: 'equals', passed: false, expected: 'foo', actual: 'bar' }],
            error: 'Values do not match',
          },
        ],
        durationMs: 150,
        passed: 1,
        failed: 1,
        skipped: 0,
        errors: 0,
      },
    ],
    totalDurationMs: 150,
    summary: {
      totalTests: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
      errors: 0,
      passRate: 50,
    },
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      nexusAgentsVersion: '2.0.1',
    },
    ...overrides,
  };
}

describe('ResultWriter', () => {
  let tempDir: string;
  let writer: ResultWriter;

  beforeEach(async () => {
    // Create unique temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'result-writer-test-'));
    writer = createResultWriter({
      outputDir: tempDir,
      keepHistory: 3,
      includeDetailedResults: true,
      prettyPrint: true,
    });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('write', () => {
    it('should write result to latest.json', async () => {
      const result = createTestRunResult();
      const writeResult = await writer.write(result);

      expect(writeResult.ok).toBe(true);
      if (writeResult.ok) {
        expect(writeResult.value).toBe(path.join(tempDir, 'latest.json'));
      }

      const latestPath = path.join(tempDir, 'latest.json');
      const content = await fs.readFile(latestPath, 'utf-8');
      const parsed = JSON.parse(content) as TestRunResult;

      expect(parsed.id).toBe(result.id);
      expect(parsed.timestamp).toBe(result.timestamp);
    });

    it('should write result to history directory', async () => {
      const timestamp = '2026-01-05T15:30:00.000Z';
      const result = createTestRunResult({ timestamp });
      await writer.write(result);

      const historyPath = path.join(tempDir, 'history', '2026-01-05T15-30-00-000Z.json');
      const content = await fs.readFile(historyPath, 'utf-8');
      const parsed = JSON.parse(content) as TestRunResult;

      expect(parsed.id).toBe(result.id);
    });

    it('should create directories if they do not exist', async () => {
      const newDir = path.join(tempDir, 'nested', 'output');
      const newWriter = createResultWriter({
        outputDir: newDir,
        keepHistory: 3,
        includeDetailedResults: true,
        prettyPrint: true,
      });

      const result = createTestRunResult();
      const writeResult = await newWriter.write(result);

      expect(writeResult.ok).toBe(true);

      const dirExists = await fs
        .stat(newDir)
        .then(() => true)
        .catch(() => false);
      expect(dirExists).toBe(true);
    });

    it('should handle multiple writes', async () => {
      const result1 = createTestRunResult({
        id: 'run-1',
        timestamp: '2026-01-05T10:00:00.000Z',
      });
      const result2 = createTestRunResult({
        id: 'run-2',
        timestamp: '2026-01-05T11:00:00.000Z',
      });

      await writer.write(result1);
      await writer.write(result2);

      // Latest should be the most recent write
      const latestResult = await writer.readLatest();
      expect(latestResult.ok).toBe(true);
      if (latestResult.ok && latestResult.value) {
        expect(latestResult.value.id).toBe('run-2');
      }

      // Both should be in history
      const historyResult = await writer.listHistory();
      expect(historyResult.ok).toBe(true);
      if (historyResult.ok) {
        expect(historyResult.value).toHaveLength(2);
      }
    });
  });

  describe('readLatest', () => {
    it('should return null when no results exist', async () => {
      const result = await writer.readLatest();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('should return the latest result', async () => {
      const testResult = createTestRunResult({ id: 'latest-test' });
      await writer.write(testResult);

      const result = await writer.readLatest();

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.id).toBe('latest-test');
      }
    });

    it('should return error for invalid JSON', async () => {
      // Manually create invalid file
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(path.join(tempDir, 'latest.json'), 'not valid json', 'utf-8');

      const result = await writer.readLatest();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ResultWriterError);
        expect(result.error.code).toBe(ResultWriterErrorCode.READ_FAILED);
      }
    });

    it('should return error for invalid schema', async () => {
      // Manually create file with invalid schema
      await fs.mkdir(tempDir, { recursive: true });
      await fs.writeFile(
        path.join(tempDir, 'latest.json'),
        JSON.stringify({ invalid: true }),
        'utf-8'
      );

      const result = await writer.readLatest();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ResultWriterError);
        expect(result.error.code).toBe(ResultWriterErrorCode.PARSE_FAILED);
      }
    });
  });

  describe('readHistory', () => {
    it('should return null for non-existent timestamp', async () => {
      const result = await writer.readHistory('2026-01-01T00:00:00.000Z');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeNull();
      }
    });

    it('should return specific historical result', async () => {
      const timestamp = '2026-01-05T12:00:00.000Z';
      const testResult = createTestRunResult({ id: 'history-test', timestamp });
      await writer.write(testResult);

      const result = await writer.readHistory(timestamp);

      expect(result.ok).toBe(true);
      if (result.ok && result.value) {
        expect(result.value.id).toBe('history-test');
        expect(result.value.timestamp).toBe(timestamp);
      }
    });
  });

  describe('listHistory', () => {
    it('should return empty array when no history exists', async () => {
      const result = await writer.listHistory();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toEqual([]);
      }
    });

    it('should list all historical timestamps sorted newest first', async () => {
      const timestamps = [
        '2026-01-05T10:00:00.000Z',
        '2026-01-05T12:00:00.000Z',
        '2026-01-05T11:00:00.000Z',
      ];

      for (const ts of timestamps) {
        const testResult = createTestRunResult({ timestamp: ts });
        await writer.write(testResult);
      }

      const result = await writer.listHistory();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(3);
        expect(result.value[0]).toBe('2026-01-05T12:00:00.000Z');
        expect(result.value[1]).toBe('2026-01-05T11:00:00.000Z');
        expect(result.value[2]).toBe('2026-01-05T10:00:00.000Z');
      }
    });
  });

  describe('pruneHistory', () => {
    it('should not delete when under keepHistory limit', async () => {
      const timestamps = ['2026-01-05T10:00:00.000Z', '2026-01-05T11:00:00.000Z'];

      for (const ts of timestamps) {
        await writer.write(createTestRunResult({ timestamp: ts }));
      }

      const result = await writer.pruneHistory();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(0);
      }

      const listResult = await writer.listHistory();
      if (listResult.ok) {
        expect(listResult.value).toHaveLength(2);
      }
    });

    it('should delete oldest files when over keepHistory limit', async () => {
      const timestamps = [
        '2026-01-05T10:00:00.000Z',
        '2026-01-05T11:00:00.000Z',
        '2026-01-05T12:00:00.000Z',
        '2026-01-05T13:00:00.000Z',
        '2026-01-05T14:00:00.000Z',
      ];

      for (const ts of timestamps) {
        await writer.write(createTestRunResult({ timestamp: ts }));
      }

      // Should have pruned during write, but call explicitly to verify
      const result = await writer.pruneHistory();

      expect(result.ok).toBe(true);

      const listResult = await writer.listHistory();
      if (listResult.ok) {
        // Should keep only 3 most recent (keepHistory = 3)
        expect(listResult.value).toHaveLength(3);
        expect(listResult.value).toContain('2026-01-05T14:00:00.000Z');
        expect(listResult.value).toContain('2026-01-05T13:00:00.000Z');
        expect(listResult.value).toContain('2026-01-05T12:00:00.000Z');
        expect(listResult.value).not.toContain('2026-01-05T10:00:00.000Z');
        expect(listResult.value).not.toContain('2026-01-05T11:00:00.000Z');
      }
    });
  });

  describe('timestamp conversion', () => {
    it('should round-trip timestamp through filename conversion', async () => {
      const originalTimestamp = '2026-01-05T15:30:45.123Z';
      const testResult = createTestRunResult({ timestamp: originalTimestamp });
      await writer.write(testResult);

      const listResult = await writer.listHistory();
      expect(listResult.ok).toBe(true);
      if (listResult.ok) {
        expect(listResult.value).toContain(originalTimestamp);
      }

      const readResult = await writer.readHistory(originalTimestamp);
      expect(readResult.ok).toBe(true);
      if (readResult.ok && readResult.value) {
        expect(readResult.value.timestamp).toBe(originalTimestamp);
      }
    });
  });
});

describe('generateTimestamp', () => {
  it('should return valid ISO 8601 timestamp', () => {
    const timestamp = generateTimestamp();

    // Should match ISO 8601 format
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    // Should be parseable
    const date = new Date(timestamp);
    expect(date.getTime()).not.toBeNaN();
  });

  it('should return current time', () => {
    const before = Date.now();
    const timestamp = generateTimestamp();
    const after = Date.now();

    const generatedTime = new Date(timestamp).getTime();
    expect(generatedTime).toBeGreaterThanOrEqual(before);
    expect(generatedTime).toBeLessThanOrEqual(after);
  });
});

describe('getETDisplayTime', () => {
  it('should format timestamp in America/New_York timezone', () => {
    // Use a known timestamp where we can verify the conversion
    // 2026-01-05T15:30:00.000Z is 10:30 AM ET (EST, UTC-5)
    const timestamp = '2026-01-05T15:30:00.000Z';
    const display = getETDisplayTime(timestamp);

    // Format should be MM/DD/YYYY, HH:MM:SS
    expect(display).toMatch(/\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}:\d{2}/);

    // Should show 10:30:00 (EST is UTC-5)
    expect(display).toContain('10:30:00');
  });
});

describe('ResultWriterError', () => {
  it('should have correct properties', () => {
    const cause = new Error('underlying error');
    const error = new ResultWriterError('Test error', ResultWriterErrorCode.WRITE_FAILED, cause);

    expect(error.name).toBe('ResultWriterError');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe(ResultWriterErrorCode.WRITE_FAILED);
    expect(error.cause).toBe(cause);
  });
});
