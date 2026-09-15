/**
 * Remove a named voter's commitment opening and append its redaction (#6265).
 * Validates the caller's objects without re-emitting Zod's key order; verifies
 * the candidate before an atomic replacement. Git history is never rewritten.
 * Operator-run, not a CI gate. Redaction signatures are unsupported by the
 * strict redaction schema and signCommitted (which accepts VoteRecord only).
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  buildRedactionRecord,
  RedactionRecordSchema,
  type RedactionRecord,
} from '../packages/nexus-agents/src/audit/redaction-record.js';
import { isReasoningDigestTier } from '../packages/nexus-agents/src/audit/reasoning-commitment.js';
import {
  VoteRecordSchema,
  verifyVoteRecordSet,
  type VoteRecord,
  type VoteRecordVerification,
} from '../packages/nexus-agents/src/audit/vote-record.js';
import {
  parseVoteRecordsText,
  VOTE_RECORDS_PATH_ENV,
  VOTE_RECORDS_REL_PATH,
} from '../packages/nexus-agents/src/audit/vote-record-store.js';
import { serializeValidatedRecord } from '../packages/nexus-agents/src/audit/ledger-append.js';
import { assertNotSourceCheckoutWrite } from '../packages/nexus-agents/src/audit/source-checkout-guard.js';
import { parseRedactArgs } from './redact-vote-record-args.js';

export interface RedactVoteRecordOptions {
  readonly ledgerPath: string;
  readonly recordId: string;
  readonly roles: readonly string[];
  readonly by: string;
  readonly reason: string;
}
export type RedactOutcome =
  | {
      readonly kind: 'redacted';
      readonly record: RedactionRecord;
      readonly signing: 'unsigned-unsupported';
    }
  | { readonly kind: 'refused'; readonly detail: string };
type Verified = Extract<VoteRecordVerification, { ok: true }>;

/** Empty/invalid ledgers never count as a verified redaction. */
function verifyText(text: string): Verified {
  const parsed = parseVoteRecordsText(text);
  if (parsed.invalidLines.length > 0)
    throw new Error('invalid ledger line(s): ' + parsed.invalidLines.join(', '));
  const verdict = verifyVoteRecordSet(parsed.records, parsed.redactions);
  if (!verdict.ok)
    throw new Error(`verification failed: ${verdict.reason} at '${verdict.recordId}'`);
  if (verdict.notVerified === 'empty') throw new Error('empty ledger: no records verified');
  return verdict;
}

/** Locate exactly one target; a duplicate id cannot select an unambiguous line. */
function locateTarget(
  text: string,
  opts: RedactVoteRecordOptions
): { target: VoteRecord; sequence: number } {
  if (opts.roles.length === 0) throw new Error('at least one role is required');
  const { records, redactions, invalidLines } = parseVoteRecordsText(text);
  if (invalidLines.length > 0)
    throw new Error('invalid ledger line(s): ' + invalidLines.join(', '));
  const targets = records.filter((r) => r.id === opts.recordId);
  if (targets.length === 0) throw new Error(`unknown record id '${opts.recordId}'`);
  if (targets.length !== 1) throw new Error(`multiple records with id '${opts.recordId}'`);
  const target = targets[0] as VoteRecord;
  if (!isReasoningDigestTier(target.version)) {
    throw new Error('redaction here is a history rewrite; not performed');
  }
  requireOpenings(target, opts.roles);
  // Nonempty: the target was found. Include BOTH record kinds in the maximum.
  let max = target.sequence;
  for (const record of [...records, ...redactions]) max = Math.max(max, record.sequence);
  const sequence = max + 1;
  if (!Number.isSafeInteger(sequence) || sequence <= target.sequence) {
    throw new Error('redaction sequence must safely advance past the target and ledger tip');
  }
  return { target, sequence };
}

/** A named role must have entries, all carrying both halves of the opening. */
function requireOpenings(target: VoteRecord, roles: readonly string[]): void {
  for (const role of roles) {
    const entries = target.voters.filter((v) => v.role === role);
    if (entries.length === 0) throw new Error(`role '${role}' has no entry`);
    for (const entry of entries) {
      if (entry.reasoning === undefined || entry.reasoningNonce === undefined) {
        throw new Error(`role '${role}' has no opening`);
      }
    }
  }
}

/** Only the selected line is serialized, with its original insertion order. */
function rewriteTarget(text: string, recordId: string, roles: ReadonlySet<string>): string {
  return text
    .split('\n')
    .map((line) => {
      if (line.trim() === '') return line;
      const raw: unknown = JSON.parse(line);
      // Schema for validation ONLY. Writing parsed.data would reorder the keys.
      if (!VoteRecordSchema.safeParse(raw).success) return line;
      const record = raw as VoteRecord;
      if (record.id !== recordId) return line;
      if (JSON.stringify(raw) !== line)
        throw new Error('target line is not canonical JSON.stringify output');
      for (const voter of record.voters) {
        if (!roles.has(voter.role)) continue;
        delete voter.reasoning;
        delete voter.reasoningNonce;
      }
      return serializeValidatedRecord(VoteRecordSchema, record, 'vote').slice(0, -1);
    })
    .join('\n');
}

/** Require the new target report and preserve every other pre-existing state. */
function verifyCandidate(text: string, before: Verified, recordId: string): void {
  const after = verifyText(text);
  const reports = after.redacted ?? [];
  if (!reports.some((r) => r.recordId === recordId)) throw new Error('target is not redacted');
  const others = (v: Verified): string =>
    JSON.stringify((v.redacted ?? []).filter((r) => r.recordId !== recordId));
  if (others(before) !== others(after))
    throw new Error('another record changed verification state');
}

/** Same-directory exclusive temp file; errors before rename leave the ledger intact. */
function replaceAtomically(path: string, original: Buffer, candidate: string): void {
  const temp = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    writeFileSync(temp, candidate, {
      encoding: 'utf8',
      flag: 'wx',
      mode: statSync(path).mode & 0o777,
    });
    if (!readFileSync(temp).equals(Buffer.from(candidate, 'utf8')))
      throw new Error('temporary ledger read-back differs');
    if (!readFileSync(path).equals(original))
      throw new Error('ledger changed during redaction; retry');
    renameSync(temp, path);
  } finally {
    rmSync(temp, { force: true });
  }
}

/** Refuse before writing on any validation or verifier failure; never repair a broken ledger. */
export function redactVoteRecord(opts: RedactVoteRecordOptions): RedactOutcome {
  assertNotSourceCheckoutWrite(opts.ledgerPath, VOTE_RECORDS_REL_PATH, VOTE_RECORDS_PATH_ENV);
  try {
    const bytes = readFileSync(opts.ledgerPath);
    const original = bytes.toString('utf8');
    if (!Buffer.from(original, 'utf8').equals(bytes))
      throw new Error('ledger is not lossless UTF-8');
    const { target, sequence } = locateTarget(original, opts);
    const before = verifyText(original);
    const record = buildRedactionRecord({
      id: randomUUID(),
      sequence,
      targetId: target.id,
      targetVoterRoles: [...new Set(opts.roles)],
      at: new Date().toISOString(),
      by: opts.by,
      reason: opts.reason,
    });
    const appended = serializeValidatedRecord(RedactionRecordSchema, record, 'redaction');
    const rewritten = rewriteTarget(original, target.id, new Set(opts.roles));
    const candidate = rewritten + (rewritten.endsWith('\n') ? '' : '\n') + appended;
    verifyCandidate(candidate, before, target.id);
    replaceAtomically(opts.ledgerPath, bytes, candidate);
    return { kind: 'redacted', record, signing: 'unsigned-unsupported' };
  } catch (error: unknown) {
    return { kind: 'refused', detail: error instanceof Error ? error.message : String(error) };
  }
}

function fail(message: string): never {
  console.error(`[redact-vote-record] ${message.replace(/[\r\n\u2028\u2029]+/g, ' ')}`);
  process.exit(1);
}

function main(): void {
  const args = parseRedactArgs(process.argv.slice(2));
  if (!args.ok) fail(args.error);
  const outcome = redactVoteRecord(args);
  if (outcome.kind === 'refused') fail(outcome.detail);
  // Do not cast a redaction to VoteRecord to call signCommitted: the strict
  // redaction schema has no signature slot. The requested flags cannot attest
  // an owner or sign this kind until the audit signature contract is extended.
  console.log(
    `[redact-vote-record] redacted '${args.recordId}'; appended '${outcome.record.id}' ` +
      `at sequence ${String(outcome.record.sequence)}. UNSIGNED: redaction signing is unsupported; ` +
      '--signing-key and --as-owner cannot sign or attest this record kind.'
  );
}

if (process.argv[1]?.endsWith('redact-vote-record.ts') === true) main();
