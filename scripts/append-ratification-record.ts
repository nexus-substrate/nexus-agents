/**
 * Caller-commits append of a ratification vote record (#5130 step 1).
 *
 * A `consensus_vote` persists its authentic record to the RUNTIME store
 * (`<repo>/.nexus-agents/governance/vote-records.jsonl`, gitignored — #3991).
 * The gates read the COMMITTED ledger (`governance/vote-records.jsonl`), which
 * nothing wrote until this script existed: every governor-path gate read a
 * 0-byte file and exited 0 (#5118). This is the bridge the `#3991` deferral
 * comment promised. It copies ONE record from the runtime store into the
 * committed ledger so the caller can commit it in the PR it ratifies; CI never
 * needs push access.
 *
 * ## What it refuses
 *
 * The record must carry `ratifiesPr` (#5130 panel Q1, option A: bound to
 * `{pr, headSha}`), its own self-hash must verify against the copy in the
 * runtime store, and `decision` must be `approved`. The committed ledger must
 * verify BEFORE the append (a tampered ledger is never extended, so the
 * append cannot launder it) and is re-read and verified AFTER it (a write
 * that merged with an unterminated last line would otherwise land as an
 * unparseable record the chain has moved past). Each refusal names its reason
 * and the path involved; an empty committed ledger is the first-record case,
 * not an error, and a missing runtime store is an error that names the path.
 *
 * ## Re-linking: why the committed copy's hash differs from the source copy's
 *
 * The ledger is a record SET with a hash-covered monotonic `sequence`, not a
 * linear chain (#3927): `sequence` is inside the self-hash precisely so that
 * editing it is tamper-evident, and `previousHash` is advisory and outside it.
 * A record copied verbatim from a runtime store at sequence 311 into an empty
 * committed ledger would fail `verifyVoteRecordSet` with `sequence_gap`
 * forever, so it MUST be re-sequenced to `(max committed sequence) + 1` — and
 * re-sequencing necessarily recomputes the hash. Every content field (`id`,
 * `recordedAt`, `proposalHash`, `proposal`, `strategy`, `decision`,
 * `approvalPercentage`, `voteCounts`, `voters`, `correlationId`, the option
 * and panel coverage, `ratifies`, `ratifiesPr`) is carried verbatim; only
 * `sequence`, `previousHash` and therefore `hash` are ledger-local. The
 * source copy's hash is verified BEFORE the copy, and the committed record is
 * self-hashed under the committed ledger's own sequence. `id` is preserved and
 * unique per ledger, so the same record can be matched across the two stores
 * and a re-run is idempotent.
 *
 * ## What the self-hash check does NOT prove (disclosed limit)
 *
 * The source check refuses a record edited WITHOUT re-hashing. A record edited
 * and re-hashed with the exported `computeVoteRecordHash`, or fabricated
 * outright, passes it and is appended — the caller-commits path TRUSTS the
 * operator's runtime store, exactly as the verifier JSDoc and the audit
 * hash-chain threat model state for author-typed records (tamper-EVIDENT, not
 * tamper-PROOF). Provenance is step 2's job — the gate cross-checks the
 * record against the job sidecar and the PR tally comment — or signing
 * (#3927 item 4). `append-ratification-record.test.ts` pins this limit with a
 * test that asserts the re-hashed edit IS appended, so signing has a RED test
 * to flip.
 *
 * ## Signing (#3927 item 4, phase 2)
 *
 * After the copy is re-sequenced and re-hashed — never before — the COMMITTED
 * hash is signed with `ssh-keygen -Y sign -n nexus-vote-record` when a key is
 * configured (`--signing-key <path>`, else `NEXUS_VOTE_SIGNING_KEY`), and the
 * `signature` lands on the record OUTSIDE its self-hash. The signer's identity
 * is whatever `governance/allowed_signers` (next to the ledger) lists the key
 * under; a key the file does not list is `signing-failed`, nothing written —
 * a signature no gate could verify is a defect at the moment of signing, not
 * later. With no key configured the record is appended UNSIGNED and the CLI
 * says so in one line: phase 2 is opt-in until the phase-3 cutover constant
 * makes an unsigned record a gate refusal. A stale `signature` on the SOURCE
 * copy is dropped with `hash` and `sequence`: it could only be over the
 * source hash. What a signature proves is key access from this environment,
 * not a human's presence (#6257; threat model).
 *
 * Two branches that each append from the same committed tip produce two
 * records at the same sequence; `merge=union` (`.gitattributes`) concatenates
 * them and the verifier reports the duplicate as a benign `forks` entry
 * (tested with real git in `append-ratification-record.test.ts`). The same
 * merge can also land two records with ONE `id` and different content (two
 * branches appending the same id): today that is a fork the verifier
 * tolerates and a later append reports as `already-present`; whether two
 * records under one id is a refusal is step 2's decision, not this script's.
 *
 * Usage (from the repo root, after the vote):
 *   pnpm exec tsx scripts/append-ratification-record.ts --record-id <voteRecordId>
 *   pnpm exec tsx scripts/append-ratification-record.ts --job <jobId>
 * Options: `--source <path>` (default: the runtime store `resolveVoteRecordsPath()`
 * resolves), `--ledger <path>` (default: `<repo>/governance/vote-records.jsonl`),
 * `--signing-key <path>` (default: `NEXUS_VOTE_SIGNING_KEY`; neither ⇒ unsigned).
 * Then `git add governance/vote-records.jsonl` and commit it in the ratified PR.
 *
 * Operator-run by design (listed in `check-script-wiring.ts` MANUAL_ONLY).
 *
 * @module scripts/append-ratification-record
 * (Source: Issue #5130, #5118, #3991)
 */

/* eslint-disable no-console */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

import type { VoteRecord } from '../packages/nexus-agents/src/audit/vote-record.js';
import type { RedactionRecord } from '../packages/nexus-agents/src/audit/redaction-record.js';
import { findReasoningCommitmentDefect } from '../packages/nexus-agents/src/audit/reasoning-commitment.js';
import {
  VoteRecordSchema,
  computeVoteRecordHash,
  verifyVoteRecordSet,
} from '../packages/nexus-agents/src/audit/vote-record.js';
import {
  VOTE_RECORDS_PATH_ENV,
  VOTE_RECORDS_REL_PATH,
  parseVoteRecordsText,
  readVoteRecords,
  resolveVoteRecordsPath,
} from '../packages/nexus-agents/src/audit/vote-record-store.js';
import { serializeValidatedRecord } from '../packages/nexus-agents/src/audit/ledger-append.js';
import { assertNotSourceCheckoutWrite } from '../packages/nexus-agents/src/audit/source-checkout-guard.js';
import type { JobResult } from '../packages/nexus-agents/src/mcp/jobs/job-result-store.js';
import { readJobResult } from '../packages/nexus-agents/src/mcp/jobs/job-result-store.js';
import { findRepoRoot } from '../packages/nexus-agents/src/config/repo-root-detection.js';
import { nexusDataPath } from '../packages/nexus-agents/src/config/nexus-data-dir.js';
import type { SigningOptions, SigningState } from './append-ratification-signing.js';
import { resolveSigning, signCommitted, signingNotice } from './append-ratification-signing.js';

/** Why an append was refused. Every value names a check that ran and failed. */
export type AppendRefusalReason =
  | 'source-missing'
  | 'record-not-found'
  | 'source-hash-mismatch'
  | 'not-bound'
  | 'not-approved'
  | 'ledger-invalid'
  | 'signing-failed'
  | 'appended-ledger-invalid';

export type AppendOutcome =
  | {
      readonly kind: 'appended';
      /** The committed copy: re-sequenced, re-hashed, content verbatim. */
      readonly record: VoteRecord;
      /** The runtime-store copy it was made from. */
      readonly sourceRecord: VoteRecord;
      readonly ledgerPath: string;
      /** True when the committed ledger was empty — this is its first record. */
      readonly first: boolean;
      /** `signed` when `signing` was configured and the record carries a verified signature; `unsigned-no-key` when it was not. */
      readonly signing: SigningState;
    }
  | { readonly kind: 'already-present'; readonly recordId: string; readonly ledgerPath: string }
  | { readonly kind: 'refused'; readonly reason: AppendRefusalReason; readonly detail: string };

export interface AppendRatificationRecordOptions {
  /** The runtime store to copy from (`resolveVoteRecordsPath()` in the CLI). */
  readonly sourcePath: string;
  /** The committed ledger to append to (`<repo>/governance/vote-records.jsonl` in the CLI). */
  readonly ledgerPath: string;
  /** The `id` of the record to copy (`voteRecordId` on the `consensus_vote` result). */
  readonly recordId: string;
  /**
   * Sign the committed hash (#3927 item 4, phase 2). Absent ⇒ appended
   * unsigned. See `append-ratification-signing.ts`.
   */
  readonly signing?: SigningOptions;
}

function refused(reason: AppendRefusalReason, detail: string): AppendOutcome {
  return { kind: 'refused', reason, detail };
}

type SourceStep = { ok: true; record: VoteRecord } | { ok: false; outcome: AppendOutcome };

/** Locate the source record by id; every miss names the path. */
function locateSourceRecord(sourcePath: string, recordId: string): SourceStep {
  if (!existsSync(sourcePath)) {
    return {
      ok: false,
      outcome: refused(
        'source-missing',
        `runtime vote-record store not found at ${sourcePath}. The vote persists there at vote time; ` +
          `set ${VOTE_RECORDS_PATH_ENV} or pass --source if the MCP server wrote elsewhere.`
      ),
    };
  }
  const { records, invalidLines } = readVoteRecords(sourcePath);
  const record = records.find((r) => r.id === recordId);
  if (record === undefined) {
    const invalidNote =
      invalidLines.length > 0
        ? ` (${String(invalidLines.length)} line(s) in that file did not parse: ${invalidLines.join(', ')})`
        : '';
    return {
      ok: false,
      outcome: refused(
        'record-not-found',
        `no record with id '${recordId}' in ${sourcePath}${invalidNote}. The id is the ` +
          '`voteRecordId` on the consensus_vote result.'
      ),
    };
  }
  return { ok: true, record };
}

/** Vet a located source record: self-hash, PR binding, approval — in that order. */
function vetSourceRecord(record: VoteRecord, sourcePath: string): SourceStep {
  const recordId = record.id;
  // The source copy's own hash must verify: the committed record is re-hashed
  // under a new sequence, so an edit WITHOUT a re-hash would otherwise be
  // laundered into a cleanly self-hashed committed line. An edit WITH a
  // re-hash passes — see the module header's disclosed limit. The SELF-hash
  // only — not
  // `verifyVoteRecordSet([record])`, whose sequence census would call a lone
  // record at sequence 311 a gap; the runtime store's coverage is not what is
  // being copied.
  const recomputed = computeVoteRecordHash(record);
  if (record.hash.length === 0 || recomputed !== record.hash) {
    return {
      ok: false,
      outcome: refused(
        'source-hash-mismatch',
        `record '${recordId}' in ${sourcePath} fails its own self-hash: stored ` +
          `${record.hash || '(none)'} vs recomputed ${recomputed}. A record edited without re-hashing is not copied.`
      ),
    };
  }
  // #6263: on the digest tier the self-hash folds a salted digest of each
  // voter's reasoning, not the text, so an edited text leaves the hash intact
  // and only the commitment breaks. Checked HERE, not left to the read-back
  // after the append, so the line is never written. The empty set (#6264): a
  // record copied INTO the committed ledger must carry every opening — a
  // redaction happens on the committed ledger afterwards (#6265), with its
  // own record there; a source entry already missing its opening is refused.
  const commitment = findReasoningCommitmentDefect(record, new Set<string>());
  if (commitment !== null) {
    return {
      ok: false,
      outcome: refused(
        'source-hash-mismatch',
        `record '${recordId}' in ${sourcePath} fails its reasoning commitment: ${commitment}. ` +
          'A record whose reasoning was edited without re-committing is not copied.'
      ),
    };
  }
  if (record.ratifiesPr === undefined) {
    return {
      ok: false,
      outcome: refused(
        'not-bound',
        `record '${recordId}' carries no ratifiesPr binding — it is not a PR ratification. ` +
          'Re-run the vote with ratifiesPr: { pr, headSha } (#5130).'
      ),
    };
  }
  if (record.decision !== 'approved') {
    return {
      ok: false,
      outcome: refused(
        'not-approved',
        `record '${recordId}' has decision '${record.decision}', not 'approved'; only an ` +
          'approving panel ratifies.'
      ),
    };
  }
  return { ok: true, record };
}

/** The committed ledger's current text and verified records (empty file ⇒ no records). */
function loadLedger(
  ledgerPath: string
):
  | { ok: true; text: string; records: VoteRecord[]; redactions: RedactionRecord[] }
  | { ok: false; outcome: AppendOutcome } {
  const text = existsSync(ledgerPath) ? readFileSync(ledgerPath, 'utf-8') : '';
  const { records, redactions, invalidLines } = parseVoteRecordsText(text);
  if (invalidLines.length > 0) {
    return {
      ok: false,
      outcome: refused(
        'ledger-invalid',
        `${ledgerPath} has ${String(invalidLines.length)} unparseable/invalid line(s) at ` +
          `${invalidLines.join(', ')}; nothing is appended to a ledger that does not read back.`
      ),
    };
  }
  // A tampered committed ledger is never extended: an append onto it would
  // read as "the chain moved on past the edit". `notVerified: 'empty'` is the
  // legitimate first-record case and passes here. A `redacted` record (#6264)
  // is ok — the tally is still hash-covered — and is appended past.
  const verdict = verifyVoteRecordSet(records, redactions);
  if (!verdict.ok) {
    return {
      ok: false,
      outcome: refused(
        'ledger-invalid',
        `${ledgerPath} fails tamper-evidence verification (${verdict.reason}) at record ` +
          `'${verdict.recordId}': ${verdict.detail}. Repair the ledger before appending.`
      ),
    };
  }
  return { ok: true, text, records, redactions };
}

/**
 * Rebuild the record under the committed ledger's next sequence — past BOTH
 * kinds of line (#6264): a redaction record holds a sequence too, and a vote
 * appended onto its number would read as a fork. `previousHash` (advisory)
 * is the highest-sequence line's, whichever kind. A `signature` on the source
 * is dropped with the other ledger-local fields: it could only have been made
 * over the source hash, which the committed copy does not carry.
 */
function relink(
  source: VoteRecord,
  committed: readonly { readonly sequence: number; readonly hash: string }[]
): VoteRecord {
  const {
    hash: _hash,
    sequence: _sequence,
    previousHash: _previousHash,
    signature: _signature,
    ...content
  } = source;
  let tip: { readonly sequence: number; readonly hash: string } | undefined;
  for (const r of committed) if (tip === undefined || r.sequence >= tip.sequence) tip = r;
  const payload: Omit<VoteRecord, 'hash'> = {
    ...content,
    sequence: (tip?.sequence ?? -1) + 1,
    ...(tip !== undefined ? { previousHash: tip.hash } : {}),
  };
  return { ...payload, hash: computeVoteRecordHash(payload) };
}

/**
 * Copy one PR-bound, approved, hash-verified record from the runtime store into
 * the committed ledger as its next sequence. See the module header for the
 * refusal set and the re-linking rule. Pure apart from the append itself.
 */
export function appendRatificationRecord(opts: AppendRatificationRecordOptions): AppendOutcome {
  const located = locateSourceRecord(opts.sourcePath, opts.recordId);
  if (!located.ok) return located.outcome;
  const source = vetSourceRecord(located.record, opts.sourcePath);
  if (!source.ok) return source.outcome;

  const ledger = loadLedger(opts.ledgerPath);
  if (!ledger.ok) return ledger.outcome;
  if (ledger.records.some((r) => r.id === opts.recordId)) {
    return { kind: 'already-present', recordId: opts.recordId, ledgerPath: opts.ledgerPath };
  }

  // Re-sequence and re-hash FIRST — past both vote and redaction lines — then
  // sign; the signature is over the hash the ledger will carry, so it can only
  // be made once that hash is final. Only the VOTE record is signed here: a
  // redaction record is never written by this script, and signing redactions
  // is #6265's concern (the redaction writer), not this append's.
  const signStep = signCommitted(
    relink(source.record, [...ledger.records, ...ledger.redactions]),
    opts.signing
  );
  if (!signStep.ok) return refused('signing-failed', signStep.detail);
  const record = signStep.record;

  // Before the write, not inside a try (#6070): a test that reached the source
  // checkout's tracked ledger must fail loudly, not skip the append quietly.
  assertNotSourceCheckoutWrite(opts.ledgerPath, VOTE_RECORDS_REL_PATH, VOTE_RECORDS_PATH_ENV);
  mkdirSync(dirname(opts.ledgerPath), { recursive: true });
  // A last line without its newline would swallow the appended record into
  // itself; terminate it first so the new record is its own line.
  const separator = ledger.text.length > 0 && !ledger.text.endsWith('\n') ? '\n' : '';
  appendFileSync(
    opts.ledgerPath,
    separator + serializeValidatedRecord(VoteRecordSchema, record, 'vote'),
    'utf-8'
  );

  const invalid = verifyAppended(opts.ledgerPath, opts.recordId);
  if (invalid !== null) return invalid;
  return {
    kind: 'appended',
    record,
    sourceRecord: source.record,
    ledgerPath: opts.ledgerPath,
    first: ledger.records.length === 0,
    signing: signStep.signing,
  };
}

/**
 * Read back what was written and verify the whole set: the claim is "the
 * committed ledger verifies after the append", measured on the bytes on
 * disk, not on the object in memory. Null when it does.
 */
function verifyAppended(ledgerPath: string, recordId: string): AppendOutcome | null {
  const after = readVoteRecords(ledgerPath);
  const verdict = verifyVoteRecordSet(after.records, after.redactions);
  if (after.invalidLines.length === 0 && verdict.ok) return null;
  const why = !verdict.ok
    ? `${verdict.reason} at '${verdict.recordId}': ${verdict.detail}`
    : `line(s) ${after.invalidLines.join(', ')} do not parse`;
  return refused(
    'appended-ledger-invalid',
    `${ledgerPath} does NOT verify after appending '${recordId}' (${why}). ` +
      'The line was written; do not commit the ledger until this is understood.'
  );
}

// ---------------------------------------------------------------------------
// --job: a consensus_vote job result names its record via `voteRecordId`.
// ---------------------------------------------------------------------------

export type JobRecordIdReason =
  'job-not-found' | 'job-not-complete' | 'job-not-consensus-vote' | 'job-without-record-id';

/**
 * The two shapes a stored consensus_vote job result takes: the handler's
 * `{ ok, value }` envelope, or the bare response. Only `voteRecordId` is read.
 */
const VoteJobResultShape = z.union([
  z.object({
    ok: z.literal(true),
    value: z.object({ voteRecordId: z.string().min(1).optional() }),
  }),
  z.object({ voteRecordId: z.string().min(1).optional() }),
]);

/** Extract the persisted record id from a job result; every miss names why. */
export function recordIdFromJobResult(
  job: JobResult | null,
  jobId: string
): { ok: true; recordId: string } | { ok: false; reason: JobRecordIdReason; detail: string } {
  if (job === null) {
    return {
      ok: false,
      reason: 'job-not-found',
      detail: `no job result for '${jobId}' at ${nexusDataPath('jobs', `result-${jobId}.json`)}.`,
    };
  }
  if (job.toolName !== 'consensus_vote') {
    return {
      ok: false,
      reason: 'job-not-consensus-vote',
      detail: `job '${jobId}' is a '${job.toolName}' job, not consensus_vote.`,
    };
  }
  if (job.status !== 'complete') {
    return {
      ok: false,
      reason: 'job-not-complete',
      detail: `job '${jobId}' is '${job.status}', not complete; nothing to append yet.`,
    };
  }
  const parsed = VoteJobResultShape.safeParse(job.result);
  const recordId = parsed.success
    ? 'value' in parsed.data
      ? parsed.data.value.voteRecordId
      : parsed.data.voteRecordId
    : undefined;
  if (recordId === undefined) {
    return {
      ok: false,
      reason: 'job-without-record-id',
      detail:
        `job '${jobId}' completed but its result carries no voteRecordId: either it ran before ` +
        '#5130 step 1 added the field, or the record was not persisted (voteRecordPersisted=false). ' +
        'Find the record in the runtime store and pass --record-id.',
    };
  }
  return { ok: true, recordId };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export interface AppendArgs {
  readonly ok: true;
  readonly selector: { readonly jobId: string } | { readonly recordId: string };
  readonly sourcePath?: string;
  readonly ledgerPath?: string;
  /** `--signing-key`; the CLI falls back to `NEXUS_VOTE_SIGNING_KEY` when absent. */
  readonly signingKeyPath?: string;
}

const USAGE =
  'usage: append-ratification-record.ts (--job <jobId> | --record-id <id>) [--source <path>] ' +
  '[--ledger <path>] [--signing-key <path>]';

/** Parse argv; exactly one selector, each option with a value, nothing unknown. */
export function parseAppendArgs(
  argv: readonly string[]
): AppendArgs | { readonly ok: false; readonly error: string } {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i] as string;
    if (!['--job', '--record-id', '--source', '--ledger', '--signing-key'].includes(flag)) {
      return { ok: false, error: `unknown argument '${flag}'. ${USAGE}` };
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      return { ok: false, error: `${flag} needs a value. ${USAGE}` };
    }
    values.set(flag, value);
    i++;
  }
  const jobId = values.get('--job');
  const recordId = values.get('--record-id');
  if ((jobId === undefined) === (recordId === undefined)) {
    return { ok: false, error: `pass exactly one of --job or --record-id. ${USAGE}` };
  }
  const sourcePath = values.get('--source');
  const ledgerPath = values.get('--ledger');
  const signingKeyPath = values.get('--signing-key');
  return {
    ok: true,
    selector: jobId !== undefined ? { jobId } : { recordId: recordId as string },
    ...(sourcePath !== undefined ? { sourcePath } : {}),
    ...(ledgerPath !== undefined ? { ledgerPath } : {}),
    ...(signingKeyPath !== undefined ? { signingKeyPath } : {}),
  };
}

function fail(message: string): never {
  console.error(`[append-ratification-record] ${message}`);
  process.exit(1);
}

/** The record id from `--record-id`, or resolved from the `--job` result; every miss exits 1 naming why. */
function resolveRecordId(selector: AppendArgs['selector']): string {
  if ('recordId' in selector) return selector.recordId;
  const resolved = recordIdFromJobResult(readJobResult(selector.jobId), selector.jobId);
  if (!resolved.ok) fail(`${resolved.reason}: ${resolved.detail}`);
  return resolved.recordId;
}

/** Print the outcome; exit 1 on a refusal. */
function reportOutcome(outcome: AppendOutcome): void {
  switch (outcome.kind) {
    case 'appended': {
      const b = outcome.record.ratifiesPr as NonNullable<VoteRecord['ratifiesPr']>;
      console.log(
        `[append-ratification-record] appended '${outcome.record.id}' to ${outcome.ledgerPath} ` +
          `as sequence ${String(outcome.record.sequence)}${outcome.first ? ' (first record)' : ''}: ` +
          `ratifies PR #${String(b.pr)} at ${b.headSha}, decision ${outcome.record.decision}. ` +
          'Commit the ledger in that PR.'
      );
      console.log(signingNotice(outcome.signing, outcome.record));
      return;
    }
    case 'already-present':
      console.log(
        `[append-ratification-record] '${outcome.recordId}' is already in ${outcome.ledgerPath}; nothing appended.`
      );
      return;
    case 'refused':
      fail(`${outcome.reason}: ${outcome.detail}`);
  }
}

function main(): void {
  const args = parseAppendArgs(process.argv.slice(2));
  if (!args.ok) fail(args.error);
  const recordId = resolveRecordId(args.selector);

  const sourcePath = args.sourcePath ?? resolveVoteRecordsPath();
  if (sourcePath === undefined) {
    fail(
      `could not resolve the runtime vote-record store; pass --source or set ${VOTE_RECORDS_PATH_ENV}.`
    );
  }
  const ledgerPath =
    args.ledgerPath ??
    ((): string => {
      const root = findRepoRoot(process.cwd());
      if (root === null) fail(`cwd ${process.cwd()} is not inside a repository; pass --ledger.`);
      return join(root, VOTE_RECORDS_REL_PATH);
    })();

  const signing = resolveSigning(args.signingKeyPath, process.env, ledgerPath);
  reportOutcome(
    appendRatificationRecord({
      sourcePath,
      ledgerPath,
      recordId,
      ...(signing !== undefined ? { signing } : {}),
    })
  );
}

if (process.argv[1]?.endsWith('append-ratification-record.ts') === true) {
  main();
}
