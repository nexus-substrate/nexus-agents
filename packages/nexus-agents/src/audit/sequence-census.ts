/**
 * nexus-agents/audit - Sequence census for the record-SET ledgers (#3927).
 *
 * The vote-record and PR-review ledgers are unordered sets of self-hashed
 * records plus a monotonic `sequence`: omission shows up as a HOLE in the
 * `0..maxSeq` run (`sequence_gap`), and a sequence carried by more than one
 * record is a benign concurrent-branch fork, surfaced as `forks`. Both
 * verifiers ran a byte-identical copy of this census; it moved here when the
 * redaction record (#6264) made the vote ledger's census run over two record
 * kinds, so the tally is over anything with a `sequence`.
 *
 * @module audit/sequence-census
 */

/** Tally of sequence number → how many records carry it, plus the max seen. */
export interface SequenceCensus {
  readonly counts: ReadonlyMap<number, number>;
  readonly maxSeq: number;
}

/** Count how many records carry each sequence number and find the max. */
export function censusSequences(records: readonly { readonly sequence: number }[]): SequenceCensus {
  const counts = new Map<number, number>();
  let maxSeq = 0;
  for (const record of records) {
    counts.set(record.sequence, (counts.get(record.sequence) ?? 0) + 1);
    if (record.sequence > maxSeq) maxSeq = record.sequence;
  }
  return { counts, maxSeq };
}

/** First missing sequence in `0..maxSeq`, or null when the run is complete. */
export function firstSequenceGap({ counts, maxSeq }: SequenceCensus): number | null {
  for (let seq = 0; seq <= maxSeq; seq++) {
    if (!counts.has(seq)) return seq;
  }
  return null;
}

/** Sequence numbers carried by more than one record (concurrent forks), ascending. */
export function forkSequences({ counts }: SequenceCensus): number[] {
  const forks: number[] = [];
  for (const [seq, count] of counts) {
    if (count > 1) forks.push(seq);
  }
  forks.sort((a, b) => a - b);
  return forks;
}
