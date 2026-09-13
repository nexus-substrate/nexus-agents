/**
 * #6110: the target project reaches the collector, and the response discloses
 * which source named it — `input`, `derived` or `default`.
 *
 * `collectRealVotes` is canned so the assertion can read the `project` it was
 * handed; `executeVoting`, the resolver and `buildResponse` are real. The
 * derived/default rows point `process.cwd()` at real directory trees outside
 * any repository, so they never depend on this checkout's own remote.
 *
 * @module mcp/tools/consensus-vote-project.test
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentVoteResult } from '../../cli/vote-types.js';
import { mkdtempOutsideRepo } from '../../testing/non-repo-temp-dir.js';

const collectRealVotesMock = vi.fn<(opts: { project?: string }) => Promise<unknown>>();
vi.mock('../../cli/voter-agents.js', () => ({
  collectRealVotes: (opts: { project?: string }): Promise<unknown> => collectRealVotesMock(opts),
}));

// The quick-mode approval path runs the contrarian check through the expert
// bridge, which would spawn a real CLI; fail it deterministically instead.
vi.mock('../../pipeline/expert-bridge.js', () => ({
  executeExpert: vi.fn().mockRejectedValue(new Error('expert bridge down (test)')),
}));

import { executeVoting } from './consensus-vote.js';
import { buildResponse, ConsensusVoteInputSchema } from './consensus-vote-types.js';

function approvingSeat(role: AgentVoteResult['role']): AgentVoteResult {
  return {
    role,
    vote: { decision: 'approve', confidence: 0.9, reasoning: 'ok' },
    source: 'llm',
    cli: 'claude',
    processingTimeMs: 1,
  };
}

function logger(): { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> } & Record<
  'debug' | 'error',
  ReturnType<typeof vi.fn>
> {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

/** The `Voter project resolved` info lines a logger saw. */
function resolutionLogs(log: { info: ReturnType<typeof vi.fn> }): unknown[][] {
  return log.info.mock.calls.filter((call) => call[0] === 'Voter project resolved');
}

describe('consensus_vote target project (#6110)', () => {
  let cwd: string;

  beforeEach(() => {
    cwd = mkdtempOutsideRepo('nexus-6110-vote-');
    vi.spyOn(process, 'cwd').mockReturnValue(cwd);
    collectRealVotesMock.mockReset();
    collectRealVotesMock.mockResolvedValue([
      approvingSeat('architect'),
      approvingSeat('security'),
      approvingSeat('scope_steward'),
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(cwd, { recursive: true, force: true });
  });

  const base = { proposal: 'Adopt widgets v2', quickMode: true, simulateVotes: false } as const;

  it("source 'input': the caller's project reaches the collector and the response", async () => {
    const log = logger();
    const input = ConsensusVoteInputSchema.parse({ ...base, project: 'acme/widgets' });
    const result = await executeVoting(input, log as never);
    expect(collectRealVotesMock).toHaveBeenCalledWith(
      expect.objectContaining({ project: 'acme/widgets' })
    );
    expect(result.project).toEqual({ name: 'acme/widgets', source: 'input' });
    expect(buildResponse(input, result).project).toEqual({
      name: 'acme/widgets',
      source: 'input',
    });
    expect(resolutionLogs(log)).toHaveLength(1);
  });

  it("source 'derived': no input, the cwd origin remote names the project", async () => {
    mkdirSync(join(cwd, '.git'));
    writeFileSync(
      join(cwd, '.git', 'config'),
      '[remote "origin"]\n\turl = git@github.com:acme/widgets.git\n'
    );
    const input = ConsensusVoteInputSchema.parse(base);
    const result = await executeVoting(input, logger() as never);
    expect(collectRealVotesMock).toHaveBeenCalledWith(
      expect.objectContaining({ project: 'acme/widgets' })
    );
    expect(buildResponse(input, result).project).toEqual({
      name: 'acme/widgets',
      source: 'derived',
    });
  });

  it("source 'default': nothing derivable, the panel judges nexus-agents and says so", async () => {
    const input = ConsensusVoteInputSchema.parse(base);
    const result = await executeVoting(input, logger() as never);
    expect(collectRealVotesMock).toHaveBeenCalledWith(
      expect.objectContaining({ project: 'nexus-agents' })
    );
    expect(buildResponse(input, result).project).toEqual({
      name: 'nexus-agents',
      source: 'default',
    });
  });

  it('the tool input schema refuses a project that fails the pattern', () => {
    expect(ConsensusVoteInputSchema.safeParse({ ...base, project: 'evil; rm -rf /' }).success).toBe(
      false
    );
    expect(ConsensusVoteInputSchema.safeParse({ ...base, project: '@acme/widgets' }).success).toBe(
      true
    );
  });

  it('an invalid project that bypassed the schema (CLI path) is logged and never reaches a prompt', async () => {
    const log = logger();
    // The CLI builds the input object directly, so the Zod regex is not in its path.
    const input = { ...ConsensusVoteInputSchema.parse(base), project: 'evil; rm -rf /' };
    const result = await executeVoting(input, log as never);
    expect(collectRealVotesMock).toHaveBeenCalledWith(
      expect.objectContaining({ project: 'nexus-agents' })
    );
    expect(result.project).toEqual({ name: 'nexus-agents', source: 'default' });
    expect(log.warn).toHaveBeenCalledWith(
      'Voter project candidate rejected',
      expect.objectContaining({ origin: 'input', candidate: 'evil; rm -rf /' })
    );
  });

  it('a direct buildResponse call with no stamped project still discloses one', () => {
    // Direct unit callers bypass executeVoting; the response must not fabricate
    // a source, so it re-runs the same resolver from the input.
    const input = ConsensusVoteInputSchema.parse({ ...base, project: 'acme/widgets' });
    const response = buildResponse(input, {
      proposal: input.proposal,
      threshold: 'simple_majority',
      result: {
        proposalId: 'p',
        outcome: 'approved',
        approvalPercentage: 100,
        voteCounts: { approve: 1, reject: 0, abstain: 0, total: 1 },
        quorumReached: true,
        votes: [],
        timestamp: 0,
      } as never,
      votes: [],
      totalTimeMs: 1,
      simulateVotes: false,
      strategy: 'simple_majority',
    });
    expect(response.project).toEqual({ name: 'acme/widgets', source: 'input' });
  });
});
