import * as fs from 'node:fs';
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, readFileSync: vi.fn(actual.readFileSync) };
});

import { EventBus } from '../../pipeline/event-bus.js';
import { TraceWriter } from '../../pipeline/trace-writer.js';
import { emitStageStarted } from '../../pipeline/pipeline-observability.js';
import type { ParsedCliArgs } from '../../cli-types.js';
import { collectHealth, handleHealthCommand } from '../../cli/health-command.js';
import { pipelineRunId } from '../../pipeline/pipeline-run-id.js';
import { getDefaultRunsDir } from '../../pipeline/pipeline-runner.js';
import { getOutcomeStore, resetOutcomeStore } from '../../orchestration/outcomes/index.js';
import { RateLimiter } from '../middleware/rate-limiter.js';
import { registerWeatherReportTool } from './weather-report-tool.js';
import type { ToolResult } from './tool-result.js';
import { getWeatherBonusScores } from '../../cli-adapters/weather-bonus-stage.js';
import { generateWeatherReport } from './weather-report.js';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'weather-pipeline-'));
  vi.stubEnv('NEXUS_DATA_DIR', dir);
  vi.stubEnv('NEXUS_PERSIST_LEARNING', 'true');
  vi.stubEnv('NEXUS_VOTE_RECORDS_PATH', join(dir, 'absent-vote-ledger.jsonl'));
  resetOutcomeStore();
  vi.clearAllMocks();
});
afterEach(() => {
  resetOutcomeStore();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(dir, { recursive: true, force: true });
});

async function traced(session: string, timestamp = Date.now()): Promise<string> {
  const runId = pipelineRunId(session);
  const bus = new EventBus();
  const writer = new TraceWriter(bus, { runsDir: getDefaultRunsDir(), runId });
  vi.spyOn(Date, 'now').mockReturnValueOnce(timestamp);
  emitStageStarted({ bus, stageId: 'research', executionId: 'dev-pipeline-research' });
  await writer.flush();
  writer.stop();
  return runId;
}

function stage(traceId: string, timestamp = Date.now()): void {
  getOutcomeStore().append({
    id: `stage-${traceId}`,
    cli: 'claude',
    category: 'planning',
    model: 'pipeline',
    source: 'delegate',
    success: false,
    durationMs: 10,
    timestamp: new Date(timestamp).toISOString(),
    traceId,
  });
}

function rawTrace(session: string, content: string): void {
  const path = join(getDefaultRunsDir(), pipelineRunId(session));
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'trace.jsonl'), content);
}

describe('weather pipeline inputs and output (#6867)', () => {
  it('renders pipeline joins from real TraceWriter files through the MCP producer', async () => {
    const run = await traced('matched');
    await traced('missing-stages');
    stage(run);
    stage(pipelineRunId('orphan'));
    const registerTool = vi.fn();
    const server = { registerTool } as unknown as Parameters<typeof registerWeatherReportTool>[0];
    registerWeatherReportTool(server, {
      rateLimiter: new RateLimiter({ capacity: 10, refillRate: 1 }),
    });
    const handler = registerTool.mock.calls[0]?.[2] as (
      args: unknown,
      extra: unknown
    ) => Promise<ToolResult>;
    const result = await handler({}, undefined);
    expect(result.isError).not.toBe(true);
    const expected = {
      costSection: {
        consensusDecisionTokens: {
          matchedPipelineRuns: 1,
          matchedPipelineOutcomeRows: 1,
          unmatchedPipelineOutcomeRows: 1,
          pipelineOutcomeJoinCoverage: 0.5,
        },
      },
    };
    expect(result.structuredContent).toMatchObject(expected);
    expect(JSON.parse(result.content[0]!.text)).toMatchObject(expected);
  });

  it('windows trace evidence and outcome rows together without historical fallback', async () => {
    const run = await traced('recent');
    const old = await traced('old', 0);
    stage(run);
    stage(old, 0);
    expect(
      generateWeatherReport({ includePipelineJoins: true }, { outcomeLookbackMs: 60_000 })
        .costSection?.consensusDecisionTokens
    ).toMatchObject({ matchedPipelineRuns: 1, pipelineOutcomeJoinCoverage: 1 });
    expect(
      generateWeatherReport({ includePipelineJoins: true }, { outcomeLookbackMs: 0 }).costSection
        ?.consensusDecisionTokens.matchedPipelineRuns
    ).toBe(2);
  });

  it('keeps an injected snapshot out of host traces and accepts explicit run IDs', async () => {
    const run = await traced('host');
    stage(run);
    expect(
      generateWeatherReport({ includePipelineJoins: true }, undefined, { decisionCostRecords: [] })
        .costSection?.consensusDecisionTokens.pipelineOutcomeJoinCoverage
    ).toBeNull();
    expect(
      generateWeatherReport({ includePipelineJoins: true }, undefined, {
        decisionCostRecords: [],
        pipelineRunIds: [run],
      }).costSection?.consensusDecisionTokens.pipelineOutcomeJoinCoverage
    ).toBe(1);
  });

  it('reports absent traces and an empty producer as unmeasured', () => {
    expect(
      generateWeatherReport({ includePipelineJoins: true }).costSection?.consensusDecisionTokens
        .pipelineOutcomeJoinCoverage
    ).toBeNull();
  });

  it('does not scan disk when persistence is disabled', async () => {
    stage(await traced('host'));
    vi.stubEnv('NEXUS_PERSIST_LEARNING', 'false');
    expect(
      generateWeatherReport({ includePipelineJoins: true }).costSection?.consensusDecisionTokens
    ).toMatchObject({
      matchedPipelineRuns: 0,
      unmatchedPipelineOutcomeRows: 1,
      pipelineOutcomeJoinCoverage: null,
    });
  });

  it('does not count empty, non-pipeline or mismatched run traces', async () => {
    await traced('');
    rawTrace('empty', '');
    rawTrace(
      'mismatch',
      JSON.stringify({ timestamp: Date.now(), runId: 'graph-run', eventType: 'pipeline.started' })
    );
    stage(pipelineRunId(''));
    stage(pipelineRunId('empty'));
    stage(pipelineRunId('mismatch'));
    expect(
      generateWeatherReport({ includePipelineJoins: true }).costSection?.consensusDecisionTokens
    ).toMatchObject({
      matchedPipelineRuns: 0,
      unmatchedPipelineOutcomeRows: 3,
      pipelineOutcomeJoinCoverage: null,
    });
  });

  it.each(['not-json', JSON.stringify({ runId: pipelineRunId('bad') })])(
    'counts malformed traces while rendering the rest of the report: %s',
    (content) => {
      rawTrace('bad', content);
      stage(pipelineRunId('bad'));
      const report = generateWeatherReport({ includePipelineJoins: true });
      expect(report.overall.totalTasks).toBe(1);
      expect(report.costSection?.consensusDecisionTokens).toMatchObject({
        unreadablePipelineTraces: 1,
        matchedPipelineRuns: 0,
        unmatchedPipelineOutcomeRows: 1,
        pipelineOutcomeJoinCoverage: null,
      });
    }
  );

  it('excludes a corrupt run while retaining independently readable joins', async () => {
    stage(await traced('good'));
    stage(pipelineRunId('bad-tail'));
    const valid = JSON.stringify({
      timestamp: Date.now(),
      runId: pipelineRunId('bad-tail'),
      eventType: 'pipeline.started',
    });
    rawTrace('bad-tail', `${valid}\nnot-json\n`);
    const report = generateWeatherReport({ includePipelineJoins: true });
    expect(report.overall.totalTasks).toBe(2);
    expect(report.costSection?.consensusDecisionTokens).toMatchObject({
      unreadablePipelineTraces: 1,
      matchedPipelineRuns: 1,
      matchedPipelineOutcomeRows: 1,
      unmatchedPipelineOutcomeRows: 1,
      pipelineOutcomeJoinCoverage: null,
    });
  });

  it('counts traces that escape the runs root through a symlink', () => {
    const path = join(getDefaultRunsDir(), pipelineRunId('escape'));
    mkdirSync(path, { recursive: true });
    const outside = join(dir, 'outside.jsonl');
    writeFileSync(
      outside,
      JSON.stringify({
        timestamp: Date.now(),
        runId: pipelineRunId('escape'),
        eventType: 'pipeline.started',
      })
    );
    symlinkSync(outside, join(path, 'trace.jsonl'));
    const report = generateWeatherReport({ includePipelineJoins: true });
    expect(report.overall.totalTasks).toBe(0);
    expect(report.costSection?.consensusDecisionTokens).toMatchObject({
      unreadablePipelineTraces: 1,
      pipelineOutcomeJoinCoverage: null,
    });
  });

  it('counts an oversized trace without reading it and still renders', () => {
    rawTrace('huge', '');
    const path = join(getDefaultRunsDir(), pipelineRunId('huge'), 'trace.jsonl');
    truncateSync(path, 100 * 1024 * 1024 + 1);
    const reads = vi.mocked(fs.readFileSync);
    const report = generateWeatherReport({ includePipelineJoins: true });
    expect(report.overall.totalTasks).toBe(0);
    expect(report.costSection?.consensusDecisionTokens).toMatchObject({
      unreadablePipelineTraces: 1,
      pipelineOutcomeJoinCoverage: null,
    });
    expect(reads.mock.calls.filter(([file]) => file === path)).toHaveLength(0);
  });

  it('skips traces with an mtime before the window without reading them', async () => {
    const run = await traced('stale');
    const path = join(getDefaultRunsDir(), run, 'trace.jsonl');
    utimesSync(path, new Date(0), new Date(0));
    const reads = vi.mocked(fs.readFileSync);
    const report = generateWeatherReport(
      { includePipelineJoins: true },
      { outcomeLookbackMs: 60_000 }
    );
    expect(report.costSection?.consensusDecisionTokens).toMatchObject({
      unreadablePipelineTraces: 0,
      pipelineOutcomeJoinCoverage: null,
    });
    expect(reads.mock.calls.filter(([file]) => file === path)).toHaveLength(0);
  });

  it('renders a truncated real TraceWriter file through the MCP producer', async () => {
    const run = await traced('truncated');
    appendFileSync(join(getDefaultRunsDir(), run, 'trace.jsonl'), '{"trunc');
    stage(run);
    const registerTool = vi.fn();
    const server = { registerTool } as unknown as Parameters<typeof registerWeatherReportTool>[0];
    registerWeatherReportTool(server, {
      rateLimiter: new RateLimiter({ capacity: 10, refillRate: 1 }),
    });
    const handler = registerTool.mock.calls[0]?.[2] as (
      args: unknown,
      extra: unknown
    ) => Promise<ToolResult>;
    const result = await handler({}, undefined);
    expect(result.isError).not.toBe(true);
    expect(collectHealth()).toMatchObject({
      totalTasks: 1,
      consensusDecisionTokens: {
        unreadablePipelineTraces: 1,
        pipelineOutcomeJoinCoverage: null,
      },
    });
    const writes = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    handleHealthCommand({ command: 'health', options: {} } as unknown as ParsedCliArgs);
    expect(writes.mock.calls.map(([value]) => String(value)).join('')).toContain(
      'Pipeline Join Coverage: unmeasured (unreadable traces: 1)'
    );
    writes.mockClear();
    handleHealthCommand({
      command: 'health',
      options: { format: 'json' },
    } as unknown as ParsedCliArgs);
    expect(JSON.parse(String(writes.mock.calls[0]?.[0]))).toMatchObject({
      consensusDecisionTokens: { unreadablePipelineTraces: 1, pipelineOutcomeJoinCoverage: null },
    });
    writes.mockRestore();
    const expected = {
      costSection: {
        consensusDecisionTokens: {
          unreadablePipelineTraces: 1,
          matchedPipelineRuns: 0,
          unmatchedPipelineOutcomeRows: 1,
          pipelineOutcomeJoinCoverage: null,
        },
      },
    };
    expect(result.structuredContent).toMatchObject(expected);
    expect(JSON.parse(result.content[0]!.text)).toMatchObject(expected);
  });

  it('keeps routing measured with a truncated trace and never reads trace files', async () => {
    const run = await traced('routing');
    const path = join(getDefaultRunsDir(), run, 'trace.jsonl');
    appendFileSync(path, '{"trunc');
    stage(run);
    const reads = vi.mocked(fs.readFileSync);
    expect(getWeatherBonusScores('planning').measured).toBe(true);
    expect(reads.mock.calls.filter(([file]) => String(file).endsWith('trace.jsonl'))).toHaveLength(
      0
    );
    expect(
      generateWeatherReport({}).costSection?.consensusDecisionTokens.matchedPipelineRuns
    ).toBeUndefined();
  });

  it('excludes a colliding run_pipeline contract ID while retaining session x', async () => {
    const run = await traced('known');
    stage(run);
    rawTrace(
      'x',
      JSON.stringify({
        timestamp: Date.now(),
        runId: 'pipeline-x',
        // A stage event, so only the executionId provenance leg can reject it.
        eventType: 'stage.completed',
        executionId: 'pipeline-x',
      })
    );
    expect(
      generateWeatherReport({ includePipelineJoins: true }).costSection?.consensusDecisionTokens
    ).toMatchObject({ matchedPipelineRuns: 1, pipelineOutcomeJoinCoverage: 1 });
    // x is a supported dev-pipeline session; its stage provenance makes it measurable.
    stage(await traced('x'));
    expect(
      generateWeatherReport({ includePipelineJoins: true }).costSection?.consensusDecisionTokens
    ).toMatchObject({ matchedPipelineRuns: 2, pipelineOutcomeJoinCoverage: 1 });
  });
});
