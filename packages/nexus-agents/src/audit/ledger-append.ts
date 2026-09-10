/**
 * Validate-before-append for the hash-chained JSONL ledgers (#6054).
 *
 * Both ledger writers (`vote-record-store`, `pr-review-record-store`) had the
 * same shape: build a record, `JSON.stringify` it, `appendFileSync`. The only
 * schema check was on the READ path, so a builder could emit a record the schema
 * rejects, the append succeeded, and the line surfaced later as an
 * `invalidLines` entry that no non-test consumer reads. #6049 shipped exactly
 * that: `optionTally: []` against a `.min(1)` the write path never checked.
 *
 * For an append-only, hash-chained artifact that direction is wrong. An
 * unreadable line cannot be repaired in place — the chain has moved past it —
 * so the cheapest moment to reject a malformed record is before it is durable.
 * The unusual record is the one most worth auditing and the one most likely to
 * trip a constraint, so the silent drop lands on the cases that matter most.
 *
 * ONE guard rather than two, so the two ledgers cannot drift on what "valid"
 * means at write time. It THROWS; each store's existing `try` turns that into
 * its `logger.warn` + `undefined` contract, which is what a caller already gets
 * for a failed write. Persistence still never throws into the vote path.
 *
 * @module audit/ledger-append
 */

import type { ZodType } from 'zod';
import { formatZodIssueWithRoot } from '../core/zod-helpers.js';

/** Stable prefix so a log reader (or a test) can find the refusal by string. */
export const UNREADABLE_RECORD_PREFIX = 'refusing to persist an unreadable';

/**
 * Serialize `record` as one ledger line, or throw when the schema that will be
 * used to READ it back rejects it. The thrown message names the ledger and the
 * failing paths, so the log entry says which field — not merely that a write
 * failed.
 *
 * VALIDATE, DO NOT RE-EMIT. The first version returned `JSON.stringify(parsed.data)`
 * — Zod's rebuilt object — and an adversarial review executed both stores to
 * show the bytes CHANGED for every valid record: Zod rebuilds objects in
 * schema-shape key order, the builders emit in a different order, so the record
 * returned to the caller and the line on disk no longer serialized identically.
 * The hash survived only because it is computed over a projection. That is the
 * #6065 class — a rebuilt object leaking resolution order into bytes — and a
 * "valid records are unchanged" claim that was false. The schema is consulted
 * for its verdict only; what is written is the caller's own object.
 */
export function serializeValidatedRecord<T>(
  schema: ZodType<T>,
  record: T,
  ledgerName: string
): string {
  const parsed = schema.safeParse(record);
  if (!parsed.success) {
    const paths = parsed.error.issues.map(formatZodIssueWithRoot).join('; ');
    throw new Error(`${UNREADABLE_RECORD_PREFIX} ${ledgerName} record: ${paths}`);
  }
  const line = JSON.stringify(record);
  // Validate what will be READ, not only what was handed in. A ratification
  // seat named the gap and a probe confirmed it: `.strict()` checks own keys, so
  // an object whose prototype carries `toJSON()` passes validation while
  // `JSON.stringify` writes something else entirely. The builders never hand
  // the guard such an object, but the guard is an exported helper and the
  // property has to hold for any caller. The same check closes every
  // JSON-lossy value at once (a non-finite number becoming `null`, a Date
  // becoming a string) rather than enumerating them. Bytes are unchanged: the
  // line written is still the caller's own serialization.
  const roundTrip = schema.safeParse(JSON.parse(line) as unknown);
  if (!roundTrip.success) {
    const paths = roundTrip.error.issues.map(formatZodIssueWithRoot).join('; ');
    throw new Error(
      `${UNREADABLE_RECORD_PREFIX} ${ledgerName} record: JSON round-trip changed it — ${paths}`
    );
  }
  return line + '\n';
}
