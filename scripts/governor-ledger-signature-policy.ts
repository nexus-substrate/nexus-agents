/**
 * Phase 3 of #3927 item 4 (#6279): the committed signature policy of the
 * ratification gate — which unsigned records the cutover grandfathers and
 * the refusal every other bound record earns without a verified signature,
 * and (#3927, closing gap) the same requirement over every record a PR ADDS
 * and, on the post-merge backstop, over the whole ledger — an unbound
 * unsigned record used to merge unrefused because no PR bound it.
 * A sibling of `governor-ledger-evidence.ts` for that file's line budget;
 * governor-owned like its parent (a change here moves the bar).
 *
 * @module scripts/governor-ledger-signature-policy
 */
import type { VoteRecord } from '../packages/nexus-agents/src/audit/vote-record.js';
import type {
  SignableLedgerRecord,
  VoteRecordSignatureVerdict,
} from '../packages/nexus-agents/src/audit/vote-record-signature.js';
import { parseVoteRecordsText } from '../packages/nexus-agents/src/audit/vote-record-store.js';
import type { RecordSignatureReport } from './governor-ledger-signature.js';

/**
 * Phase 3 of #3927 item 4 (#6279): the COMMITTED cutover. Measured on main
 * 2026-09-16 before choosing it: sequences 0–14 are unsigned (committed
 * before #6355 gave the loop a key), every record from 15 on is signed by
 * `nexus-agent@framework`. Named on the ratified line so a reader knows the
 * grandfathered range; the enforcement itself does NOT read `sequence`
 * (see {@link GRANDFATHERED_RECORD_HASHES}).
 */
export const SIGNATURE_CUTOVER_SEQUENCE = 15;

/**
 * The exact unsigned records the cutover grandfathers, by HASH — the 15
 * records the ledger carried unsigned on 2026-09-16, sequences 0–14. The
 * #6384 panel's architect and contrarian seats showed why the predicate
 * cannot be `sequence < cutover`: `sequence` is author-typed and the
 * verifier admits duplicate sequences (concurrent forks), so a forged record
 * stamped `sequence: 14` would have slipped under the bar. A hash is
 * self-certifying — it covers every authenticity field — and this set is
 * closed: any other bound record must be `signed`, whatever it says its
 * sequence is. Never extend it; a new unsigned record is a defect, not a
 * grandfather.
 */
export const GRANDFATHERED_RECORD_HASHES: ReadonlySet<string> = new Set([
  'a2606a0ff6cfaf51aa6836f4269036422e8d34492cbe187f66a15f7089f43007',
  'd007aacb890b3da7441cb8098ecf3ffb80f09fc67e66472396a7fa6d9580d9fa',
  'fc01fe3fddc966dcfc02ed795f601618af57644eb642b9656854e643ede63608',
  '3e837f71e38284f62a9308451ac96fc33213829aa186ee2de4b821167e864473',
  '55893ac21d093f02b1b3bdb1f4312bf35513bc37a43fc6616300e778f9bc0e97',
  '579cd509b5056355b0792bc38f3983ec74f73dfa60ff87753f7e64eb40d8ed67',
  '874aa912c9739c192e7236db1a8af774674d1380c2b7ee75d1c54672dfa5f18e',
  '9feb47f1978d3c599aa6393f52839742410a1637a991f6468d6f13c197476380',
  'd30ef600f76d1849c16bbb8a710dd020c30e605ef3441c5bb988f17f61314074',
  '03773ae41e6780df3cf561800feff0b9b4f24533d44d361ef5e82fbcc113fa76',
  'add4978066368747e4cd8785180d53ebdf0a893aab9605b3b6be1e80f601840c',
  '6e3eafca72bccbc70a657413ff974038bcdbafacc1b4d886065a808c3a4c79d1',
  '71a2eb20af9991d5b462df63bba0ce474d24741914fca9b12dd094664088b58c',
  '36bd7c7723377d744666b6bc39293787a2c93bd0186a6059393cab930cbca235',
  '4992f601c9bc6468c9624bb558abd7e91157217ce66070fc0e248be347de6c36',
]);

/** The refusal one unsigned (or unverifiable) bound record earns past the cutover. */
export interface SignatureRequiredFailure {
  readonly kind: 'signature-required';
  readonly record: VoteRecord;
  readonly verdict: VoteRecordSignatureVerdict;
}

/**
 * Phase 3 (#6279): every bound record outside {@link GRANDFATHERED_RECORD_HASHES}
 * whose signature verdict is not `signed`. No verifier supplied counts as
 * `signature-not-measured` for those records — a caller that cannot verify
 * cannot pass them. Records before the cutover are grandfathered and produce
 * nothing here; an empty bound set produces nothing (there is nothing to sign).
 */
export function signatureRequiredFailures(
  bound: readonly VoteRecord[],
  signatures: readonly RecordSignatureReport[] | undefined
): SignatureRequiredFailure[] {
  const failures: SignatureRequiredFailure[] = [];
  for (const record of bound) {
    // By hash, never by the author-typed `sequence` (#6384 panel finding).
    if (GRANDFATHERED_RECORD_HASHES.has(record.hash)) continue;
    const verdict: VoteRecordSignatureVerdict = signatures?.find((s) => s.recordId === record.id)
      ?.verdict ?? {
      code: 'signature-not-measured',
      reason: 'no verifier supplied; a record outside the grandfather set cannot pass unverified',
    };
    if (verdict.code !== 'signed') failures.push({ kind: 'signature-required', record, verdict });
  }
  return failures;
}

/**
 * #3927 (closing gap): which ledger records the signature requirement covers
 * BEYOND the bound ones. `added` — every record (vote or redaction) the head
 * ledger carries whose id+hash the base ledger does not: what this PR appends, the
 * pre-merge job's scope. `ledger` — every record in the ledger: the post-merge
 * backstop's scope, so a bypassed pre-merge gate leaves `main` red for as long
 * as the record stays unsigned, not only on the push that landed it.
 */
export type LedgerSignatureScope = 'added' | 'ledger';

/** The scopes, as the workflow spells them. */
export const LEDGER_SIGNATURE_SCOPES: readonly LedgerSignatureScope[] = ['added', 'ledger'];

/** One refused LINE of the ledger: the record it carries, its 1-based record-line number, and the verdict. */
export interface LedgerLineSignatureReport extends RecordSignatureReport {
  readonly line: number;
}

/**
 * What the scope-wide signature check measured, in RAW LEDGER LINES — every
 * occurrence, never the deduplicated record set (PR #7000 panel: an unsigned
 * copy of a signed record shares its id and hash, because the signature is
 * outside the hash, and the deduplicated set hid it). The counts partition
 * the ledger: `lines = inBase + grandfathered + checked`.
 */
export interface LedgerSignatureCheck {
  readonly scope: LedgerSignatureScope;
  /** Record lines (non-blank) in the head ledger. */
  readonly lines: number;
  /** `added` only: lines matched, occurrence for occurrence, to a base line with the same id, hash AND signature. */
  readonly inBase: number;
  /** Lines exempt as grandfathered: an UNSIGNED line whose hash is in {@link GRANDFATHERED_RECORD_HASHES}. */
  readonly grandfathered: number;
  /** Lines judged. 0 is named, not hidden: a PR that adds no line, or a ledger of only exempt lines. */
  readonly checked: number;
  /** Every judged line whose verdict is not `signed`, in ledger order; empty when all are signed. */
  readonly refused: readonly LedgerLineSignatureReport[];
}

/** Each record line's parsed record, in order; a line that does not parse as one record is `undefined`. */
function recordsByLine(text: string): (SignableLedgerRecord | undefined)[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const { records, redactions } = parseVoteRecordsText(line);
      return records[0] ?? redactions[0];
    });
}

/**
 * The identity of one occurrence for the `added` diff: id, hash and the
 * signature itself. A redaction's rewrite of a base line keeps all three
 * (the reasoning it drops is outside both), so it stays "on the base"; an
 * unsigned or re-signed copy of a base record differs in the third, so it
 * is an added line and must verify on its own.
 */
function occurrenceKey(r: SignableLedgerRecord): string {
  return `${r.id}\u0000${r.hash}\u0000${JSON.stringify(r.signature ?? null)}`;
}

/**
 * Run the signature requirement over the ledger LINES `scope` names (#3927).
 * `added`: each head line not matched — as a multiset, occurrence for
 * occurrence — by a base line with the same {@link occurrenceKey}; `added`
 * without a base cannot say what was added, so it widens to `ledger`
 * (fail-closed, and the reported scope says so). `ledger`: every line.
 *
 * Grandfathering exempts a line only when its hash is grandfathered AND it
 * carries no signature: an unsigned re-append of a grandfathered record is
 * byte-for-byte that record's hash-covered content again (the hash covers
 * every field but `previousHash` and `signature`), so it adds nothing to
 * sign; a grandfathered record carrying a signature is judged, so a forged
 * signature on one is refused rather than waved through. No verifier ⇒ every
 * judged line is `signature-not-measured`. A line that does not parse is
 * refused as `signature-not-measured` naming the line (unreachable after the
 * ledger load, which refuses such a ledger first).
 */
export function ledgerSignatureCheck(
  headText: string,
  scope: LedgerSignatureScope,
  baseText: string | undefined,
  verify: LineVerifier | undefined
): LedgerSignatureCheck {
  const effective: LedgerSignatureScope =
    scope === 'added' && baseText === undefined ? 'ledger' : scope;
  const baseCounts = baseOccurrences(effective === 'added' ? baseText : undefined);
  const head = recordsByLine(headText);
  const counts = { inBase: 0, grandfathered: 0, checked: 0 };
  const refused: LedgerLineSignatureReport[] = [];
  for (const [i, record] of head.entries()) {
    const outcome = classifyLine(record, baseCounts);
    counts[outcome]++;
    if (outcome !== 'checked') continue;
    const verdict = lineVerdict(record, verify);
    if (verdict.code !== 'signed') {
      refused.push({ recordId: record?.id ?? `(line ${String(i + 1)})`, line: i + 1, verdict });
    }
  }
  return { scope: effective, lines: head.length, ...counts, refused };
}

type LineVerifier = (record: SignableLedgerRecord) => VoteRecordSignatureVerdict;

/** The base ledger's lines as a multiset of {@link occurrenceKey}s; empty when there is no base to diff. */
function baseOccurrences(baseText: string | undefined): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of baseText === undefined ? [] : recordsByLine(baseText)) {
    if (r !== undefined) counts.set(occurrenceKey(r), (counts.get(occurrenceKey(r)) ?? 0) + 1);
  }
  return counts;
}

/** Where one head line falls: matched to a base occurrence (consuming it), exempt, or judged. */
function classifyLine(
  record: SignableLedgerRecord | undefined,
  baseCounts: Map<string, number>
): 'inBase' | 'grandfathered' | 'checked' {
  if (record === undefined) return 'checked';
  const key = occurrenceKey(record);
  const left = baseCounts.get(key) ?? 0;
  if (left > 0) {
    baseCounts.set(key, left - 1);
    return 'inBase';
  }
  // Only an UNSIGNED line is exempt by hash; a signed one is judged.
  if (record.signature === undefined && GRANDFATHERED_RECORD_HASHES.has(record.hash)) {
    return 'grandfathered';
  }
  return 'checked';
}

/** One judged line's verdict; an unparseable line or a missing verifier is `signature-not-measured`. */
function lineVerdict(
  record: SignableLedgerRecord | undefined,
  verify: LineVerifier | undefined
): VoteRecordSignatureVerdict {
  if (record === undefined) {
    return {
      code: 'signature-not-measured',
      reason: 'the line does not parse as one ledger record',
    };
  }
  return (
    verify?.(record) ?? {
      code: 'signature-not-measured',
      reason: 'no verifier supplied; a record outside the grandfather set cannot pass unverified',
    }
  );
}

/** The refusal a ratified verdict becomes when a record in scope is not `signed` (#3927). */
export type LedgerSignatureRequired = {
  readonly kind: 'ledger-signature-required';
} & LedgerSignatureCheck;

/** The scope-wide check a verdict carries (#3927); absent when no scope was supplied. */
export interface WithLedgerSignatures {
  readonly ledgerSignatures?: LedgerSignatureCheck;
}

/** The inputs the scope-wide check reads; a subset of the evidence inputs. */
export interface SignatureScopeInputs {
  readonly signatureScope?: LedgerSignatureScope | undefined;
  readonly baseLedgerText?: string | undefined;
  readonly signatureVerifier?:
    ((record: SignableLedgerRecord) => VoteRecordSignatureVerdict) | undefined;
}

/**
 * Fold the scope-wide check into a verdict (#3927). No scope ⇒ the verdict
 * unchanged (the pure caller's not-checked case). A ratified verdict with a
 * refused record becomes `ledger-signature-required`; a clean one carries the
 * check (the line counts what was judged). Any other verdict already refuses
 * and carries the check only when it names a record. Generic over the
 * verdict so this module does not import the evidence module back.
 */
export function applySignatureScope<V extends { readonly kind: string }>(
  verdict: V,
  isRatified: (kind: V['kind']) => boolean,
  ledgerText: string,
  inputs: SignatureScopeInputs
): V | (V & WithLedgerSignatures) | LedgerSignatureRequired {
  if (inputs.signatureScope === undefined) return verdict;
  const check = ledgerSignatureCheck(
    ledgerText,
    inputs.signatureScope,
    inputs.baseLedgerText,
    inputs.signatureVerifier
  );
  const ratified = isRatified(verdict.kind);
  if (check.refused.length === 0)
    return ratified ? { ...verdict, ledgerSignatures: check } : verdict;
  return ratified
    ? { kind: 'ledger-signature-required', ...check }
    : { ...verdict, ledgerSignatures: check };
}
