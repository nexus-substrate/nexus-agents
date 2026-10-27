import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as store from '../audit/vote-record-store.js';
import { computeVoteRecordHash, hashProposal, type VoteRecord } from '../audit/vote-record.js';
import { computeReasoningDigest } from '../audit/reasoning-commitment.js';
import { buildRedactionRecord, redactVoterOpenings } from '../audit/redaction-record.js';
import { inlineVoteArtifactText } from '../cli/vote-artifact.js';
import type { VoterRole } from '../cli/voter-roles.js';
import { qualifyCheckpointApproval } from './pipeline-checkpoint-qualification.js';
import type { CheckpointApprovalQualification } from './pipeline-checkpoint-qualification.js';

const PROPOSAL = inlineVoteArtifactText(
  'Review the complete plan.',
  'Implement feature.',
  'plan.txt'
);
const NONCE = 'ab'.repeat(32);
const REASONING = 'The complete plan satisfies the requested feature.';

function record(overrides: Partial<VoteRecord> = {}): VoteRecord {
  const payload: Omit<VoteRecord, 'hash'> = {
    version: '1.13',
    id: 'checkpoint-test-vote',
    sequence: 0,
    recordedAt: '2026-10-27T00:00:00.000Z',
    proposal: PROPOSAL,
    proposalHash: hashProposal(PROPOSAL),
    strategy: 'supermajority',
    decision: 'approved',
    approvalPercentage: 100,
    voteCounts: { approve: 3, reject: 0, abstain: 0, total: 3 },
    voters: ['architect', 'security', 'catfish'].map((role) => ({
      role,
      decision: 'approve' as const,
      confidence: 0.9,
      reasoning: REASONING,
      reasoningNonce: NONCE,
      reasoningDigest: computeReasoningDigest(NONCE, REASONING),
    })),
    errorPolicy: 'absolute_quorum',
    ...overrides,
  };
  return { ...payload, hash: computeVoteRecordHash(payload) };
}

/** Local unit fixture through the canonical producer; no live voters run here. */
function producerRecord(roles: readonly VoterRole[]): VoteRecord {
  const timestamp = '2026-10-27T00:00:00.000Z';
  return store.buildVoteRecord({
    id: 'checkpoint-producer-test',
    proposal: PROPOSAL,
    strategy: 'supermajority',
    declaredOptions: undefined,
    resolvedDecision: 'approved',
    errorPolicy: 'absolute_quorum',
    recordedAt: timestamp,
    votes: roles.map((role) => ({
      role,
      source: 'llm' as const,
      processingTimeMs: 1,
      vote: { decision: 'approve' as const, confidence: 0.9, reasoning: REASONING },
    })),
    result: {
      proposalId: 'checkpoint-producer-test',
      proposal: { title: 'Unit fixture', description: PROPOSAL, algorithm: 'supermajority' },
      outcome: 'approved',
      votes: new Map(),
      voteCounts: { approve: roles.length, reject: 0, abstain: 0, total: roles.length },
      approvalPercentage: 100,
      quorumReached: true,
      startedAt: timestamp,
      closedAt: timestamp,
      durationMs: 1,
    },
  });
}

describe('qualifyCheckpointApproval', () => {
  let directory: string;
  let ledger: string;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'checkpoint-qualification-'));
    ledger = join(directory, 'votes.jsonl');
    vi.spyOn(store, 'resolveVoteRecordsPath').mockReturnValue(ledger);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });
  function save(...records: readonly unknown[]): void {
    writeFileSync(ledger, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  }
  function qualify(
    reconstructedProposal = PROPOSAL,
    voteRecordId = 'checkpoint-test-vote'
  ): CheckpointApprovalQualification {
    return qualifyCheckpointApproval({ reconstructedProposal, voteRecordId });
  }

  it('qualifies a canonical three-role approval without imposing the source-review seven-role bar', () => {
    const approved = record();
    save(approved);
    expect(qualify()).toEqual({
      status: 'qualified',
      recordId: approved.id,
      recordHash: approved.hash,
      proposalHash: approved.proposalHash,
    });
  });

  it.each([
    { panel: 'quick three-role', roles: ['architect', 'security', 'scope_steward'] },
    {
      panel: 'full seven-role',
      roles: ['architect', 'security', 'devex', 'ai_ml', 'pm', 'catfish', 'scope_steward'],
    },
  ] as const)('qualifies a clean $panel producer fixture with omitted coverage', ({ roles }) => {
    const approved = producerRecord(roles);
    // The actual producer intentionally omits this field for clean ordinary votes.
    expect(approved.panelCoverage).toBeUndefined();
    expect(approved.voters).toHaveLength(roles.length);
    expect(approved.errorPolicy).toBe('absolute_quorum');
    const parsed = store.parseVoteRecordsText(JSON.stringify(approved));
    expect(parsed.invalidLines).toEqual([]);
    expect(parsed.records).toEqual([approved]);
    save(approved);
    expect(qualify(PROPOSAL, approved.id)).toEqual({
      status: 'qualified',
      recordId: approved.id,
      recordHash: approved.hash,
      proposalHash: approved.proposalHash,
    });
  });

  it.each(['missing', 'empty'])('names an %s ledger as unavailable', (kind) => {
    if (kind === 'empty') writeFileSync(ledger, '\n');
    expect(qualify()).toEqual({ status: 'unavailable', reason: 'ledger-empty' });
  });

  it('reports unresolved ledger paths without attempting a read', () => {
    vi.mocked(store.resolveVoteRecordsPath).mockReturnValue(undefined);
    const read = vi.spyOn(store, 'readVoteRecords');
    expect(qualify()).toEqual({ status: 'unavailable', reason: 'ledger-path-unavailable' });
    expect(read).not.toHaveBeenCalled();
  });

  it('reports read permission errors without exposing raw error contents', () => {
    vi.spyOn(store, 'readVoteRecords').mockImplementation(() => {
      throw new Error('EACCES private contextual text');
    });
    expect(qualify()).toEqual({ status: 'unavailable', reason: 'ledger-unreadable' });
  });

  it('rejects a malformed line beside a valid approval', () => {
    save(record());
    writeFileSync(ledger, `${JSON.stringify(record())}\n{truncated`);
    expect(qualify()).toEqual({ status: 'invalid', reason: 'ledger-invalid' });
  });

  it('rejects self-hash and reasoning-commitment tampering', () => {
    const approved = record();
    save({ ...approved, proposalHash: '0'.repeat(64) });
    expect(qualify()).toEqual({ status: 'invalid', reason: 'ledger-invalid' });
    save({ ...approved, voters: approved.voters.map((v) => ({ ...v, reasoning: 'altered' })) });
    expect(qualify()).toEqual({ status: 'invalid', reason: 'ledger-invalid' });
  });

  it('rejects duplicate IDs even when both records individually verify', () => {
    save(record(), record());
    expect(qualify()).toEqual({ status: 'invalid', reason: 'ledger-ambiguous' });
  });

  it('does not treat an absent target as approval', () => {
    save(record());
    expect(qualify(PROPOSAL, 'missing-record')).toEqual({
      status: 'unavailable',
      reason: 'approval-missing',
    });
  });

  it.each(['rejected', 'no_quorum'] as const)(
    'rejects an authoritative %s decision',
    (decision) => {
      save(record({ decision }));
      expect(qualify()).toEqual({ status: 'invalid', reason: 'approval-not-approved' });
    }
  );

  it('checks complete proposal equality, including supplemental context', () => {
    save(record());
    expect(qualify(`${PROPOSAL}\nDifferent context`)).toEqual({
      status: 'invalid',
      reason: 'proposal-mismatch',
    });
  });

  it.each(['plain unframed proposal', PROPOSAL.replace('Implement feature.', 'Altered feature.')])(
    'rejects absent or invalid artifact framing even with a matching canonical proposal hash',
    (proposal) => {
      save(record({ proposal, proposalHash: hashProposal(proposal) }));
      expect(qualify(proposal)).toEqual({ status: 'invalid', reason: 'artifact-invalid' });
    }
  );

  it.each(['\uD800', '\0'])('rejects lossy or invalid supplemental proposal text', (suffix) => {
    const proposal = `${PROPOSAL}\n${suffix}`;
    save(record({ proposalHash: hashProposal(proposal) }));
    expect(qualify(proposal)).toEqual({ status: 'invalid', reason: 'artifact-invalid' });
  });

  it('verifies the full proposal hash even when the stored proposal summary is truncated', () => {
    const proposal = inlineVoteArtifactText('Review.', 'Complete plan. '.repeat(100), 'plan.txt');
    const approved = record({
      proposal: proposal.slice(0, 500) + '...',
      proposalHash: hashProposal(proposal),
    });
    save(approved);
    expect(qualify(proposal)).toMatchObject({ status: 'qualified', recordHash: approved.hash });
  });

  it('rejects a valid individual record in a ledger with a sequence gap', () => {
    save(record({ sequence: 1 }));
    expect(qualify()).toEqual({ status: 'invalid', reason: 'ledger-invalid' });
  });

  it('requires recorded absolute-quorum provenance', () => {
    save(record({ errorPolicy: undefined }));
    expect(qualify()).toEqual({ status: 'unavailable', reason: 'approval-policy-unavailable' });
    save(record({ errorPolicy: 'reduce_denominator' }));
    expect(qualify()).toEqual({ status: 'invalid', reason: 'approval-policy-mismatch' });
  });

  it('does not certify empty, errored, duplicate, or unverifiable panel coverage', () => {
    save(record({ voters: [], voteCounts: { approve: 0, reject: 0, abstain: 0, total: 0 } }));
    expect(qualify()).toEqual({ status: 'unavailable', reason: 'approval-coverage-unavailable' });
    save(
      record({ panelCoverage: { requested: 4, responded: 3, errored: 1, erroredRoles: ['pm'] } })
    );
    expect(qualify()).toEqual({ status: 'unavailable', reason: 'approval-coverage-unavailable' });
    save(record({ voters: record().voters.map((v) => ({ ...v, role: 'architect' })) }));
    expect(qualify()).toEqual({ status: 'unavailable', reason: 'approval-coverage-unavailable' });
    save(record({ voters: record().voters.map((v) => ({ ...v, unverifiable: true })) }));
    expect(qualify()).toEqual({ status: 'unavailable', reason: 'approval-coverage-unavailable' });
  });

  it('passes redactions to canonical verification but refuses redacted target review evidence', () => {
    const approved = record();
    const redaction = buildRedactionRecord({
      id: 'redaction-test',
      sequence: 1,
      targetId: approved.id,
      targetVoterRoles: ['architect'],
      at: '2026-10-27T01:00:00.000Z',
      by: 'test-owner',
      reason: 'Remove private context',
    });
    save(
      { ...approved, voters: redactVoterOpenings(approved.voters, new Set(['architect'])) },
      redaction
    );
    expect(qualify()).toEqual({ status: 'unavailable', reason: 'approval-evidence-redacted' });
  });
});
