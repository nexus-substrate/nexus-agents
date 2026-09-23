/**
 * #6258: the live result names the working directory the panel's seats were
 * pointed at, so an `unverifiable` seat is diagnosable without stderr.
 *
 * `collectRealVotes` is canned so the assertion can read the `workspace` it
 * was handed; `executeVoting` and `buildResponse` are real. `process.cwd()` is
 * pointed at a path that differs from every other literal in the file, so a
 * stamp that read anything else could not pass.
 *
 * @module mcp/tools/consensus-vote-workspace.test
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { AgentVoteResult } from '../../cli/vote-types.js';

const collectRealVotesMock = vi.fn<(opts: { workspace?: string }) => Promise<unknown>>();
vi.mock('../../cli/voter-agents.js', () => ({
  collectRealVotes: (opts: { workspace?: string }): Promise<unknown> => collectRealVotesMock(opts),
}));

// The quick-mode approval path runs the contrarian check through the expert
// bridge, which would spawn a real CLI; fail it deterministically instead.
vi.mock('../../pipeline/expert-bridge.js', () => ({
  executeExpert: vi.fn().mockRejectedValue(new Error('expert bridge down (test)')),
}));

import { CONSENSUS_VOTE_OUTPUT_SCHEMA, executeVoting } from './consensus-vote.js';
import { buildResponse, ConsensusVoteInputSchema } from './consensus-vote-types.js';

const PROCESS_CWD = '/srv/panel-cwd-6258';
const SCRATCH_CHECKOUT = '/tmp/ratify-scratch-6258';

function approvingSeat(role: AgentVoteResult['role']): AgentVoteResult {
  return {
    role,
    vote: { decision: 'approve', confidence: 0.9, reasoning: 'ok' },
    source: 'llm',
    cli: 'claude',
    processingTimeMs: 1,
  };
}

function logger(): Record<'debug' | 'info' | 'warn' | 'error', ReturnType<typeof vi.fn>> {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

/** The `workspace` the collector was handed on its first call. */
function collectorWorkspace(): string | undefined {
  return collectRealVotesMock.mock.calls[0]?.[0].workspace;
}

describe('consensus_vote names the panel working directory (#6258)', () => {
  beforeEach(() => {
    vi.spyOn(process, 'cwd').mockReturnValue(PROCESS_CWD);
    collectRealVotesMock.mockReset();
    collectRealVotesMock.mockResolvedValue([
      approvingSeat('architect'),
      approvingSeat('security'),
      approvingSeat('scope_steward'),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const base = {
    proposal: 'Adopt widgets v2',
    quickMode: true,
    simulateVotes: false,
    project: 'acme/widgets',
  } as const;

  it('no caller workspace: stamps the process cwd the seats were handed', async () => {
    const input = ConsensusVoteInputSchema.parse(base);
    const result = await executeVoting(input, logger() as never);
    // The record is the value the collector received, not a recomputation.
    expect(collectorWorkspace()).toBe(PROCESS_CWD);
    expect(result.workspace).toBe(PROCESS_CWD);
    expect(buildResponse(input, result).workspace).toBe(PROCESS_CWD);
  });

  it('a CLI scratch checkout is the directory named, not the process cwd', async () => {
    const input = ConsensusVoteInputSchema.parse(base);
    const result = await executeVoting(input, logger() as never, {
      workspace: SCRATCH_CHECKOUT,
      workspaceSha: 'a'.repeat(40),
    });
    expect(collectorWorkspace()).toBe(SCRATCH_CHECKOUT);
    expect(result.workspace).toBe(SCRATCH_CHECKOUT);
    expect(buildResponse(input, result).workspace).toBe(SCRATCH_CHECKOUT);
  });

  it('a simulated panel names no directory — no seat was pointed at one', async () => {
    const input = ConsensusVoteInputSchema.parse({ ...base, simulateVotes: true });
    const result = await executeVoting(input, logger() as never);
    expect(result).not.toHaveProperty('workspace');
    expect(buildResponse(input, result)).not.toHaveProperty('workspace');
  });

  it('the output schema declares the field — the SDK rejects an undeclared one (#5044)', () => {
    const strict = z.object(CONSENSUS_VOTE_OUTPUT_SCHEMA).strict();
    expect(strict.safeParse({ workspace: PROCESS_CWD }).success).toBe(true);
  });
});
