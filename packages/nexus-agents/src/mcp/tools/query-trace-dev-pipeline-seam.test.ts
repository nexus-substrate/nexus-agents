/**
 * Dev-pipeline trace persistence → query_trace seam (#6856).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { nexusDataPath } from '../../config/nexus-data-dir.js';
import { runDevPipeline } from '../../pipeline/dev-pipeline.js';
import { EventBus, getPipelineEventBus } from '../../pipeline/event-bus.js';
import { TraceWriter } from '../../pipeline/trace-writer.js';
import { queryTraceFromDisk } from './query-trace-tool.js';

function unexpectedStage(): Promise<never> {
  return Promise.reject(new Error('Unexpected stage after research failed'));
}

async function writeTrace(directory: 'runs' | 'traces', runId: string): Promise<void> {
  const bus = new EventBus();
  const writer = new TraceWriter(bus, { runsDir: nexusDataPath(directory), runId });
  try {
    bus.emit({
      type: 'stage.completed',
      timestamp: 1234,
      executionId: runId,
      stageId: 'research',
      durationMs: 25,
      success: true,
    });
    await writer.flush();
  } finally {
    writer.stop();
  }
}

describe('dev-pipeline traces queried from disk', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'nexus-query-trace-seam-'));
    vi.stubEnv('NEXUS_DATA_DIR', tempDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tempDir, { recursive: true, force: true });
  });

  it('reads a trace flushed by the real dev-pipeline writer helper', async () => {
    const sessionId = 'trace-seam';
    const runId = `pipeline-${sessionId}`;
    const failure = new Error('Research stopped after emitting an event');
    const run = runDevPipeline(
      'Exercise trace persistence',
      {
        research: () => {
          getPipelineEventBus().emit({
            type: 'stage.completed',
            timestamp: 1234,
            executionId: runId,
            stageId: 'research',
            durationMs: 25,
            success: true,
          });
          return Promise.reject(failure);
        },
        plan: unexpectedStage,
        vote: unexpectedStage,
        decompose: unexpectedStage,
        implement: unexpectedStage,
        qaReview: unexpectedStage,
        securityScan: unexpectedStage,
      },
      { sessionId }
    );
    await expect(run).rejects.toThrow(failure.message);

    const result = await queryTraceFromDisk({ runId });

    expect(result.source).toBe('disk');
    expect(result.events).toEqual([
      {
        timestamp: 1234,
        runId,
        eventType: 'stage.completed',
        executionId: runId,
        nodeId: 'research',
        durationMs: 25,
      },
    ]);
    expect(result).toMatchObject({ totalEvents: 1, sourceDirectory: 'runs' });
  });

  it.each(['runs', 'traces'] as const)('keeps existing %s traces readable', async (directory) => {
    await writeTrace(directory, 'pipeline-existing');

    const result = await queryTraceFromDisk({ runId: 'pipeline-existing' });

    expect(result).toMatchObject({ source: 'disk', totalEvents: 1, sourceDirectory: directory });
    expect(result.events[0]?.['nodeId']).toBe('research');
  });

  it('prefers runs when both directories contain the same run ID', async () => {
    await writeTrace('runs', 'pipeline-duplicate');
    await writeTrace('traces', 'pipeline-duplicate');
    await writeFile(nexusDataPath('traces', 'pipeline-duplicate', 'trace.jsonl'), 'broken JSON\n');

    const result = await queryTraceFromDisk({ runId: 'pipeline-duplicate' });

    expect(result).toMatchObject({ source: 'disk', sourceDirectory: 'runs', totalEvents: 1 });
    expect(result.errorCategory).toBeUndefined();
  });

  it('reports not_found when the trace exists in neither directory', async () => {
    const result = await queryTraceFromDisk({ runId: 'pipeline-missing' });

    expect(result).toMatchObject({
      source: 'not_found',
      errorCategory: 'not_found',
      errorMessage: "No trace file for runId 'pipeline-missing'",
      events: [],
      totalEvents: 0,
    });
    expect(result).not.toHaveProperty('sourceDirectory');
  });

  it('keeps an explicit directory override confined to that directory', async () => {
    await writeTrace('traces', 'pipeline-override');

    const result = await queryTraceFromDisk({ runId: 'pipeline-override' }, nexusDataPath('runs'));

    expect(result).toMatchObject({ source: 'not_found', errorCategory: 'not_found' });
  });

  it('filters and limits events in a historical dev-pipeline trace', async () => {
    await writeTrace('traces', 'pipeline-filter');
    const tracePath = nexusDataPath('traces', 'pipeline-filter', 'trace.jsonl');
    await writeFile(
      tracePath,
      ['stage.completed', 'model.called', 'model.called']
        .map((eventType) => JSON.stringify({ eventType }))
        .join('\n')
    );

    const result = await queryTraceFromDisk({
      runId: 'pipeline-filter',
      eventType: 'model.called',
      limit: 1,
    });

    expect(result).toMatchObject({
      source: 'disk',
      sourceDirectory: 'traces',
      totalEvents: 2,
      truncated: true,
      events: [{ eventType: 'model.called' }],
    });
  });

  it('keeps an existing trace with no matching events distinct from absence', async () => {
    await writeTrace('traces', 'pipeline-no-match');

    const result = await queryTraceFromDisk({
      runId: 'pipeline-no-match',
      eventType: 'model.called',
    });

    expect(result).toMatchObject({ source: 'disk', sourceDirectory: 'traces', totalEvents: 0 });
    expect(result.errorCategory).toBeUndefined();
  });

  it('does not fall back from an oversized runs trace to a historical trace', async () => {
    await writeTrace('runs', 'pipeline-large');
    await writeTrace('traces', 'pipeline-large');
    await truncate(nexusDataPath('runs', 'pipeline-large', 'trace.jsonl'), 100 * 1024 * 1024 + 1);

    const result = await queryTraceFromDisk({ runId: 'pipeline-large' });

    expect(result).toMatchObject({
      source: 'disk',
      sourceDirectory: 'runs',
      errorCategory: 'too_large',
      truncated: true,
    });
  });

  it('blocks a historical trace symlink that escapes its directory', async () => {
    await writeTrace('runs', 'outside');
    await mkdir(nexusDataPath('traces'), { recursive: true });
    await symlink(nexusDataPath('runs', 'outside'), nexusDataPath('traces', 'pipeline-escape'));

    const result = await queryTraceFromDisk({ runId: 'pipeline-escape' });

    expect(result.source).toBe('not_found');
    expect(result.events).toEqual([]);
  });
});
