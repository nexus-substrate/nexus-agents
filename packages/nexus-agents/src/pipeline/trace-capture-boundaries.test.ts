/** Default writer boundaries on the actual shared bus (#7551 source-review dissent). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompositeRouter } from '../cli-adapters/composite-router.js';
import type { CompositeRoutingDecision } from '../cli-adapters/composite-router-types.js';
import { queryTraceFromDisk } from '../mcp/tools/query-trace-tool.js';
import { EventBus, getPipelineEventBus, resetPipelineEventBus } from './event-bus.js';
import type { IEventBus, PipelineEvent } from './event-types.js';
import { ExecutionTraceEntrySchema } from './trace-schema.js';
import { TraceWriter } from './trace-writer.js';

const runId = 'capture-local';
const zero = { run_related: 0, attempt_owned: 0, global_context: 0, unattributed: 0 };
const runOrigin = (id: string) => ({ kind: 'run', producer: 'dev-pipeline', runId: id }) as const;
const stage = (origin?: ReturnType<typeof runOrigin>): PipelineEvent => ({
  type: 'stage.completed',
  executionId: 'shared-generic-stage',
  stageId: 'local-stage',
  durationMs: 1,
  success: true,
  timestamp: 1,
  ...(origin === undefined ? {} : { origin }),
});
let directory: string;
const writers: TraceWriter[] = [];
function writer(bus: IEventBus, maxBufferSize = 10): TraceWriter {
  const result = new TraceWriter(bus, { runsDir: directory, runId, maxBufferSize });
  writers.push(result);
  return result;
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'trace-default-capture-'));
  resetPipelineEventBus();
});
afterEach(async () => {
  for (const value of writers.splice(0)) value.stop();
  resetPipelineEventBus();
  await rm(directory, { recursive: true, force: true });
});

describe('originless capture boundaries', () => {
  it('omits the actual canonical routing emitter prompt prefix from disk and query', async () => {
    const bus = getPipelineEventBus();
    const value = writer(bus);
    const router = new CompositeRouter(new Map(), {
      enableRoutingMemory: false,
      enableStrategyDistillation: false,
      enableResourceStrategy: false,
      enableCapacityBalancing: false,
    });
    const decision: Pick<CompositeRoutingDecision, 'cliName' | 'reason' | 'stagesExecuted'> = {
      cliName: 'codex',
      reason: 'Fixed harmless routing fixture',
      stagesExecuted: ['fixture:pass'],
    };
    const prompt = 'SYNTHETIC_ROUTING_INPUT_7551_abcdefghijklmnopqrstuvwxyz';
    const emit: unknown = Reflect.get(router, 'emitRoutingDecision');
    expect(typeof emit).toBe('function');
    if (typeof emit !== 'function') throw new Error('Missing canonical routing emitter');
    Reflect.apply(emit, router, [decision, prompt]);
    expect(bus.query({ type: 'routing.decision' })).toMatchObject([{ taskId: prompt }]);
    await value.flush();
    const raw = await readFile(join(directory, runId, 'trace.jsonl'), 'utf8');
    const result = await queryTraceFromDisk({ runId }, directory);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      eventType: 'routing.decision',
      modelId: 'codex',
      reasoning: decision.reason,
      captureRelation: 'unattributed',
    });
    expect(raw).not.toContain(prompt);
    expect(JSON.stringify(result)).not.toContain(prompt);
    expect(result.events[0]).not.toHaveProperty('taskId');
  });

  it('keeps actual lifecycle and tool identities without inventing ownership', async () => {
    const bus = new EventBus();
    const value = writer(bus);
    bus.emit({
      type: 'pipeline.started',
      taskId: 'task-identity',
      executionId: 'execution-identity',
      intentId: 'intent-identity',
      attemptId: 'attempt-identity',
      timestamp: 1,
    });
    bus.emit({
      type: 'tool.invoked',
      toolName: 'fixture',
      invocationId: 'tool-identity',
      timestamp: 2,
    });
    await value.flush();
    const result = await queryTraceFromDisk({ runId }, directory);
    expect(result.events[0]).toMatchObject({
      taskId: 'task-identity',
      intentId: 'intent-identity',
      attemptId: 'attempt-identity',
      captureRelation: 'unattributed',
    });
    expect(result.events[1]).toMatchObject({
      invocationId: 'tool-identity',
      captureRelation: 'unattributed',
    });
    expect(result.attribution?.retained).toEqual({ ...zero, unattributed: 2 });
  });

  it('retains task IDs from all five declared task-identity event types', async () => {
    const bus = new EventBus();
    const value = writer(bus);
    const events: PipelineEvent[] = [
      { type: 'task.created', taskId: 'created-id', timestamp: 1 },
      {
        type: 'task.status_changed',
        taskId: 'status-id',
        from: 'queued',
        to: 'running',
        timestamp: 2,
      },
      { type: 'task.completed', taskId: 'completed-id', success: true, timestamp: 3 },
      { type: 'task.failed', taskId: 'failed-id', error: 'Fixed fixture failure', timestamp: 4 },
      { type: 'pipeline.started', taskId: 'pipeline-id', executionId: 'pipeline-id', timestamp: 5 },
    ];
    for (const event of events) bus.emit(event);
    await value.flush();
    const result = await queryTraceFromDisk({ runId }, directory);
    expect(result.events.map((event) => event['taskId'])).toEqual([
      'created-id',
      'status-id',
      'completed-id',
      'failed-id',
      'pipeline-id',
    ]);
    expect(result.attribution).toMatchObject({
      status: 'measured',
      retained: { ...zero, unattributed: 5 },
    });
  });

  it('omits undeclared taskId payloads from stage, model and global signal events', async () => {
    const bus = new EventBus();
    const value = writer(bus);
    const payload = 'SYNTHETIC_UNDECLARED_TASK_INPUT_7551';
    const stageWithPayload = { ...stage(), taskId: payload };
    const modelWithPayload = {
      type: 'model.called' as const,
      timestamp: 2,
      executionId: 'fixture-model',
      cli: 'fixture-cli',
      model: 'fixture',
      tokensIn: 1,
      tokensOut: 1,
      durationMs: 1,
      taskId: payload,
    };
    const signalWithPayload = {
      type: 'signal.vote_rejected' as const,
      timestamp: 3,
      proposalId: 'global-proposal',
      approvalPercentage: 0,
      taskId: payload,
      origin: { kind: 'global' as const, producer: 'consensus' as const },
    };
    bus.emit(stageWithPayload);
    bus.emit(modelWithPayload);
    bus.emit(signalWithPayload);
    await value.flush();
    const result = await queryTraceFromDisk({ runId }, directory);
    expect(result.events).toHaveLength(3);
    expect(result.attribution).toMatchObject({
      status: 'measured',
      retained: { ...zero, unattributed: 2, global_context: 1 },
    });
    expect(await readFile(join(directory, runId, 'trace.jsonl'), 'utf8')).not.toContain(payload);
    expect(JSON.stringify(result)).not.toContain(payload);
    for (const event of result.events) expect(event).not.toHaveProperty('taskId');
  });

  it('omits empty and overbound identity fields without poisoning otherwise valid rows', async () => {
    const bus = new EventBus();
    const value = writer(bus);
    bus.emit({
      type: 'pipeline.started',
      taskId: '',
      executionId: 'local-execution',
      intentId: '',
      attemptId: '',
      timestamp: 1,
    });
    bus.emit({ type: 'tool.invoked', toolName: 'fixture', invocationId: '', timestamp: 2 });
    bus.emit({ type: 'task.created', taskId: 'x'.repeat(257), timestamp: 3 });
    await value.flush();
    const result = await queryTraceFromDisk({ runId }, directory);
    expect(result.events).toHaveLength(3);
    expect(result.attribution).toMatchObject({
      status: 'measured',
      retained: { ...zero, unattributed: 3 },
    });
    for (const event of result.events) {
      expect(event).toMatchObject({ provenanceTruncated: true, captureRelation: 'unattributed' });
      for (const key of ['taskId', 'intentId', 'attemptId', 'invocationId']) {
        expect(event).not.toHaveProperty(key);
      }
    }
  });

  it('drops an explicit foreign signal before it can evict the unknown local row', async () => {
    const bus = new EventBus();
    const value = writer(bus, 1);
    bus.emit(stage());
    bus.emit({
      type: 'signal.vote_rejected',
      timestamp: 2,
      proposalId: 'foreign-proposal',
      approvalPercentage: 0,
      origin: runOrigin('capture-foreign'),
    });
    await value.flush();
    const result = await queryTraceFromDisk({ runId }, directory);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({ eventType: 'stage.completed', nodeId: 'local-stage' });
    expect(result.attribution).toMatchObject({
      status: 'measured',
      writerObserved: { observed: 2, foreignDropped: 1, evicted: 0 },
      retained: { ...zero, unattributed: 1 },
    });
    expect(bus.totalEmitted).toBe(2);
  });

  it('drops explicit foreign-only rows to a measured empty capture', async () => {
    const bus = new EventBus();
    const value = writer(bus);
    bus.emit(stage(runOrigin('capture-foreign')));
    await value.flush();
    expect(await readFile(join(directory, runId, 'trace.jsonl'), 'utf8')).toBe('');
    expect(await queryTraceFromDisk({ runId }, directory)).toMatchObject({
      totalEvents: 0,
      attribution: {
        status: 'measured',
        writerObserved: { observed: 1, foreignDropped: 1, evicted: 0 },
        retained: zero,
      },
    });
  });

  it('keeps explicit same-run origin UNKNOWN without guessing a writer producer or attempt', async () => {
    const bus = new EventBus();
    const value = writer(bus);
    bus.emit(stage(runOrigin(runId)));
    await value.flush();
    const result = await queryTraceFromDisk({ runId }, directory);
    expect(result.events[0]).toMatchObject({
      origin: runOrigin(runId),
      captureRelation: 'unattributed',
    });
    expect(result.events[0]).not.toHaveProperty('captureOrigin');
    expect(result.attribution?.retained).toEqual({ ...zero, unattributed: 1 });
  });

  it('retains missing-origin rows as UNKNOWN, including an unqualified signal', async () => {
    const bus = new EventBus();
    const value = writer(bus);
    bus.emit(stage());
    bus.emit({
      type: 'signal.vote_rejected',
      timestamp: 2,
      proposalId: 'unknown-proposal',
      approvalPercentage: 0,
    });
    await value.flush();
    const result = await queryTraceFromDisk({ runId }, directory);
    expect(result.events).toHaveLength(2);
    expect(result.events.every((event) => event['captureRelation'] === 'unattributed')).toBe(true);
    expect(result.attribution?.retained).toEqual({ ...zero, unattributed: 2 });
  });

  it('retains explicitly global context once with no writer-origin inference', async () => {
    const bus = new EventBus();
    const value = writer(bus);
    bus.emit({
      type: 'signal.vote_rejected',
      timestamp: 1,
      proposalId: 'global-proposal',
      approvalPercentage: 0,
      origin: { kind: 'global', producer: 'consensus' },
    });
    await value.flush();
    const result = await queryTraceFromDisk({ runId }, directory);
    expect(result.events).toHaveLength(1);
    expect(result.attribution?.retained).toEqual({ ...zero, global_context: 1 });
    expect(bus.totalEmitted).toBe(1);
  });

  it('rejects a persisted known-foreign row even when capture producer is UNKNOWN', () => {
    expect(
      ExecutionTraceEntrySchema.safeParse({
        attributionVersion: 1,
        captureRelation: 'unattributed',
        timestamp: 1,
        runId,
        eventType: 'stage.completed',
        origin: runOrigin('capture-foreign'),
      }).success
    ).toBe(false);
  });
});
