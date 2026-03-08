/**
 * Tests for query_trace MCP tool (Epic #952, Phase 5)
 *
 * @module mcp/tools/query-trace-tool.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chmod } from 'node:fs/promises';

import {
  QueryTraceInputSchema,
  queryTraceFromDisk,
  classifyTraceError,
} from './query-trace-tool.js';

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

  it('rejects runId with path traversal characters', () => {
    expect(QueryTraceInputSchema.safeParse({ runId: '../etc/passwd' }).success).toBe(false);
    expect(QueryTraceInputSchema.safeParse({ runId: '../../root' }).success).toBe(false);
    expect(QueryTraceInputSchema.safeParse({ runId: 'run/../../etc' }).success).toBe(false);
  });

  it('rejects runId exceeding max length', () => {
    const result = QueryTraceInputSchema.safeParse({ runId: 'a'.repeat(129) });
    expect(result.success).toBe(false);
  });

  it('rejects eventType with special characters', () => {
    expect(
      QueryTraceInputSchema.safeParse({ runId: 'run-1', eventType: 'model.called; rm -rf' }).success
    ).toBe(false);
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
        modelId: 'claude-sonnet-4-6',
      }),
      JSON.stringify({
        timestamp: 2000,
        runId: 'run-1',
        eventType: 'routing.decision',
        modelId: 'claude-sonnet-4-6',
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

  it('skips malformed JSONL lines without crashing', async () => {
    const runDir = join(tempDir, 'run-malformed');
    await mkdir(runDir, { recursive: true });

    const traces = [
      JSON.stringify({ eventType: 'model.called', agentId: 'a1' }),
      'NOT VALID JSON {{{',
      JSON.stringify({ eventType: 'routing.decision', modelId: 'm1' }),
      '',
      '{{broken}}',
    ].join('\n');

    await writeFile(join(runDir, 'trace.jsonl'), traces + '\n');

    const result = await queryTraceFromDisk({ runId: 'run-malformed' }, tempDir);

    // Should parse 2 valid lines, skip 2 malformed ones
    expect(result.source).toBe('disk');
    expect(result.totalEvents).toBe(2);
    expect(result.events).toHaveLength(2);
  });

  it('blocks path traversal at runtime via resolve guard', async () => {
    // Even if schema validation were bypassed, the resolve guard should block
    const result = await queryTraceFromDisk({ runId: '..\\..\\etc' } as never, tempDir);

    expect(result.source).toBe('not_found');
    expect(result.events).toHaveLength(0);
  });

  it('returns not_found error category for missing trace file', async () => {
    const result = await queryTraceFromDisk({ runId: 'nonexistent' }, tempDir);

    expect(result.source).toBe('not_found');
    expect(result.errorCategory).toBe('not_found');
    expect(result.errorMessage).toBeDefined();
  });

  it('returns permission_error category for inaccessible trace file', async () => {
    const runDir = join(tempDir, 'run-noperm');
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, 'trace.jsonl'), '{"eventType":"test"}\n');
    await chmod(join(runDir, 'trace.jsonl'), 0o000);

    const result = await queryTraceFromDisk({ runId: 'run-noperm' }, tempDir);

    expect(result.source).toBe('not_found');
    expect(result.errorCategory).toBe('permission_error');
    expect(result.errorMessage).toBeDefined();
    expect(result.events).toHaveLength(0);

    // Restore permissions for cleanup
    await chmod(join(runDir, 'trace.jsonl'), 0o644);
  });
});

// ============================================================================
// Error Classification
// ============================================================================

describe('classifyTraceError', () => {
  it('classifies ENOENT as not_found', () => {
    const err = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    expect(classifyTraceError(err)).toBe('not_found');
  });

  it('classifies EACCES as permission_error', () => {
    const err = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    expect(classifyTraceError(err)).toBe('permission_error');
  });

  it('classifies EPERM as permission_error', () => {
    const err = Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
    expect(classifyTraceError(err)).toBe('permission_error');
  });

  it('classifies SyntaxError as parse_error', () => {
    expect(classifyTraceError(new SyntaxError('Unexpected token'))).toBe('parse_error');
  });

  it('classifies error with JSON in message as parse_error', () => {
    expect(classifyTraceError(new Error('Invalid JSON at position 5'))).toBe('parse_error');
  });

  it('classifies non-Error values as unknown', () => {
    expect(classifyTraceError('string error')).toBe('unknown');
    expect(classifyTraceError(42)).toBe('unknown');
    expect(classifyTraceError(null)).toBe('unknown');
  });

  it('classifies generic Error as unknown', () => {
    expect(classifyTraceError(new Error('something went wrong'))).toBe('unknown');
  });
});
