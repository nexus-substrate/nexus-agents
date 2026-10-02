/** Live panel judgments and reproducible owner samples for remediation soak. */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ParsedCliArgs } from '../cli-types.js';
import { createLogger, getErrorMessage, getTimeProvider } from '../core/index.js';
import { executeVoting } from '../mcp/tools/consensus-vote.js';
import { ConsensusVoteInputSchema } from '../mcp/tools/consensus-vote-types.js';
import { recordAuthenticVote } from '../mcp/tools/consensus-vote-recording.js';
import {
  getRemediationSoakFile,
  RemediationSoakRecordSchema,
} from '../mcp/tools/improvement-remediation-shadow.js';
import { buildRemediationPanelProposal } from '../mcp/tools/remediation-review-proposal.js';
import {
  drawRemediationReviewSample,
  getRemediationReviewSampleStore,
  getRemediationReviewStore,
  hashSoakRecordLine,
  pendingSoakSelections,
  readRemediationReviewRecords,
  soakRefOf,
} from '../mcp/tools/remediation-review.js';

/** Reject missing, fractional or nonpositive batch/sample limits. */
function positiveCount(value: string | undefined, flag: string): number {
  const n = value === undefined ? Number.NaN : Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error(`${flag} must be a positive integer`);
  return n;
}

/** A single parsed soak snapshot; duplicate coordinates cannot bind one artifact. */
interface SoakSnapshot {
  readonly path: string;
  readonly raw: string;
  readonly lines: Map<string, string>;
  readonly soak: Map<string, { signalKey: string; timestamp: string }>;
  readonly malformedSoakLines: number;
  readonly duplicateSoakRefs: readonly string[];
}

function soakSnapshot(): SoakSnapshot {
  const path = getRemediationSoakFile();
  const raw = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const lines = new Map<string, string>();
  const soak = new Map<string, { signalKey: string; timestamp: string }>();
  const duplicates = new Set<string>();
  let malformedSoakLines = 0;
  for (const line of raw.split('\n')) {
    if (line.trim() === '') continue;
    let record;
    try {
      record = RemediationSoakRecordSchema.parse(JSON.parse(line));
    } catch {
      malformedSoakLines++;
      continue;
    }
    const ref = soakRefOf(record);
    if (duplicates.has(ref) || lines.has(ref)) {
      duplicates.add(ref);
      lines.delete(ref);
      soak.delete(ref);
      continue;
    }
    lines.set(ref, line);
    soak.set(ref, record);
  }
  return { path, raw, lines, soak, malformedSoakLines, duplicateSoakRefs: [...duplicates] };
}

/** Run exactly one engine invocation and require a durable vote before recording a judgment. */
async function judgeLine(
  ref: string,
  raw: string,
  quick: boolean,
  snapshot: SoakSnapshot
): Promise<void> {
  const proposal = buildRemediationPanelProposal(raw);
  const input = ConsensusVoteInputSchema.parse({
    proposal,
    strategy: 'higher_order',
    errorPolicy: 'absolute_quorum',
    quickMode: quick,
    simulateVotes: false,
  });
  const voting = await executeVoting(input, createLogger({ component: 'remediation-panel' }));
  if (voting.decision !== 'approved' && voting.decision !== 'rejected') {
    throw new Error(voting.decision ?? 'vote has no decision');
  }
  if (voting.votes.length === 0 || voting.votes.some((v) => v.source !== 'llm')) {
    throw new Error('Panel contains absent, errored or simulated seats');
  }
  const persisted = await recordAuthenticVote({
    proposal,
    strategy: 'higher_order',
    result: voting.result,
    votes: voting.votes,
    declaredOptions: undefined,
    resolvedDecision: voting.decision,
    errorPolicy: 'absolute_quorum',
  });
  if (!persisted.persisted) throw new Error(persisted.detail);
  if (readFileSync(snapshot.path, 'utf8') !== snapshot.raw)
    throw new Error('Soak hash mismatch: artifact changed during vote');
  const id = persisted.record.id;
  const stored = getRemediationReviewStore().record(
    {
      soakRef: ref,
      reviewedAt: getTimeProvider().nowIso(),
      reviewed: true,
      sound: voting.decision === 'approved',
      judgeKind: 'panel',
      evaluator: `panel:${id}`,
      voteRecordId: id,
      voteLedgerPath: resolve(persisted.path),
      soakRecordHash: hashSoakRecordLine(raw),
    },
    raw
  );
  if (!stored) throw new Error('Panel judgment persistence failed');
}

/** Batch failures are reported per ref and never converted into unsound verdicts. */
export async function runPanelJudge(args: ParsedCliArgs): Promise<void> {
  const batch = positiveCount(args.options.batch, '--batch');
  const snapshot = soakSnapshot();
  const { lines, malformedSoakLines, duplicateSoakRefs } = snapshot;
  const reviews = readRemediationReviewRecords(undefined, snapshot.raw.split('\n'), snapshot.lines);
  const pending = pendingSoakSelections([...snapshot.soak.values()], reviews).slice(0, batch);
  const failures: { soakRef: string; error: string }[] = [];
  let judged = 0;
  // Empty pending set is explicitly zero judgments, with no engine or persistence calls.
  for (const item of pending) {
    try {
      await judgeLine(item.soakRef, lines.get(item.soakRef) ?? '', args.options.quick, snapshot);
      judged++;
    } catch (error: unknown) {
      failures.push({ soakRef: item.soakRef, error: getErrorMessage(error) });
    }
  }
  const result = {
    judged,
    attempted: pending.length,
    malformedSoakLines,
    duplicateSoakRefs,
    failures,
  };
  process.stdout.write(
    args.options.format === 'json'
      ? `${JSON.stringify(result, null, 2)}\n`
      : `${String(judged)} panel judgment(s) recorded of ${String(pending.length)} attempted\n${String(malformedSoakLines)} malformed soak line(s) skipped\n${duplicateSoakRefs.map((ref) => `${ref}: duplicate soak ref skipped\n`).join('')}${failures.map((f) => `${f.soakRef}: ${f.error}\n`).join('')}`
  );
}

/** Persist the crypto-seeded draw and its panel snapshots before the owner marks it. */
export function runSample(args: ParsedCliArgs): void {
  const n = positiveCount(args.options.n ?? '10', '--n');
  const owner = args.options.owner?.trim();
  if (owner === undefined || owner === '')
    throw new Error('remediation-review sample: a named --owner is required');
  const sample = drawRemediationReviewSample(
    readRemediationReviewRecords(undefined, undefined, undefined, true),
    n,
    owner,
    args.options.seed
  );
  if (sample.refs.length === 0) throw new Error('No panel-judged refs to sample');
  if (!getRemediationReviewSampleStore().record(sample))
    throw new Error('Sample persistence failed');
  process.stdout.write(
    args.options.format === 'json'
      ? `${JSON.stringify({ sample }, null, 2)}\n`
      : `Sample ${sample.id} (${String(sample.refs.length)} refs; seed ${sample.seed}):\n${sample.refs.map((ref) => `  ${ref}`).join('\n')}\n`
  );
}
