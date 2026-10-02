/** Model-family floor and owner override for governor ratification (#6601). */
import { afterAll, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { VoteRecord } from '../packages/nexus-agents/src/audit/vote-record.js';
import { computeVoteRecordHash } from '../packages/nexus-agents/src/audit/vote-record.js';
import {
  buildVoteRecord,
  parseVoteRecordsText,
} from '../packages/nexus-agents/src/audit/vote-record-store.js';
import { verifyVoteRecordSignature } from '../packages/nexus-agents/src/audit/vote-record-signature.js';
import type { AgentVoteResult, VoterRole } from '../packages/nexus-agents/src/cli/vote-types.js';
import { appendRatificationRecord } from './append-ratification-record.js';
import { signCommitted } from './append-ratification-signing.js';
import { evaluateLedgerEvidence, type LedgerEvidence } from './governor-ledger-evidence.js';
import { formatLedgerEvidence } from './governor-ledger-report.js';
import * as diversity from './governor-ledger-diversity.js';
import * as dealing from '../packages/nexus-agents/src/cli/voter-family-dealing.js';
import { DEFAULT_MODEL_CAPABILITIES } from '../packages/nexus-agents/src/config/in-tree-data.js';
import { governorPathsFromCodeowners } from './governor-section.js';

const DIR = mkdtempSync(join(tmpdir(), '6601-test-'));
const OWNER_KEY = join(DIR, 'owner');
const AGENT_KEY = join(DIR, 'agent');
for (const key of [OWNER_KEY, AGENT_KEY]) {
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'test', '-f', key]);
}
const SIGNERS =
  `owner@test namespaces="nexus-vote-record",valid-after="20200101" ${readFileSync(`${OWNER_KEY}.pub`, 'utf-8')}` +
  `nexus-agent@test namespaces="nexus-vote-record",valid-after="20200101" ${readFileSync(`${AGENT_KEY}.pub`, 'utf-8')}`;
const SIGNERS_PATH = join(DIR, 'allowed_signers');
writeFileSync(SIGNERS_PATH, SIGNERS);
afterAll(() => {
  rmSync(DIR, { recursive: true, force: true });
});

const PR = 6601;
const HEAD = '0123456789abcdef0123456789abcdef01234567';
const OTHER_HEAD = '1111111111111111111111111111111111111111';
const MODELS = ['claude-opus-4-6', 'gpt-5', 'gemini-2.5-pro'];
const ROLES: readonly VoterRole[] = ['architect', 'security', 'scope_steward'];

function record(
  id: string,
  models: readonly (string | undefined)[],
  sequence = 0,
  votes: AgentVoteResult[] = ROLES.map((role, i) => ({
    role,
    vote: { decision: 'approve', confidence: 0.9, reasoning: 'test approval' },
    source: 'llm',
    processingTimeMs: 1,
    ...(models[i] !== undefined ? { model: models[i] } : {}),
  }))
): VoteRecord {
  const responses = votes.filter((v) => v.source !== 'error');
  const approve = responses.filter((v) => v.vote.decision === 'approve').length;
  const reject = responses.filter((v) => v.vote.decision === 'reject').length;
  const abstain = responses.filter((v) => v.vote.decision === 'abstain').length;
  const now = '2026-10-02T12:00:00.000Z';
  return buildVoteRecord({
    id,
    proposal: 'Ratify governor change',
    strategy: 'supermajority',
    declaredOptions: undefined,
    resolvedDecision: 'approved',
    votes,
    sequence,
    errorPolicy: 'absolute_quorum',
    ratifiesPr: { pr: PR, headSha: HEAD },
    result: {
      proposalId: id,
      proposal: { title: 'Ratification', description: 'test', algorithm: 'supermajority' },
      outcome: 'approved',
      votes: new Map(),
      voteCounts: { approve, reject, abstain, total: responses.length },
      approvalPercentage: responses.length === 0 ? 0 : (approve / responses.length) * 100,
      quorumReached: true,
      startedAt: now,
      closedAt: now,
      durationMs: 1,
    },
  });
}

function sevenSeatRecord(
  decision: AgentVoteResult['vote']['decision'],
  source: AgentVoteResult['source']
): VoteRecord {
  const roles: readonly VoterRole[] = [
    'architect',
    'security',
    'devex',
    'ai_ml',
    'pm',
    'catfish',
    'scope_steward',
  ];
  const votes: AgentVoteResult[] = roles.map((role, i) => ({
    role,
    vote: { decision: i === 6 ? decision : 'approve', confidence: 0.9, reasoning: 'test scrutiny' },
    source: i === 6 ? source : 'llm',
    model: i === 6 ? 'gemini-2.5-pro' : 'claude-opus-4-6',
    processingTimeMs: 1,
  }));
  return signed(record('seven-seats', [], 0, votes));
}

function rehash(r: VoteRecord, changes: Partial<VoteRecord>): VoteRecord {
  const { hash: _hash, signature: _signature, ...payload } = { ...r, ...changes };
  if (payload.version !== '1.13') {
    payload.voters = payload.voters.map(
      ({ reasoningDigest: _digest, reasoningNonce: _nonce, ...v }) => v
    );
  }
  return { ...payload, hash: computeVoteRecordHash(payload) };
}

function signed(r: VoteRecord, owner = false): VoteRecord {
  const step = signCommitted(r, {
    keyPath: owner ? OWNER_KEY : AGENT_KEY,
    allowedSignersPath: SIGNERS_PATH,
    source: 'flag',
    asOwner: owner,
  });
  if (!step.ok) throw new Error(step.detail);
  return step.record;
}

function evaluate(records: readonly VoteRecord[], pr = PR, headSha = HEAD): LedgerEvidence {
  return evaluateLedgerEvidence({
    ledgerText: records.map((r) => JSON.stringify(r)).join('\n'),
    pr,
    head: {
      sha: headSha,
      parentSha: OTHER_HEAD,
      commitFiles: ['scripts/governor-ledger-evidence.ts'],
    },
    signatureVerifier: (r) => verifyVoteRecordSignature({ record: r, allowedSigners: SIGNERS }),
  });
}

const single = (): VoteRecord =>
  signed(record('single', ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-opus-4-6']));
const override = (): VoteRecord =>
  signed(record('override', ['claude-opus-4-6', 'claude-opus-4-6', 'claude-opus-4-6'], 1), true);

describe('governor model diversity floor (#6601)', () => {
  it('ratifies a three-family panel', () => {
    expect(evaluate([signed(record('diverse', MODELS))]).kind).toBe('ratified');
  });

  it('refuses distinct models of one family with a named recovery', () => {
    const evidence = evaluate([single()]);
    expect(evidence.kind).toBe('insufficient-model-diversity');
    const line = formatLedgerEvidence(evidence);
    expect(line).toContain('anthropic');
    expect(line).toContain('at least 2 model families');
    expect(line).toContain(
      'push a new head and re-run the panel, or add an owner-signed override bound to this head'
    );
    expect(line).toContain(`PR #${String(PR)} headSha ${HEAD}`);
    expect(line).toContain('head does not cover head^ or a different rebased record sha');
    expect(line).toContain('owner override');
  });

  it.each([
    ['abstain', 'unverifiable'],
    ['abstain', 'llm'],
    ['approve', 'unverifiable'],
    ['reject', 'unverifiable'],
  ] as const)('refuses six claude approvals plus a gemini %s from %s', (decision, source) => {
    const panel = sevenSeatRecord(decision, source);
    expect(panel.voters).toHaveLength(7);
    expect(panel.voteCounts.approve).toBe(decision === 'approve' ? 7 : 6);
    expect(panel.panelCoverage).toMatchObject({ requested: 7, responded: 7, errored: 0 });
    const evidence = evaluate([panel]);
    expect(evidence.kind).toBe('insufficient-model-diversity');
    expect(formatLedgerEvidence(evidence)).toContain('families found: anthropic)');
  });

  it('ratifies six claude approvals plus a real gemini reject', () => {
    const panel = sevenSeatRecord('reject', 'llm');
    expect(panel.voteCounts).toEqual({ approve: 6, reject: 1, abstain: 0, total: 7 });
    expect(evaluate([panel]).kind).toBe('ratified');
  });

  it('does not count an errored gemini seat omitted from the recorded voters', () => {
    const panel = sevenSeatRecord('abstain', 'error');
    expect(panel.voters).toHaveLength(6);
    const evidence = evaluate([panel]);
    expect(evidence.kind).toBe('degraded-panel');
    expect(formatLedgerEvidence(evidence)).toContain('insufficient-model-diversity');
  });

  it('does not supersede a single-family record with a newer diverse record at the same head', () => {
    const evidence = evaluate([single(), signed(record('newer-diverse', MODELS, 1))]);
    expect(evidence.kind).toBe('insufficient-model-diversity');
  });

  it('accepts a separate owner-signed override with the required notice', () => {
    const evidence = evaluate([single(), override()]);
    expect(evidence.kind).toBe('ratified');
    expect(formatLedgerEvidence(evidence)).toContain(
      'ratified single-family (anthropic) under owner override override'
    );
    expect(formatLedgerEvidence(evidence)).toContain(`bound to PR #${String(PR)} headSha ${HEAD}`);
    expect(formatLedgerEvidence(evidence)).toContain(
      'head does not cover head^ or a different rebased record sha'
    );
  });

  it('appends the override through the existing --as-owner signing path', () => {
    const sourcePath = join(DIR, 'source.jsonl');
    const ledgerPath = join(DIR, 'ledger.jsonl');
    writeFileSync(
      sourcePath,
      JSON.stringify(record('appended-override', ['claude-opus-4-6'])) + '\n'
    );
    writeFileSync(ledgerPath, JSON.stringify(single()) + '\n');
    const appended = appendRatificationRecord({
      sourcePath,
      ledgerPath,
      recordId: 'appended-override',
      signing: {
        keyPath: OWNER_KEY,
        allowedSignersPath: SIGNERS_PATH,
        source: 'flag',
        asOwner: true,
      },
    });
    expect(appended.kind).toBe('appended');
    const evidence = evaluate(parseVoteRecordsText(readFileSync(ledgerPath, 'utf-8')).records);
    expect(evidence.kind).toBe('ratified');
    expect(formatLedgerEvidence(evidence)).toContain('under owner override appended-override');
  });

  it.each(['head', 'pr', 'agent', 'unsigned', 'bad-signature'])(
    'refuses an override with %s mismatch',
    (mismatch) => {
      let candidate = override();
      if (mismatch === 'head')
        candidate = signed(
          rehash(candidate, { ratifiesPr: { pr: PR, headSha: OTHER_HEAD } }),
          true
        );
      if (mismatch === 'pr')
        candidate = signed(rehash(candidate, { ratifiesPr: { pr: PR + 1, headSha: HEAD } }), true);
      if (mismatch === 'agent') candidate = signed(rehash(candidate, {}));
      if (mismatch === 'unsigned') candidate = rehash(candidate, {});
      if (mismatch === 'bad-signature')
        candidate = {
          ...candidate,
          signature: signed(rehash(candidate, { proposal: 'different bytes' }), true).signature,
        };
      const evidence = evaluate([single(), candidate]);
      expect(evidence.kind).toBe(
        mismatch === 'unsigned' || mismatch === 'bad-signature'
          ? 'signature-required'
          : 'insufficient-model-diversity'
      );
      expect(formatLedgerEvidence(evidence)).toContain('insufficient-model-diversity');
    }
  );

  it('does not let an owner-signed panel override itself', () => {
    expect(evaluate([signed(record('alone', ['claude-opus-4-6']), true)]).kind).toBe(
      'insufficient-model-diversity'
    );
  });

  it.each([
    ['decision', 'not-approved'],
    ['policy', 'wrong-error-policy'],
    ['strategy', 'wrong-strategy'],
    ['coverage', 'degraded-panel'],
  ] as const)('keeps the %s check on an owner override', (check, kind) => {
    const changes: Partial<VoteRecord> =
      check === 'decision'
        ? { decision: 'rejected' }
        : check === 'policy'
          ? { errorPolicy: 'reduce_denominator' }
          : check === 'strategy'
            ? { strategy: 'simple_majority' }
            : {
                panelCoverage: {
                  requested: 3,
                  responded: 2,
                  errored: 1,
                  erroredRoles: ['architect'],
                },
              };
    expect(evaluate([single(), signed(rehash(override(), changes), true)]).kind).toBe(kind);
  });

  it('does not let an override on head cover a single-family record on head^', () => {
    const evidence = evaluateLedgerEvidence({
      ledgerText: [
        signed(rehash(single(), { ratifiesPr: { pr: PR, headSha: OTHER_HEAD } })),
        override(),
      ]
        .map((r) => JSON.stringify(r))
        .join('\n'),
      pr: PR,
      head: { sha: HEAD, parentSha: OTHER_HEAD, commitFiles: ['governance/vote-records.jsonl'] },
      signatureVerifier: (r) => verifyVoteRecordSignature({ record: r, allowedSigners: SIGNERS }),
    });
    expect(evidence.kind).toBe('insufficient-model-diversity');
    const refusal = formatLedgerEvidence(evidence);
    expect(refusal).toContain(`PR #${String(PR)} headSha ${OTHER_HEAD}`);
    expect(refusal).toContain('head does not cover head^ or a different rebased record sha');
  });

  it.each(['ancestor', 'prior-head'] as const)(
    'keeps the override notice after a %s head move',
    (relation) => {
      const ledgerText = [single(), override()].map((r) => JSON.stringify(r)).join('\n');
      const evidence = evaluateLedgerEvidence({
        ledgerText,
        pr: PR,
        head: { sha: OTHER_HEAD, commitFiles: ['scripts/change.ts'] },
        movedHead: () => ({
          kind: 'measured',
          relation,
          nonLedgerChanged: true,
          tree: { kind: 'equal', replayedTree: 'test-tree' },
          ledgerText,
        }),
        signatureVerifier: (r) => verifyVoteRecordSignature({ record: r, allowedSigners: SIGNERS }),
      });
      expect(evidence.kind).toBe('ratified-rebased');
      expect(formatLedgerEvidence(evidence)).toContain(
        'ratified single-family (anthropic) under owner override override'
      );
    }
  );

  it('does not extend historical grandfathering to a rehashed copy', () => {
    const { records } = parseVoteRecordsText(
      readFileSync(join(process.cwd(), 'governance/vote-records.jsonl'), 'utf-8')
    );
    const historical = records.find((r) => r.ratifiesPr?.pr === 6559);
    expect(historical).toBeDefined();
    if (historical === undefined) throw new Error('missing historical ratification');
    const copy = signed(rehash(historical, { sequence: 0 }));
    expect(evaluate([copy], 6559, historical.ratifiesPr?.headSha).kind).toBe(
      'insufficient-model-diversity'
    );
  });

  it.each([
    ['unknown', ['unrecognized-test-model', 'other-test-model', 'unrecognized-test-model']],
    ['absent', [undefined, undefined, undefined]],
    ['pending', ['pending-detection', 'pending-detection', 'pending-detection']],
  ] as const)('refuses %s models as unmeasured even with an owner override', (_name, models) => {
    const evidence = evaluate([signed(record('unmeasured', models)), override()]);
    expect(evidence.kind).toBe('unmeasured-model-diversity');
    expect(formatLedgerEvidence(evidence)).toContain('families found: none');
  });

  it('does not count unknown or missing seats toward the floor', () => {
    expect(
      evaluate([signed(record('partial', ['claude-opus-4-6', 'unknown-test-model', undefined]))])
        .kind
    ).toBe('insufficient-model-diversity');
    expect(
      evaluate([signed(record('partial-diverse', ['claude-opus-4-6', 'gpt-5', undefined]))]).kind
    ).toBe('ratified');
  });

  it('names an empty voter collection as unmeasured', () => {
    const evidence = evaluate([signed(rehash(record('no-voters', MODELS), { voters: [] }))]);
    expect(evidence.kind).toBe('unmeasured-model-diversity');
    expect(formatLedgerEvidence(evidence)).toContain('families found: none');
  });

  it('treats pre-model schemas and missing modern models as unmeasured', () => {
    const legacy = signed(rehash(record('legacy', []), { version: '1.7' }));
    const evidence = evaluate([legacy]);
    expect(evidence.kind).toBe('unmeasured-model-diversity');
    expect(formatLedgerEvidence(evidence)).toContain('families found: none');
    expect(evaluate([signed(rehash(record('modern-empty', []), { version: '1.8' }))]).kind).toBe(
      'unmeasured-model-diversity'
    );
  });

  it('evaluates model evidence even on an older schema label', () => {
    expect(evaluate([signed(rehash(single(), { version: '1.7' }))]).kind).toBe(
      'insufficient-model-diversity'
    );
  });

  it('keeps every PR ratified by the real committed ledger passing', () => {
    const ledgerText = readFileSync(join(process.cwd(), 'governance/vote-records.jsonl'), 'utf-8');
    const { records, invalidLines } = parseVoteRecordsText(ledgerText);
    expect(invalidLines).toEqual([]);
    expect(records.length).toBeGreaterThan(0);
    const allowedSigners = readFileSync(join(process.cwd(), 'governance/allowed_signers'), 'utf-8');
    for (const r of records) {
      if (r.ratifiesPr === undefined) continue;
      const evidence = evaluateLedgerEvidence({
        ledgerText,
        pr: r.ratifiesPr.pr,
        head: {
          sha: r.ratifiesPr.headSha,
          parentSha: OTHER_HEAD,
          commitFiles: ['scripts/governor-ledger-evidence.ts'],
        },
        signatureVerifier: (entry) => verifyVoteRecordSignature({ record: entry, allowedSigners }),
      });
      expect(evidence.kind, r.id).toBe('ratified');
    }
  });
});

describe('governed model-family mapping', () => {
  it('cannot split one vendor into multiple families through the ordinary classifier', () => {
    vi.spyOn(dealing, 'vendorFamilyOf').mockImplementation((modelId) =>
      modelId.includes('sonnet') ? 'google' : 'openai'
    );
    const evidence = diversity.modelDiversityEvidence([single()], undefined);
    expect(evidence.failures).toHaveLength(1);
    expect(evidence.failures[0]).toMatchObject({
      kind: 'insufficient-model-diversity',
      families: ['anthropic'],
    });
  });

  it('cannot count unknown vendors through the ordinary classifier', () => {
    vi.spyOn(dealing, 'vendorFamilyOf').mockReturnValue('google');
    const evidence = diversity.modelDiversityEvidence(
      [record('unknown-vendor', ['new-test-vendor', 'other-test-vendor', 'new-test-vendor'])],
      undefined
    );
    expect(evidence.failures).toHaveLength(1);
    expect(evidence.failures[0]).toMatchObject({
      kind: 'unmeasured-model-diversity',
      families: [],
    });
  });

  it.each([
    ['claude-opus-4-6', 'anthropic'],
    ['ANTHROPIC/claude_sonnet_4_6', 'anthropic'],
    ['gpt-5', 'openai'],
    ['o3-mini', 'openai'],
    ['chatgpt-4o', 'openai'],
    ['gemini-2.5-pro', 'google'],
    ['meta-llama/llama-3', 'meta'],
    ['qwen-3', 'qwen'],
    ['nvidia/nemotron-super', 'nvidia'],
    ['codestral-2501', 'mistral'],
    ['command-r-plus', 'cohere'],
    ['deepseek-r1', 'deepseek'],
    ['claudia-7b', 'unknown'],
    ['opus', 'unknown'],
    ['sonnet', 'unknown'],
    ['haiku', 'unknown'],
    ['fable', 'unknown'],
    ['SONNET', 'unknown'],
    ['unknownvendor/sonnet', 'unknown'],
    ['', 'unknown'],
  ])('pins %s to %s', (modelId, family) => {
    expect(diversity.governorVendorFamilyOf(modelId)).toBe(family);
  });

  it('agrees with the ordinary classifier or is stricter for every in-tree id and alias', () => {
    const models = DEFAULT_MODEL_CAPABILITIES.models;
    expect(models.length, 'empty in-tree registry measures no mapping agreement').toBeGreaterThan(
      0
    );
    for (const model of models) {
      const ids = [model.id, ...(model.aliases ?? [])];
      if (model.cliModelName !== undefined) ids.push(model.cliModelName);
      for (const id of ids) {
        const family = diversity.governorVendorFamilyOf(id);
        expect(family === 'unknown' || family === dealing.vendorFamilyOf(id), id).toBe(true);
      }
    }
  });

  it('agrees with the ordinary classifier or is stricter for every committed ledger model', () => {
    const text = readFileSync(join(process.cwd(), 'governance/vote-records.jsonl'), 'utf-8');
    const { records, invalidLines } = parseVoteRecordsText(text);
    expect(invalidLines).toEqual([]);
    const ids = new Set(records.flatMap((r) => r.voters.flatMap((v) => v.model ?? [])));
    expect(ids.size, 'empty ledger model set measures no mapping agreement').toBeGreaterThan(0);
    for (const id of ids) {
      const family = diversity.governorVendorFamilyOf(id);
      expect(family === 'unknown' || family === dealing.vendorFamilyOf(id), id).toBe(true);
    }
  });

  it('governs the mapping agreement test so an ordinary PR cannot remove it', () => {
    const codeowners = readFileSync(join(process.cwd(), 'CODEOWNERS'), 'utf-8');
    expect(governorPathsFromCodeowners(codeowners)).toContain(
      '/scripts/governor-ledger-diversity.test.ts'
    );
  });
});

describe('gateway-served model diversity reader (#6951)', () => {
  it('reads a signed gateway-substituted panel and applies the serving family floor', () => {
    const panel = record('substituted', ['gemini-2.5-pro', 'claude-opus-4-6']);
    const voters = panel.voters.map((v, i) =>
      i === 0 ? { ...v, servedModel: 'claude-sonnet-4-6' } : v
    );
    const reported = signed(rehash(panel, { voters }));
    const parsed = parseVoteRecordsText(JSON.stringify(reported));
    expect(parsed.invalidLines).toEqual([]);
    expect(parsed.records[0]?.voters[0]).toMatchObject({
      model: 'gemini-2.5-pro',
      servedModel: 'claude-sonnet-4-6',
    });
    expect(diversity.modelDiversityEvidence(parsed.records, undefined).failures).toMatchObject([
      { kind: 'insufficient-model-diversity', families: ['anthropic'] },
    ]);
    expect(evaluate(parsed.records).kind).toBe('insufficient-model-diversity');
  });

  it('refuses an all-Claude panel when one seat reports Gemini', () => {
    const panel = record('all-claude', Array<string>(3).fill('claude-opus-4-6'));
    const voters = panel.voters.map((v, i) =>
      i === 1 ? { ...v, servedModel: 'gemini-2.5-pro' } : v
    );
    expect(evaluate([signed(rehash(panel, { voters }))]).kind).toBe('insufficient-model-diversity');
  });

  it.each(['sonnet', 'opus', 'haiku', 'fable'])(
    'preserves the main verdict for GPT plus bare configured alias %s without reports',
    (alias) => {
      // origin/main classifies bare aliases as unknown: only OpenAI gets credit.
      const panel = record('legacy-alias', ['gpt-5', alias]);
      expect(evaluate([signed(panel)]).kind).toBe('insufficient-model-diversity');
      expect(diversity.modelDiversityEvidence([panel], undefined).failures).toMatchObject([
        { families: ['openai'] },
      ]);
    }
  );

  it('withholds the only configured family when its serving report is unknown', () => {
    const panel = record('unknown-report', ['gpt-5']);
    const voters = panel.voters.map((v) => ({ ...v, servedModel: 'unknownvendor/x' }));
    expect(
      diversity.modelDiversityEvidence([rehash(panel, { voters })], undefined).failures
    ).toMatchObject([{ kind: 'unmeasured-model-diversity', families: [] }]);
  });

  it('never passes a generated panel that fails the main configured-family floor', () => {
    // Literal origin/main classifications; independent of the classifier under test.
    const models = [
      ['claude-opus-4-6', 'anthropic', 'sonnet'],
      ['gpt-5', 'openai', 'openai/gpt-5'],
      ['gemini-2.5-pro', 'google', 'google/gemini-2.5-pro'],
      ['llama-3', 'meta', 'meta/llama-3'],
      ['qwen-3', 'qwen', 'qwen/qwen-3'],
      ['nemotron-super', 'nvidia', 'nvidia/nemotron'],
      ['codestral-2501', 'mistral', 'mistral/mixtral'],
      ['command-r', 'cohere', 'cohere/command-r'],
      ['deepseek-r1', 'deepseek', 'deepseek/deepseek-r1'],
      ['sonnet', 'unknown', 'sonnet'],
      ['opus', 'unknown', 'opus'],
      ['haiku', 'unknown', 'haiku'],
      ['fable', 'unknown', 'fable'],
      ['unknownvendor/x', 'unknown', 'unknownvendor/x'],
      [undefined, 'unknown', 'gpt-5'],
    ] as const;
    const seats = models.flatMap(([model, mainFamily, sameFamily]) =>
      [
        undefined,
        sameFamily,
        mainFamily === 'openai' ? 'gemini-2.5-pro' : 'gpt-5',
        'unknownvendor/x',
      ].map((servedModel) => ({ model, mainFamily, servedModel }))
    );
    const panels = seats.flatMap((a) => seats.map((b) => [a, b] as const));
    expect(panels).toHaveLength(3600);
    for (const [a, b] of panels) {
      const panel = record('monotonic', [a.model, b.model]);
      const voters = panel.voters.map((v, i) => ({
        ...v,
        servedModel: [a.servedModel, b.servedModel][i],
      }));
      const mainFamilies = new Set([a.mainFamily, b.mainFamily].filter((f) => f !== 'unknown'));
      const mainPasses = mainFamilies.size >= 2;
      const newPasses =
        diversity.modelDiversityEvidence([rehash(panel, { voters })], undefined).failures.length ===
        0;
      expect(!newPasses || mainPasses, JSON.stringify([a, b])).toBe(true);
      if (a.servedModel === undefined && b.servedModel === undefined) {
        expect(newPasses, JSON.stringify([a, b])).toBe(mainPasses);
      }
    }
  });
  it.each([
    ['claude-opus-4-6', 'gemini-2.5-pro', 'insufficient-model-diversity'],
    [undefined, 'gemini-2.5-pro', 'insufficient-model-diversity'],
    ['gemini-2.5-pro', 'unknownvendor/x', 'insufficient-model-diversity'],
    ['claude-opus-4-6', undefined, 'insufficient-model-diversity'],
    ['gemini-2.5-pro', 'google/gemini-2.5-pro', 'ratified'],
  ] as const)(
    'uses configured %s and served %s through the pinned table',
    (model, servedModel, expected) => {
      const panel = record('reported-family', ['claude-opus-4-6', model]);
      const voters = panel.voters.map((v, i) => (i === 1 ? { ...v, servedModel } : v));
      expect(evaluate([signed(rehash(panel, { voters }))]).kind).toBe(expected);
      if (servedModel === 'unknownvendor/x') {
        expect(
          diversity.modelDiversityEvidence([rehash(panel, { voters })], undefined).failures
        ).toMatchObject([{ kind: 'insufficient-model-diversity', families: ['anthropic'] }]);
      }
    }
  );

  it.each(['sonnet', 'opus', 'haiku', 'fable'])(
    'keeps bare Claude fallback alias %s in the anthropic family',
    (servedModel) => {
      const panel = record('claude-fallback', ['gpt-5', 'claude-sonnet-4-6']);
      const voters = panel.voters.map((v, i) => (i === 1 ? { ...v, servedModel } : v));
      expect(
        diversity.modelDiversityEvidence([rehash(panel, { voters })], undefined).failures
      ).toEqual([]);
      // A report cannot grant family credit to an unconfigured seat.
      const aliasOnly = record('alias-only', [undefined]);
      const onlyVoters = aliasOnly.voters.map((v, i) => (i === 0 ? { ...v, servedModel } : v));
      expect(
        diversity.modelDiversityEvidence([rehash(aliasOnly, { voters: onlyVoters })], undefined)
          .failures
      ).toMatchObject([{ kind: 'unmeasured-model-diversity', families: [] }]);
    }
  );

  it.each(['abstain', 'unverifiable', 'error'] as const)(
    'does not count a served family from a %s seat',
    (excluded) => {
      const panel = sevenSeatRecord(
        excluded === 'abstain' ? 'abstain' : 'approve',
        excluded === 'abstain' ? 'llm' : excluded
      );
      const voters = panel.voters.map((v, i) => (i === 6 ? { ...v, servedModel: 'gpt-5' } : v));
      expect(
        diversity.modelDiversityEvidence([rehash(panel, { voters })], undefined).failures
      ).toMatchObject([{ kind: 'insufficient-model-diversity', families: ['anthropic'] }]);
    }
  );

  it('names zero known served or configured families as unmeasured', () => {
    const panel = record('unknown-served', ['unknownvendor/configured']);
    const voters = panel.voters.map((v) => ({ ...v, servedModel: 'unknownvendor/x' }));
    expect(evaluate([signed(rehash(panel, { voters }))]).kind).toBe('unmeasured-model-diversity');
  });
});
