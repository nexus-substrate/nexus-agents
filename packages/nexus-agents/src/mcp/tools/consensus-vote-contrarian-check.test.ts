/**
 * Seam test for #6111: the quick-mode contrarian check is reported as its own
 * response field.
 *
 * In quick mode the contrarian is a separate `executeExpert` call, not a seat
 * in `votes`. When it errors under `absolute_quorum` the decision degrades to
 * `no_quorum` while `voteCounts.error` stays 0, because that bucket only counts
 * seats — the tally could not represent the voice that failed. `contrarianCheck`
 * names that voice: `errored`, `ok`, or `skipped` when the check did not run.
 *
 * Harness: `collectRealVotes` is canned (3 clean approving seats), the
 * expert-bridge is a controllable mock, everything downstream is real.
 *
 * @module mcp/tools/consensus-vote-contrarian-check.test
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

const executeExpertMock = vi.fn<() => Promise<{ success: boolean; text: string }>>();
vi.mock('../../pipeline/expert-bridge.js', () => ({
  executeExpert: (): Promise<{ success: boolean; text: string }> => executeExpertMock(),
}));

import { executeVoting } from './consensus-vote.js';
import { buildResponse } from './consensus-vote-types.js';
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

const QUICK_ABSOLUTE = {
  proposal: 'ship it',
  simulateVotes: false,
  quickMode: true,
  errorPolicy: 'absolute_quorum' as const,
};

describe('contrarianCheck reports the quick-mode contrarian voice (#6111)', () => {
  let tmpDir: string;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-contrarian-check-'));
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

  it('3 clean seats + failing expert call under absolute_quorum → no_quorum with error:0 and contrarianCheck errored', async () => {
    // The reproduced fixture from the #6107 investigation: the expert-bridge
    // reports failure, so the contrarian voice was never obtained.
    executeExpertMock.mockResolvedValue({ success: false, text: '' });

    const result = await executeVoting(QUICK_ABSOLUTE, logger);
    const response = buildResponse(QUICK_ABSOLUTE, result);

    expect(response.decision).toBe('no_quorum');
    expect(response.voteCounts).toEqual({
      approve: 3,
      reject: 0,
      abstain: 0,
      error: 0,
      unverifiable: 0,
    });
    expect(response.contrarianCheck).toBe('errored');
  });

  it('3 clean seats + succeeding expert call → approved with contrarianCheck ok', async () => {
    executeExpertMock.mockResolvedValue({
      success: true,
      text: '{"decision":"approve","confidence":0.9,"reasoning":"sound"}',
    });

    const result = await executeVoting(QUICK_ABSOLUTE, logger);
    const response = buildResponse(QUICK_ABSOLUTE, result);

    expect(response.decision).toBe('approved');
    expect(response.voteCounts.error).toBe(0);
    expect(response.contrarianCheck).toBe('ok');
  });

  it('full 7-seat mode never runs the separate check → contrarianCheck skipped', async () => {
    // Catfish is a seat here; a failing expert-bridge must not even be consulted.
    executeExpertMock.mockResolvedValue({ success: false, text: '' });
    const input = { ...QUICK_ABSOLUTE, quickMode: false };

    const result = await executeVoting(input, logger);
    const response = buildResponse(input, result);

    expect(collectRealVotesMock.mock.calls[0]?.[0].roles).toHaveLength(7);
    expect(executeExpertMock).not.toHaveBeenCalled();
    expect(response.decision).toBe('approved');
    expect(response.contrarianCheck).toBe('skipped');
  });

  it('non-absolute_quorum policy: the check still ran and errored, and the field says so', async () => {
    // The pre-#4132 carve-out keeps the verdict; the FIELD must not launder the
    // failed check as ok just because the policy chose not to void the vote.
    executeExpertMock.mockResolvedValue({ success: false, text: '' });
    const input = { proposal: 'ship it', simulateVotes: false, quickMode: true };

    const result = await executeVoting(input, logger);
    const response = buildResponse(input, result);

    expect(response.decision).toBe('approved');
    expect(response.contrarianCheck).toBe('errored');
  });
});
