/** Real local gateway → bridges → voter → ledger → unchanged governor family floor. */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
const isolation = await vi.hoisted(async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const previous = process.env['NEXUS_DATA_DIR'];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), '7550-family-floor-'));
  process.env['NEXUS_DATA_DIR'] = dir;
  return { dir, previous };
});
import { rmSync } from 'node:fs';
import { SdkAdapter } from '../packages/nexus-agents/src/adapters/sdk/sdk-adapter.js';
import { ModelToCliAdapter } from '../packages/nexus-agents/src/cli-adapters/model-to-cli-adapter.js';
import { CliToModelAdapter } from '../packages/nexus-agents/src/cli-adapters/cli-to-model-adapter.js';
import { executeWithRetries } from '../packages/nexus-agents/src/cli/voter-execution.js';
import { buildLlmVoteResult } from '../packages/nexus-agents/src/cli/voter-attempt-usage.js';
import type { AgentVoteResult, VoterRole } from '../packages/nexus-agents/src/cli/vote-types.js';
import { buildVoteRecord } from '../packages/nexus-agents/src/audit/vote-record-store.js';
import {
  VoteRecordSchema,
  type VoteRecord,
} from '../packages/nexus-agents/src/audit/vote-record.js';
import { serializeValidatedRecord } from '../packages/nexus-agents/src/audit/ledger-append.js';
import { createLogger } from '../packages/nexus-agents/src/core/index.js';
import { FAKE_OPENAI_KEY } from '../packages/nexus-agents/src/testing/test-secrets.js';
import {
  startFakeGateway,
  type FakeGateway,
} from '../packages/nexus-agents/src/testing/gateway/fake-gateway.js';
import { modelDiversityEvidence } from './governor-ledger-diversity.js';
import type { ICliAdapter } from '../packages/nexus-agents/src/cli-adapters/types.js';

const CONFIGURED = 'claude-opus';
const REPORTED = 'gpt-4o-mini';
const VOTE = JSON.stringify({
  decision: 'approve',
  confidence: 0.9,
  reasoning: 'Offline family-floor control',
});
let gateway: FakeGateway;
beforeAll(async () => {
  gateway = await startFakeGateway({
    catalog: [CONFIGURED, REPORTED].map((id) => ({
      id,
      object: 'model' as const,
      created: 1,
      owned_by: 'fixture',
    })),
  });
});
afterEach(() => {
  gateway.clearRequests();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await gateway.close();
  rmSync(isolation.dir, { recursive: true, force: true });
  if (isolation.previous === undefined) delete process.env['NEXUS_DATA_DIR'];
  else process.env['NEXUS_DATA_DIR'] = isolation.previous;
});

async function gatewayVote(modelId: string, role: VoterRole): Promise<AgentVoteResult> {
  const backend = new SdkAdapter({
    providerId: 'custom-openai',
    modelId,
    baseUrl: gateway.baseUrl,
    apiKey: FAKE_OPENAI_KEY,
  });
  const adapter = new CliToModelAdapter(new ModelToCliAdapter(backend, { name: 'api:fixture' }));
  const result = await executeWithRetries({
    role,
    proposal: 'Offline family-floor control',
    adapter,
    timeoutMs: 30_000,
    maxRetries: 0,
    logger: createLogger({ component: 'family-floor-control' }),
  });
  if (!result.ok) throw new Error(result.error);
  return buildLlmVoteResult(role, result, adapter, 1);
}

async function unreportedCliVote(
  name: 'claude' | 'codex',
  modelId: string,
  role: VoterRole
): Promise<AgentVoteResult> {
  const cli = {
    name,
    transport: 'stdio',
    enforcesReadOnlyAnalysis: true,
    capabilities: { reasoning: 9, contextWindow: 200_000, codeGeneration: 9, speed: 7, cost: 5 },
    getModelInfo: () => ({ id: modelId, name: 'Offline configured identity' }),
    execute: () => Promise.resolve({ ok: true, value: { text: VOTE } }),
  } as unknown as ICliAdapter;
  const adapter = new CliToModelAdapter(cli);
  const outcome = await executeWithRetries({
    role,
    proposal: 'Offline no-report floor control',
    adapter,
    timeoutMs: 30_000,
    maxRetries: 0,
    logger: createLogger({ component: 'no-report-floor-control' }),
  });
  if (!outcome.ok) throw new Error(outcome.error);
  return buildLlmVoteResult(role, outcome, adapter, 1);
}

/** Fixture decision context, actual produced voter rows, no live/ratification authority. */
function recordFor(votes: AgentVoteResult[]): VoteRecord {
  const at = '2026-10-21T00:00:00.000Z';
  const record = buildVoteRecord({
    id: 'offline-family-floor',
    proposal: 'Offline family-floor fixture',
    strategy: 'supermajority',
    votes,
    declaredOptions: undefined,
    resolvedDecision: 'approved',
    result: {
      proposalId: 'offline',
      proposal: { title: 'Offline', description: 'No authority', algorithm: 'supermajority' },
      outcome: 'approved',
      votes: new Map(votes.map((v) => [v.role, v.vote])),
      voteCounts: { approve: votes.length, reject: 0, abstain: 0, total: votes.length },
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

describe.each(['chat', 'responses'])('genuine %s gateway report', (surface) => {
  it('withholds the configured family after real bridge/voter/ledger composition', async () => {
    vi.stubEnv('NEXUS_CUSTOM_API_ALLOW_PRIVATE', '1');
    vi.stubEnv('NEXUS_CUSTOM_API_SURFACE', surface);
    gateway.setScript(() => ({ kind: 'text', content: VOTE, responseModel: REPORTED }));
    // First prove that the fixture actually emits the intended counterfactual.
    const wire = await fetch(`${gateway.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: CONFIGURED, messages: [] }),
    });
    expect(await wire.json()).toMatchObject({ model: REPORTED });
    const votes = [
      await gatewayVote(CONFIGURED, 'architect'),
      await gatewayVote(REPORTED, 'security'),
    ];
    const record = recordFor(votes);
    expect(record.voters[0]).toMatchObject({
      model: CONFIGURED,
      servedModel: REPORTED,
      resolvedModel: REPORTED,
    });
    expect(modelDiversityEvidence([record], undefined).failures).toMatchObject([
      { kind: 'insufficient-model-diversity', families: ['openai'] },
    ]);
  });
});

it('preserves existing configured-family floor credit for two real no-report CLI rows', async () => {
  const votes = [
    await unreportedCliVote('claude', CONFIGURED, 'architect'),
    await unreportedCliVote('codex', REPORTED, 'security'),
  ];
  const record = recordFor(votes);
  expect(record.voters).toHaveLength(2);
  expect(record.voters[0]).toMatchObject({ model: CONFIGURED });
  expect(record.voters[1]).toMatchObject({ model: REPORTED });
  expect(record.voters[0]).not.toHaveProperty('servedModel');
  expect(record.voters[1]).not.toHaveProperty('servedModel');
  expect(modelDiversityEvidence([record], undefined).failures).toEqual([]);
});
