/** Rejected plans remain reviewable after real async settlement (#7424). */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import { toolStructuredError } from '../tools/tool-result.js';
import { _resetForTests as resetConcurrency, tryAcquire } from './job-concurrency.js';
import { readJobResult, writeJobPending, writeJobCancelled } from './job-result-store.js';
import { runJobInBackground } from './run-as-job.js';
import { initTaskState, readTaskState } from '../../context/structured-task-state.js';
import { resolveJobResultWithSource } from './task-state-source.js';
import { FAKE_ANTHROPIC_KEY } from '../../testing/test-secrets.js';
import { nexusDataPath } from '../../config/nexus-data-dir.js';

const JOB_ID = 'dp-rejected-plan-evidence';
const PLAN = 'First add a failing regression; then implement the minimum fix.';
const PROPOSAL = `Review the complete development plan.\n${PLAN}\nResearch context: exact assembled context.`;

describe('async rejected development-plan evidence (#7424)', () => {
  let dataDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'nexus-plan-evidence-'));
    process.env['NEXUS_DATA_DIR'] = dataDir;
    resetNexusDataDirCache();
    resetConcurrency();
  });

  afterEach(() => {
    if (originalDataDir === undefined) delete process.env['NEXUS_DATA_DIR'];
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    resetConcurrency();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('retains the rejected plan and exact proposal without making the job complete', async () => {
    expect(tryAcquire('run_dev_pipeline')).toBe(true);
    writeJobPending(JOB_ID, 'run_dev_pipeline');
    await runJobInBackground(JOB_ID, {
      toolName: 'run_dev_pipeline',
      input: {},
      freshJobId: () => JOB_ID,
      run: () =>
        Promise.resolve(
          toolStructuredError({
            errorCategory: 'business',
            message: 'Pipeline stopped at the planning gate',
            detail: {
              completed: false,
              planStatus: 'unapproved',
              plan: PLAN,
              planVoteProposal: PROPOSAL,
              planVoteRecordId: 'vote-rejected-test',
            },
          })
        ),
    });
    const record = readJobResult(JOB_ID);
    expect(record?.status).toBe('failed');
    expect(record?.result).toBeUndefined();
    expect(record?.failureDetail).toBeUndefined();
    expect(record).toMatchObject({
      failureEvidence: {
        kind: 'dev_pipeline_plan',
        planStatus: 'unapproved',
        plan: { text: PLAN, coverage: 'complete' },
        proposal: { text: PROPOSAL, coverage: 'complete' },
        voteRecordId: 'vote-rejected-test',
      },
    });
  });
  it('preserves evidence through the default failed task-state reader for a custom session id', async () => {
    const jobId = 'custom-planning-session';
    expect(tryAcquire('run_dev_pipeline')).toBe(true);
    writeJobPending(jobId, 'run_dev_pipeline');
    await runJobInBackground(jobId, {
      toolName: 'run_dev_pipeline',
      input: {},
      freshJobId: () => jobId,
      run: () => {
        expect(
          initTaskState({
            taskId: jobId,
            stage: 'failed',
            decisions: [],
            blockers: [],
            position: { currentStep: 'plan' },
            updatedAt: new Date().toISOString(),
          }).ok
        ).toBe(true);
        return Promise.resolve(
          toolStructuredError({
            errorCategory: 'business',
            message: 'Plan rejected',
            detail: {
              completed: false,
              planStatus: 'unapproved',
              plan: PLAN,
              planVoteProposal: PROPOSAL,
            },
          })
        );
      },
    });
    const resolved = resolveJobResultWithSource(jobId);
    expect(resolved?.source).toBe('task_state');
    expect(resolved?.record.status).toBe('failed');
    expect(resolved?.record.result).toBeUndefined();
    expect(resolved?.record).toMatchObject({
      failureEvidence: {
        plan: { text: PLAN, coverage: 'complete' },
        proposal: { text: PROPOSAL, coverage: 'complete' },
      },
    });
  });

  it('redacts before writing and binds retained bytes separately from the raw plan', async () => {
    const rawPlan = `${PLAN} Credential: ${FAKE_ANTHROPIC_KEY}`;
    expect(tryAcquire('run_dev_pipeline')).toBe(true);
    writeJobPending(JOB_ID, 'run_dev_pipeline');
    await runJobInBackground(JOB_ID, {
      toolName: 'run_dev_pipeline',
      input: {},
      freshJobId: () => JOB_ID,
      run: () =>
        Promise.resolve(
          toolStructuredError({
            errorCategory: 'business',
            message: 'Plan rejected',
            detail: { completed: false, planStatus: 'unapproved', plan: rawPlan },
          })
        ),
    });
    const disk = readFileSync(nexusDataPath('jobs', `result-${JOB_ID}.json`), 'utf8');
    expect(disk).not.toContain(FAKE_ANTHROPIC_KEY);
    const stored: unknown = JSON.parse(disk);
    expect(stored).toMatchObject({
      status: 'failed',
      failureEvidence: {
        plan: {
          coverage: 'redacted',
          rawSha256: createHash('sha256').update(rawPlan).digest('hex'),
        },
      },
    });
  });
  it('marks initialized task state with a per-dispatch identity', async () => {
    expect(tryAcquire('run_dev_pipeline')).toBe(true);
    writeJobPending(JOB_ID, 'run_dev_pipeline');
    await runJobInBackground(JOB_ID, {
      toolName: 'run_dev_pipeline',
      input: {},
      freshJobId: () => JOB_ID,
      run: () => {
        expect(
          initTaskState({
            taskId: JOB_ID,
            stage: 'failed',
            decisions: [],
            blockers: [],
            position: { currentStep: 'plan' },
            updatedAt: new Date().toISOString(),
          }).ok
        ).toBe(true);
        return Promise.resolve({ isError: true });
      },
    });
    const state = readTaskState(JOB_ID);
    expect(state.ok).toBe(true);
    if (!state.ok) throw state.error;
    expect(state.value).toMatchObject({ dispatch: 'async', asyncDispatchId: expect.any(String) });
  });
  it('does not attach late evidence after the sidecar is cancelled', async () => {
    expect(tryAcquire('run_dev_pipeline')).toBe(true);
    writeJobPending(JOB_ID, 'run_dev_pipeline');
    writeJobCancelled(JOB_ID, 'run_dev_pipeline', 'Stop');
    await runJobInBackground(JOB_ID, {
      toolName: 'run_dev_pipeline',
      input: {},
      freshJobId: () => JOB_ID,
      run: () =>
        Promise.resolve(
          toolStructuredError({
            errorCategory: 'business',
            message: 'Plan rejected',
            detail: { completed: false, planStatus: 'unapproved', plan: PLAN },
          })
        ),
    });
    expect(readJobResult(JOB_ID)).toMatchObject({ status: 'cancelled' });
    expect(readJobResult(JOB_ID)?.failureEvidence).toBeUndefined();
  });

  it('keeps legacy state unbound instead of attaching new evidence to an old dispatch', async () => {
    expect(
      initTaskState({
        taskId: JOB_ID,
        stage: 'failed',
        decisions: [],
        blockers: [],
        position: { currentStep: 'old plan' },
        updatedAt: new Date().toISOString(),
        asyncDispatchId: '00000000-0000-4000-8000-000000000742',
      }).ok
    ).toBe(true);
    const before = readTaskState(JOB_ID);
    expect(before.ok).toBe(true);
    if (!before.ok) throw before.error;
    expect(before.value.asyncDispatchId).toBeUndefined(); // Caller cannot assert provenance.
    expect(tryAcquire('run_dev_pipeline')).toBe(true);
    writeJobPending(JOB_ID, 'run_dev_pipeline');
    await runJobInBackground(JOB_ID, {
      toolName: 'run_dev_pipeline',
      input: {},
      freshJobId: () => JOB_ID,
      run: () =>
        Promise.resolve(
          toolStructuredError({
            errorCategory: 'business',
            message: 'Plan rejected',
            detail: { completed: false, planStatus: 'unapproved', plan: PLAN },
          })
        ),
    });
    const resolved = resolveJobResultWithSource(JOB_ID);
    expect(resolved?.source).toBe('task_state');
    expect(resolved?.record.failureEvidence).toBeUndefined();
    expect(readJobResult(JOB_ID)?.failureEvidence?.plan).toMatchObject({ text: PLAN });
  });

  it('keeps concurrent async dispatches and their plan evidence separate', async () => {
    const run = async (jobId: string, plan: string): Promise<string | undefined> => {
      expect(tryAcquire('run_dev_pipeline')).toBe(true);
      writeJobPending(jobId, 'run_dev_pipeline');
      await runJobInBackground(jobId, {
        toolName: 'run_dev_pipeline',
        input: {},
        freshJobId: () => jobId,
        run: async () => {
          await Promise.resolve();
          expect(
            initTaskState({
              taskId: jobId,
              stage: 'failed',
              decisions: [],
              blockers: [],
              position: { currentStep: 'plan' },
              updatedAt: new Date().toISOString(),
            }).ok
          ).toBe(true);
          return toolStructuredError({
            errorCategory: 'business',
            message: 'Plan rejected',
            detail: { completed: false, planStatus: 'unapproved', plan },
          });
        },
      });
      const resolved = resolveJobResultWithSource(jobId);
      expect(resolved?.source).toBe('task_state');
      expect(resolved?.record.failureEvidence?.plan).toMatchObject({ text: plan });
      return resolved?.record.failureEvidence?.dispatchId;
    };
    const [left, right] = await Promise.all([
      run('left-plan-session', 'Left plan'),
      run('right-plan-session', 'Right plan'),
    ]);
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    expect(left).not.toBe(right);
  });
  it('preserves the business rejection when the byte limit cuts a redaction marker', async () => {
    const rawPlan =
      'x'.repeat(32768 - 8 - 10) + ' password=' + FAKE_ANTHROPIC_KEY + ' trailing body';
    expect(tryAcquire('run_dev_pipeline')).toBe(true);
    writeJobPending(JOB_ID, 'run_dev_pipeline');
    await runJobInBackground(JOB_ID, {
      toolName: 'run_dev_pipeline',
      input: {},
      freshJobId: () => JOB_ID,
      run: () =>
        Promise.resolve(
          toolStructuredError({
            errorCategory: 'business',
            message: 'Authentic planning rejection',
            detail: { completed: false, planStatus: 'unapproved', plan: rawPlan },
          })
        ),
    });
    const record = readJobResult(JOB_ID);
    expect(record?.status).toBe('failed');
    expect(record?.error).toContain('Authentic planning rejection');
    expect(record?.failureEvidence?.plan).toMatchObject({ coverage: 'truncated', redacted: true });
  });
});
