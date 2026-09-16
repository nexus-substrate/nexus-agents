/**
 * Phase 3 of #3927 item 4 (#6279): the committed signature policy of the
 * ratification gate — which unsigned records the cutover grandfathers and
 * the refusal every other bound record earns without a verified signature.
 * A sibling of `governor-ledger-evidence.ts` for that file's line budget;
 * governor-owned like its parent (a change here moves the bar).
 *
 * @module scripts/governor-ledger-signature-policy
 */
import type { VoteRecord } from '../packages/nexus-agents/src/audit/vote-record.js';
import type { VoteRecordSignatureVerdict } from '../packages/nexus-agents/src/audit/vote-record-signature.js';
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
