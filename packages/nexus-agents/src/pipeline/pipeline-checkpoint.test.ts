/**
 * Pipeline Checkpoint Tests (#1703 — checkpoint/resume for crash recovery)
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  saveStageCheckpoint,
  loadCheckpointState,
  cleanupCheckpoint,
  checkpointToResult,
} from './pipeline-checkpoint.js';

const TEST_DIR = path.join(os.tmpdir(), 'nexus-checkpoint-test');

afterEach(() => {
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('saveStageCheckpoint + loadCheckpointState', () => {
  it('round-trips research checkpoint', () => {
    const saved = saveStageCheckpoint(
      'test-session-1',
      'research',
      { type: 'research', text: 'Found 3 papers' },
      TEST_DIR
    );
    expect(saved).toBe(true);

    const state = loadCheckpointState('test-session-1', TEST_DIR);
    expect(state).not.toBeNull();
    expect(state?.research).toBe('Found 3 papers');
    expect(state?.lastCompletedStage).toBe('research');
  });

  it('round-trips plan checkpoint', () => {
    saveStageCheckpoint(
      'test-session-2',
      'plan',
      { type: 'plan', text: 'Step 1, Step 2', iterations: 2 },
      TEST_DIR
    );

    const state = loadCheckpointState('test-session-2', TEST_DIR);
    expect(state?.plan).toBe('Step 1, Step 2');
    expect(state?.voteIterations).toBe(2);
  });

  it('accumulates multiple stages', () => {
    const sid = 'test-multi';
    saveStageCheckpoint(sid, 'research', { type: 'research', text: 'R' }, TEST_DIR);
    saveStageCheckpoint(sid, 'plan', { type: 'plan', text: 'P', iterations: 1 }, TEST_DIR);
    saveStageCheckpoint(
      sid,
      'decompose',
      {
        type: 'decompose',
        tasks: [{ id: 't1', title: 'T', description: 'D', assignedTo: 'coder', status: 'pending' }],
      },
      TEST_DIR
    );

    const state = loadCheckpointState(sid, TEST_DIR);
    expect(state?.research).toBe('R');
    expect(state?.plan).toBe('P');
    expect(state?.tasks).toHaveLength(1);
    expect(state?.lastCompletedStage).toBe('decompose');
  });

  it('returns null for non-existent session', () => {
    expect(loadCheckpointState('nonexistent', TEST_DIR)).toBeNull();
  });

  it('rejects invalid session IDs', () => {
    expect(saveStageCheckpoint('../hack', 'research', { type: 'research', text: '' })).toBe(false);
    expect(loadCheckpointState('../hack')).toBeNull();
  });
});

describe('cleanupCheckpoint', () => {
  it('removes checkpoint file on success', () => {
    const sid = 'test-cleanup';
    saveStageCheckpoint(sid, 'research', { type: 'research', text: 'X' }, TEST_DIR);
    expect(loadCheckpointState(sid, TEST_DIR)).not.toBeNull();

    cleanupCheckpoint(sid, TEST_DIR);
    expect(loadCheckpointState(sid, TEST_DIR)).toBeNull();
  });
});

describe('checkpointToResult', () => {
  it('converts checkpoint state to partial pipeline result', () => {
    const result = checkpointToResult({
      plan: 'My plan',
      voteIterations: 2,
      implementedTasks: [
        { id: 't1', title: 'T', description: '', assignedTo: 'coder', status: 'done' },
      ],
      securityPassed: true,
    });

    expect(result.plan).toBe('My plan');
    expect(result.voteIterations).toBe(2);
    expect(result.tasks).toHaveLength(1);
    expect(result.securityPassed).toBe(true);
  });
});
