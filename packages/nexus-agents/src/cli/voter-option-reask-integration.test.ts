/** Real consensus_vote collection through the audit record builder (#4495). */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompletionRequest, IModelAdapter, ILogger } from '../core/index.js';
import { buildVoteRecord } from '../audit/vote-record-store.js';
import { resetNexusDataDirCache } from '../config/nexus-data-dir.js';
import { executeVoting, resetCorrelationTracker } from '../mcp/tools/consensus-vote.js';
import { ConsensusVoteInputSchema } from '../mcp/tools/consensus-vote-types.js';

const OPTIONS = ['split only', 'keep together'];
const APPROVER_COUNT = 6;
const STAGGERED_PANEL_MS = 12_000;
const QUIET: ILogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
  setLevel: vi.fn(),
};

function panelAdapter(): IModelAdapter {
  let firstPassCalls = 0;
  return {
    providerId: 'test',
    modelId: 'test-model',
    capabilities: [],
    complete: vi.fn().mockImplementation((request: CompletionRequest) => {
      const reask = request.messages.some(
        (message) =>
          typeof message.content === 'string' && message.content.includes('OPTION SELECTION RE-ASK')
      );
      if (!reask) firstPassCalls += 1;
      const answer = reask
        ? { selectedOption: OPTIONS[0] }
        : firstPassCalls <= APPROVER_COUNT
          ? { decision: 'approve', confidence: 0.9, reasoning: 'The artifact supports approval.' }
          : {
              decision: 'reject',
              confidence: 0.9,
              reasoning: 'The artifact supports rejection.',
              selectedOption: OPTIONS[1],
            };
      return Promise.resolve({
        ok: true,
        value: {
          content: JSON.stringify(answer),
          model: 'test-model',
          usage: {},
          stopReason: 'end_turn',
        },
      });
    }),
    stream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue(1),
    validateConfig: vi.fn().mockReturnValue({ ok: true }),
  };
}

describe('consensus_vote option re-ask record consistency (#4495)', () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'option-reask-integration-'));
    vi.stubEnv('NEXUS_DATA_DIR', dataDir);
    resetNexusDataDirCache();
    resetCorrelationTracker();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    resetNexusDataDirCache();
    resetCorrelationTracker();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('records resolved approving selections and a tally matching those voter entries', async () => {
    const input = ConsensusVoteInputSchema.parse({
      proposal: 'Choose the implementation scope.',
      strategy: 'simple_majority',
      quickMode: false,
      options: OPTIONS,
    });
    const adapter = panelAdapter();
    const pending = executeVoting(input, QUIET, { gatewayAdapters: [adapter] });
    await vi.advanceTimersByTimeAsync(STAGGERED_PANEL_MS);
    const voting = await pending;
    if (voting.decision !== 'approved') throw new Error('Expected an approved option vote');
    expect(voting.votes).toHaveLength(APPROVER_COUNT + 1);
    expect(voting.votes.filter((seat) => seat.optionReask?.resolved === true)).toHaveLength(
      APPROVER_COUNT
    );
    const record = buildVoteRecord({
      id: 'option-reask-integration',
      proposal: input.proposal,
      strategy: voting.strategy,
      result: voting.result,
      votes: voting.votes,
      declaredOptions: input.options,
      resolvedDecision: voting.decision,
    });
    expect(record.optionTally).toEqual([{ option: OPTIONS[0], count: APPROVER_COUNT }]);
    const recordedSelections = record.voters.flatMap((voter) =>
      voter.selectedOption === undefined ? [] : [voter.selectedOption]
    );
    expect(recordedSelections).toEqual(Array.from({ length: APPROVER_COUNT }, () => OPTIONS[0]));
    expect(
      record.voters.find((voter) => voter.decision === 'reject')?.selectedOption
    ).toBeUndefined();
    expect(record.optionTally?.[0]?.count).toBe(recordedSelections.length);
    expect(adapter.complete).toHaveBeenCalledTimes(APPROVER_COUNT * 2 + 1);
  });
});
