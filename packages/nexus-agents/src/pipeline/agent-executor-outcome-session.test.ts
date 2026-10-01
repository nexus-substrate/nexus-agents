/** Real pipeline trace → persisted stage outcome join seam (#6858). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('./expert-bridge.js', () => ({
  executeExpert: () =>
    Promise.resolve({
      success: true,
      text: 'Measured plan',
      expertType: 'architecture',
      cli: 'codex',
      durationMs: 17,
    }),
}));
vi.mock('./agent-executor-context.js', () => ({
  getOutcomeContext: () => '',
  getTrendContext: () => '',
  getWeatherContext: () => Promise.resolve(''),
  getMemoryContext: () => Promise.resolve(''),
}));
vi.mock('./agent-executor-memory.js', () => ({
  recordLearning: vi.fn(),
  recordMemoryError: vi.fn(),
  recordRoutingExperience: vi.fn(),
  flushPipelineMemory: vi.fn(),
}));

import { createAgentStages } from './agent-executor.js';
import { runDevPipeline } from './dev-pipeline.js';
import { getOutcomeStore, resetOutcomeStore } from '../orchestration/outcomes/outcome-store.js';
import { resetNexusDataDirCache } from '../config/nexus-data-dir.js';
import { queryTraceFromDisk } from '../mcp/tools/query-trace-tool.js';
import { TaskOutcomeSchema } from '../orchestration/outcomes/outcome-types.js';

function unexpectedStage(): Promise<never> {
  return Promise.reject(new Error('Unexpected stage after seam stopped'));
}

describe('stage outcomes join the real trace run (#6858)', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pipeline-outcome-session-'));
    vi.stubEnv('NEXUS_DATA_DIR', directory);
    resetNexusDataDirCache();
    resetOutcomeStore();
  });
  afterEach(async () => {
    resetOutcomeStore();
    vi.unstubAllEnvs();
    resetNexusDataDirCache();
    await rm(directory, { recursive: true, force: true });
  });

  it.each([true, false])(
    'counts a stage with session reachable=%s against the flushed run',
    async (reachable) => {
      const sessionId = '6858-disk-session-unusual';
      const runId = `pipeline-${sessionId}`;
      const stages = createAgentStages(reachable ? { sessionId } : {});
      const stop = new Error('Stop after recording the plan seam');
      await expect(
        runDevPipeline(
          'Exercise the outcome trace seam',
          {
            research: async () => {
              await stages.plan('task', 'research');
              throw stop;
            },
            plan: unexpectedStage,
            vote: unexpectedStage,
            decompose: unexpectedStage,
            implement: unexpectedStage,
            qaReview: unexpectedStage,
            securityScan: unexpectedStage,
          },
          { sessionId }
        )
      ).rejects.toThrow(stop.message);

      const trace = await queryTraceFromDisk({ runId });
      expect(trace.runId).toBe(runId);
      expect(trace.totalEvents).toBeGreaterThan(0);
      const outcomes = getOutcomeStore().query({ source: 'delegate' });
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]?.id).toMatch(/^pipeline-plan-/);
      if (reachable) expect(outcomes[0]?.traceId).toBe(trace.runId);
      else expect(outcomes[0]).not.toHaveProperty('traceId');
    }
  );

  it('keeps the row, without a traceId, when the run id would exceed the persisted cap', async () => {
    // The tool accepts a 128-char sessionId; `pipeline-` makes 137, past the
    // 128-char traceId cap, which would fail the whole row on reload.
    const sessionId = 's'.repeat(128);
    const stages = createAgentStages({ sessionId });
    const stop = new Error('Stop after recording the plan seam');
    await expect(
      runDevPipeline(
        'Exercise the over-long run id',
        {
          research: async () => {
            await stages.plan('task', 'research');
            throw stop;
          },
          plan: unexpectedStage,
          vote: unexpectedStage,
          decompose: unexpectedStage,
          implement: unexpectedStage,
          qaReview: unexpectedStage,
          securityScan: unexpectedStage,
        },
        { sessionId }
      )
    ).rejects.toThrow(stop.message);

    const outcomes = getOutcomeStore().query({ source: 'delegate' });
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).not.toHaveProperty('traceId');
    expect(TaskOutcomeSchema.safeParse(outcomes[0]).success).toBe(true);
  });
});
