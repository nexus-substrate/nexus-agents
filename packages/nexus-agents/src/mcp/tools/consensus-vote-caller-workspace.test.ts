/** #7751: a caller-supplied panel workspace reaches the seats and bounds artifactPath. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempOutsideRepo } from '../../testing/non-repo-temp-dir.js';
import type { AgentVoteResult, VoterRole } from '../../cli/vote-types.js';
import { VOTE_RECORDS_PATH_ENV } from '../../audit/vote-record-store.js';
import { parseToolErrorEnvelope } from '../error-envelope.js';
import type { ToolResult } from './tool-result.js';

const collectMock =
  vi.fn<(opts: { roles: readonly VoterRole[]; proposal: string }) => Promise<unknown>>();
vi.mock('../../cli/voter-agents.js', () => ({
  collectRealVotes: (opts: { roles: readonly VoterRole[]; proposal: string }): Promise<unknown> =>
    collectMock(opts),
}));
vi.mock('../middleware/tool-wrapper.js', () => ({
  wrapToolWithTimeout: (_name: string, fn: unknown) => fn,
  toSdkCallbackWithTimeoutCheck: (fn: unknown) => fn,
  getToolTimeout: () => 900_000,
}));
vi.mock('../middleware/secure-handler.js', () => ({
  createSecureHandler: (fn: unknown) => fn,
}));
vi.mock('../../cli-adapters/factory.js', () => ({
  createAllAdapters: () => new Map(),
  getAvailableClis: () => Promise.resolve([]),
  isCliAvailable: () => Promise.resolve(false),
  createCliAdapter: () => {
    throw new Error('Unexpected real adapter construction');
  },
}));

import { CONSENSUS_VOTE_TOOL_SCHEMA, registerConsensusVoteTool } from './consensus-vote.js';
import { ConsensusVoteInputSchema } from './consensus-vote-types.js';
import { resolveCallerWorkspace } from './consensus-vote-caller-workspace.js';
import { resetNexusDataDirCache } from '../../config/nexus-data-dir.js';
import { _resetForTests as resetJobConcurrency } from '../jobs/job-concurrency.js';

const CTX = {
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  requestContext: {},
};

function captureHandler(): (args: unknown, ctx: unknown) => Promise<ToolResult> {
  let handler: ((args: unknown, ctx: unknown) => Promise<ToolResult>) | undefined;
  registerConsensusVoteTool(
    {
      registerTool: (_name: string, _schema: unknown, callback: unknown) => {
        handler = callback as typeof handler;
      },
    } as never,
    { rateLimiter: { tryConsume: () => ({ allowed: true, remaining: 99 }) } as never }
  );
  if (handler === undefined) throw new Error('handler not registered');
  return handler;
}

/** A directory findRepoRoot accepts as a repository root. */
function makeRepoRoot(parent: string, name: string): string {
  const dir = mkdtempSync(join(parent, name));
  mkdirSync(join(dir, '.git'));
  return dir;
}

function responseOf(result: ToolResult): Record<string, unknown> {
  const first = result.content?.[0] as { text?: unknown } | undefined;
  expect(first).toBeDefined();
  return JSON.parse(String(first?.text)) as Record<string, unknown>;
}

describe('consensus_vote caller workspace (#7751)', () => {
  let base: string;
  let workspace: string;
  let outside: string;
  let ledger: string;

  beforeEach(() => {
    base = mkdtempSync(join(process.cwd(), '.vote-workspace-test-'));
    workspace = makeRepoRoot(base, 'repo-');
    outside = mkdtempOutsideRepo('nexus-vote-workspace-outside-');
    ledger = join(base, 'vote-records.jsonl');
    vi.stubEnv('NEXUS_DATA_DIR', base);
    vi.stubEnv(VOTE_RECORDS_PATH_ENV, ledger);
    resetNexusDataDirCache();
    resetJobConcurrency();
    collectMock.mockReset();
    collectMock.mockResolvedValue([
      {
        role: 'architect',
        vote: { decision: 'approve', confidence: 0.9, reasoning: 'ok' },
        source: 'llm',
        cli: 'claude',
        processingTimeMs: 1,
      } satisfies Partial<AgentVoteResult>,
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetNexusDataDirCache();
    rmSync(base, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it('advertises the optional workspace and rejects an empty one', () => {
    expect(CONSENSUS_VOTE_TOOL_SCHEMA).toHaveProperty('workspace');
    expect(
      ConsensusVoteInputSchema.parse({ proposal: 'p', workspace: 'some/repo' })
    ).toHaveProperty('workspace', 'some/repo');
    expect(ConsensusVoteInputSchema.safeParse({ proposal: 'p', workspace: '' }).success).toBe(
      false
    );
    expect(ConsensusVoteInputSchema.safeParse({ proposal: 'p' }).success).toBe(true);
  });

  describe('resolveCallerWorkspace', () => {
    it('defaults to the caller cwd when omitted', () => {
      expect(resolveCallerWorkspace(undefined, '/tmp/somewhere')).toEqual({
        ok: true,
        value: '/tmp/somewhere',
      });
    });

    it('resolves a relative path against the caller cwd and returns the repo root', () => {
      mkdirSync(join(workspace, 'nested'));
      const resolved = resolveCallerWorkspace('nested', workspace);
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;
      expect(resolved.value).toBe(workspace);
    });

    it.each([
      ['missing', 'no-such-dir', /does not exist/i],
      ['file', 'plain.txt', /not a directory/i],
    ])('rejects a %s workspace', (_name, name, reason) => {
      writeFileSync(join(workspace, 'plain.txt'), 'x');
      const resolved = resolveCallerWorkspace(join(workspace, name), workspace);
      expect(resolved.ok).toBe(false);
      if (resolved.ok) return;
      expect(resolved.reason).toMatch(reason);
    });

    it('rejects a directory that is not inside a repository', () => {
      const loose = outside;
      const resolved = resolveCallerWorkspace(loose, workspace);
      expect(resolved.ok).toBe(false);
      if (resolved.ok) return;
      expect(resolved.reason).toMatch(/repository root|\.git/i);
    });
  });

  it('points the seats at the supplied workspace and stamps it on the response', async () => {
    const result = await captureHandler()({ proposal: 'p', quickMode: true, workspace }, CTX);
    expect(result.isError).not.toBe(true);
    expect(responseOf(result)).toHaveProperty('workspace', workspace);
    expect(collectMock).toHaveBeenCalled();
  });

  it('honours a relative workspace against the server cwd', async () => {
    const result = await captureHandler()(
      { proposal: 'p', quickMode: true, workspace: relative(process.cwd(), workspace) },
      CTX
    );
    expect(result.isError).not.toBe(true);
    expect(responseOf(result)).toHaveProperty('workspace', workspace);
  });

  it('inlines an artifactPath that lives in the workspace but outside the server cwd', async () => {
    writeFileSync(join(workspace, 'change.diff'), 'diff --git a/x b/x\n+added line\n');
    const result = await captureHandler()(
      { proposal: 'review it', quickMode: true, workspace, artifactPath: 'change.diff' },
      CTX
    );
    expect(result.isError).not.toBe(true);
    expect(collectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        proposal: expect.stringContaining('Artifact: change.diff sha256:'),
      })
    );
  });

  it('rejects a workspace that cannot be used, before any seat runs', async () => {
    const loose = outside;
    for (const dispatch of ['sync', 'async']) {
      const result = await captureHandler()(
        { proposal: 'p', quickMode: true, workspace: loose, dispatch },
        CTX
      );
      expect(result.isError).toBe(true);
      expect(parseToolErrorEnvelope(result._meta)?.errorCategory).toBe('validation');
      expect(result.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ text: expect.stringMatching(/repository root|\.git/i) }),
        ])
      );
    }
    expect(collectMock).not.toHaveBeenCalled();
  });

  it.each(['sync', 'async'])(
    'keeps artifactPath bounded by the workspace it was given for %s',
    async (dispatch) => {
      const sibling = makeRepoRoot(base, 'other-');
      writeFileSync(join(sibling, 'private.diff'), 'x');
      const result = await captureHandler()(
        {
          proposal: 'p',
          quickMode: true,
          workspace,
          artifactPath: join(sibling, 'private.diff'),
          dispatch,
        },
        CTX
      );
      expect(result.isError).toBe(true);
      expect(parseToolErrorEnvelope(result._meta)?.errorCategory).toBe('permission');
      expect(result.content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            text: expect.stringContaining('artifactPath must be within the repository root'),
          }),
        ])
      );
      expect(collectMock).not.toHaveBeenCalled();
    }
  );
});
