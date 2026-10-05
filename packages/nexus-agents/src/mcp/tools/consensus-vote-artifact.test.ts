/** Artifact input travels through the registered tool into seats and the ledger. */
import { mkdtempOutsideRepo } from '../../testing/non-repo-temp-dir.js';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentVoteResult, VoterRole } from '../../cli/vote-types.js';
import { VOTE_RECORDS_PATH_ENV } from '../../audit/vote-record-store.js';
import { parseVoteRecordsText } from '../../audit/vote-record-store.js';
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

import { CONSENSUS_VOTE_TOOL_SCHEMA, registerConsensusVoteTool } from './consensus-vote.js';
import { ConsensusVoteInputSchema } from './consensus-vote-types.js';
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

describe('consensus_vote artifactPath (#7092)', () => {
  let root: string;
  let outside: string;
  let ledger: string;

  beforeEach(() => {
    root = mkdtempSync(join(process.cwd(), '.vote-artifact-test-'));
    outside = mkdtempOutsideRepo('nexus-vote-artifact-outside-');
    ledger = join(root, 'vote-records.jsonl');
    vi.stubEnv('NEXUS_DATA_DIR', root);
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
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  it('advertises the optional path and rejects an empty path', () => {
    expect(CONSENSUS_VOTE_TOOL_SCHEMA).toHaveProperty('artifactPath');
    expect(
      ConsensusVoteInputSchema.parse({ proposal: 'p', artifactPath: 'resolution.diff' })
    ).toHaveProperty('artifactPath', 'resolution.diff');
    expect(ConsensusVoteInputSchema.safeParse({ proposal: 'p', artifactPath: '' }).success).toBe(
      false
    );
    expect(ConsensusVoteInputSchema.safeParse({ proposal: 'p' }).success).toBe(true);
  });

  it.each(['sync', 'async'])(
    'inlines >4000 bytes into seats and proposalHash for %s',
    async (dispatch) => {
      const content = `${'résolution\n'.repeat(500)}+ reviewed change`;
      const artifactPath = join(root, 'resolution.diff');
      writeFileSync(artifactPath, content);
      const digest = createHash('sha256').update(content).digest('hex');
      const proposal = `Ratify merge\n\nArtifact: resolution.diff sha256:${digest} ${String(Buffer.byteLength(content))} bytes\n===== BEGIN ARTIFACT =====\n${content}\n===== END ARTIFACT =====`;
      const result = await captureHandler()(
        {
          proposal: 'Ratify merge',
          artifactPath: relative(process.cwd(), artifactPath),
          quickMode: true,
          dispatch,
        },
        CTX
      );
      expect(result.isError).not.toBe(true);
      await vi.waitFor(() => {
        expect(collectMock).toHaveBeenCalledWith(expect.objectContaining({ proposal }));
        const { records } = parseVoteRecordsText(readFileSync(ledger, 'utf-8'));
        expect(records).toHaveLength(1);
        expect(records[0]?.proposalHash).toBe(createHash('sha256').update(proposal).digest('hex'));
      });
    }
  );

  it('leaves a proposal without an artifact unchanged', async () => {
    await captureHandler()({ proposal: 'Ordinary vote', quickMode: true }, CTX);
    expect(collectMock).toHaveBeenCalledWith(
      expect.objectContaining({ proposal: 'Ordinary vote' })
    );
  });

  it('allows an internal symlink while keeping the supplied basename in the header', async () => {
    const artifactPath = join(root, 'alias.diff');
    const realPath = join(root, 'resolution.diff');
    writeFileSync(realPath, 'reviewed change');
    symlinkSync(realPath, artifactPath);
    const result = await captureHandler()({ proposal: 'p', artifactPath, quickMode: true }, CTX);
    expect(result.isError).not.toBe(true);
    expect(collectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        proposal: expect.stringContaining('Artifact: alias.diff sha256:'),
      })
    );
  });

  it.each(['sync', 'async'])(
    'denies traversal, absolute escapes and symlink escapes for %s',
    async (dispatch) => {
      const outsidePath = join(outside, 'private.txt');
      writeFileSync(outsidePath, 'not authorized');
      const link = join(root, 'external-link');
      symlinkSync(outside, link);
      for (const artifactPath of [
        outsidePath,
        relative(process.cwd(), outsidePath),
        join(link, 'private.txt'),
      ]) {
        const result = await captureHandler()(
          { proposal: 'p', artifactPath, quickMode: true, dispatch },
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
      }
      expect(collectMock).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['missing', undefined, /not found|ENOENT|no such file/i],
    ['empty', '', /empty/i],
    ['binary', 'text\0binary', /NUL|binary/i],
    ['over-cap', 'x'.repeat(262_145), /262145.*262144/],
  ] as const)('rejects %s artifacts before any seats run', async (_name, content, error) => {
    const artifactPath = join(root, 'invalid.diff');
    if (content !== undefined) writeFileSync(artifactPath, content);
    for (const dispatch of ['sync', 'async']) {
      const result = await captureHandler()(
        { proposal: 'p', artifactPath, quickMode: true, dispatch },
        CTX
      );
      expect(result.isError).toBe(true);
      expect(parseToolErrorEnvelope(result._meta)?.errorCategory).toBe('validation');
      expect(result.content).toEqual(
        expect.arrayContaining([expect.objectContaining({ text: expect.stringMatching(error) })])
      );
    }
    expect(collectMock).not.toHaveBeenCalled();
  });
});
