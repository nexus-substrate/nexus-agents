/** Counted or unknown capture loss must not certify full weather join coverage (#7552). */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../pipeline/event-bus.js';
import { TraceWriter } from '../../pipeline/trace-writer.js';
import { TraceAttributionSnapshotSchema } from '../../pipeline/trace-schema.js';
import { pipelineRunId } from '../../pipeline/pipeline-run-id.js';
import { getDefaultRunsDir } from '../../pipeline/pipeline-runner.js';
import { getOutcomeStore, resetOutcomeStore } from '../../orchestration/outcomes/index.js';
import { queryTraceFromDisk } from './query-trace-tool.js';
import { generateWeatherReport } from './weather-report.js';

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'weather-invalid-trace-loss-'));
  vi.stubEnv('NEXUS_DATA_DIR', directory);
  vi.stubEnv('NEXUS_PERSIST_LEARNING', 'true');
  vi.stubEnv('NEXUS_VOTE_RECORDS_PATH', join(directory, 'absent-vote-ledger.jsonl'));
  resetOutcomeStore();
});
afterEach(() => {
  resetOutcomeStore();
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

async function traced(withInvalidLoss: boolean): Promise<string> {
  const runId = pipelineRunId('invalid-loss-weather-fixture');
  const bus = new EventBus();
  // Explicit fixture provenance only: this does not establish production origin threading.
  const origin = { kind: 'run', producer: 'dev-pipeline', runId } as const;
  const writer = new TraceWriter(bus, { runsDir: getDefaultRunsDir(), runId, origin });
  const event = {
    type: 'stage.started',
    timestamp: Date.now(),
    stageId: 'research',
    pluginId: 'research',
    executionId: 'dev-pipeline-research',
    origin,
  } as const;
  try {
    if (withInvalidLoss) {
      const invalid = { ...event };
      Object.defineProperty(invalid, 'origin', {
        get: () => {
          throw new Error('FAKE_TEST weather trace conversion failure');
        },
      });
      bus.emit(invalid);
    }
    bus.emit(event);
    await writer.flush();
  } finally {
    writer.stop();
  }
  getOutcomeStore().append({
    id: `stage-${runId}`,
    cli: 'claude',
    category: 'planning',
    model: 'pipeline',
    source: 'delegate',
    success: false,
    durationMs: 10,
    timestamp: new Date().toISOString(),
    traceId: runId,
  });
  return runId;
}

function joins(): NonNullable<
  ReturnType<typeof generateWeatherReport>['costSection']
>['consensusDecisionTokens'] {
  const result = generateWeatherReport({ includePipelineJoins: true }).costSection;
  expect(result).toBeDefined();
  if (result === undefined) throw new Error('Missing weather cost section');
  return result.consensusDecisionTokens;
}

function expectRetainedLogicalJoin(): void {
  expect(joins()).toMatchObject({
    matchedPipelineRuns: 1,
    matchedPipelineOutcomeRows: 1,
    unmatchedPipelineOutcomeRows: 0,
    unreadablePipelineTraces: 0,
  });
}

describe('weather join coverage with counted or unknown trace capture loss', () => {
  it('keeps a retained logical run matched but withholds coverage for counted invalid loss', async () => {
    const runId = await traced(true);
    expect(await queryTraceFromDisk({ runId }, getDefaultRunsDir())).toMatchObject({
      events: [{ eventType: 'stage.started', captureRelation: 'run_related' }],
      attribution: {
        status: 'measured',
        writerObserved: { observed: 2, invalidDropped: 1 },
      },
    });
    expectRetainedLogicalJoin();
    expect(joins().pipelineOutcomeJoinCoverage).toBeNull();
  });

  it('keeps a historical logical run matched but withholds coverage for unknown invalid loss', async () => {
    const runId = await traced(false);
    const path = join(getDefaultRunsDir(), runId, 'trace-attribution.json');
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
    const snapshot = TraceAttributionSnapshotSchema.parse(raw);
    const { invalidDropped, ...historicalCounts } = snapshot.writerObserved;
    expect(invalidDropped).toBe(0);
    // Historical omission keeps the exact retained trace bytes and digest binding intact.
    writeFileSync(path, JSON.stringify({ ...snapshot, writerObserved: historicalCounts }) + '\n');
    expect(await queryTraceFromDisk({ runId }, getDefaultRunsDir())).toMatchObject({
      events: [{ eventType: 'stage.started', captureRelation: 'run_related' }],
      attribution: { status: 'measured', writerObserved: { invalidDropped: null } },
    });
    expectRetainedLogicalJoin();
    expect(joins().pipelineOutcomeJoinCoverage).toBeNull();
  });

  it.each([false, true])(
    'withholds mixed-run coverage when a separate empty capture has historical unknown loss=%s',
    async (historical) => {
      await traced(false);
      const runId = pipelineRunId('empty-loss-weather-fixture');
      const bus = new EventBus();
      // Explicit fixture provenance; the real writer emits and binds the empty capture.
      const origin = { kind: 'run', producer: 'dev-pipeline', runId } as const;
      const writer = new TraceWriter(bus, { runsDir: getDefaultRunsDir(), runId, origin });
      try {
        if (!historical) {
          const invalid = {
            type: 'stage.started',
            timestamp: Date.now(),
            executionId: 'dev-pipeline-empty-research',
            stageId: 'research',
            pluginId: 'research',
            origin,
          } as const;
          Object.defineProperty(invalid, 'origin', {
            get: () => {
              throw new Error('FAKE_TEST invalid-only weather conversion failure');
            },
          });
          bus.emit(invalid);
        }
        await writer.flush();
      } finally {
        writer.stop();
      }
      if (historical) {
        const path = join(getDefaultRunsDir(), runId, 'trace-attribution.json');
        const snapshot = TraceAttributionSnapshotSchema.parse(
          JSON.parse(readFileSync(path, 'utf8'))
        );
        const { invalidDropped, ...historicalCounts } = snapshot.writerObserved;
        expect(invalidDropped).toBe(0);
        // Omit only the historical measurement; preserve exact empty-byte binding.
        writeFileSync(path, JSON.stringify({ ...snapshot, writerObserved: historicalCounts }));
      }
      expect(await queryTraceFromDisk({ runId }, getDefaultRunsDir())).toMatchObject({
        events: [],
        attribution: {
          status: 'measured',
          writerObserved: {
            observed: historical ? 0 : 1,
            invalidDropped: historical ? null : 1,
            foreignDropped: 0,
            evicted: 0,
          },
          retained: { run_related: 0, attempt_owned: 0, global_context: 0, unattributed: 0 },
        },
      });
      // Neither empty capture is fabricated into a joined run or unreadable trace.
      expectRetainedLogicalJoin();
      expect(joins().pipelineOutcomeJoinCoverage).toBeNull();
    }
  );

  it('preserves mixed-run coverage with a separate explicitly zero-loss empty capture', async () => {
    await traced(false);
    const runId = pipelineRunId('empty-zero-loss-weather-fixture');
    const origin = { kind: 'run', producer: 'dev-pipeline', runId } as const;
    const writer = new TraceWriter(new EventBus(), {
      runsDir: getDefaultRunsDir(),
      runId,
      origin,
    });
    try {
      await writer.flush();
    } finally {
      writer.stop();
    }
    expect(await queryTraceFromDisk({ runId }, getDefaultRunsDir())).toMatchObject({
      events: [],
      attribution: {
        status: 'measured',
        writerObserved: { observed: 0, invalidDropped: 0 },
        retained: { run_related: 0, attempt_owned: 0, global_context: 0, unattributed: 0 },
      },
    });
    expectRetainedLogicalJoin();
    expect(joins().pipelineOutcomeJoinCoverage).toBe(1);
  });

  it('preserves healthy join coverage for an explicitly measured zero-loss capture', async () => {
    const runId = await traced(false);
    expect(await queryTraceFromDisk({ runId }, getDefaultRunsDir())).toMatchObject({
      attribution: { status: 'measured', writerObserved: { observed: 1, invalidDropped: 0 } },
    });
    expectRetainedLogicalJoin();
    expect(joins().pipelineOutcomeJoinCoverage).toBe(1);
  });
});
