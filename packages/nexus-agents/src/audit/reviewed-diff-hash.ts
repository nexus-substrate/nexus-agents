/**
 * Canonical reviewed-diff hashing for the Option-C pr_review binding (#3831).
 *
 * The authority `pr_review` record binds to `{prNumber, baseSha, reviewedDiffHash}`
 * (replacing the rejected `headSha` binding). `reviewedDiffHash` must be computed
 * BYTE-IDENTICALLY by the producer (over the diff the voters reviewed) and the
 * governor gate (`scripts/check-governor-review.ts`, which recomputes it from the
 * committed PR's diff). This module is the single shared definition so the two
 * sides cannot drift.
 *
 * CANONICAL FORM (the binding contract — pinned per the #3831 ratification panel):
 *  1. The diff bytes are produced by the EXACT git invocation
 *     {@link CANONICAL_GIT_DIFF_ARGS} (pinned config so the bytes are stable across
 *     git versions / local gitconfig). The gate runs this; the producer is handed
 *     the same bytes (the pr_review tool reviews exactly this diff).
 *  2. The UTF-8 bytes are truncated to {@link MAX_REVIEWED_DIFF_BYTES} at a BYTE
 *     boundary (NOT a codepoint boundary — both sides truncate identically).
 *  3. `sha256(truncatedBytes)` hex.
 *
 * KNOWN LIMITATION (#3831 condition B): because the truncation is part of the
 * canonical form, content past {@link MAX_REVIEWED_DIFF_BYTES} is UNBOUND — two
 * diffs sharing the first 50k bytes hash identically. The voters only saw the
 * first 50k, so binding to that is the honest contract, but a record cannot attest
 * anything beyond the cap. Producers MUST surface {@link reviewedDiffWasTruncated}
 * so an over-cap review is visible.
 *
 * @module audit/reviewed-diff-hash
 */

import * as crypto from 'node:crypto';

/**
 * Max reviewed-diff size folded into the canonical hash, in BYTES (UTF-8). Mirrors
 * the pr_review tool's `MAX_DIFF_LENGTH` review cap — the voters never see past it,
 * so the binding cannot honestly attest past it either (#3831 condition B).
 */
export const MAX_REVIEWED_DIFF_BYTES = 50_000;

/**
 * The pinned `git diff` argument vector that defines the canonical reviewed-diff
 * bytes. Both the gate (which runs git) and any producer that recomputes locally
 * MUST use these exact args so the output is byte-stable regardless of the host's
 * git version or `~/.gitconfig`:
 *  - `-c core.autocrlf=false` — never rewrite line endings.
 *  - `-c diff.algorithm=myers` — pin the diff algorithm (patience/histogram/minimal
 *    via local config would change the bytes).
 *  - `-c diff.mnemonicprefix=false` / `-c diff.noprefix=false` — keep the default
 *    `a/`,`b/` prefixes regardless of local config.
 *  - `--no-color` / `--no-ext-diff` — no ANSI, no external differ.
 *  - `--no-renames` — rename detection output is config/version-sensitive; off.
 *  - `-U3` — pin the context-line count (git default is 3, but it is configurable).
 *  - `<base>..<head>` — TWO-DOT range (base→head), NOT three-dot/merge-base.
 * Caller appends the `<base>..<head>` range as the final element.
 */
export const CANONICAL_GIT_DIFF_ARGS: readonly string[] = Object.freeze([
  '-c',
  'core.autocrlf=false',
  '-c',
  'diff.algorithm=myers',
  '-c',
  'diff.mnemonicprefix=false',
  '-c',
  'diff.noprefix=false',
  'diff',
  '--no-color',
  '--no-ext-diff',
  '--no-renames',
  '-U3',
]);

/** Build the full canonical `git` argv for a base..head range (two-dot). */
export function canonicalGitDiffArgs(baseSha: string, headSha: string): string[] {
  return [...CANONICAL_GIT_DIFF_ARGS, `${baseSha}..${headSha}`];
}

/**
 * Compute the canonical `reviewedDiffHash` over a reviewed-diff string. Truncates
 * the UTF-8 bytes to {@link MAX_REVIEWED_DIFF_BYTES} at a BYTE boundary, then
 * sha256. The SAME function is called by the producer (over the diff the tool
 * reviewed) and the gate (over {@link canonicalGitDiffArgs} output) so the hash
 * reproduces iff the committed PR's canonical diff is byte-identical to what was
 * reviewed.
 */
export function computeReviewedDiffHash(diff: string): string {
  const bytes = Buffer.from(diff, 'utf-8');
  const truncated =
    bytes.byteLength > MAX_REVIEWED_DIFF_BYTES ? bytes.subarray(0, MAX_REVIEWED_DIFF_BYTES) : bytes;
  return crypto.createHash('sha256').update(truncated).digest('hex');
}

/**
 * Whether the reviewed diff exceeds the canonical cap (so the hash binds only the
 * first {@link MAX_REVIEWED_DIFF_BYTES} bytes). Producers SHOULD log/warn when true
 * (#3831 condition B) so an over-cap review is observable.
 */
export function reviewedDiffWasTruncated(diff: string): boolean {
  return Buffer.byteLength(diff, 'utf-8') > MAX_REVIEWED_DIFF_BYTES;
}
