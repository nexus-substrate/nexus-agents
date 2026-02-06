/**
 * Tests for Wave Checkpoint Persistence.
 *
 * (Source: Context Exhaustion Prevention - Issue #769 follow-up)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  ensureCheckpointDir,
  appendWaveCheckpoint,
  loadCheckpoints,
  summarizeCheckpoints,
  cleanupCheckpoint,
} from './wave-checkpoint-persistence.js';
import type { WaveTaskResult } from './wave-scheduler-types.js';

// ============================================================================
// Test Helpers
// ============================================================================

let testDir: string;

function createTestDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wave-checkpoint-test-'));
}

function makeResult(taskId: string, tokens: number): WaveTaskResult {
  return {
    taskId,
    success: true,
    output: `Output for ${taskId}`,
    truncated: false,
    originalLength: 20,
    estimatedTokens: tokens,
    durationMs: 100,
  };
}

function makeFailedResult(taskId: string): WaveTaskResult {
  return {
    taskId,
    success: false,
    output: '',
    truncated: false,
    originalLength: 0,
    estimatedTokens: 0,
    durationMs: 50,
    error: 'Task failed',
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function checkpoint(
  sessionId: string,
  waveIndex: number,
  results: readonly WaveTaskResult[],
  totalTokens: number,
  durationMs: number
) {
  return appendWaveCheckpoint({
    sessionId,
    waveIndex,
    results,
    totalTokens,
    durationMs,
    customDir: testDir,
  });
}

beforeEach(() => {
  testDir = createTestDir();
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

// ============================================================================
// ensureCheckpointDir
// ============================================================================

describe('ensureCheckpointDir', () => {
  it('should create directory with custom path', () => {
    const dir = path.join(testDir, 'custom-checkpoints');
    const result = ensureCheckpointDir(dir);
    expect(result.ok).toBe(true);
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('should succeed if directory already exists', () => {
    const dir = path.join(testDir, 'existing');
    fs.mkdirSync(dir, { recursive: true });
    const result = ensureCheckpointDir(dir);
    expect(result.ok).toBe(true);
  });
});

// ============================================================================
// appendWaveCheckpoint + loadCheckpoints
// ============================================================================

describe('appendWaveCheckpoint', () => {
  it('should write and load a single checkpoint', () => {
    const sessionId = 'test-session-1';
    const results = [makeResult('task-a', 500), makeResult('task-b', 300)];

    const writeResult = checkpoint(sessionId, 0, results, 800, 200);
    expect(writeResult.ok).toBe(true);

    const loadResult = loadCheckpoints(sessionId, testDir);
    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok) return;

    expect(loadResult.value).toHaveLength(1);
    const entry = loadResult.value[0]!;
    expect(entry.sessionId).toBe(sessionId);
    expect(entry.waveIndex).toBe(0);
    expect(entry.results).toHaveLength(2);
    expect(entry.totalTokens).toBe(800);
    expect(entry.durationMs).toBe(200);
  });

  it('should append multiple waves as separate JSONL lines', () => {
    const sessionId = 'test-session-multi';

    checkpoint(sessionId, 0, [makeResult('a', 100)], 100, 50);
    checkpoint(sessionId, 1, [makeResult('b', 200)], 200, 75);
    checkpoint(sessionId, 2, [makeResult('c', 300)], 300, 100);

    const loadResult = loadCheckpoints(sessionId, testDir);
    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok) return;

    expect(loadResult.value).toHaveLength(3);
    expect(loadResult.value[0]!.waveIndex).toBe(0);
    expect(loadResult.value[1]!.waveIndex).toBe(1);
    expect(loadResult.value[2]!.waveIndex).toBe(2);
  });

  it('should persist failed task results with error field', () => {
    const sessionId = 'test-session-fail';
    const results = [makeFailedResult('bad-task')];

    checkpoint(sessionId, 0, results, 0, 50);

    const loadResult = loadCheckpoints(sessionId, testDir);
    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok) return;

    const entry = loadResult.value[0]!;
    expect(entry.results[0]!.success).toBe(false);
    expect(entry.results[0]!.error).toBe('Task failed');
  });

  it('should reject session IDs with path traversal', () => {
    const result = appendWaveCheckpoint({
      sessionId: '../escape',
      waveIndex: 0,
      results: [],
      totalTokens: 0,
      durationMs: 0,
      customDir: testDir,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('path traversal');
  });

  it('should reject empty session IDs', () => {
    const result = appendWaveCheckpoint({
      sessionId: '',
      waveIndex: 0,
      results: [],
      totalTokens: 0,
      durationMs: 0,
      customDir: testDir,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('1-128 characters');
  });
});

// ============================================================================
// loadCheckpoints
// ============================================================================

describe('loadCheckpoints', () => {
  it('should return empty array for non-existent session', () => {
    const result = loadCheckpoints('no-such-session', testDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('should skip malformed JSONL lines gracefully', () => {
    const sessionId = 'test-corrupt';
    checkpoint(sessionId, 0, [makeResult('a', 100)], 100, 50);

    const filePath = path.join(testDir, `checkpoint-${sessionId}.jsonl`);
    fs.appendFileSync(filePath, 'this is not json\n');

    checkpoint(sessionId, 1, [makeResult('b', 200)], 200, 75);

    const result = loadCheckpoints(sessionId, testDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toHaveLength(2);
  });

  it('should reject session IDs with forward slashes', () => {
    const result = loadCheckpoints('bad/id', testDir);
    expect(result.ok).toBe(false);
  });
});

// ============================================================================
// summarizeCheckpoints
// ============================================================================

describe('summarizeCheckpoints', () => {
  it('should return null for empty entries', () => {
    expect(summarizeCheckpoints([])).toBeNull();
  });

  it('should produce correct summary from multiple entries', () => {
    const sessionId = 'test-summary';

    checkpoint(sessionId, 0, [makeResult('a', 100), makeResult('b', 200)], 300, 50);
    checkpoint(sessionId, 1, [makeResult('c', 400)], 400, 75);

    const loadResult = loadCheckpoints(sessionId, testDir);
    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok) return;

    const summary = summarizeCheckpoints(loadResult.value);
    expect(summary).not.toBeNull();
    if (summary === null) return;

    expect(summary.sessionId).toBe(sessionId);
    expect(summary.waveCount).toBe(2);
    expect(summary.totalTokens).toBe(700);
    expect(summary.totalTasks).toBe(3);
    expect(summary.lastTimestamp).toBeTruthy();
  });
});

// ============================================================================
// cleanupCheckpoint
// ============================================================================

describe('cleanupCheckpoint', () => {
  it('should remove the checkpoint file', () => {
    const sessionId = 'test-cleanup';
    checkpoint(sessionId, 0, [makeResult('a', 100)], 100, 50);

    const filePath = path.join(testDir, `checkpoint-${sessionId}.jsonl`);
    expect(fs.existsSync(filePath)).toBe(true);

    const result = cleanupCheckpoint(sessionId, testDir);
    expect(result.ok).toBe(true);
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('should succeed silently if file does not exist', () => {
    const result = cleanupCheckpoint('no-such-session', testDir);
    expect(result.ok).toBe(true);
  });

  it('should reject path traversal in cleanup', () => {
    const result = cleanupCheckpoint('../../etc', testDir);
    expect(result.ok).toBe(false);
  });
});
