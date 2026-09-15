/**
 * Unit tests for the contrarian-escalation gate, moved from
 * `consensus-vote.test.ts` alongside the block itself (#6148, row 1).
 *
 * Only `maybeEscalateContrarian` is exported; `runContrarianCheck` and the
 * escalation threshold are tested through it. The re-vote is injected as
 * `ctx.revote`: most cases pass the real `executeVoting`, so `collectRealVotes`
 * is canned (clean approvals for whatever panel is requested) and the
 * expert-bridge is a controllable mock; everything downstream is real. One
 * case passes a spy to prove the injected function is the one called.
 *
 * @module mcp/tools/consensus-vote-contrarian.test
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentVoteResult, VoterRole } from '../../cli/vote-types.js';
import type { ILogger } from '../../core/index.js';

const collectRealVotesMock = vi.fn<(opts: { roles: readonly VoterRole[] }) => Promise<unknown>>();
vi.mock('../../cli/voter-agents.js', () => ({
  collectRealVotes: (opts: { roles: readonly VoterRole[] }): Promise<unknown> =>
    collectRealVotesMock(opts),
}));

// #4132: the contrarian expert-bridge is the only import `runContrarianCheck`
// makes; a rejecting mock reports errored:true deterministically (no live
// adapter), a resolving one drives the threshold comparison.
const executeExpertMock =
  vi.fn<
    (
      expert: string,
      prompt: string,
      options?: { workDir?: string | undefined }
    ) => Promise<{ success: boolean; text: string }>
  >();
vi.mock('../../pipeline/expert-bridge.js', () => ({
  executeExpert: (
    expert: string,
    prompt: string,
    options?: { workDir?: string | undefined }
  ): Promise<{ success: boolean; text: string }> => executeExpertMock(expert, prompt, options),
}));

import { maybeEscalateContrarian } from './consensus-vote-contrarian.js';
import { executeVoting } from './consensus-vote.js';
import type { ConsensusVoteInput, ExtendedVotingResult } from './consensus-vote-types.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';

const logger: ILogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
} as unknown as ILogger;

/** One clean live approve per requested role — no errored seats anywhere. */
function cleanApprovals(roles: readonly VoterRole[]): AgentVoteResult[] {
  return roles.map((role) => ({
    role,
    vote: { decision: 'approve', confidence: 0.9, reasoning: 'ok' },
    processingTimeMs: 1,
    source: 'llm',
  }));
}

const QUICK = { proposal: 'ship it', simulateVotes: false, quickMode: true };
const CTX = {
  strategy: 'simple_majority' as const,
  posteriorApproval: undefined,
  revote: executeVoting,
};

describe('maybeEscalateContrarian — quick-mode contrarian-check error (#4132)', () => {
  beforeEach(() => {
    executeExpertMock.mockReset();
    executeExpertMock.mockRejectedValue(new Error('expert bridge down (test)'));
  });

  it('absolute_quorum + quick approval + contrarian check errors → degradeReason (no_quorum)', async () => {
    const out = await maybeEscalateContrarian(
      { ...QUICK, errorPolicy: 'absolute_quorum' },
      'approved',
      CTX,
      logger
    );
    expect(out.escalated).toBeUndefined();
    expect(out.degradeReason).toContain('no_quorum');
    expect(out.degradeReason).toContain('contrarian');
    // #6111: the failed voice is named as its own field, not only as prose.
    expect(out.contrarianCheck).toBe('errored');
  });

  it('non-absolute_quorum + contrarian check errors → no degrade (pre-#4132 behavior preserved)', async () => {
    const out = await maybeEscalateContrarian(QUICK, 'approved', CTX, logger);
    expect(out.escalated).toBeUndefined();
    expect(out.degradeReason).toBeUndefined();
    // #6111: the verdict is kept, but the check still errored and says so.
    expect(out.contrarianCheck).toBe('errored');
  });

  it('full-panel mode does not run the check → contrarianCheck skipped (#6111)', async () => {
    const out = await maybeEscalateContrarian(
      { ...QUICK, quickMode: false },
      'approved',
      CTX,
      logger
    );
    expect(out.contrarianCheck).toBe('skipped');
    expect(executeExpertMock).not.toHaveBeenCalled();
  });
});

describe('maybeEscalateContrarian — escalation threshold (#1799)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-contrarian-escalation-'));
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    resetNexusDataDirCache();
    collectRealVotesMock.mockReset();
    collectRealVotesMock.mockImplementation((opts) => Promise.resolve(cleanApprovals(opts.roles)));
    executeExpertMock.mockReset();
  });

  afterEach(() => {
    if (originalDataDir === undefined) Reflect.deleteProperty(process.env, 'NEXUS_DATA_DIR');
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    resetNexusDataDirCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('a rejection at or above the threshold re-runs the vote with the full panel', async () => {
    executeExpertMock.mockResolvedValue({
      success: true,
      text: '{"decision":"reject","confidence":0.9,"reasoning":"YAGNI"}',
    });

    const out = await maybeEscalateContrarian(QUICK, 'approved', CTX, logger);

    expect(out.contrarianCheck).toBe('ok');
    expect(out.degradeReason).toBeUndefined();
    expect(out.escalated).toBeDefined();
    // The re-vote is the full 7-seat panel, not the 3-seat quick panel.
    expect(collectRealVotesMock).toHaveBeenCalledTimes(1);
    expect(collectRealVotesMock.mock.calls[0]?.[0].roles).toHaveLength(7);
  });

  it('the injected revote is what runs the full-panel re-vote (#6148)', async () => {
    executeExpertMock.mockResolvedValue({
      success: true,
      text: '{"decision":"reject","confidence":0.9,"reasoning":"YAGNI"}',
    });
    const escalatedResult = { proposal: 'from the spy' } as unknown as ExtendedVotingResult;
    const revote = vi.fn<(input: ConsensusVoteInput) => Promise<ExtendedVotingResult>>();
    revote.mockResolvedValue(escalatedResult);

    const out = await maybeEscalateContrarian(QUICK, 'approved', { ...CTX, revote }, logger);

    expect(out.escalated).toBe(escalatedResult);
    expect(revote).toHaveBeenCalledTimes(1);
    // The spy was handed the full-panel input, and the real voters never ran.
    expect(revote.mock.calls[0]?.[0]).toMatchObject({ proposal: 'ship it', quickMode: false });
    expect(collectRealVotesMock).not.toHaveBeenCalled();
  });

  it('keeps the contrarian and escalation re-vote in the scratch workspace (#6358)', async () => {
    executeExpertMock.mockResolvedValue({
      success: true,
      text: '{"decision":"reject","confidence":0.9,"reasoning":"YAGNI"}',
    });
    const escalatedResult = { proposal: 'from the spy' } as unknown as ExtendedVotingResult;
    const revote = vi.fn().mockResolvedValue(escalatedResult);
    const opts = { workspace: '/tmp/vote-scratch', workspaceSha: 'a'.repeat(40) };

    await maybeEscalateContrarian(QUICK, 'approved', { ...CTX, revote }, logger, opts);

    expect(executeExpertMock).toHaveBeenCalledWith(
      'architecture',
      expect.stringContaining(
        `detached scratch checkout of the ratified head ${opts.workspaceSha}`
      ),
      { workDir: opts.workspace }
    );
    expect(executeExpertMock.mock.calls[0]?.[1]).toContain(
      'do NOT run git checkout/switch/reset/pull or modify files; read only.'
    );
    expect(revote).toHaveBeenCalledWith({ ...QUICK, quickMode: false }, logger, opts);
  });

  it('keeps the original contrarian prompt when no workspace is supplied', async () => {
    executeExpertMock.mockResolvedValue({ success: true, text: '{"decision":"approve"}' });

    await maybeEscalateContrarian(QUICK, 'approved', CTX, logger);

    expect(executeExpertMock.mock.calls[0]?.[1]).toBe(
      [
        'You are a contrarian analyst. Your job is to find reasons this proposal should be REJECTED.',
        'Look for: YAGNI (not needed), MISALIGNED (wrong tech/architecture), SECURITY_RISK, SCOPE_CREEP.',
        '',
        'Proposal: ship it',
        '',
        'If you find a strong reason to reject, respond with JSON:',
        '{"decision":"reject","confidence":0.0-1.0,"reasoning":"your concern"}',
        'If the proposal is sound, respond with:',
        '{"decision":"approve","confidence":0.0-1.0,"reasoning":"why it is acceptable"}',
      ].join('\n')
    );
    expect(executeExpertMock.mock.calls[0]?.[2]).toEqual({ workDir: undefined });
  });

  it('a rejection below the threshold keeps the quick-mode result', async () => {
    executeExpertMock.mockResolvedValue({
      success: true,
      text: '{"decision":"reject","confidence":0.5,"reasoning":"meh"}',
    });

    const out = await maybeEscalateContrarian(QUICK, 'approved', CTX, logger);

    expect(out.contrarianCheck).toBe('ok');
    expect(out.escalated).toBeUndefined();
    expect(out.degradeReason).toBeUndefined();
    expect(collectRealVotesMock).not.toHaveBeenCalled();
  });

  it('an approval, whatever its confidence, never escalates', async () => {
    executeExpertMock.mockResolvedValue({
      success: true,
      text: '{"decision":"approve","confidence":0.99,"reasoning":"sound"}',
    });

    const out = await maybeEscalateContrarian(QUICK, 'approved', CTX, logger);

    expect(out.contrarianCheck).toBe('ok');
    expect(out.escalated).toBeUndefined();
    expect(collectRealVotesMock).not.toHaveBeenCalled();
  });
});
