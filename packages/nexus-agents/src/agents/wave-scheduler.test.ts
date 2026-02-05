/**
 * Tests for Wave Scheduler.
 *
 * (Source: Issue #769 - Code-enforced subagent context limits)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWaveScheduler, chunkByDirectory, DEFAULT_WAVE_CONFIG } from './wave-scheduler.js';
import type { WaveTask, WaveTaskExecutor } from './wave-scheduler-types.js';

// ============================================================================
// Test Helpers
// ============================================================================

function createTask(id: string, deps: string[] = []): WaveTask<string> {
  return { id, description: `Task ${id}`, input: id, dependencies: deps };
}

// ============================================================================
// WaveScheduler.buildWaves
// ============================================================================

describe('WaveScheduler.buildWaves', () => {
  const scheduler = createWaveScheduler({ maxConcurrency: 3 });

  it('should group independent tasks into a single wave', () => {
    const tasks = [createTask('a'), createTask('b'), createTask('c')];
    const waves = scheduler.buildWaves(tasks);
    expect(waves).toHaveLength(1);
    expect(waves[0]).toHaveLength(3);
  });

  it('should split independent tasks exceeding maxConcurrency into sub-waves', () => {
    const tasks = [
      createTask('a'),
      createTask('b'),
      createTask('c'),
      createTask('d'),
      createTask('e'),
    ];
    const waves = scheduler.buildWaves(tasks);
    expect(waves).toHaveLength(2);
    expect(waves[0]).toHaveLength(3);
    expect(waves[1]).toHaveLength(2);
  });

  it('should respect dependencies across waves', () => {
    const tasks = [
      createTask('a'),
      createTask('b'),
      createTask('c', ['a', 'b']),
      createTask('d', ['c']),
    ];
    const waves = scheduler.buildWaves(tasks);
    expect(waves.length).toBeGreaterThanOrEqual(3);

    // Wave 0: a, b (no deps)
    const wave0Ids = waves[0]!.map((t) => t.id);
    expect(wave0Ids).toContain('a');
    expect(wave0Ids).toContain('b');

    // Wave 1: c (depends on a, b)
    const wave1Ids = waves[1]!.map((t) => t.id);
    expect(wave1Ids).toContain('c');

    // Wave 2: d (depends on c)
    const wave2Ids = waves[2]!.map((t) => t.id);
    expect(wave2Ids).toContain('d');
  });

  it('should handle empty task list', () => {
    const waves = scheduler.buildWaves([]);
    expect(waves).toHaveLength(0);
  });

  it('should handle circular dependencies without infinite loop', () => {
    const tasks = [createTask('a', ['b']), createTask('b', ['a'])];
    const waves = scheduler.buildWaves(tasks);
    // Should break out and add remaining tasks
    expect(waves.length).toBeGreaterThan(0);
    const allIds = waves.flat().map((t) => t.id);
    expect(allIds).toContain('a');
    expect(allIds).toContain('b');
  });
});

// ============================================================================
// WaveScheduler.execute
// ============================================================================

describe('WaveScheduler.execute', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute all tasks and return results', async () => {
    const scheduler = createWaveScheduler({ maxConcurrency: 2 });
    const tasks = [createTask('a'), createTask('b'), createTask('c')];
    const executor: WaveTaskExecutor<string> = (task) => Promise.resolve(`output-${task.id}`);

    const result = await scheduler.execute(tasks, executor);

    expect(result.allResults).toHaveLength(3);
    expect(result.aborted).toBe(false);
    expect(result.waves.length).toBeGreaterThanOrEqual(1);
    for (const r of result.allResults) {
      expect(r.success).toBe(true);
      expect(r.output).toContain('output-');
    }
  });

  it('should truncate output exceeding maxOutputChars', async () => {
    const scheduler = createWaveScheduler({ maxOutputChars: 50 });
    const tasks = [createTask('a')];
    const longOutput = 'x'.repeat(200);
    const executor: WaveTaskExecutor<string> = () => Promise.resolve(longOutput);

    const result = await scheduler.execute(tasks, executor);
    const taskResult = result.allResults[0]!;

    expect(taskResult.truncated).toBe(true);
    expect(taskResult.originalLength).toBe(200);
    expect(taskResult.output.length).toBeLessThan(200);
    expect(taskResult.output).toContain('truncated');
  });

  it('should handle task failures without aborting by default', async () => {
    const scheduler = createWaveScheduler({ abortOnFailure: false });
    const tasks = [createTask('a'), createTask('b')];
    const executor: WaveTaskExecutor<string> = (task) => {
      if (task.id === 'a') return Promise.reject(new Error('boom'));
      return Promise.resolve('ok');
    };

    const result = await scheduler.execute(tasks, executor);

    expect(result.allResults).toHaveLength(2);
    const failedResult = result.allResults.find((r) => r.taskId === 'a');
    const successResult = result.allResults.find((r) => r.taskId === 'b');
    expect(failedResult?.success).toBe(false);
    expect(failedResult?.error).toBe('boom');
    expect(successResult?.success).toBe(true);
    expect(result.aborted).toBe(false);
  });

  it('should abort on failure when configured', async () => {
    const scheduler = createWaveScheduler({
      abortOnFailure: true,
      maxConcurrency: 1,
    });
    const tasks = [createTask('a'), createTask('b')];
    const executor: WaveTaskExecutor<string> = (task) => {
      if (task.id === 'a') return Promise.reject(new Error('fail'));
      return Promise.resolve('ok');
    };

    const result = await scheduler.execute(tasks, executor);

    expect(result.aborted).toBe(true);
    expect(result.abortReason).toContain('Task a failed');
  });

  it('should abort when token budget is exceeded', async () => {
    const scheduler = createWaveScheduler({
      maxTotalTokens: 10,
      maxConcurrency: 1,
    });
    // Each task returns 200 chars ≈ 50 tokens, exceeding budget of 10
    const tasks = [createTask('a'), createTask('b')];
    const executor: WaveTaskExecutor<string> = () => Promise.resolve('x'.repeat(200));

    const result = await scheduler.execute(tasks, executor);

    // First wave executes, second wave aborted due to budget
    expect(result.aborted).toBe(true);
    expect(result.abortReason).toContain('Token budget exhausted');
  });

  it('should estimate tokens from output length', async () => {
    const scheduler = createWaveScheduler();
    const tasks = [createTask('a')];
    const executor: WaveTaskExecutor<string> = () => Promise.resolve('x'.repeat(400));

    const result = await scheduler.execute(tasks, executor);
    // 400 chars / 4 ≈ 100 tokens
    expect(result.allResults[0]!.estimatedTokens).toBe(100);
  });
});

// ============================================================================
// chunkByDirectory
// ============================================================================

describe('chunkByDirectory', () => {
  it('should group files by top-level directory', () => {
    const files = [
      '/src/agents/foo.ts',
      '/src/agents/bar.ts',
      '/src/core/baz.ts',
      '/src/mcp/qux.ts',
    ];
    const chunks = chunkByDirectory(files, '/src');

    expect(chunks).toHaveLength(3);
    const agentsChunk = chunks.find((c) => c.scope === '/src/agents/');
    const coreChunk = chunks.find((c) => c.scope === '/src/core/');
    const mcpChunk = chunks.find((c) => c.scope === '/src/mcp/');

    expect(agentsChunk?.items).toHaveLength(2);
    expect(coreChunk?.items).toHaveLength(1);
    expect(mcpChunk?.items).toHaveLength(1);
  });

  it('should handle trailing slash in basePath', () => {
    const files = ['/src/agents/foo.ts', '/src/core/bar.ts'];
    const chunks = chunkByDirectory(files, '/src/');
    expect(chunks).toHaveLength(2);
  });

  it('should handle empty file list', () => {
    const chunks = chunkByDirectory([], '/src');
    expect(chunks).toHaveLength(0);
  });

  it('should handle files not matching basePath', () => {
    const files = ['/other/file.ts'];
    const chunks = chunkByDirectory(files, '/src');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.id).toBe('chunk-other');
  });

  it('should have unique chunk IDs', () => {
    const files = ['/src/a/x.ts', '/src/b/y.ts', '/src/c/z.ts'];
    const chunks = chunkByDirectory(files, '/src');
    const ids = chunks.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ============================================================================
// Factory & Config
// ============================================================================

describe('createWaveScheduler', () => {
  it('should create scheduler with default config', () => {
    const scheduler = createWaveScheduler();
    const config = scheduler.getConfig();
    expect(config.maxConcurrency).toBe(DEFAULT_WAVE_CONFIG.maxConcurrency);
    expect(config.maxOutputChars).toBe(DEFAULT_WAVE_CONFIG.maxOutputChars);
  });

  it('should merge custom config with defaults', () => {
    const scheduler = createWaveScheduler({ maxConcurrency: 2, maxOutputChars: 5000 });
    const config = scheduler.getConfig();
    expect(config.maxConcurrency).toBe(2);
    expect(config.maxOutputChars).toBe(5000);
    expect(config.abortOnFailure).toBe(false); // default
  });
});
