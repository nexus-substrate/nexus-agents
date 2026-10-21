/** Composed model-report regressions: fake only the external CLI response. */
import { describe, expect, it } from 'vitest';
import { CliToModelAdapter } from '../cli-adapters/cli-to-model-adapter.js';
import { ModelToCliAdapter } from '../cli-adapters/model-to-cli-adapter.js';
import type { CliResponse, ICliAdapter } from '../cli-adapters/types.js';
import { createLogger } from '../core/index.js';
import { voterModelEvidence } from '../audit/voter-model-provenance.js';
import { buildVoteRecord } from '../audit/vote-record-store.js';
import { VoteRecordSchema, type VoteRecord } from '../audit/vote-record.js';
import { serializeValidatedRecord } from '../audit/ledger-append.js';
import { buildLlmVoteResult } from './voter-attempt-usage.js';
import { executeWithRetries } from './voter-execution.js';
import type { AgentVoteResult } from './vote-types.js';

const CONFIGURED_MODEL = 'claude-fable-5';
const SUBSTITUTED_MODEL = 'opus';
const VOTE_TEXT = JSON.stringify({
  decision: 'approve',
  confidence: 0.9,
  reasoning: 'Offline transport fixture; no live decision or model execution.',
});

/** The only fake boundary: a CLI's successful external response. */
function externalCli(response: CliResponse): ICliAdapter {
  return {
    name: 'claude',
    transport: 'stdio',
    enforcesReadOnlyAnalysis: true,
    capabilities: {
      reasoning: 9,
      contextWindow: 200_000,
      codeGeneration: 9,
      speed: 7,
      cost: 5,
    },
    getModelInfo: () => ({ id: CONFIGURED_MODEL, name: 'Configured CLI model' }),
    execute: () => Promise.resolve({ ok: true, value: response }),
  } as unknown as ICliAdapter;
}

async function voteFrom(response: CliResponse): Promise<AgentVoteResult> {
  const adapter = new CliToModelAdapter(externalCli(response));
  const outcome = await executeWithRetries({
    role: 'architect',
    proposal: 'Offline report-provenance regression',
    adapter,
    timeoutMs: 30_000,
    maxRetries: 0,
    logger: createLogger({ component: 'model-report-regression' }),
  });
  if (!outcome.ok) throw new Error(outcome.error);
  return buildLlmVoteResult('architect', outcome, adapter, 1);
}

/** Offline decision context; the voter row is built by the real completion path. */
function serializedRecordFor(vote: AgentVoteResult): VoteRecord {
  const at = '2026-10-21T00:00:00.000Z';
  const record = buildVoteRecord({
    id: 'offline-model-provenance',
    proposal: 'Offline model provenance; no authority or live panel claim',
    strategy: 'supermajority',
    declaredOptions: undefined,
    resolvedDecision: 'approved',
    votes: [vote],
    result: {
      proposalId: 'offline-proposal',
      proposal: {
        title: 'Offline fixture',
        description: 'Serialization control',
        algorithm: 'supermajority',
      },
      outcome: 'approved',
      votes: new Map([['architect', vote.vote]]),
      voteCounts: { approve: 1, reject: 0, abstain: 0, total: 1 },
      approvalPercentage: 100,
      quorumReached: true,
      startedAt: at,
      closedAt: at,
      durationMs: 1,
    },
  });
  return VoteRecordSchema.parse(
    JSON.parse(serializeValidatedRecord(VoteRecordSchema, record, 'offline')) as unknown
  );
}

describe('model report provenance through the real retry and ledger projection', () => {
  it('keeps derived substitution out of servedModel without losing selected attribution', async () => {
    const vote = await voteFrom({
      text: VOTE_TEXT,
      model: SUBSTITUTED_MODEL,
      fallbackFrom: 'fable',
    });
    const evidence = voterModelEvidence(vote);

    expect(evidence).not.toHaveProperty('servedModel');
    expect(evidence.model).toBe(CONFIGURED_MODEL);
    expect(evidence.resolvedModel).toBe('claude-opus');
    expect(evidence.fallback?.fromModel).toBe('fable');
    const persisted = serializedRecordFor(vote).voters[0];
    expect(persisted).not.toHaveProperty('servedModel');
    expect(persisted).not.toHaveProperty('operationalModel');
    expect(persisted?.resolvedModel).toBe('claude-opus');
  });

  it('preserves an explicit report ahead of operational selection through the voter', async () => {
    const vote = await voteFrom({
      text: VOTE_TEXT,
      model: SUBSTITUTED_MODEL,
      reportedModel: 'gpt-6.1-sol',
    });
    const evidence = voterModelEvidence(vote);
    expect(evidence.servedModel).toBe('gpt-6.1-sol');
    expect(evidence.resolvedModel).toBe('gpt-6.1-sol');
    expect(evidence.model).toBe(CONFIGURED_MODEL);
  });

  it('carries reporting evidence through both bridge directions', async () => {
    const model = new CliToModelAdapter(
      externalCli({
        text: VOTE_TEXT,
        model: SUBSTITUTED_MODEL,
        reportedModel: 'claude-opus',
      })
    );
    const cli = new ModelToCliAdapter(model, { name: 'claude' });
    const result = await cli.execute({ content: 'Offline bridge roundtrip' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.model).toBe(SUBSTITUTED_MODEL);
    expect(result.value.reportedModel).toBe('claude-opus');
  });

  it.each(['', ' ', 'bad model', 'bad\nmodel', 'x'.repeat(201)])(
    'omits invalid reporting evidence without losing the vote: %j',
    async (reportedModel) => {
      const vote = await voteFrom({ text: VOTE_TEXT, model: 'opus', reportedModel });
      expect(vote.vote.decision).toBe('approve');
      expect(vote).not.toHaveProperty('servedModel');
      expect(voterModelEvidence(vote).resolvedModel).toBe('claude-opus');
    }
  );

  it.each(['', ' ', 'bad model', 'x'.repeat(201)])(
    'omits invalid operational hints while preserving a genuine report: %j',
    async (model) => {
      const vote = await voteFrom({ text: VOTE_TEXT, model, reportedModel: 'claude-opus' });
      expect(vote).not.toHaveProperty('operationalModel');
      expect(vote.servedModel).toBe('claude-opus');
      expect(vote.model).toBe(CONFIGURED_MODEL);
    }
  );
});
