/**
 * Tests for Session Progress Journal.
 *
 * (Source: Context Exhaustion Prevention - Issue #769 follow-up)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createSessionJournal, loadJournal, summarizeJournal } from './session-journal.js';

// ============================================================================
// Test Helpers
// ============================================================================

let testDir: string;

function createTestDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'session-journal-test-'));
}

beforeEach(() => {
  testDir = createTestDir();
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

// ============================================================================
// createSessionJournal
// ============================================================================

describe('createSessionJournal', () => {
  it('should create a journal instance', () => {
    const result = createSessionJournal('test-session', testDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sessionId).toBe('test-session');
  });

  it('should reject invalid session IDs', () => {
    const result = createSessionJournal('../bad', testDir);
    expect(result.ok).toBe(false);
  });

  it('should reject empty session IDs', () => {
    const result = createSessionJournal('', testDir);
    expect(result.ok).toBe(false);
  });
});

// ============================================================================
// record + loadJournal
// ============================================================================

describe('journal record and load', () => {
  it('should record and load session_start event', () => {
    const journalResult = createSessionJournal('sess-1', testDir);
    expect(journalResult.ok).toBe(true);
    if (!journalResult.ok) return;
    const journal = journalResult.value;

    const writeResult = journal.record('session_start', 'Session started');
    expect(writeResult.ok).toBe(true);

    const loadResult = loadJournal('sess-1', testDir);
    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok) return;

    expect(loadResult.value).toHaveLength(1);
    const entry = loadResult.value[0]!;
    expect(entry.event).toBe('session_start');
    expect(entry.summary).toBe('Session started');
    expect(entry.sessionId).toBe('sess-1');
  });

  it('should record multiple events', () => {
    const journalResult = createSessionJournal('sess-multi', testDir);
    expect(journalResult.ok).toBe(true);
    if (!journalResult.ok) return;
    const journal = journalResult.value;

    journal.record('session_start', 'Started');
    journal.record('task_start', 'Scanning agents/', { taskId: 'scan-1' });
    journal.record('task_complete', 'Scan done', { taskId: 'scan-1', tokensUsed: 5000 });
    journal.record('session_end', 'Session ended normally');

    const loadResult = loadJournal('sess-multi', testDir);
    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok) return;

    expect(loadResult.value).toHaveLength(4);
    expect(loadResult.value[2]!.tokensUsed).toBe(5000);
    expect(loadResult.value[2]!.taskId).toBe('scan-1');
  });

  it('should record events with metadata', () => {
    const journalResult = createSessionJournal('sess-meta', testDir);
    expect(journalResult.ok).toBe(true);
    if (!journalResult.ok) return;
    const journal = journalResult.value;

    journal.record('context_warning', 'Pressure at 80%', {
      metadata: { level: 'warning', utilization: 0.8 },
    });

    const loadResult = loadJournal('sess-meta', testDir);
    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok) return;

    const entry = loadResult.value[0]!;
    expect(entry.metadata).toEqual({ level: 'warning', utilization: 0.8 });
  });
});

// ============================================================================
// recordQuestion
// ============================================================================

describe('recordQuestion', () => {
  it('should record user questions', () => {
    const journalResult = createSessionJournal('sess-q', testDir);
    expect(journalResult.ok).toBe(true);
    if (!journalResult.ok) return;
    const journal = journalResult.value;

    journal.recordQuestion('What is the architecture?');
    journal.recordQuestion('How do I configure routing?');

    const loadResult = loadJournal('sess-q', testDir);
    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok) return;

    expect(loadResult.value).toHaveLength(2);
    expect(loadResult.value[0]!.event).toBe('user_question');
    expect(loadResult.value[0]!.summary).toBe('What is the architecture?');
  });
});

// ============================================================================
// recordTaskMilestone
// ============================================================================

describe('recordTaskMilestone', () => {
  it('should record task start and complete', () => {
    const journalResult = createSessionJournal('sess-task', testDir);
    expect(journalResult.ok).toBe(true);
    if (!journalResult.ok) return;
    const journal = journalResult.value;

    journal.recordTaskMilestone('t1', 'task_start', 'Starting scan');
    journal.recordTaskMilestone('t1', 'task_complete', 'Scan finished', 3000);

    const loadResult = loadJournal('sess-task', testDir);
    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok) return;

    expect(loadResult.value).toHaveLength(2);
    expect(loadResult.value[0]!.taskId).toBe('t1');
    expect(loadResult.value[1]!.tokensUsed).toBe(3000);
  });
});

// ============================================================================
// loadJournal edge cases
// ============================================================================

describe('loadJournal', () => {
  it('should return empty array for non-existent session', () => {
    const result = loadJournal('no-such-session', testDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('should skip malformed lines', () => {
    const journalResult = createSessionJournal('sess-corrupt', testDir);
    expect(journalResult.ok).toBe(true);
    if (!journalResult.ok) return;
    journalResult.value.record('session_start', 'Started');

    // Inject corrupt line
    const filePath = path.join(testDir, 'journal-sess-corrupt.jsonl');
    fs.appendFileSync(filePath, 'not valid json\n');

    journalResult.value.record('session_end', 'Ended');

    const loadResult = loadJournal('sess-corrupt', testDir);
    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok) return;

    expect(loadResult.value).toHaveLength(2);
  });
});

// ============================================================================
// summarizeJournal
// ============================================================================

describe('summarizeJournal', () => {
  it('should return null for empty entries', () => {
    expect(summarizeJournal([])).toBeNull();
  });

  it('should detect normally ended session', () => {
    const journalResult = createSessionJournal('sess-summary', testDir);
    expect(journalResult.ok).toBe(true);
    if (!journalResult.ok) return;
    const journal = journalResult.value;

    journal.record('session_start', 'Started');
    journal.recordQuestion('What happened?');
    journal.recordTaskMilestone('t1', 'task_complete', 'Done', 2000);
    journal.record('session_end', 'Ended');

    const loadResult = loadJournal('sess-summary', testDir);
    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok) return;

    const summary = summarizeJournal(loadResult.value);
    expect(summary).not.toBeNull();
    if (summary === null) return;

    expect(summary.sessionId).toBe('sess-summary');
    expect(summary.totalEvents).toBe(4);
    expect(summary.pendingQuestions).toEqual(['What happened?']);
    expect(summary.completedTasks).toBe(1);
    expect(summary.totalTokensUsed).toBe(2000);
    expect(summary.endedNormally).toBe(true);
  });

  it('should detect abnormally ended session (no session_end)', () => {
    const journalResult = createSessionJournal('sess-crash', testDir);
    expect(journalResult.ok).toBe(true);
    if (!journalResult.ok) return;
    const journal = journalResult.value;

    journal.record('session_start', 'Started');
    journal.recordQuestion('Help me with X');
    // No session_end — simulates crash

    const loadResult = loadJournal('sess-crash', testDir);
    expect(loadResult.ok).toBe(true);
    if (!loadResult.ok) return;

    const summary = summarizeJournal(loadResult.value);
    expect(summary).not.toBeNull();
    if (summary === null) return;

    expect(summary.endedNormally).toBe(false);
    expect(summary.pendingQuestions).toEqual(['Help me with X']);
  });
});
