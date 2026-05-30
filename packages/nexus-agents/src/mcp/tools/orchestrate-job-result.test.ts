/**
 * Integration tests for the #3091 async orchestrate writer: the background
 * run must record its result into the Stage-2 task-state log keyed by
 * jobId (== taskId), so the #3090 dual-read reader can resolve it.
 *
 * Drives the (test-exported) `runOrchestrateInBackground` directly so the
 * fire-and-forget run is awaitable and deterministic.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  runOrchestrateInBackground,
  createMockOrchestrator,
  type OrchestrateDeps,
  type OrchestrateInput,
} from './orchestrate.js';
import { NOOP_NOTIFIER } from '../mcp-notifier.js';
import { resolveJobResult, readJobResultFromTaskState } from '../jobs/task-state-source.js';
import { readJobResult } from '../jobs/job-result-store.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import { createLogger } from '../../core/index.js';
import { RateLimiter } from '../middleware/index.js';

const logger = createLogger({ component: 'test-orch-job-result' });

function testRateLimiter(): RateLimiter {
  return new RateLimiter({ capacity: 1000, refillRate: 1000, refillIntervalMs: 1000 });
}

// A task loaded with HIGH_COMPLEXITY_KEYWORDS (refactor, distributed,
// architecture, optimize, security, performance, concurrent, trade-off,
// decision, migrate, legacy) so the SharedTaskAnalyzer scores it non-'simple'
// — otherwise the fast-path short-circuits and skips task-state recording.
const COMPLEX_TASK =
  'Refactor the distributed authentication architecture to optimize security ' +
  'and performance under concurrent load, analyze the trade-off decisions, ' +
  'and migrate the legacy session services.';

function depsWith(orchestrator: NonNullable<OrchestrateDeps['orchestrator']>): OrchestrateDeps {
  return { orchestrator, logger, rateLimiter: testRateLimiter() };
}

function taskInput(task: string): OrchestrateInput {
  return { task, maxIterations: 10 };
}

function bgParams(
  input: OrchestrateInput,
  deps: OrchestrateDeps
): {
  input: OrchestrateInput;
  deps: OrchestrateDeps;
  notifier: typeof NOOP_NOTIFIER;
  logger: typeof logger;
} {
  return { input, deps, notifier: NOOP_NOTIFIER, logger };
}

describe('async orchestrate writer → task-state (#3091)', () => {
  let tmpDir: string;
  const origData = process.env['NEXUS_DATA_DIR'];
  const origSrc = process.env['NEXUS_JOB_RESULT_SOURCE'];
  const origTs = process.env['NEXUS_TASK_STATE_ENABLED'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-orch-jr-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    process.env['NEXUS_JOB_RESULT_SOURCE'] = 'task_state';
    delete process.env['NEXUS_TASK_STATE_ENABLED']; // default ON
    resetNexusDataDirCache();
  });

  afterEach(() => {
    if (origData === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = origData;
    if (origSrc === undefined) delete process.env['NEXUS_JOB_RESULT_SOURCE'];
    else process.env['NEXUS_JOB_RESULT_SOURCE'] = origSrc;
    if (origTs === undefined) delete process.env['NEXUS_TASK_STATE_ENABLED'];
    else process.env['NEXUS_TASK_STATE_ENABLED'] = origTs;
    resetNexusDataDirCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records the result into the task-state log under jobId=taskId', async () => {
    const jobId = 'orch-itest-success';
    await runOrchestrateInBackground(
      jobId,
      bgParams(taskInput(COMPLEX_TASK), depsWith(createMockOrchestrator()))
    );

    // The task-state branch must have run (non-simple task → full pipeline),
    // proving the taskId threaded all the way to executeOrchestration.
    const fromState = readJobResultFromTaskState(jobId);
    expect(fromState).not.toBeNull();
    expect(fromState?.status).toBe('complete');
    expect(fromState?.result).toBeDefined();
    expect(fromState?.toolName).toBe('orchestrate');

    // Dual-read resolves it, and the sidecar got the same terminal status.
    expect(resolveJobResult(jobId)?.status).toBe('complete');
    expect(readJobResult(jobId)?.status).toBe('complete');
  });

  it('records a terminal failed stage when the orchestrator fails', async () => {
    const jobId = 'orch-itest-failure';
    const failing = {
      execute: () => Promise.reject(new Error('mock orchestrator boom')),
    } as unknown as NonNullable<OrchestrateDeps['orchestrator']>;

    await runOrchestrateInBackground(jobId, bgParams(taskInput(COMPLEX_TASK), depsWith(failing)));

    const fromState = readJobResultFromTaskState(jobId);
    expect(fromState).not.toBeNull();
    expect(fromState?.status).toBe('failed');
    // error is sourced from the recorded blocker
    expect(typeof fromState?.error).toBe('string');
  });
});
