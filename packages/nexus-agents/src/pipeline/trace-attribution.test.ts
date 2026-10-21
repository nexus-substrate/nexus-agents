/** Actual shared-bus/writer/filesystem containment for #7551. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir, symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { PipelineEvent } from './event-types.js';
import { EventBus } from './event-bus.js';
import { TraceWriter } from './trace-writer.js';
import { ExecutionTraceEntrySchema } from './trace-schema.js';
import { queryTraceFromDisk } from '../mcp/tools/query-trace-tool.js';
import { compareDecisions, extractDecisions, parseTraceJsonl } from '../replay/replay-executor.js';
import { generateWeatherReport } from '../mcp/tools/weather-report.js';
import { getOutcomeStore, resetOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import { resetNexusDataDirCache } from '../config/nexus-data-dir.js';

const runOrigin = (
  runId: string,
  producer: 'dev-pipeline' | 'contract-pipeline' = 'dev-pipeline'
) => ({ kind: 'run', producer, runId }) as const;
const globalOrigin = { kind: 'global', producer: 'consensus' } as const;
const stage = (origin?: ReturnType<typeof runOrigin>): PipelineEvent => ({
  type: 'stage.completed' as const,
  timestamp: Date.now(),
  executionId: 'dev-pipeline-plan',
  stageId: 'plan',
  durationMs: 1,
  success: true,
  ...(origin === undefined ? {} : { origin }),
});
const zero = { run_related: 0, attempt_owned: 0, global_context: 0, unattributed: 0 };
let directory: string;
const writers: TraceWriter[] = [];
const outsideFiles: string[] = [];
function writer(bus: EventBus, runId: string, maxBufferSize = 10): TraceWriter {
  const options = { runsDir: directory, runId, maxBufferSize, origin: runOrigin(runId) };
  const value = new TraceWriter(bus, options);
  writers.push(value);
  return value;
}
const content = (runId: string): Promise<string> =>
  readFile(join(directory, runId, 'trace.jsonl'), 'utf8');
async function metadata(runId: string): Promise<Record<string, unknown>> {
  return JSON.parse(
    await readFile(join(directory, runId, 'trace-attribution.json'), 'utf8')
  ) as Record<string, unknown>;
}
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'trace-origin-'));
});
afterEach(async () => {
  for (const value of writers.splice(0)) value.stop();
  for (const file of outsideFiles.splice(0)) await rm(file, { force: true });
  vi.unstubAllEnvs();
  resetNexusDataDirCache();
  resetOutcomeStore();
  await rm(directory, { recursive: true, force: true });
});

describe('real shared-bus containment', () => {
  it('drops foreign origins despite equal generic execution IDs, without republication', async () => {
    const bus = new EventBus();
    const a = writer(bus, 'pipeline-a');
    const b = writer(bus, 'pipeline-b');
    bus.emit(stage(runOrigin('pipeline-a')));
    bus.emit(stage(runOrigin('pipeline-b')));
    await Promise.all([a.flush(), b.flush()]);
    const result = await queryTraceFromDisk({ runId: 'pipeline-a' }, directory);
    expect(result.totalEvents).toBe(1);
    expect(result.events[0]).toMatchObject({
      attributionVersion: 1,
      captureRelation: 'run_related',
      origin: runOrigin('pipeline-a'),
    });
    expect(result).toMatchObject({
      attribution: {
        status: 'measured',
        writerObserved: { observed: 2, foreignDropped: 1, evicted: 0 },
        retained: { ...zero, run_related: 1 },
      },
    });
    expect(bus.totalEmitted).toBe(2);
  });
  it('drops a different producer with the same run string', async () => {
    const bus = new EventBus();
    const value = writer(bus, 'pipeline-a');
    bus.emit(stage(runOrigin('pipeline-a', 'contract-pipeline')));
    await value.flush();
    expect(await content('pipeline-a')).toBe('');
    expect(await metadata('pipeline-a')).toMatchObject({
      writerObserved: { observed: 1, foreignDropped: 1, evicted: 0 },
    });
  });
  it('writes dropped-only and explicitly empty snapshots', async () => {
    const bus = new EventBus();
    const a = writer(bus, 'pipeline-a');
    bus.emit(stage(runOrigin('pipeline-b')));
    await a.flush();
    expect(await content('pipeline-a')).toBe('');
    expect(await queryTraceFromDisk({ runId: 'pipeline-a' }, directory)).toMatchObject({
      attribution: {
        status: 'measured',
        writerObserved: { observed: 1, foreignDropped: 1, evicted: 0 },
        retained: zero,
      },
    });
    const b = writer(bus, 'pipeline-empty');
    await b.flush();
    expect(await content('pipeline-empty')).toBe('');
    expect(await metadata('pipeline-empty')).toMatchObject({
      writerObserved: { observed: 0, foreignDropped: 0, evicted: 0 },
    });
  });
  it('labels missing origin UNKNOWN without inferring global from a signal name', async () => {
    const bus = new EventBus();
    const value = writer(bus, 'pipeline-a');
    bus.emit(stage());
    bus.emit({
      type: 'signal.vote_rejected',
      timestamp: 1,
      proposalId: 'p',
      approvalPercentage: 0,
    });
    await value.flush();
    const result = await queryTraceFromDisk({ runId: 'pipeline-a' }, directory);
    expect(result.events.map((e) => e['captureRelation'])).toEqual([
      'unattributed',
      'unattributed',
    ]);
    expect(result).toMatchObject({ attribution: { retained: { ...zero, unattributed: 2 } } });
  });
  it('retains all three bounded global signal payloads and drops foreign run signals', async () => {
    const bus = new EventBus();
    const value = writer(bus, 'pipeline-a');
    let signals = 0;
    const unsubscribe = bus.subscribe({ type: 'signal.vote_rejected' }, () => {
      signals++;
    });
    bus.emit({
      type: 'signal.vote_rejected',
      timestamp: 1,
      proposalId: 'p',
      approvalPercentage: 25,
      rejectionRules: ['DRY'],
      origin: globalOrigin,
    });
    bus.emit({
      type: 'signal.vote_rejected',
      timestamp: 2,
      proposalId: 'q',
      approvalPercentage: 0,
      origin: runOrigin('pipeline-b'),
    });
    bus.emit({
      type: 'signal.fitness_declined',
      timestamp: 3,
      score: 70,
      floor: 90,
      dimension: 'quality',
      origin: { kind: 'global', producer: 'fitness-review' },
    });
    bus.emit({
      type: 'signal.swarm_unhealthy',
      timestamp: 4,
      agentId: 'codex',
      reason: 'unavailable',
      origin: { kind: 'global', producer: 'swarm-health' },
    });
    await value.flush();
    unsubscribe();
    const result = await queryTraceFromDisk({ runId: 'pipeline-a' }, directory);
    expect(result.events).toHaveLength(3);
    expect(result.events[0]).toMatchObject({
      captureRelation: 'global_context',
      proposalId: 'p',
      approvalPercentage: 25,
      rejectionRules: ['DRY'],
    });
    expect(result.events[1]).toMatchObject({ score: 70, floor: 90, dimension: 'quality' });
    expect(result.events[2]).toMatchObject({ agentId: 'codex', reason: 'unavailable' });
    expect(signals).toBe(2);
    expect(bus.totalEmitted).toBe(4);
  });
  it('bounds signal fields and discloses truncation', async () => {
    const bus = new EventBus();
    const value = writer(bus, 'pipeline-a');
    bus.emit({
      type: 'signal.vote_rejected',
      timestamp: 1,
      proposalId: 'p'.repeat(500),
      approvalPercentage: 0,
      rejectionRules: Array.from({ length: 100 }, () => 'r'.repeat(500)),
      origin: globalOrigin,
    });
    await value.flush();
    const result = await queryTraceFromDisk({ runId: 'pipeline-a' }, directory);
    expect(result.events[0]).toMatchObject({ provenanceTruncated: true });
    expect((result.events[0]?.['proposalId'] as string).length).toBeLessThanOrEqual(256);
    expect((result.events[0]?.['rejectionRules'] as string[]).length).toBeLessThanOrEqual(20);
  });
  it('separates lifetime observations, FIFO retention, filtered and page counts', async () => {
    const bus = new EventBus();
    const value = writer(bus, 'pipeline-a', 2);
    bus.emit(stage(runOrigin('pipeline-b')));
    for (let i = 0; i < 3; i++) bus.emit(stage(runOrigin('pipeline-a')));
    bus.emit({
      type: 'signal.vote_rejected',
      timestamp: 1,
      proposalId: 'p',
      approvalPercentage: 0,
      origin: globalOrigin,
    });
    await value.flush();
    expect(
      await queryTraceFromDisk(
        { runId: 'pipeline-a', eventType: 'stage.completed', limit: 1 },
        directory
      )
    ).toMatchObject({
      totalEvents: 1,
      attribution: {
        writerObserved: { observed: 5, foreignDropped: 1, evicted: 2 },
        retained: { ...zero, run_related: 1, global_context: 1 },
        filtered: { ...zero, run_related: 1 },
        returned: { ...zero, run_related: 1 },
      },
    });
  });
  it('serializes flush snapshots with an event during an active flush', async () => {
    const bus = new EventBus();
    const value = writer(bus, 'pipeline-a');
    bus.emit(stage(runOrigin('pipeline-a')));
    const first = value.flush();
    bus.emit(stage(runOrigin('pipeline-a')));
    const second = value.flush();
    await Promise.all([first, second, value.flush()]);
    const text = await content('pipeline-a');
    expect(await metadata('pipeline-a')).toMatchObject({
      traceSha256: createHash('sha256').update(text).digest('hex'),
      traceBytes: Buffer.byteLength(text),
      writerObserved: { observed: 2 },
    });
    expect((await queryTraceFromDisk({ runId: 'pipeline-a' }, directory)).totalEvents).toBe(2);
  });
  it('copies retained provenance and stops observing after unsubscribe', async () => {
    const bus = new EventBus();
    const value = writer(bus, 'pipeline-a');
    const rules = ['DRY'];
    bus.emit({
      type: 'signal.vote_rejected',
      timestamp: 1,
      proposalId: 'p',
      approvalPercentage: 0,
      rejectionRules: rules,
      origin: globalOrigin,
    });
    rules.push('NEW');
    await value.flush();
    value.stop();
    bus.emit(stage(runOrigin('pipeline-a')));
    expect(
      (await queryTraceFromDisk({ runId: 'pipeline-a' }, directory)).events[0]?.['rejectionRules']
    ).toEqual(['DRY']);
    expect((await metadata('pipeline-a'))['writerObserved']).toEqual({
      observed: 1,
      foreignDropped: 0,
      evicted: 0,
      invalidDropped: 0,
    });
  });
});

describe('schema and snapshot trust boundary', () => {
  it('retains optional attribution and rejects contradictory relations', () => {
    const row = {
      timestamp: 1,
      runId: 'pipeline-a',
      eventType: 'stage.completed',
      attributionVersion: 1,
      origin: runOrigin('pipeline-a'),
      captureOrigin: runOrigin('pipeline-a'),
      captureRelation: 'run_related',
    };
    expect(ExecutionTraceEntrySchema.parse(row)).toMatchObject(row);
    expect(
      ExecutionTraceEntrySchema.safeParse({ ...row, captureRelation: 'attempt_owned' }).success
    ).toBe(false);
    expect(
      ExecutionTraceEntrySchema.safeParse({ ...row, origin: runOrigin('pipeline-b') }).success
    ).toBe(false);
    expect(ExecutionTraceEntrySchema.safeParse({ ...row, captureRelation: 'owned' }).success).toBe(
      false
    );
    expect(
      ExecutionTraceEntrySchema.safeParse({ timestamp: 1, runId: 'legacy', eventType: 'tick' })
        .success
    ).toBe(true);
  });
  it.each(['absent', 'mismatch', 'oversize', 'escaping-symlink', 'malformed'] as const)(
    'reports %s metadata unmeasured, never zero',
    async (mode) => {
      const bus = new EventBus();
      const value = writer(bus, 'pipeline-a');
      bus.emit(stage(runOrigin('pipeline-a')));
      await value.flush();
      const file = join(directory, 'pipeline-a', 'trace-attribution.json');
      if (mode === 'absent') await rm(file, { force: true });
      if (mode === 'mismatch')
        await writeFile(
          file,
          JSON.stringify({ ...(await metadata('pipeline-a')), traceSha256: '0'.repeat(64) })
        );
      if (mode === 'oversize') await writeFile(file, ' '.repeat(16385));
      if (mode === 'malformed') await writeFile(file, '{');
      if (mode === 'escaping-symlink') {
        const outside = `${directory}-attribution.json`;
        outsideFiles.push(outside);
        await writeFile(outside, JSON.stringify(await metadata('pipeline-a')), { flag: 'wx' });
        await rm(file);
        await symlink(outside, file);
      }
      const result = await queryTraceFromDisk({ runId: 'pipeline-a' }, directory);
      expect(result).toMatchObject({
        attribution: { status: 'unmeasured', writerObserved: null, retained: null },
      });
      expect(result.events[0]?.['captureRelation']).not.toBe('run_related');
    }
  );
  it('discloses parse loss and refuses complete attribution totals', async () => {
    const bus = new EventBus();
    const value = writer(bus, 'pipeline-a');
    bus.emit(stage(runOrigin('pipeline-a')));
    await value.flush();
    await writeFile(
      join(directory, 'pipeline-a', 'trace.jsonl'),
      (await content('pipeline-a')) + 'broken\n'
    );
    expect(await queryTraceFromDisk({ runId: 'pipeline-a' }, directory)).toMatchObject({
      skippedLines: 1,
      attribution: { status: 'unmeasured', retained: null },
    });
  });
  it('fails closed between atomic renames and permits retry', async () => {
    const bus = new EventBus();
    const value = writer(bus, 'pipeline-a');
    bus.emit(stage(runOrigin('pipeline-a')));
    await mkdir(join(directory, 'pipeline-a', 'trace-attribution.json'), { recursive: true });
    await expect(value.flush()).rejects.toThrow();
    expect(await queryTraceFromDisk({ runId: 'pipeline-a' }, directory)).toMatchObject({
      attribution: { status: 'unmeasured', writerObserved: null },
    });
    await rm(join(directory, 'pipeline-a', 'trace-attribution.json'), { recursive: true });
    await value.flush();
    expect(await queryTraceFromDisk({ runId: 'pipeline-a' }, directory)).toMatchObject({
      attribution: { status: 'measured' },
    });
  });
});

describe('configured buffer compatibility', () => {
  it('preserves an explicit safe FIFO bound above the default', () => {
    const bus = new EventBus();
    const value = new TraceWriter(bus, {
      runsDir: directory,
      runId: 'larger',
      maxBufferSize: 50_001,
    });
    writers.push(value);
    value.stop();
    expect(value).toBeDefined();
  });
});

describe('containment consumers', () => {
  it('excludes legacy routing and names zero comparison unmeasured', () => {
    expect(
      extractDecisions([
        { timestamp: 1, runId: 'r', eventType: 'routing.decision', modelId: 'codex' },
      ])
    ).toHaveLength(0);
    expect(compareDecisions([], [])).toMatchObject({ measurement: 'unmeasured' });
  });
  it('does not certify prefix-only real dev traces', async () => {
    vi.stubEnv('NEXUS_DATA_DIR', directory);
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'true');
    vi.stubEnv('NEXUS_VOTE_RECORDS_PATH', join(directory, 'absent-ledger.jsonl'));
    resetNexusDataDirCache();
    resetOutcomeStore();
    const bus = new EventBus();
    const value = new TraceWriter(bus, {
      runsDir: join(directory, 'runs'),
      runId: 'pipeline-legacy',
    });
    writers.push(value);
    bus.emit(stage());
    await value.flush();
    expect(
      generateWeatherReport({ includePipelineJoins: true }).costSection?.consensusDecisionTokens
    ).toMatchObject({ matchedPipelineRuns: 0, pipelineOutcomeJoinCoverage: null });
  });
  it('keeps legacy parsing readable without promoting capture identity', () => {
    const entries = parseTraceJsonl(
      JSON.stringify({ timestamp: 1, runId: 'r', eventType: 'routing.decision', modelId: 'codex' })
    );
    expect(entries).toHaveLength(1);
    expect(extractDecisions(entries)).toEqual([]);
  });
});

describe('typed producer consumer conjunction', () => {
  it.each(['dev-pipeline', 'contract-pipeline', 'graph-pipeline'] as const)(
    'certifies logical participation only for the explicit dev producer: %s',
    async (producer) => {
      vi.stubEnv('NEXUS_DATA_DIR', directory);
      vi.stubEnv('NEXUS_PERSIST_LEARNING', 'true');
      vi.stubEnv('NEXUS_VOTE_RECORDS_PATH', join(directory, 'absent-ledger.jsonl'));
      resetNexusDataDirCache();
      resetOutcomeStore();
      const runId = 'pipeline-producer';
      const origin = { kind: 'run', producer, runId } as const;
      const bus = new EventBus();
      const value = new TraceWriter(bus, { runsDir: join(directory, 'runs'), runId, origin });
      writers.push(value);
      bus.emit({ ...stage(), origin });
      await value.flush();
      getOutcomeStore().append({
        id: 'outcome',
        traceId: runId,
        cli: 'codex',
        category: 'planning',
        model: 'pipeline',
        source: 'delegate',
        success: true,
        durationMs: 1,
        timestamp: new Date().toISOString(),
      });
      expect(
        generateWeatherReport({ includePipelineJoins: true }).costSection?.consensusDecisionTokens
      ).toMatchObject({
        matchedPipelineRuns: producer === 'dev-pipeline' ? 1 : 0,
        pipelineOutcomeJoinCoverage: producer === 'dev-pipeline' ? 1 : null,
      });
    }
  );

  it('replay validates the producer pair rather than trusting a declared relation', () => {
    const row = {
      timestamp: 1,
      runId: 'pipeline-a',
      eventType: 'routing.decision',
      modelId: 'codex',
      attributionVersion: 1 as const,
      captureRelation: 'run_related' as const,
      origin: runOrigin('pipeline-a', 'contract-pipeline'),
      captureOrigin: runOrigin('pipeline-a'),
    };
    expect(extractDecisions([row])).toEqual([]);
  });
});

describe('committed-tuple classification without producer threading', () => {
  it.each(['exact', 'missing-writer-attempt', 'different-attempt'] as const)(
    'requires the exact task/run/attempt on both sides: %s',
    async (mode) => {
      const origin = {
        kind: 'run',
        producer: 'contract-pipeline',
        runId: 'task',
        taskId: 'task',
        attemptId: 'one',
      } as const;
      const capture =
        mode === 'missing-writer-attempt'
          ? {
              kind: 'run' as const,
              producer: 'contract-pipeline' as const,
              runId: 'task',
              taskId: 'task',
            }
          : { ...origin, attemptId: mode === 'different-attempt' ? 'two' : 'one' };
      const bus = new EventBus();
      const value = new TraceWriter(bus, { runsDir: directory, runId: 'task', origin: capture });
      writers.push(value);
      bus.emit({
        type: 'pipeline.started',
        timestamp: 1,
        taskId: 'task',
        executionId: 'task',
        attemptId: 'one',
        intentId: 'start:one',
        origin,
      });
      await value.flush();
      const result = await queryTraceFromDisk({ runId: 'task' }, directory);
      if (mode === 'different-attempt') {
        expect(result).toMatchObject({
          totalEvents: 0,
          attribution: { writerObserved: { foreignDropped: 1 } },
        });
      } else {
        expect(result.events[0]).toMatchObject({
          captureRelation: mode === 'exact' ? 'attempt_owned' : 'unattributed',
          taskId: 'task',
          attemptId: 'one',
          intentId: 'start:one',
        });
      }
    }
  );
});

describe('weather whole-snapshot diagnostics', () => {
  it.each(['wrong-digest', 'matching-digest-null'] as const)(
    'retains an independently good run but names the unreadable snapshot: %s',
    async (damage) => {
      vi.stubEnv('NEXUS_DATA_DIR', directory);
      vi.stubEnv('NEXUS_PERSIST_LEARNING', 'true');
      vi.stubEnv('NEXUS_VOTE_RECORDS_PATH', join(directory, 'absent-ledger.jsonl'));
      resetNexusDataDirCache();
      resetOutcomeStore();
      for (const session of ['good', 'bad']) {
        const runId = `pipeline-${session}`;
        const origin = runOrigin(runId);
        const bus = new EventBus();
        const value = new TraceWriter(bus, { runsDir: join(directory, 'runs'), runId, origin });
        writers.push(value);
        bus.emit({ ...stage(), origin });
        await value.flush();
        getOutcomeStore().append({
          id: session,
          traceId: runId,
          cli: 'codex',
          category: 'planning',
          model: 'pipeline',
          source: 'delegate',
          success: true,
          durationMs: 1,
          timestamp: new Date().toISOString(),
        });
      }
      const path = join(directory, 'runs', 'pipeline-bad', 'trace.jsonl');
      const metaPath = join(directory, 'runs', 'pipeline-bad', 'trace-attribution.json');
      const snapshot = JSON.parse(await readFile(metaPath, 'utf8')) as Record<string, unknown>;
      let text = await readFile(path, 'utf8');
      if (damage === 'matching-digest-null') {
        text += 'null\n';
        await writeFile(path, text);
      }
      await writeFile(
        metaPath,
        JSON.stringify({
          ...snapshot,
          traceBytes: Buffer.byteLength(text),
          traceSha256:
            damage === 'wrong-digest'
              ? '0'.repeat(64)
              : createHash('sha256').update(text).digest('hex'),
        })
      );
      expect(
        generateWeatherReport({ includePipelineJoins: true }).costSection?.consensusDecisionTokens
      ).toMatchObject({
        matchedPipelineRuns: 1,
        unreadablePipelineTraces: 1,
        pipelineOutcomeJoinCoverage: null,
      });
    }
  );
});

describe('raw UTF-8 snapshot binding at actual file consumers', () => {
  it.each([
    ['query', 'original-sidecar'],
    ['query', 'raw-updated-sidecar'],
    ['weather', 'original-sidecar'],
    ['weather', 'raw-updated-sidecar'],
  ] as const)('rejects lossy trace decoding: %s / %s', async (consumer, mode) => {
    vi.stubEnv('NEXUS_DATA_DIR', directory);
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'true');
    vi.stubEnv('NEXUS_VOTE_RECORDS_PATH', join(directory, 'absent-ledger.jsonl'));
    resetNexusDataDirCache();
    resetOutcomeStore();
    const runId = 'pipeline-utf8';
    const origin = runOrigin(runId);
    const bus = new EventBus();
    const value = new TraceWriter(bus, { runsDir: join(directory, 'runs'), runId, origin });
    writers.push(value);
    bus.emit({
      type: 'stage.completed',
      timestamp: Date.now(),
      stageId: 'plan',
      durationMs: 1,
      success: true,
      origin,
      executionId: 'dev-pipeline-\uFFFD',
    });
    await value.flush();
    getOutcomeStore().append({
      id: 'outcome-utf8',
      traceId: runId,
      cli: 'codex',
      category: 'planning',
      model: 'pipeline',
      source: 'delegate',
      success: true,
      durationMs: 1,
      timestamp: new Date().toISOString(),
    });
    const tracePath = join(directory, 'runs', runId, 'trace.jsonl');
    const metadataPath = join(directory, 'runs', runId, 'trace-attribution.json');
    const original = await readFile(tracePath);
    const originalMetadata = JSON.parse(await readFile(metadataPath, 'utf8')) as Record<
      string,
      unknown
    >;
    const offset = original.indexOf(Buffer.from('\uFFFD'));
    expect(offset).toBeGreaterThanOrEqual(0);
    const changed = Buffer.concat([
      original.subarray(0, offset),
      Buffer.from([0xe1, 0x80]),
      original.subarray(offset + 3),
    ]);
    expect(changed.toString('utf8')).toBe(original.toString('utf8'));
    expect(changed.length).not.toBe(original.length);
    const weather = (): ReturnType<typeof generateWeatherReport> =>
      generateWeatherReport({ includePipelineJoins: true });
    if (consumer === 'query') {
      expect(await queryTraceFromDisk({ runId }, join(directory, 'runs'))).toMatchObject({
        attribution: { status: 'measured', retained: { run_related: 1 } },
      });
    } else {
      expect(weather().costSection?.consensusDecisionTokens).toMatchObject({
        matchedPipelineRuns: 1,
        pipelineOutcomeJoinCoverage: 1,
      });
    }
    await writeFile(tracePath, changed);
    if (mode === 'raw-updated-sidecar')
      await writeFile(
        metadataPath,
        JSON.stringify({
          ...originalMetadata,
          traceBytes: changed.length,
          traceSha256: createHash('sha256').update(changed).digest('hex'),
        })
      );
    if (consumer === 'query') {
      const result = await queryTraceFromDisk({ runId }, join(directory, 'runs'));
      expect(result).toMatchObject({ attribution: { status: 'unmeasured', retained: null } });
      expect(result.events[0]?.['captureRelation']).toBeUndefined();
    } else {
      expect(weather().costSection?.consensusDecisionTokens).toMatchObject({
        matchedPipelineRuns: 0,
        unreadablePipelineTraces: 1,
        pipelineOutcomeJoinCoverage: null,
      });
    }
  });
});
