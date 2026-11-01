/**
 * Pipeline Checkpoint Tests (#1703 — checkpoint/resume for crash recovery)
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  saveStageCheckpoint,
  loadCheckpointState,
  cleanupCheckpoint,
  checkpointToResult,
  loadCheckpointDiagnostic,
  saveBoundStageCheckpoint,
} from './pipeline-checkpoint.js';
import { captureAcceptanceContext } from './acceptance-context.js';
import { buildPlanVoteProposal } from './plan-vote-proposal.js';
import { checkpointTaskIdentities } from './pipeline-checkpoint-binding.js';
import type { AcceptanceMetadata } from './acceptance-binding.js';
import type { PipelineCheckpointBinding } from './pipeline-checkpoint-binding.js';
import * as dataPaths from '../config/nexus-data-dir.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: vi.fn(actual.readFileSync),
    appendFileSync: vi.fn(actual.appendFileSync),
    closeSync: vi.fn(actual.closeSync),
  };
});

const TEST_DIR = path.join(os.tmpdir(), 'nexus-checkpoint-test');

afterEach(() => {
  vi.restoreAllMocks();
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('bound checkpoint diagnostics and persistence', () => {
  const sid = 'bound-test';
  const file = path.join(TEST_DIR, `pipeline-${sid}.jsonl`);
  const hash = (text: string): { sha256: string; bytes: number } => ({
    sha256: createHash('sha256').update(text).digest('hex'),
    bytes: Buffer.byteLength(text),
  });
  function acceptance(): AcceptanceMetadata {
    const captured = captureAcceptanceContext({ kind: 'task', source: 'Build feature' });
    if (!captured.ok) throw captured.error;
    return {
      source: captured.value.source,
      projection: captured.value.projection.identity,
      provenance: captured.value.provenance,
    };
  }
  function binding(): PipelineCheckpointBinding {
    return { format: 'pipeline-checkpoint-v1' as const, acceptance: acceptance() };
  }
  function line(
    stage = 'research',
    data: unknown = { type: 'research', text: 'Research' },
    metadata: unknown = binding()
  ): unknown {
    return {
      sessionId: sid,
      stage,
      timestamp: '2026-10-27T00:00:00.000Z',
      data,
      binding: metadata,
    };
  }
  function write(...entries: readonly unknown[]): void {
    fs.mkdirSync(TEST_DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n', {
      mode: 0o600,
    });
  }
  it('reads an absent checkpoint without creating its directory', () => {
    expect(loadCheckpointDiagnostic(sid, TEST_DIR)).toEqual({ kind: 'absent' });
    expect(fs.existsSync(TEST_DIR)).toBe(false);
  });
  it('uses the canonical read-only resolver for the default checkpoint directory', () => {
    const readOnly = vi.spyOn(dataPaths, 'previewNexusDataPath').mockReturnValue(TEST_DIR);
    const mutating = vi.spyOn(dataPaths, 'nexusDataPath').mockReturnValue(TEST_DIR);
    expect(loadCheckpointDiagnostic(sid)).toEqual({ kind: 'absent' });
    expect(readOnly).toHaveBeenCalledExactlyOnceWith('checkpoints');
    expect(mutating).not.toHaveBeenCalled();
    expect(fs.existsSync(TEST_DIR)).toBe(false);
  });
  it('distinguishes an existing empty checkpoint from absence', () => {
    write();
    fs.writeFileSync(file, '');
    expect(loadCheckpointDiagnostic(sid, TEST_DIR)).toMatchObject({
      kind: 'invalid',
      reason: 'empty-checkpoint',
    });
    expect(loadCheckpointState(sid, TEST_DIR)).toEqual({});
  });
  it('rejects malformed UTF-8 instead of replacement decoding', () => {
    write();
    fs.writeFileSync(file, Buffer.from([0xc3, 0x28]));
    expect(loadCheckpointDiagnostic(sid, TEST_DIR)).toMatchObject({
      kind: 'invalid',
      reason: 'invalid-encoding',
    });
  });
  it('reports permission and IO errors separately from ENOENT', () => {
    write(line());
    vi.mocked(fs.readFileSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('private'), { code: 'EACCES' });
    });
    expect(loadCheckpointDiagnostic(sid, TEST_DIR)).toEqual({
      kind: 'unavailable',
      reason: 'checkpoint-unreadable',
    });
  });
  it('allows bound research-only state without inventing approval', () => {
    write(line());
    const result = loadCheckpointDiagnostic(sid, TEST_DIR);
    expect(result).toMatchObject({
      kind: 'bound',
      state: { research: 'Research' },
      binding: { acceptance: acceptance() },
    });
    if (result.kind === 'bound') expect(result.binding.approval).toBeUndefined();
  });
  it.each([
    null,
    { ...binding(), format: 'pipeline-checkpoint-v2' },
    { ...binding(), acceptance: {} },
  ])('never strips malformed recognized binding into legacy', (metadata) => {
    write(line('research', { type: 'research', text: 'Research' }, metadata));
    expect(loadCheckpointDiagnostic(sid, TEST_DIR)).toMatchObject({ kind: 'invalid' });
    expect(loadCheckpointState(sid, TEST_DIR)).toBeNull();
  });
  it('poisons a bound session containing a malformed or legacy line', () => {
    write(line());
    fs.appendFileSync(file, '{truncated');
    expect(loadCheckpointDiagnostic(sid, TEST_DIR)).toMatchObject({ kind: 'invalid' });
    expect(loadCheckpointState(sid, TEST_DIR)).toBeNull();
    write(line(), {
      sessionId: sid,
      stage: 'plan',
      timestamp: 'now',
      data: { type: 'plan', text: 'Plan', iterations: 1 },
    });
    expect(loadCheckpointDiagnostic(sid, TEST_DIR)).toMatchObject({ kind: 'invalid' });
  });
  it('keeps legacy partial recovery without certifying invalid input', () => {
    write({
      sessionId: sid,
      stage: 'research',
      timestamp: 'now',
      data: { type: 'research', text: 'Old research' },
    });
    fs.appendFileSync(file, '{broken');
    expect(loadCheckpointDiagnostic(sid, TEST_DIR)).toMatchObject({ kind: 'invalid' });
    expect(loadCheckpointState(sid, TEST_DIR)?.research).toBe('Old research');
  });

  it('warns on legacy recovery without logging malformed private input', () => {
    const logs = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    write({
      sessionId: sid,
      stage: 'research',
      timestamp: 'now',
      data: { type: 'research', text: 'Old research' },
    });
    fs.appendFileSync(file, '{PRIVATE_SENTINEL');
    expect(loadCheckpointState(sid, TEST_DIR)?.research).toBe('Old research');
    expect(JSON.stringify(logs.mock.calls)).toContain('Recovered legacy checkpoint');
    expect(JSON.stringify(logs.mock.calls)).not.toContain('PRIVATE_SENTINEL');
  });
  it('checks session identity and stage/data agreement', () => {
    write({
      sessionId: 'other',
      stage: 'research',
      data: { type: 'research', text: 'Research' },
      timestamp: 'now',
      binding: binding(),
    });
    expect(loadCheckpointDiagnostic(sid, TEST_DIR)).toMatchObject({ kind: 'invalid' });
    write(line('plan'));
    expect(loadCheckpointDiagnostic(sid, TEST_DIR)).toMatchObject({ kind: 'invalid' });
  });
  it('retains the exact final suffix, including cutoff whitespace', () => {
    const plan = 'Implement feature';
    const suffix = buildPlanVoteProposal(plan, 'x'.repeat(999) + ' Y').suffix;
    const approval = {
      format: 'bound-plan-vote-v1' as const,
      voteRecordId: 'vote-test',
      recordHash: 'a'.repeat(64),
      proposalHash: 'b'.repeat(64),
      suffix,
    };
    write(
      line(),
      line(
        'plan',
        { type: 'plan', text: plan, iterations: 1 },
        { ...binding(), planIdentity: hash(plan) }
      ),
      line(
        'vote',
        { type: 'vote', approved: true, iterations: 1 },
        { ...binding(), planIdentity: hash(plan), approval }
      )
    );
    const result = loadCheckpointDiagnostic(sid, TEST_DIR);
    expect(result.kind).toBe('bound');
    if (result.kind === 'bound') expect(result.binding.approval?.suffix).toEqual(suffix);
  });
  it('rejects a mismatched plan identity and unsupported suffix format', () => {
    write(
      line(),
      line(
        'plan',
        { type: 'plan', text: 'Plan', iterations: 1 },
        { ...binding(), planIdentity: hash('other') }
      )
    );
    expect(loadCheckpointDiagnostic(sid, TEST_DIR)).toMatchObject({ kind: 'invalid' });
    const approval = {
      format: 'bound-plan-vote-v1',
      voteRecordId: 'vote-test',
      recordHash: 'a'.repeat(64),
      proposalHash: 'b'.repeat(64),
      suffix: { format: 'future' },
    };
    write(
      line(
        'vote',
        { type: 'vote', approved: true, iterations: 1 },
        { ...binding(), planIdentity: hash('Plan'), approval }
      )
    );
    expect(loadCheckpointDiagnostic(sid, TEST_DIR)).toMatchObject({ kind: 'invalid' });
  });
  it('writes sensitive metadata only to restrictive files and does not repair permissive ones', () => {
    expect(
      saveBoundStageCheckpoint({
        sessionId: sid,
        stage: 'research',
        data: { type: 'research', text: 'R' },
        binding: binding(),
        customDir: TEST_DIR,
      })
    ).toEqual({ status: 'saved' });
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    fs.chmodSync(file, 0o644);
    const before = fs.readFileSync(file);
    expect(
      saveBoundStageCheckpoint({
        sessionId: sid,
        stage: 'research',
        data: { type: 'research', text: 'next' },
        binding: binding(),
        customDir: TEST_DIR,
      })
    ).toMatchObject({ status: 'unavailable', reason: 'checkpoint-permissions' });
    expect(fs.readFileSync(file)).toEqual(before);
    expect(fs.statSync(file).mode & 0o777).toBe(0o644);
  });
  it('rejects invalid sensitive evidence before creating a checkpoint', () => {
    expect(
      saveBoundStageCheckpoint({
        sessionId: sid,
        stage: 'plan',
        data: { type: 'plan', text: 'Plan', iterations: 1 },
        binding: binding(),
        customDir: TEST_DIR,
      })
    ).toMatchObject({ status: 'invalid' });
    expect(fs.existsSync(TEST_DIR)).toBe(false);
  });

  it('keeps plan-only crash state partial and rejects task reuse without persisted approval', () => {
    const planIdentity = hash('Plan');
    const plan = line(
      'plan',
      { type: 'plan', text: 'Plan', iterations: 1 },
      { ...binding(), planIdentity }
    );
    write(line(), plan);
    const partial = loadCheckpointDiagnostic(sid, TEST_DIR);
    expect(partial.kind).toBe('bound');
    if (partial.kind === 'bound') expect(partial.binding.approval).toBeUndefined();
    const tasks = [
      {
        id: 'one',
        title: 'First',
        description: 'Work',
        assignedTo: 'coder' as const,
        status: 'pending' as const,
        writeTargets: { kind: 'workspace-relative' as const, paths: ['src/first.ts'] },
      },
    ];
    write(
      line(),
      plan,
      line(
        'decompose',
        { type: 'decompose', tasks },
        {
          ...binding(),
          planIdentity,
          decision: { voteRecordId: 'missing', recordHash: 'a'.repeat(64) },
          ...checkpointTaskIdentities(tasks),
        }
      )
    );
    expect(loadCheckpointDiagnostic(sid, TEST_DIR)).toMatchObject({ kind: 'invalid' });
  });

  it('binds task definitions to the approved plan and permits implementation status changes', () => {
    const planIdentity = hash('Plan');
    const decision = { voteRecordId: 'vote-test', recordHash: 'a'.repeat(64) };
    const approval = {
      ...decision,
      format: 'bound-plan-vote-v1',
      proposalHash: 'b'.repeat(64),
      suffix: buildPlanVoteProposal('Plan', '').suffix,
    };
    const tasks = [
      {
        id: 'one',
        title: 'First',
        description: 'Work',
        assignedTo: 'coder' as const,
        status: 'pending' as const,
      },
    ];
    const prefix = [
      line(),
      line('plan', { type: 'plan', text: 'Plan', iterations: 1 }, { ...binding(), planIdentity }),
      line(
        'vote',
        { type: 'vote', approved: true, iterations: 1 },
        { ...binding(), planIdentity, approval }
      ),
      line(
        'decompose',
        { type: 'decompose', tasks },
        { ...binding(), planIdentity, decision, ...checkpointTaskIdentities(tasks) }
      ),
    ];
    const implemented = tasks.map((task) => ({
      ...task,
      status: 'done' as const,
      implementation: 'Result',
    }));
    write(
      ...prefix,
      line(
        'implement',
        { type: 'implement', tasks: implemented },
        { ...binding(), planIdentity, decision, ...checkpointTaskIdentities(implemented) }
      )
    );
    expect(loadCheckpointDiagnostic(sid, TEST_DIR).kind).toBe('bound');
    const altered = implemented.map((task) => ({
      ...task,
      writeTargets: { kind: 'workspace-relative' as const, paths: ['src/other.ts'] },
    }));
    write(
      ...prefix,
      line(
        'implement',
        { type: 'implement', tasks: altered },
        { ...binding(), planIdentity, decision, ...checkpointTaskIdentities(altered) }
      )
    );
    expect(loadCheckpointDiagnostic(sid, TEST_DIR)).toMatchObject({ kind: 'invalid' });
  });

  it.each([true, false])('rejects every stage appended after security passed=%s', (passed) => {
    const planIdentity = hash('Plan');
    const decision = { voteRecordId: 'vote-terminal', recordHash: 'a'.repeat(64) };
    const approval = {
      ...decision,
      format: 'bound-plan-vote-v1',
      proposalHash: 'b'.repeat(64),
      suffix: buildPlanVoteProposal('Plan', '').suffix,
    };
    const tasks = [
      {
        id: 'one',
        title: 'Task',
        description: 'Work',
        assignedTo: 'coder' as const,
        status: 'done' as const,
        implementation: 'Earlier work',
      },
    ];
    const common = { ...binding(), planIdentity, decision };
    const taskBinding = { ...common, ...checkpointTaskIdentities(tasks) };
    const stages = [
      line(),
      line('plan', { type: 'plan', text: 'Plan', iterations: 1 }, { ...binding(), planIdentity }),
      line(
        'vote',
        { type: 'vote', approved: true, iterations: 1 },
        { ...binding(), planIdentity, approval }
      ),
      line('decompose', { type: 'decompose', tasks }, taskBinding),
      line('implement', { type: 'implement', tasks }, taskBinding),
      line('security', { type: 'security', passed }, common),
    ];
    write(...stages);
    expect(loadCheckpointDiagnostic(sid, TEST_DIR)).toMatchObject({
      kind: 'bound',
      state: { securityPassed: passed },
    });
    for (const laterStage of stages) {
      write(...stages, laterStage);
      expect(loadCheckpointDiagnostic(sid, TEST_DIR)).toMatchObject({
        kind: 'invalid',
        reason: 'checkpoint-lineage-mismatch',
      });
      expect(loadCheckpointState(sid, TEST_DIR)).toBeNull();
    }
  });

  it('reports failed persistence without leaking sensitive text or claiming a resumable checkpoint', () => {
    const sentinel = 'PRIVATE_SUFFIX_SENTINEL';
    const logOutput = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    vi.mocked(fs.appendFileSync).mockImplementationOnce(() => {
      throw new Error(sentinel);
    });
    const result = saveBoundStageCheckpoint({
      sessionId: sid,
      stage: 'research',
      data: { type: 'research', text: sentinel },
      binding: binding(),
      customDir: TEST_DIR,
    });
    expect(result).toEqual({ status: 'unavailable', reason: 'checkpoint-write-failed' });
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(JSON.stringify(logOutput.mock.calls)).not.toContain(sentinel);
    expect(loadCheckpointDiagnostic(sid, TEST_DIR)).toMatchObject({
      kind: 'invalid',
      reason: 'empty-checkpoint',
    });
  });

  it('does not disclose invalid suffix values in diagnostics', () => {
    const sentinel = 'PRIVATE_SUFFIX_SENTINEL';
    write(
      line(
        'vote',
        { type: 'vote', approved: true, iterations: 1 },
        { ...binding(), approval: { suffix: sentinel } }
      )
    );
    const result = loadCheckpointDiagnostic(sid, TEST_DIR);
    expect(result.kind).toBe('invalid');
    expect(JSON.stringify(result)).not.toContain(sentinel);
  });

  it('rejects unknown fields in recognized bound data rather than silently stripping them', () => {
    const data = { type: 'research' as const, text: 'Research', unrecognized: 'PRIVATE_SENTINEL' };
    write(line('research', data));
    expect(loadCheckpointDiagnostic(sid, TEST_DIR)).toMatchObject({ kind: 'invalid' });
    expect(
      saveBoundStageCheckpoint({
        sessionId: sid,
        stage: 'research',
        data,
        binding: binding(),
        customDir: TEST_DIR,
      })
    ).toMatchObject({ status: 'invalid' });
  });

  it('reports unmeasured owner protection when platform APIs are unavailable', () => {
    const original = process;
    try {
      vi.stubGlobal('process', { ...original, getuid: undefined });
      expect(
        saveBoundStageCheckpoint({
          sessionId: sid,
          stage: 'research',
          data: { type: 'research', text: 'R' },
          binding: binding(),
          customDir: TEST_DIR,
        })
      ).toEqual({ status: 'unavailable', reason: 'checkpoint-permissions-unmeasured' });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fs.existsSync(TEST_DIR)).toBe(false);
  });
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

  it('round-trips vote checkpoint without conditional metadata (#5969)', () => {
    const sid = 'test-vote';
    saveStageCheckpoint(
      sid,
      'vote',
      {
        type: 'vote',
        approved: true,
        iterations: 2,
      },
      TEST_DIR
    );

    const state = loadCheckpointState(sid, TEST_DIR);
    expect(state).toEqual({ voteIterations: 2, lastCompletedStage: 'vote' });
    const entry = JSON.parse(
      fs.readFileSync(path.join(TEST_DIR, `pipeline-${sid}.jsonl`), 'utf-8')
    ) as { data: unknown };
    expect(entry.data).toEqual({ type: 'vote', approved: true, iterations: 2 });
  });

  it.each([false, true])('ignores 9.x conditional metadata (conditional=%s)', (conditional) => {
    const sid = 'test-9x-vote';
    fs.mkdirSync(TEST_DIR, { recursive: true });
    const entry = {
      sessionId: sid,
      stage: 'vote',
      timestamp: '2026-10-01T00:00:00Z',
      data: {
        type: 'vote',
        approved: true,
        conditional,
        conditions: ['Must validate builds'],
        caveats: ['High maintenance'],
        voteConditional: conditional,
        voteConditions: ['Must validate builds'],
        voteCaveats: ['High maintenance'],
        iterations: 2,
      },
    };
    fs.writeFileSync(path.join(TEST_DIR, `pipeline-${sid}.jsonl`), JSON.stringify(entry) + '\n');

    expect(loadCheckpointState(sid, TEST_DIR)).toEqual({
      voteIterations: 2,
      lastCompletedStage: 'vote',
    });
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
