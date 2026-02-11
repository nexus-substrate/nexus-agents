/**
 * Tests for query_trace MCP tool (Epic #952, Phase 5)
 *
 * @module mcp/tools/query-trace-tool.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { QueryTraceInputSchema, queryTraceFromDisk } from './query-trace-tool.js';

// ============================================================================
// Input Schema Validation
// ============================================================================

describe('QueryTraceInputSchema', () => {
  it('validates valid input', () => {
    const result = QueryTraceInputSchema.safeParse({
      runId: 'run-123',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty runId', () => {
    const result = QueryTraceInputSchema.safeParse({ runId: '' });
    expect(result.success).toBe(false);
  });

  it('accepts optional eventType filter', () => {
    const result = QueryTraceInputSchema.safeParse({
      runId: 'run-123',
      eventType: 'model.called',
    });
    expect(result.success).toBe(true);
  });

  it('accepts optional limit', () => {
    const result = QueryTraceInputSchema.safeParse({
      runId: 'run-123',
      limit: 50,
    });
    expect(result.success).toBe(true);
  });

  it('rejects limit above 500', () => {
    const result = QueryTraceInputSchema.safeParse({
      runId: 'run-123',
      limit: 501,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Disk Query
// ============================================================================

describe('queryTraceFromDisk', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'nexus-trace-q-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns events from trace.jsonl', async () => {
    const runDir = join(tempDir, 'run-1');
    await mkdir(runDir, { recursive: true });

    const traces = [
      JSON.stringify({
        timestamp: 1000,
        runId: 'run-1',
        eventType: 'model.called',
        agentId: 'code_expert',
        modelId: 'claude-sonnet-4-5',
      }),
      JSON.stringify({
        timestamp: 2000,
        runId: 'run-1',
        eventType: 'routing.decision',
        modelId: 'claude-sonnet-4-5',
        reasoning: 'Highest score',
      }),
    ].join('\n');

    await writeFile(join(runDir, 'trace.jsonl'), traces + '\n');

    const result = await queryTraceFromDisk({ runId: 'run-1' }, tempDir);

    expect(result.source).toBe('disk');
    expect(result.totalEvents).toBe(2);
    expect(result.events).toHaveLength(2);
    const first = result.events[0];
    expect(first).toBeDefined();
    expect(first?.['agentId']).toBe('code_expert');
  });

  it('filters by eventType', async () => {
    const runDir = join(tempDir, 'run-2');
    await mkdir(runDir, { recursive: true });

    const traces = [
      JSON.stringify({ eventType: 'model.called', agentId: 'a1' }),
      JSON.stringify({ eventType: 'routing.decision', modelId: 'm1' }),
      JSON.stringify({ eventType: 'model.called', agentId: 'a2' }),
    ].join('\n');

    await writeFile(join(runDir, 'trace.jsonl'), traces + '\n');

    const result = await queryTraceFromDisk({ runId: 'run-2', eventType: 'model.called' }, tempDir);

    expect(result.totalEvents).toBe(2);
    expect(result.events).toHaveLength(2);
  });

  it('respects limit parameter', async () => {
    const runDir = join(tempDir, 'run-3');
    await mkdir(runDir, { recursive: true });

    const traces = Array.from({ length: 10 }, (_, i) =>
      JSON.stringify({ eventType: 'task.created', taskId: `t${String(i)}` })
    ).join('\n');

    await writeFile(join(runDir, 'trace.jsonl'), traces + '\n');

    const result = await queryTraceFromDisk({ runId: 'run-3', limit: 3 }, tempDir);

    expect(result.events).toHaveLength(3);
    expect(result.truncated).toBe(true);
    expect(result.totalEvents).toBe(10);
  });

  it('returns not_found for missing run', async () => {
    const result = await queryTraceFromDisk({ runId: 'nonexistent' }, tempDir);

    expect(result.source).toBe('not_found');
    expect(result.events).toHaveLength(0);
    expect(result.totalEvents).toBe(0);
  });

  it('handles empty trace file', async () => {
    const runDir = join(tempDir, 'run-empty');
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, 'trace.jsonl'), '\n');

    const result = await queryTraceFromDisk({ runId: 'run-empty' }, tempDir);

    expect(result.events).toHaveLength(0);
  });
});
