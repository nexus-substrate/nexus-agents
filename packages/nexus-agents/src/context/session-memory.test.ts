/**
 * Tests for Session Memory Manager.
 * (Source: Issue #130)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  SessionMemory,
  createSessionMemory,
  SessionMemoryError,
  type SessionLearning,
  type CompletedTask,
  type ResolvedError,
} from './session-memory.js';

// ============================================================================
// Test Setup
// ============================================================================

let testDir: string;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-memory-test-'));
});

afterEach(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true });
  }
});

function createTestMemory(): SessionMemory {
  return createSessionMemory(testDir, {
    maxEpisodesToLoad: 10,
    maxLearningsInContext: 20,
    minConfidenceThreshold: 0.5,
  });
}

// ============================================================================
// Session Lifecycle Tests
// ============================================================================

describe('SessionMemory', () => {
  describe('session lifecycle', () => {
    it('should start a new session', () => {
      const memory = createTestMemory();
      const result = memory.startSession('test-session-1');

      expect(result.ok).toBe(true);
      expect(memory.isSessionActive()).toBe(true);
      expect(memory.getCurrentSessionId()).toBe('test-session-1');
    });

    it('should reject starting a session when one is already active', () => {
      const memory = createTestMemory();
      memory.startSession('session-1');
      const result = memory.startSession('session-2');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(SessionMemoryError);
        expect(result.error.message).toContain('already in progress');
      }
    });

    it('should end a session and persist data', () => {
      const memory = createTestMemory();
      memory.startSession('test-session');

      // Record some data
      memory.recordLearning({
        pattern: 'Use Result type for errors',
        context: 'TypeScript error handling',
        confidence: 0.9,
      });

      const result = memory.endSession('Test session completed');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.sessionId).toBe('test-session');
        expect(result.value.summary).toBe('Test session completed');
        expect(result.value.learnings).toHaveLength(1);
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }

      expect(memory.isSessionActive()).toBe(false);
      expect(memory.getCurrentSessionId()).toBeNull();
    });

    it('should reject ending when no session is active', () => {
      const memory = createTestMemory();
      const result = memory.endSession('No session');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('No session');
      }
    });

    it('should create episode file on session end', () => {
      const memory = createTestMemory();
      memory.startSession('file-test');
      memory.recordLearning({
        pattern: 'Test pattern',
        context: 'Test context',
        confidence: 0.8,
      });
      memory.endSession('File test');

      const files = fs.readdirSync(testDir);
      expect(files.some((f) => f.startsWith('episode-') && f.endsWith('.json'))).toBe(true);
    });
  });

  // ============================================================================
  // Recording Tests
  // ============================================================================

  describe('recording', () => {
    it('should record learnings', () => {
      const memory = createTestMemory();
      memory.startSession('recording-test');

      const learning: SessionLearning = {
        pattern: 'Split long functions',
        context: 'ESLint max-lines-per-function rule',
        confidence: 0.9,
        source: 'task-123',
      };

      const result = memory.recordLearning(learning);
      expect(result.ok).toBe(true);

      const endResult = memory.endSession('Test');
      expect(endResult.ok).toBe(true);
      if (endResult.ok) {
        expect(endResult.value.learnings).toHaveLength(1);
        expect(endResult.value.learnings[0]?.pattern).toBe('Split long functions');
      }
    });

    it('should record completed tasks', () => {
      const memory = createTestMemory();
      memory.startSession('task-test');

      const task: CompletedTask = {
        issue: 130,
        approach: 'Implemented SessionMemory class',
        challenges: ['YAML parsing', 'File persistence'],
        durationMs: 3600000,
      };

      const result = memory.recordTask(task);
      expect(result.ok).toBe(true);

      const endResult = memory.endSession('Test');
      if (endResult.ok) {
        expect(endResult.value.tasksCompleted).toHaveLength(1);
        expect(endResult.value.tasksCompleted[0]?.issue).toBe(130);
      }
    });

    it('should record resolved errors', () => {
      const memory = createTestMemory();
      memory.startSession('error-test');

      const error: ResolvedError = {
        error: "TS2345: Type 'string | undefined' not assignable",
        solution: 'Early undefined check with return',
        filePattern: '*.ts with noUncheckedIndexedAccess',
      };

      const result = memory.recordError(error);
      expect(result.ok).toBe(true);

      const endResult = memory.endSession('Test');
      if (endResult.ok) {
        expect(endResult.value.errorsResolved).toHaveLength(1);
        expect(endResult.value.errorsResolved[0]?.solution).toContain('undefined check');
      }
    });

    it('should reject recording without active session', () => {
      const memory = createTestMemory();

      const learningResult = memory.recordLearning({
        pattern: 'Test',
        context: 'Test',
        confidence: 0.5,
      });
      expect(learningResult.ok).toBe(false);

      const taskResult = memory.recordTask({
        approach: 'Test',
        challenges: [],
      });
      expect(taskResult.ok).toBe(false);

      const errorResult = memory.recordError({
        error: 'Test',
        solution: 'Test',
      });
      expect(errorResult.ok).toBe(false);
    });

    it('should validate learning data', () => {
      const memory = createTestMemory();
      memory.startSession('validation-test');

      const result = memory.recordLearning({
        pattern: '', // Invalid: empty
        context: 'Test',
        confidence: 0.5,
      });

      expect(result.ok).toBe(false);
      memory.endSession('Test');
    });
  });

  // ============================================================================
  // Retrieval Tests
  // ============================================================================

  describe('retrieval', () => {
    it('should load episodes from previous sessions', () => {
      // Create first session
      const memory1 = createTestMemory();
      memory1.startSession('session-1');
      memory1.recordLearning({
        pattern: 'Pattern 1',
        context: 'Context 1',
        confidence: 0.8,
      });
      memory1.endSession('Session 1 done');

      // Create second session and load episodes
      const memory2 = createTestMemory();
      const episodes = memory2.loadEpisodes();

      expect(episodes.length).toBe(1);
      expect(episodes[0]?.sessionId).toBe('session-1');
    });

    it('should load relevant learnings on session start', () => {
      // Create session with high-confidence learning
      const memory1 = createTestMemory();
      memory1.startSession('prior-session');
      memory1.recordLearning({
        pattern: 'High confidence pattern',
        context: 'Important context',
        confidence: 0.95,
      });
      memory1.recordLearning({
        pattern: 'Low confidence pattern',
        context: 'Less important',
        confidence: 0.3, // Below threshold
      });
      memory1.endSession('Prior session');

      // Start new session - should get high confidence learning
      const memory2 = createTestMemory();
      const result = memory2.startSession('new-session');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.length).toBe(1); // Only high confidence
        expect(result.value[0]?.pattern).toBe('High confidence pattern');
      }
      memory2.endSession('Done');
    });

    it('should search learnings by query', () => {
      const memory1 = createTestMemory();
      memory1.startSession('search-test');
      memory1.recordLearning({
        pattern: 'Use Result type for TypeScript errors',
        context: 'Error handling pattern',
        confidence: 0.9,
      });
      memory1.recordLearning({
        pattern: 'Split long functions',
        context: 'Code quality rule',
        confidence: 0.8,
      });
      memory1.endSession('Search test');

      const memory2 = createTestMemory();
      const results = memory2.searchLearnings('TypeScript');

      expect(results.length).toBe(1);
      expect(results[0]?.pattern).toContain('Result type');
    });

    it('should match multi-word queries using keyword AND logic (#1182)', () => {
      const memory1 = createTestMemory();
      memory1.startSession('keyword-test');
      memory1.recordLearning({
        pattern: 'Pipeline subsystems fully wired',
        context: 'PluginRegistry singleton wiring complete',
        confidence: 0.9,
      });
      memory1.recordLearning({
        pattern: 'Something unrelated',
        context: 'Other context',
        confidence: 0.8,
      });
      memory1.endSession('keyword test done');

      const memory2 = createTestMemory();
      // "pipeline wiring" should match learning with both "pipeline" and "wiring"
      const results = memory2.searchLearnings('pipeline wiring');
      expect(results.length).toBe(1);
      expect(results[0]?.pattern).toContain('Pipeline');
    });

    it('should search current session learnings before endSession (#1126)', () => {
      const memory = createTestMemory();
      memory.startSession('live-search');
      memory.recordLearning({
        pattern: 'OpenCode supports 75+ models',
        context: 'Integration research',
        confidence: 0.85,
      });

      // Search without ending the session — should find the in-memory learning
      const results = memory.searchLearnings('OpenCode');

      expect(results.length).toBe(1);
      expect(results[0]?.pattern).toContain('75+ models');
    });

    it('should get recent error solutions', () => {
      const memory1 = createTestMemory();
      memory1.startSession('error-solutions');
      memory1.recordError({
        error: 'TS2322: Type mismatch',
        solution: 'Cast to correct type',
      });
      memory1.recordError({
        error: 'ESLint: max-lines',
        solution: 'Extract helper functions',
      });
      memory1.endSession('Error solutions');

      const memory2 = createTestMemory();
      const solutions = memory2.getRecentErrorSolutions(10);

      expect(solutions.length).toBe(2);
    });

    it('should limit loaded episodes', () => {
      const memory = createTestMemory();

      // Create multiple episodes
      for (let i = 0; i < 5; i++) {
        memory.startSession(`session-${String(i)}`);
        memory.recordLearning({
          pattern: `Pattern ${String(i)}`,
          context: `Context ${String(i)}`,
          confidence: 0.8,
        });
        memory.endSession(`Session ${String(i)}`);
      }

      const limitedMemory = createSessionMemory(testDir, { maxEpisodesToLoad: 3 });
      const episodes = limitedMemory.loadEpisodes();

      expect(episodes.length).toBe(3);
    });

    it('should sort learnings by confidence', () => {
      const memory1 = createTestMemory();
      memory1.startSession('confidence-sort');
      memory1.recordLearning({ pattern: 'Low', context: 'Test', confidence: 0.5 });
      memory1.recordLearning({ pattern: 'High', context: 'Test', confidence: 0.95 });
      memory1.recordLearning({ pattern: 'Medium', context: 'Test', confidence: 0.7 });
      memory1.endSession('Confidence sort');

      const memory2 = createTestMemory();
      const learnings = memory2.loadRelevantLearnings();

      expect(learnings.length).toBe(3);
      expect(learnings[0]?.pattern).toBe('High');
      expect(learnings[1]?.pattern).toBe('Medium');
      expect(learnings[2]?.pattern).toBe('Low');
    });
  });

  // ============================================================================
  // Persistence Tests
  // ============================================================================

  describe('persistence', () => {
    it('should create memory directory if not exists', () => {
      const newDir = path.join(testDir, 'new-subdir');
      const memory = createSessionMemory(newDir);
      memory.startSession('dir-test');
      memory.endSession('Done');

      expect(fs.existsSync(newDir)).toBe(true);
    });

    it('should persist episode data in JSON format', () => {
      const memory = createTestMemory();
      memory.startSession('json-test');
      memory.recordLearning({
        pattern: "Quote's test",
        context: 'JSON escaping',
        confidence: 0.9,
      });
      memory.endSession('JSON test');

      const files = fs.readdirSync(testDir);
      const jsonFile = files.find((f) => f.endsWith('.json'));
      expect(jsonFile).toBeDefined();

      const content = fs.readFileSync(path.join(testDir, jsonFile as string), 'utf-8');
      expect(content).toContain('"sessionId":');
      expect(content).toContain('"learnings":');
      expect(content).toContain("Quote's test"); // JSON handles quotes
    });

    it('should handle multiple sessions', () => {
      for (let i = 0; i < 3; i++) {
        const memory = createTestMemory();
        memory.startSession(`multi-${String(i)}`);
        memory.recordLearning({
          pattern: `Pattern ${String(i)}`,
          context: 'Multi-session test',
          confidence: 0.8,
        });
        memory.endSession(`Session ${String(i)}`);
      }

      const files = fs.readdirSync(testDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      expect(jsonFiles.length).toBe(3);
    });
  });

  // ============================================================================
  // Factory Function Tests
  // ============================================================================

  describe('createSessionMemory', () => {
    it('should create memory with default config', () => {
      const memory = createSessionMemory(testDir);
      expect(memory).toBeInstanceOf(SessionMemory);
    });

    it('should create memory with custom config', () => {
      const memory = createSessionMemory(testDir, {
        maxEpisodesToLoad: 5,
        minConfidenceThreshold: 0.7,
      });
      expect(memory).toBeInstanceOf(SessionMemory);
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('SessionMemory integration', () => {
  it('should support full session workflow', () => {
    // Session 1: Record learnings
    const memory1 = createTestMemory();
    memory1.startSession('workflow-1');

    memory1.recordLearning({
      pattern: 'Use immutable types with readonly',
      context: 'TypeScript best practices',
      confidence: 0.95,
    });

    memory1.recordTask({
      issue: 140,
      approach: 'Implemented CLI command with parseOptions',
      challenges: ['Logger contamination in tests'],
      durationMs: 7200000,
    });

    memory1.recordError({
      error: 'Logger output contaminating JSON',
      solution: 'Mock createLogger in test setup',
      filePattern: '*.test.ts',
    });

    const session1Result = memory1.endSession('Implemented CLI Integration');
    expect(session1Result.ok).toBe(true);

    // Session 2: Load and use previous learnings
    const memory2 = createTestMemory();
    const learningsResult = memory2.startSession('workflow-2');

    expect(learningsResult.ok).toBe(true);
    if (learningsResult.ok) {
      expect(learningsResult.value.length).toBeGreaterThan(0);
      expect(learningsResult.value.some((l) => l.pattern.includes('readonly'))).toBe(true);
    }

    // Search for relevant solutions
    const errorSolutions = memory2.getRecentErrorSolutions();
    expect(errorSolutions.some((e) => e.solution.includes('Mock'))).toBe(true);

    memory2.endSession('Session 2 complete');
  });
});

// ============================================================================
// Memory Bounds Tests (Issue #709)
// ============================================================================

describe('SessionMemory bounds', () => {
  describe('per-session FIFO eviction', () => {
    it('should evict oldest learnings when limit exceeded', () => {
      const memory = createSessionMemory(testDir, { maxLearningsPerSession: 3 });
      memory.startSession('eviction-test');

      for (let i = 0; i < 5; i++) {
        memory.recordLearning({
          pattern: `Pattern ${String(i)}`,
          context: `Context ${String(i)}`,
          confidence: 0.8,
        });
      }

      const result = memory.endSession('Test');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.learnings).toHaveLength(3);
        expect(result.value.learnings[0]?.pattern).toBe('Pattern 2');
        expect(result.value.learnings[2]?.pattern).toBe('Pattern 4');
      }
    });

    it('should evict oldest tasks when limit exceeded', () => {
      const memory = createSessionMemory(testDir, { maxTasksPerSession: 2 });
      memory.startSession('task-eviction');

      for (let i = 0; i < 4; i++) {
        memory.recordTask({
          approach: `Approach ${String(i)}`,
          challenges: [],
        });
      }

      const result = memory.endSession('Test');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.tasksCompleted).toHaveLength(2);
        expect(result.value.tasksCompleted[0]?.approach).toBe('Approach 2');
      }
    });

    it('should evict oldest errors when limit exceeded', () => {
      const memory = createSessionMemory(testDir, { maxErrorsPerSession: 2 });
      memory.startSession('error-eviction');

      for (let i = 0; i < 4; i++) {
        memory.recordError({
          error: `Error ${String(i)}`,
          solution: `Fix ${String(i)}`,
        });
      }

      const result = memory.endSession('Test');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.errorsResolved).toHaveLength(2);
        expect(result.value.errorsResolved[0]?.error).toBe('Error 2');
      }
    });
  });

  describe('episode file retention', () => {
    it('should delete oldest episode files when limit exceeded', () => {
      const memory = createSessionMemory(testDir, { maxEpisodeFiles: 3 });

      for (let i = 0; i < 5; i++) {
        memory.startSession(`retention-${String(i)}`);
        memory.recordLearning({
          pattern: `Pattern ${String(i)}`,
          context: 'Retention test',
          confidence: 0.8,
        });
        memory.endSession(`Session ${String(i)}`);
      }

      const files = fs.readdirSync(testDir).filter((f) => f.endsWith('.json'));
      expect(files.length).toBe(3);
    });

    it('should keep most recent episodes when enforcing retention', () => {
      const memory = createSessionMemory(testDir, { maxEpisodeFiles: 2 });

      for (let i = 0; i < 4; i++) {
        memory.startSession(`keep-recent-${String(i)}`);
        memory.recordLearning({
          pattern: `Pattern ${String(i)}`,
          context: 'Test',
          confidence: 0.8,
        });
        memory.endSession(`Session ${String(i)}`);
      }

      const episodes = memory.loadEpisodes(10);
      expect(episodes.length).toBe(2);
      // Most recent should be kept (sorted by filename descending)
      expect(episodes[0]?.sessionId).toBe('keep-recent-3');
      expect(episodes[1]?.sessionId).toBe('keep-recent-2');
    });
  });
});
