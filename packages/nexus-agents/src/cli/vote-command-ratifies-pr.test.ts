/**
 * The CLI `vote` command's hop into the real recorder (#6227).
 *
 * `vote-command.test.ts` mocks `executeVoting` and `recordAuthenticVote`
 * wholesale, so it can prove what the command HANDS the recorder but not what
 * lands on the ledger. This file cans only `collectRealVotes` (no network, no
 * `simulateVotes`) and lets `executeVoting` → `recordAuthenticVote` →
 * `persistVoteRecord` run for real into a temp store, then reads the record
 * back through the store parser — the same harness as the MCP seam test
 * (`consensus-vote-ratifies-pr.test.ts`), for the same reason: the narrowing
 * in `toCliVoteResult` is where `optionGate` (#5362) and `errorPolicy`
 * (#6211) were lost with no compile error.
 *
 * @module cli/vote-command-ratifies-pr.test
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentVoteResult, VoterRole } from './vote-types.js';
import { VOTE_RECORDS_PATH_ENV, parseVoteRecordsText } from '../audit/vote-record-store.js';
import { verifyVoteRecordSet, type VoteRecord } from '../audit/vote-record.js';
import { resetNexusDataDirCache } from '../config/nexus-data-dir.js';

const collectRealVotesMock =
  vi.fn<(opts: CollectedOptions) => Promise<readonly AgentVoteResult[]>>();
// Wholesale replacement (#4629): `consensus-vote.ts` must see the canned
// collector, and `vote-command.ts` reads the timeout constant from the same
// module.
vi.mock('./voter-agents.js', () => ({
  DEFAULT_VOTE_TIMEOUT_MS: 90_000,
  collectRealVotes: (opts: CollectedOptions): Promise<readonly AgentVoteResult[]> =>
    collectRealVotesMock(opts),
}));

import { voteCommand } from './vote-command.js';

let SHA: string;
type CollectedOptions = { roles: readonly VoterRole[]; workspace?: string; workspaceSha?: string };

function approvingPanel(roles: readonly VoterRole[]): AgentVoteResult[] {
  return roles.map((role) => ({
    role,
    vote: { decision: 'approve', confidence: 0.9, reasoning: 'ok' },
    source: 'llm',
    cli: 'claude',
    processingTimeMs: 1,
  }));
}

describe('nexus-agents vote --ratifies-pr / --strategy reach the persisted record (#6227)', () => {
  let tmpDir: string;
  let store: string;
  let out: string[];
  let restoreStdout: () => void;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];
  const originalTmp = process.env['NEXUS_TMPDIR'];
  let repo: string;
  const originalStore = process.env[VOTE_RECORDS_PATH_ENV];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-cli-vote-ratifies-pr-'));
    repo = join(tmpDir, 'repo');
    mkdirSync(repo);
    const git = (args: string[]): string =>
      execFileSync('git', args, {
        cwd: repo,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    git(['init']);
    git([
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '--allow-empty',
      '-m',
      'fixture',
    ]);
    SHA = git(['rev-parse', 'HEAD']);
    vi.spyOn(process, 'cwd').mockReturnValue(repo);
    process.env['NEXUS_TMPDIR'] = join(tmpDir, 'scratch');
    store = join(tmpDir, 'vote-records.jsonl');
    process.env['NEXUS_DATA_DIR'] = tmpDir;
    process.env[VOTE_RECORDS_PATH_ENV] = store;
    resetNexusDataDirCache();
    collectRealVotesMock.mockReset();
    collectRealVotesMock.mockImplementation(({ roles }) => Promise.resolve(approvingPanel(roles)));
    out = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      out.push(String(chunk));
      return true;
    });
    restoreStdout = (): void => {
      spy.mockRestore();
    };
  });

  afterEach(() => {
    restoreStdout();
    vi.restoreAllMocks();
    if (originalTmp === undefined) Reflect.deleteProperty(process.env, 'NEXUS_TMPDIR');
    else process.env['NEXUS_TMPDIR'] = originalTmp;
    if (originalDataDir === undefined) Reflect.deleteProperty(process.env, 'NEXUS_DATA_DIR');
    else process.env['NEXUS_DATA_DIR'] = originalDataDir;
    if (originalStore === undefined) Reflect.deleteProperty(process.env, VOTE_RECORDS_PATH_ENV);
    else process.env[VOTE_RECORDS_PATH_ENV] = originalStore;
    resetNexusDataDirCache();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function readBack(): VoteRecord {
    const { records, invalidLines } = parseVoteRecordsText(readFileSync(store, 'utf-8'));
    expect(invalidLines).toEqual([]);
    expect(records).toHaveLength(1);
    expect(verifyVoteRecordSet(records).ok).toBe(true);
    return records[0]!;
  }

  const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, '');
  const printed = (): string => stripAnsi(out.join(''));

  it('binds the record to the PR at the sha, at the strategy and policy the panel ran under', async () => {
    const code = await voteCommand({
      proposal: 'Ratify PR #6227',
      strategy: 'supermajority',
      errorPolicy: 'absolute_quorum',
      ratifiesPr: { pr: 6227, headSha: SHA },
    });
    expect(code).toBe(0);

    const record = readBack();
    expect(record.ratifiesPr).toEqual({ pr: 6227, headSha: SHA });
    expect(record.errorPolicy).toBe('absolute_quorum');
    expect(record.strategy).toBe('supermajority');
    expect(record.decision).toBe('approved');
    // 1.13: every live voter entry carries a salted reasoning digest (#6263).
    expect(record.version).toBe('1.13');
    // A whole 7-seat panel: what the ledger gate reads as `ratified`.
    expect(record.panelCoverage).toMatchObject({ requested: 7, errored: 0 });

    // The bound line names the PR and sha; the plain record-id line stays for
    // scripts to grep (`append-ratification-record.ts --record-id`).
    expect(printed()).toContain(`record ${record.id} bound to PR 6227 @ ${SHA}`);
    expect(printed()).toContain(`Audit record #${String(record.sequence)} written (${record.id})`);
    // At the governor bar there is nothing to notice.
    expect(printed()).not.toContain('governor bar');
  });

  it('runs the panel in a detached scratch checkout and disposes it after tally', async () => {
    const diagnostics = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    let workspace: string | undefined;
    collectRealVotesMock.mockImplementation((opts) => {
      workspace = opts.workspace;
      expect(workspace).toBeDefined();
      expect(opts.workspaceSha).toBe(SHA);
      expect(workspace).not.toBe(repo);
      expect(
        execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim()
      ).toBe(SHA);
      return Promise.resolve(approvingPanel(opts.roles));
    });
    expect(await voteCommand({ proposal: 'p', ratifiesPr: { pr: 6358, headSha: SHA } })).toBe(0);
    if (workspace === undefined) throw new Error('Panel workspace is missing');
    expect(existsSync(workspace)).toBe(false);
    expect(diagnostics).toHaveBeenCalledWith(
      `panel workspace: ${workspace} (detached at ${SHA})\n`
    );
    expect(diagnostics).toHaveBeenCalledWith(`panel workspace disposed: ${workspace}\n`);
  });

  it('disposes the scratch checkout when the panel throws', async () => {
    let workspace: string | undefined;
    collectRealVotesMock.mockImplementation((opts) => {
      workspace = opts.workspace;
      throw new Error('seat launch failed');
    });
    expect(await voteCommand({ proposal: 'p', ratifiesPr: { pr: 6358, headSha: SHA } })).toBe(1);
    expect(workspace).toBeDefined();
    expect(existsSync(workspace!)).toBe(false);
    expect(printed()).toContain('seat launch failed');
  });

  it('keeps the same scratch checkout alive through a no-quorum retry, then disposes it', async () => {
    const workspaces: string[] = [];
    collectRealVotesMock.mockImplementation((opts) => {
      if (opts.workspace === undefined) throw new Error('Panel workspace is missing');
      workspaces.push(opts.workspace);
      expect(existsSync(opts.workspace)).toBe(true);
      expect(opts.workspaceSha).toBe(SHA);
      const votes = approvingPanel(opts.roles);
      return Promise.resolve(
        workspaces.length === 1
          ? votes.map((vote) => ({
              ...vote,
              source: 'error' as const,
              vote: { decision: 'abstain' as const, confidence: 0, reasoning: 'seat timed out' },
              error: 'seat timed out',
            }))
          : votes
      );
    });

    const code = await voteCommand({
      proposal: 'p',
      ratifiesPr: { pr: 6358, headSha: SHA },
      errorPolicy: 'absolute_quorum',
      onNoQuorum: 'retry',
    });

    expect(code).toBe(0);
    expect(collectRealVotesMock).toHaveBeenCalledTimes(2);
    expect(workspaces).toHaveLength(2);
    expect(workspaces[1]).toBe(workspaces[0]);
    expect(existsSync(workspaces[0]!)).toBe(false);
    expect(printed()).toContain('No quorum — re-running the vote once');
  });

  it('records NO binding when the flag was not given — the pair', async () => {
    await voteCommand({ proposal: 'Yes or no', strategy: 'supermajority' });
    const record = readBack();
    expect('ratifiesPr' in record).toBe(false);
    expect(printed()).not.toContain('bound to PR');
  });

  it('--strategy wins over the legacy --threshold when both are given (mirrors resolveStrategy)', async () => {
    await voteCommand({
      proposal: 'p',
      strategy: 'supermajority',
      threshold: 'majority',
    });
    expect(readBack().strategy).toBe('supermajority');
  });

  it('--threshold alone still sets the bar (the legacy spelling keeps working)', async () => {
    await voteCommand({ proposal: 'p', threshold: 'supermajority' });
    expect(readBack().strategy).toBe('supermajority');
  });

  it('the named empty case: --ratifies-pr below the governor bar still records, and says so', async () => {
    // The gate, not the CLI, judges the bar (`wrong-error-policy` for the
    // policy; the strategy is not gated today). The CLI's job is to write the
    // record as run and put the bar in front of the operator on one line.
    const code = await voteCommand({
      proposal: 'Ratify PR #6227',
      ratifiesPr: { pr: 6227, headSha: SHA },
    });
    expect(code).toBe(0);
    const record = readBack();
    expect(record.ratifiesPr).toEqual({ pr: 6227, headSha: SHA });
    expect(record.strategy).toBe('simple_majority');
    expect(record.errorPolicy).toBe('reduce_denominator');
    const lines = printed()
      .split('\n')
      .filter((l) => l.includes('governor bar'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('--strategy supermajority');
    expect(lines[0]).toContain('--error-policy absolute_quorum');
    expect(lines[0]).toContain('simple_majority');
    expect(lines[0]).toContain('reduce_denominator');
  });

  it('the notice fires on the policy alone: supermajority under the default policy', async () => {
    await voteCommand({
      proposal: 'Ratify PR #6227',
      strategy: 'supermajority',
      ratifiesPr: { pr: 6227, headSha: SHA },
    });
    expect(readBack().errorPolicy).toBe('reduce_denominator');
    expect(printed()).toContain('governor bar');
  });
});
