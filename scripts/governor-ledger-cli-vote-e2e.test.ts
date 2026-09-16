/**
 * End to end for #6227: `nexus-agents vote --strategy supermajority
 * --error-policy absolute_quorum --ratifies-pr <n>@<sha>` → the real CLI
 * command → the real recorder into a temp runtime store →
 * `scripts/append-ratification-record.ts --record-id` as a subprocess into a
 * committed ledger in a temp git repo → `evaluateLedgerEvidence` (the real
 * gate function) → `ratified` for the PR at that sha, `sha-mismatch` for
 * another.
 *
 * Only `collectRealVotes` is canned (a whole approving 7-seat panel — no
 * network, no `simulateVotes`, which the recorder would refuse anyway). Argv
 * parsing, the handler, `executeVoting`, `recordAuthenticVote`,
 * `persistVoteRecord`, the append script and the gate are all real. The
 * sibling in `governor-ledger-evidence.test.ts` starts at `persistVoteRecord`;
 * this row starts at the argv the operator types, because the four hops above
 * the recorder are the ones #6227 adds.
 *
 * @module scripts/governor-ledger-cli-vote-e2e.test
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { AgentVoteResult, VoterRole } from '../packages/nexus-agents/src/cli/vote-types.js';
import {
  VOTE_RECORDS_PATH_ENV,
  VOTE_RECORDS_REL_PATH,
  parseVoteRecordsText,
} from '../packages/nexus-agents/src/audit/vote-record-store.js';
import { resetNexusDataDirCache } from '../packages/nexus-agents/src/config/nexus-data-dir.js';
import { evaluateLedgerEvidence, type LedgerEvidence } from './governor-ledger-evidence.js';
import type { VoteRecordSignatureVerdict } from '../packages/nexus-agents/src/audit/vote-record-signature.js';

const collectRealVotesMock =
  vi.fn<(opts: { roles: readonly VoterRole[] }) => Promise<readonly AgentVoteResult[]>>();
vi.mock('../packages/nexus-agents/src/cli/voter-agents.js', () => ({
  DEFAULT_VOTE_TIMEOUT_MS: 90_000,
  collectRealVotes: (opts: { roles: readonly VoterRole[] }): Promise<readonly AgentVoteResult[]> =>
    collectRealVotesMock(opts),
}));

import { parseCliArgs } from '../packages/nexus-agents/src/cli.js';
import { handleVoteCommand } from '../packages/nexus-agents/src/cli-commands-handlers.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APPEND_SCRIPT = join(REPO_ROOT, 'scripts', 'append-ratification-record.ts');
const PR = 6227;
const OTHER = '1111111111111111111111111111111111111111';

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.invalid',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.invalid',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};

describe('e2e: nexus-agents vote --ratifies-pr → append script → the ledger gate (#6227)', () => {
  let dir: string;
  let repo: string;
  let store: string;
  let ledgerPath: string;
  let out: string[];
  let restoreStdout: () => void;
  const originalDataDir = process.env['NEXUS_DATA_DIR'];
  const originalStore = process.env[VOTE_RECORDS_PATH_ENV];

  function git(args: readonly string[]): string {
    return execFileSync('git', [...args], {
      cwd: repo,
      encoding: 'utf-8',
      env: GIT_ENV,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cli-vote-ratifies-e2e-'));
    repo = join(dir, 'repo');
    store = join(dir, 'runtime', 'vote-records.jsonl');
    ledgerPath = join(repo, VOTE_RECORDS_REL_PATH);
    mkdirSync(repo, { recursive: true });
    git(['init', '-q', '-b', 'main']);
    // The PR's head before the ledger commit: the commit the panel reviews.
    writeFileSync(join(repo, 'change.ts'), 'export const x = 1;\n');
    git(['add', 'change.ts']);
    git(['commit', '-q', '-m', 'the change under review']);

    process.env['NEXUS_DATA_DIR'] = join(dir, 'runtime');
    process.env[VOTE_RECORDS_PATH_ENV] = store;
    resetNexusDataDirCache();
    collectRealVotesMock.mockReset();
    collectRealVotesMock.mockImplementation(({ roles }) =>
      Promise.resolve(
        roles.map((role): AgentVoteResult => ({
          role,
          vote: { decision: 'approve', confidence: 0.9, reasoning: 'ok' },
          source: 'llm',
          cli: 'claude',
          processingTimeMs: 1,
        }))
      )
    );
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
    rmSync(dir, { recursive: true, force: true });
  });

  /** The real append script, as a subprocess, exactly as the operator runs it. */
  function append(id: string): { status: number; out: string } {
    try {
      const text = execFileSync(
        'pnpm',
        [
          'exec',
          'tsx',
          APPEND_SCRIPT,
          '--record-id',
          id,
          '--source',
          store,
          '--ledger',
          ledgerPath,
        ],
        { cwd: REPO_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
      );
      return { status: 0, out: text };
    } catch (error: unknown) {
      const e = error as { status: number | null; stdout: string; stderr: string };
      return { status: e.status ?? -1, out: `${e.stdout}${e.stderr}` };
    }
  }

  it('ratified for the PR at the sha the panel bound; sha-mismatch for another', async () => {
    const reviewedSha = git(['rev-parse', 'HEAD']);
    expect(reviewedSha).toMatch(/^[0-9a-f]{40}$/);

    // 1. The operator's argv, through the real parser and handler.
    const args = parseCliArgs([
      'vote',
      '--proposal',
      `Ratify PR #${String(PR)} at ${reviewedSha}`,
      '--strategy',
      'supermajority',
      '--error-policy',
      'absolute_quorum',
      '--ratifies-pr',
      `${String(PR)}@${reviewedSha}`,
    ]);
    expect(args.command).toBe('vote');
    // The operator runs `vote` from inside the repository under review: since
    // #6358 the handler creates a detached scratch checkout of the ratified
    // sha from the repo at process.cwd(), so the cwd must be the fixture repo
    // (the sha is not a commit of the nexus-agents checkout the tests run in).
    const originalCwd = process.cwd();
    process.chdir(repo);
    let exit: Awaited<ReturnType<typeof handleVoteCommand>>;
    try {
      exit = await handleVoteCommand(args);
    } finally {
      process.chdir(originalCwd);
    }
    expect(exit.exitCode).toBe(0);
    expect(collectRealVotesMock).toHaveBeenCalledTimes(1);

    // 2. The record id the command printed is the one the script is keyed on.
    const printed = out.join('').replace(/\x1b\[[0-9;]*m/g, '');
    const bound = /record (vote-[0-9a-z-]+) bound to PR (\d+) @ ([0-9a-f]{40})/.exec(printed);
    expect(bound, printed).not.toBeNull();
    const [, recordId, boundPr, boundSha] = bound as RegExpExecArray;
    expect(boundPr).toBe(String(PR));
    expect(boundSha).toBe(reviewedSha);
    const { records } = parseVoteRecordsText(readFileSync(store, 'utf-8'));
    expect(records.map((r) => r.id)).toEqual([recordId]);
    expect(records[0]?.errorPolicy).toBe('absolute_quorum');
    expect(records[0]?.strategy).toBe('supermajority');

    // 3. The caller-commits append, as a subprocess, then the ledger-only tip.
    const appended = append(recordId as string);
    expect(appended.status, appended.out).toBe(0);
    expect(appended.out).toContain(`ratifies PR #${String(PR)} at ${reviewedSha}`);
    git(['add', VOTE_RECORDS_REL_PATH]);
    git(['commit', '-q', '-m', 'ledger']);
    const tipSha = git(['rev-parse', 'HEAD']);
    const tipFiles = git(['diff-tree', '--no-commit-id', '--name-only', '-r', tipSha]).split('\n');
    expect(tipFiles).toEqual([VOTE_RECORDS_REL_PATH]);

    // 4. The real gate, over the committed bytes, with an empty base ledger so
    // append-only is checked too.
    const ledgerText = readFileSync(ledgerPath, 'utf-8');
    // #6279: the append here runs with no signing key (unsigned by
    // construction, see `append`), and the record is not grandfathered, so
    // the signature check is stubbed as holding — the binding and append-only
    // properties are what this test measures.
    const signedStub = (): VoteRecordSignatureVerdict => ({
      code: 'signed',
      keyId: 'nexus-agent@fixture',
      principal: 'nexus-agent@fixture',
      signerKind: 'agent',
    });
    const ratified: LedgerEvidence = evaluateLedgerEvidence({
      ledgerText,
      pr: PR,
      head: { sha: tipSha, parentSha: reviewedSha, commitFiles: tipFiles },
      baseLedgerText: '',
      signatureVerifier: signedStub,
    });
    expect(ratified.kind).toBe('ratified');
    if (ratified.kind !== 'ratified') throw new Error('unreachable');
    expect(ratified.record.id).toBe(recordId);
    expect(ratified.shaChecked).toBe(true);
    expect(ratified.appendOnlyChecked).toBe(true);
    expect(ratified.record.errorPolicy).toBe('absolute_quorum');
    expect(ratified.record.panelCoverage).toMatchObject({ requested: 7, errored: 0 });

    const mismatch = evaluateLedgerEvidence({
      ledgerText,
      pr: PR,
      head: { sha: OTHER, parentSha: undefined, commitFiles: ['src/a.ts'] },
      signatureVerifier: signedStub,
    });
    expect(mismatch).toEqual({
      kind: 'sha-mismatch',
      accepted: [OTHER],
      found: [reviewedSha],
      // #6256: no probe was passed, so the moved-head rule reports "not measured".
      moved: [{ sha: reviewedSha, reason: expect.stringContaining('not measured') as string }],
    });
  }, 90_000);
});
