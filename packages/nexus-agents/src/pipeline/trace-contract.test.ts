/**
 * Tests for Execution Trace Contract (Epic #952, Phase 1-2)
 *
 * Validates the trace schema, event attribution fields,
 * TraceWriter disk persistence, and JSONL serialization.
 *
 * @module pipeline/trace-contract.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, mkdir as fsMkdir, chmod } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EventBus } from './event-bus.js';
import type { PipelineEvent } from './event-types.js';
import {
  ExecutionTraceEntrySchema,
  type ExecutionTraceEntry,
  ErrorTaxonomy,
} from './trace-schema.js';
import { TraceWriter } from './trace-writer.js';

// ============================================================================
// Trace Schema Validation
// ============================================================================

describe('ExecutionTraceEntry schema', () => {
  const validEntry: ExecutionTraceEntry = {
    timestamp: Date.now(),
    runId: 'run-abc-123',
    eventType: 'model.called',
    executionId: 'exec-1',
    nodeId: 'analyze',
    agentId: 'code_expert',
    modelId: 'claude-sonnet-4-5-20250929',
    role: 'code_expert',
    durationMs: 1200,
    errorTaxonomy: undefined,
  };

  it('validates a correct trace entry', () => {
    const result = ExecutionTraceEntrySchema.safeParse(validEntry);
    expect(result.success).toBe(true);
  });

  it('requires runId', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { runId: _runId, ...without } = validEntry;
    const result = ExecutionTraceEntrySchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('requires eventType', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { eventType: _eventType, ...without } = validEntry;
    const result = ExecutionTraceEntrySchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it('accepts optional agentId and modelId', () => {
    const entry = { ...validEntry, agentId: undefined, modelId: undefined };
    const result = ExecutionTraceEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it('validates errorTaxonomy enum', () => {
    const retriable = { ...validEntry, errorTaxonomy: 'retriable' };
    expect(ExecutionTraceEntrySchema.safeParse(retriable).success).toBe(true);

    const fatal = { ...validEntry, errorTaxonomy: 'fatal' };
    expect(ExecutionTraceEntrySchema.safeParse(fatal).success).toBe(true);

    const invalid = { ...validEntry, errorTaxonomy: 'unknown-type' };
    expect(ExecutionTraceEntrySchema.safeParse(invalid).success).toBe(false);
  });

  it('accepts reasoning string', () => {
    const entry = {
      ...validEntry,
      reasoning: 'Selected for highest code generation score',
    };
    const result = ExecutionTraceEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it('accepts decisionPath array', () => {
    const entry = {
      ...validEntry,
      decisionPath: ['budget:pass', 'topsis:0.87', 'linucb:selected'],
    };
    const result = ExecutionTraceEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });
});

describe('ErrorTaxonomy', () => {
  it('has retriable and fatal values', () => {
    expect(ErrorTaxonomy.RETRIABLE).toBe('retriable');
    expect(ErrorTaxonomy.FATAL).toBe('fatal');
  });
});

// ============================================================================
// Enhanced Event Attribution
// ============================================================================

describe('ModelCalledEvent attribution', () => {
  it('EventBus accepts model.called with agentId and role', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe({ type: 'model.called' }, handler);

    const event: PipelineEvent = {
      type: 'model.called',
      executionId: 'exec-1',
      cli: 'claude',
      model: 'claude-sonnet-4-5-20250929',
      tokensIn: 100,
      tokensOut: 200,
      durationMs: 500,
      agentId: 'code_expert',
      role: 'code_expert',
      timestamp: Date.now(),
    };

    bus.emit(event);
    expect(handler).toHaveBeenCalledWith(event);

    const firstCall = handler.mock.calls[0];
    expect(firstCall).toBeDefined();
    const emitted = firstCall?.[0] as PipelineEvent;
    expect(emitted.type).toBe('model.called');
    if (emitted.type === 'model.called') {
      expect(emitted.agentId).toBe('code_expert');
      expect(emitted.role).toBe('code_expert');
    }
  });
});

describe('RoutingDecisionEvent attribution', () => {
  it('EventBus accepts routing.decision with reasoning', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe({ type: 'routing.decision' }, handler);

    const event: PipelineEvent = {
      type: 'routing.decision',
      taskId: 'task-1',
      selectedModel: 'claude-sonnet-4-5-20250929',
      reasoning: 'Highest TOPSIS score (0.92) for code generation',
      decisionPath: ['budget:pass', 'topsis:0.92'],
      timestamp: Date.now(),
    };

    bus.emit(event);
    const firstCall = handler.mock.calls[0];
    expect(firstCall).toBeDefined();
    const emitted = firstCall?.[0] as PipelineEvent;
    if (emitted.type === 'routing.decision') {
      expect(emitted.reasoning).toBe('Highest TOPSIS score (0.92) for code generation');
      expect(emitted.decisionPath).toEqual(['budget:pass', 'topsis:0.92']);
    }
  });
});

describe('StageFailedEvent error taxonomy', () => {
  it('EventBus accepts stage.failed with errorTaxonomy', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe({ type: 'stage.failed' }, handler);

    const event: PipelineEvent = {
      type: 'stage.failed',
      executionId: 'exec-1',
      stageId: 'model-router',
      error: 'Connection timeout',
      errorTaxonomy: 'retriable',
      timestamp: Date.now(),
    };

    bus.emit(event);
    const firstCall = handler.mock.calls[0];
    expect(firstCall).toBeDefined();
    const emitted = firstCall?.[0] as PipelineEvent;
    if (emitted.type === 'stage.failed') {
      expect(emitted.errorTaxonomy).toBe('retriable');
    }
  });
});

// ============================================================================
// TraceWriter Disk Persistence
// ============================================================================

describe('TraceWriter', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'nexus-trace-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes trace.jsonl on flush', async () => {
    const bus = new EventBus();
    const writer = new TraceWriter(bus, {
      runsDir: tempDir,
      runId: 'test-run-1',
    });

    bus.emit({
      type: 'model.called',
      executionId: 'exec-1',
      cli: 'claude',
      model: 'claude-sonnet-4-5-20250929',
      tokensIn: 100,
      tokensOut: 200,
      durationMs: 500,
      agentId: 'code_expert',
      role: 'code_expert',
      timestamp: Date.now(),
    });

    await writer.flush();

    const tracePath = join(tempDir, 'test-run-1', 'trace.jsonl');
    const content = await readFile(tracePath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);

    const firstLine = lines[0];
    expect(firstLine).toBeDefined();
    const parsed: unknown = JSON.parse(firstLine ?? '');
    const entry = parsed as Record<string, unknown>;
    expect(entry['runId']).toBe('test-run-1');
    expect(entry['agentId']).toBe('code_expert');
    expect(entry['modelId']).toBe('claude-sonnet-4-5-20250929');

    writer.stop();
  });

  it('writes index.md summary on flush', async () => {
    const bus = new EventBus();
    const writer = new TraceWriter(bus, {
      runsDir: tempDir,
      runId: 'test-run-2',
    });

    bus.emit({
      type: 'pipeline.started',
      taskId: 'task-1',
      executionId: 'exec-1',
      timestamp: Date.now(),
    });

    bus.emit({
      type: 'pipeline.completed',
      executionId: 'exec-1',
      success: true,
      durationMs: 3000,
      timestamp: Date.now(),
    });

    await writer.flush();

    const indexPath = join(tempDir, 'test-run-2', 'index.md');
    const content = await readFile(indexPath, 'utf-8');
    expect(content).toContain('# Run: test-run-2');
    expect(content).toContain('Events:');

    writer.stop();
  });

  it('buffers multiple events before flush', async () => {
    const bus = new EventBus();
    const writer = new TraceWriter(bus, {
      runsDir: tempDir,
      runId: 'test-run-3',
    });

    bus.emit({
      type: 'task.created',
      taskId: 'task-1',
      timestamp: Date.now(),
    });

    bus.emit({
      type: 'model.called',
      executionId: 'exec-1',
      cli: 'claude',
      model: 'claude-sonnet-4-5-20250929',
      tokensIn: 50,
      tokensOut: 100,
      durationMs: 300,
      agentId: 'arch_expert',
      role: 'architecture_expert',
      timestamp: Date.now(),
    });

    await writer.flush();

    const tracePath = join(tempDir, 'test-run-3', 'trace.jsonl');
    const content = await readFile(tracePath, 'utf-8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);

    writer.stop();
  });

  it('handles stop gracefully', async () => {
    const bus = new EventBus();
    const writer = new TraceWriter(bus, {
      runsDir: tempDir,
      runId: 'test-run-4',
    });

    writer.stop();
    // Should not throw after stop
    bus.emit({
      type: 'task.created',
      taskId: 'task-1',
      timestamp: Date.now(),
    });

    await writer.flush();
  });

  it('throws on write failure (not silently swallowed)', async () => {
    const bus = new EventBus();
    const runId = 'test-run-fail';
    const runDir = join(tempDir, runId);
    // Create dir then make it read-only so writeFile fails
    await fsMkdir(runDir, { recursive: true });
    await chmod(runDir, 0o444);

    const writer = new TraceWriter(bus, {
      runsDir: tempDir,
      runId,
    });

    bus.emit({
      type: 'task.created',
      taskId: 'task-1',
      timestamp: Date.now(),
    });

    await expect(writer.flush()).rejects.toThrow();

    // Restore for cleanup
    await chmod(runDir, 0o755);
    writer.stop();
  });

  it('does not leave temp files on flush failure', async () => {
    const bus = new EventBus();
    const runId = 'test-run-cleanup';
    const runDir = join(tempDir, runId);
    // Create dir then make read-only to force write failure
    await fsMkdir(runDir, { recursive: true });
    await chmod(runDir, 0o444);

    const writer = new TraceWriter(bus, {
      runsDir: tempDir,
      runId,
    });

    bus.emit({
      type: 'task.created',
      taskId: 'task-1',
      timestamp: Date.now(),
    });

    try {
      await writer.flush();
    } catch {
      // Expected to throw
    }

    // Restore permissions to read dir contents
    await chmod(runDir, 0o755);

    // Verify no temp files left behind
    if (existsSync(runDir)) {
      const files = readdirSync(runDir);
      const tmpFiles = files.filter((f) => f.includes('.tmp.'));
      expect(tmpFiles).toHaveLength(0);
    }

    writer.stop();
  });

  it('preserves buffer on flush failure (allows retry)', async () => {
    const bus = new EventBus();
    const runId = 'test-run-retry';
    const runDir = join(tempDir, runId);
    await fsMkdir(runDir, { recursive: true });
    await chmod(runDir, 0o444);

    const writer = new TraceWriter(bus, {
      runsDir: tempDir,
      runId,
    });

    bus.emit({
      type: 'task.created',
      taskId: 'task-1',
      timestamp: Date.now(),
    });

    // First flush fails
    await expect(writer.flush()).rejects.toThrow();

    // Buffer should still have events (not cleared on failure)
    const writerRecord = writer as unknown as Record<string, unknown>;
    const buffer = writerRecord['buffer'] as unknown[];
    expect(buffer.length).toBeGreaterThan(0);

    // Restore and cleanup
    await chmod(runDir, 0o755);
    writer.stop();
  });
});
