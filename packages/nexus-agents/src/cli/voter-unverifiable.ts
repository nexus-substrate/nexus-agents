/**
 * A seat that could not read the artifact is `unverifiable` (#6094).
 *
 * Design panel on #6068 (option C, 6 of 6). Before this, a voter whose
 * sandboxed shell failed — `bwrap: loopback: Failed RTM_NEWADDR` on a
 * userns-restricted host — returned a parsed JSON vote and was recorded as an
 * ordinary `abstain` with `source: 'llm'`. The retry path never saw it, the
 * tally could not tell "read it and abstained" from "never saw it", and one
 * seat voted APPROVE on the proposal text after failing to read
 * (`vote-1789058788915-6lfrbuq`). A record that cannot represent absence
 * launders a blind seat as a considered one — the Mission's p1 class.
 *
 * Classification order: the structured signal first (stderr the CLI transport
 * captured while serving the completion), the reasoning text as a fallback.
 * Regex over prose both misses and false-positives, which is why it is the
 * fallback and why its constant is named — the six real ledger entries in
 * `voter-unverifiable.test.ts` are its regression set.
 *
 * @module cli/voter-unverifiable
 */

import type { AgentVoteResult, UnverifiableSignal } from './vote-types.js';

/**
 * The structured signal: a sandbox / shell failure on the CLI's stderr. The
 * bubblewrap and landlock strings are what codex emits on a host where
 * `apparmor_restrict_unprivileged_userns=1` (Ubuntu 24.04+ default, #6093).
 */
export const UNVERIFIABLE_STDERR_RE =
  /\bbwrap: |RTM_NEWADDR|\bsandbox\b[^\n]*\b(?:denied|failed|not permitted)\b/i;

/**
 * The fallback: the seat's own reasoning says it could not read the artifact.
 *
 * Anchored on the concrete phrases the six real ledger entries used, plus the
 * `UNVERIFIABLE:` prefix the voter prompt now asks a blind seat to write. It
 * deliberately does NOT match a bare "could not read" — a seat that read the
 * artifact may say a comment "could not be read easily" and still have judged
 * the code.
 */
export const UNVERIFIABLE_REASONING_RE =
  /\bUNVERIFIABLE:|\bbwrap: |RTM_NEWADDR|\b(?:repository|source|shell) (?:reads?|access|execution|inspection) failed\b|\bcould not (?:read|inspect) the artifact\b/i;

/** Evidence available after one completion: the transport's stderr, the parsed reasoning. */
export interface UnverifiableEvidence {
  readonly cliStderr?: string | undefined;
  readonly reasoning: string;
}

/**
 * Classify a parsed vote as unverifiable, naming which evidence did it, or
 * `undefined` when the seat gave no sign of having failed to read.
 *
 * The empty case is named: no stderr and clean reasoning is a seat that read
 * the artifact, and its decision stands.
 */
export function classifyUnverifiable(
  evidence: UnverifiableEvidence
): UnverifiableSignal | undefined {
  const stderr = evidence.cliStderr ?? '';
  if (stderr !== '' && UNVERIFIABLE_STDERR_RE.test(stderr)) return 'stderr';
  if (UNVERIFIABLE_REASONING_RE.test(evidence.reasoning)) return 'reasoning';
  return undefined;
}

/**
 * Re-record a parsed vote as an unverifiable seat.
 *
 * The decision the model returned is DISCARDED (the caller logs it): the seat
 * never carries approve/reject, and never a `selectedOption` — a blind seat
 * cannot have chosen. Confidence is 0 because there is no verdict to be
 * confident in. Everything that IS real provenance — the reasoning text, the
 * model, the CLI, the token counts — is kept.
 */
export function markUnverifiable(
  result: AgentVoteResult,
  signal: UnverifiableSignal
): AgentVoteResult {
  const { selectedOption: _discarded, ...rest } = result;
  return {
    ...rest,
    source: 'unverifiable',
    unverifiableSignal: signal,
    vote: { ...result.vote, decision: 'abstain', confidence: 0 },
  };
}

/**
 * An absent seat: one that errored, or one that answered without having read
 * the artifact. Both are absences, not judgments — the per-role retry
 * relaunches them and `absolute_quorum` voids on them alike.
 */
export function isAbsentSeat(v: Pick<AgentVoteResult, 'source'>): boolean {
  return v.source === 'error' || v.source === 'unverifiable';
}
