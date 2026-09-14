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
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentVoteResult, VoterRole } from './vote-types.js';
import { VOTE_RECORDS_PATH_ENV, parseVoteRecordsText } from '../audit/vote-record-store.js';
import { verifyVoteRecordSet, type VoteRecord } from '../audit/vote-record.js';
import { resetNexusDataDirCache } from '../config/nexus-data-dir.js';

const collectRealVotesMock =
  vi.fn<(opts: { roles: readonly VoterRole[] }) => Promise<readonly AgentVoteResult[]>>();
// Wholesale replacement (#4629): `consensus-vote.ts` must see the canned
// collector, and `vote-command.ts` reads the timeout constant from the same
// module.
vi.mock('./voter-agents.js', () => ({
  DEFAULT_VOTE_TIMEOUT_MS: 90_000,
  collectRealVotes: (opts: { roles: readonly VoterRole[] }): Promise<readonly AgentVoteResult[]> =>
    collectRealVotesMock(opts),
}));

import { voteCommand } from './vote-command.js';

const SHA = '0123456789abcdef0123456789abcdef01234567';

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
  const originalStore = process.env[VOTE_RECORDS_PATH_ENV];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'nexus-cli-vote-ratifies-pr-'));
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
    expect(record.version).toBe('1.11');
    // A whole 7-seat panel: what the ledger gate reads as `ratified`.
    expect(record.panelCoverage).toMatchObject({ requested: 7, errored: 0 });

    // The bound line names the PR and sha; the plain record-id line stays for
    // scripts to grep (`append-ratification-record.ts --record-id`).
    expect(printed()).toContain(`record ${record.id} bound to PR 6227 @ ${SHA}`);
    expect(printed()).toContain(`Audit record #${String(record.sequence)} written (${record.id})`);
    // At the governor bar there is nothing to notice.
    expect(printed()).not.toContain('governor bar');
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
