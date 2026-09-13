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
 * The fallback's error strings: the seat's own reasoning quotes a failed read.
 *
 * Anchored on the concrete phrases the six real ledger entries used. It
 * deliberately does NOT match a bare "could not read" — a seat that read the
 * artifact may say a comment "could not be read easily" and still have judged
 * the code. Since #6104 a match here is necessary but not sufficient: a seat
 * that quotes the error and then asserts a successful read (`RECOVERY_PHRASE_RE`
 * or `FILE_LINE_CITATION_RE`) keeps its vote. The `UNVERIFIABLE:` prefix the
 * voter prompt asks for is its own rule, `UNVERIFIABLE_PREFIX_RE`, and needs
 * no error string.
 */
export const UNVERIFIABLE_REASONING_RE =
  /\bbwrap: |RTM_NEWADDR|\b(?:repository|source|shell) (?:reads?|access|execution|inspection) failed\b|\bcould not (?:read|inspect) the artifact\b/i;

/**
 * The prefix `voter-prompts.ts` asks a blind seat to BEGIN its reasoning with.
 * Anchored at the start: a seat that mentions the word mid-sentence is quoting
 * the instruction, not obeying it.
 */
export const UNVERIFIABLE_PREFIX_RE = /^\s*UNVERIFIABLE:/i;

/**
 * A `path/file.ext:LINE` citation — the location form the PR-review addendum
 * in `voter-prompts.ts` asks findings to use. A seat that cites a line read
 * the file. Requires a dotted extension before the colon so a clock time, a
 * ratio or a bare SHA does not count.
 */
export const FILE_LINE_CITATION_RE = /(?:^|[\s(`'"])[\w./-]*[\w-]+\.[a-z][a-z\d]{0,5}:\d+\b/i;

/**
 * The recovery phrases a seat writes when a first read failed and a later one
 * did not (#6104). ONE named list: extend it here, never inline. The two
 * strings the #6101 adversarial review executed are the first two rows.
 */
export const RECOVERY_PHRASE_RE =
  /\b(?:retry|second attempt|subsequent attempt|re-?run) succeeded\b|\bthen read\b|\bwas able to read\b/i;

/** Which sub-rule of the reasoning fallback fired; reported for the debug log. */
export type UnverifiableReasoningRule = 'prefix' | 'error_without_recovery';

/** Evidence available after one completion: the transport's stderr, the parsed reasoning. */
export interface UnverifiableEvidence {
  readonly cliStderr?: string | undefined;
  readonly reasoning: string;
}

/** True when the reasoning asserts a successful read: a recovery phrase or a file:line citation. */
function assertsSuccessfulRead(reasoning: string): boolean {
  return RECOVERY_PHRASE_RE.test(reasoning) || FILE_LINE_CITATION_RE.test(reasoning);
}

/**
 * Classify a parsed vote as unverifiable, naming which evidence did it, or
 * `undefined` when the seat gave no sign of having failed to read.
 *
 * The stderr signal is primary and unconditional. The reasoning fallback
 * fires on the `UNVERIFIABLE:` prefix, or on an error string only when the
 * reasoning does not also assert a successful read (#6104) — a seat that
 * quotes `bwrap:` and then says the retry succeeded read the artifact, and
 * discarding it was a measured false-positive class. `onReasoningRule`
 * receives the sub-rule that fired so the caller can log it.
 *
 * The empty case is named: no stderr and clean reasoning is a seat that read
 * the artifact, and its decision stands.
 */
export function classifyUnverifiable(
  evidence: UnverifiableEvidence,
  onReasoningRule?: (rule: UnverifiableReasoningRule) => void
): UnverifiableSignal | undefined {
  const stderr = evidence.cliStderr ?? '';
  if (stderr !== '' && UNVERIFIABLE_STDERR_RE.test(stderr)) return 'stderr';
  const { reasoning } = evidence;
  if (UNVERIFIABLE_PREFIX_RE.test(reasoning)) {
    onReasoningRule?.('prefix');
    return 'reasoning';
  }
  if (UNVERIFIABLE_REASONING_RE.test(reasoning) && !assertsSuccessfulRead(reasoning)) {
    onReasoningRule?.('error_without_recovery');
    return 'reasoning';
  }
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
