/**
 * mine-pr-review-candidates-core.ts — PURE candidate-mining logic for the
 * pr_review eval curation pipeline (#3847).
 *
 * Given already-fetched merged-PR metadata + a fix/revert index, this module
 * produces CANDIDATE pr_review eval cases (proposals) for the owner to
 * adjudicate. It contains ZERO I/O: the `gh` shelling-out lives in
 * mine-pr-review-candidates.ts; every decision here is unit-tested against
 * fixtures (no live network).
 *
 * What this module does NOT do (owner-mandated, non-negotiable):
 *   - It NEVER sets a final buggy/clean verdict. The only label it assigns is a
 *     `weakLabel` ('likely-buggy' | 'likely-clean' | 'unknown') — a TRIAGE HINT,
 *     not a ground-truth class. Every emitted case carries `adjudicated: false`.
 *   - It NEVER invents a diff. The diff excerpt is a bounded slice of the real
 *     `gh`-fetched diff; if none was fetched the excerpt is empty.
 *   - It is conservative: `unknown` whenever the corrective-change signal is
 *     ambiguous or absent-but-recent (no clean tenure established).
 *
 * The weak label reuses the tested rubric labeler (curate-pr-review-labeling.ts)
 * so the mining heuristic stays consistent with the adjudication rubric
 * (docs/research/pr-review-eval-labeling-rubric.md, #3846): a confirmed
 * defect-fix → likely-buggy, a refinement / long-tenure-no-fix → likely-clean,
 * an ambiguous fix → unknown.
 *
 * @module scripts/mine-pr-review-candidates-core
 * (Source: Issue #3847, epic #3845; rubric #3846)
 */

import { proposeLabel, type PrSignals } from './curate-pr-review-labeling.js';

// ============================================================================
// Inputs (what the gh I/O layer hands us — objective, no labels)
// ============================================================================

/** A merged PR as fetched from `gh pr list --json …`. */
export interface MergedPr {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  readonly url: string;
  readonly author: string;
  readonly mergedAt: string;
  readonly files: readonly string[];
  readonly reviewDecision: string | null;
}

/** A merged PR plus its real, gh-fetched unified diff (bounded later). */
export interface MergedPrWithDiff extends MergedPr {
  /** The real unified diff text fetched via `gh pr diff`. */
  readonly diff: string;
}

/** The set of PR numbers already present so the miner can dedup against them. */
export interface DedupIndex {
  /** PR numbers already in testing/datasets/pr-review-sample.json. */
  readonly datasetNumbers: ReadonlySet<number>;
  /** PR numbers already emitted to the candidates file (never re-propose). */
  readonly existingCandidateNumbers: ReadonlySet<number>;
}

// ============================================================================
// Bot-PR exclusion
// ============================================================================

/**
 * Login fragments that mark a PR as bot-authored. Substring match, lower-cased:
 * changeset-release (the version-packages PR), dependabot, github-actions, and
 * the generic `[bot]` suffix GitHub appends to App identities.
 */
const BOT_AUTHOR_MARKERS: readonly string[] = [
  'changeset-release',
  'dependabot',
  'github-actions',
  'renovate',
  '[bot]',
  'app/',
];

/** True when the PR's author login looks bot-authored. */
export function isBotAuthored(author: string): boolean {
  const a = author.toLowerCase();
  return BOT_AUTHOR_MARKERS.some((m) => a.includes(m));
}

// ============================================================================
// Weak label (TRIAGE HINT — never a verdict)
// ============================================================================

export type WeakLabel = 'likely-buggy' | 'likely-clean' | 'unknown';

export interface WeakLabelResult {
  readonly weakLabel: WeakLabel;
  /** The objective evidence string for the weak label (for owner triage). */
  readonly weakLabelEvidence: string;
}

/**
 * The minimum age (days since merge) a no-corrective-PR signal needs before it
 * is treated as a `likely-clean` hint rather than `unknown`. Mirrors the
 * dataset's long-tenure rationale: a defect would usually have surfaced a
 * corrective PR within ~6 weeks, so a younger no-fix PR is not yet clean
 * evidence. Below this floor a no-fix PR is `unknown` (no signal yet).
 */
export const CLEAN_TENURE_DAYS = 42;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between an ISO merge timestamp and `now` (>=0; 0 if unparseable). */
export function daysSinceMerge(mergedAt: string, now: Date): number {
  const merged = Date.parse(mergedAt);
  if (Number.isNaN(merged)) return 0;
  const diff = now.getTime() - merged;
  return diff <= 0 ? 0 : Math.floor(diff / DAY_MS);
}

/** likely-clean hint from a refinement-only follow-up (the prior PR was not corrected). */
function refinementClean(justification: string): WeakLabelResult {
  return { weakLabel: 'likely-clean', weakLabelEvidence: justification };
}

/** Tenure-based clean / unknown split for a PR with NO corrective follow-up. */
function noFixTenure(signals: PrSignals, ageDays: number): WeakLabelResult {
  if (ageDays >= CLEAN_TENURE_DAYS) {
    return {
      weakLabel: 'likely-clean',
      weakLabelEvidence:
        `No corrective/revert PR has touched any source file #${String(signals.number)} ` +
        `changed in the ${String(ageDays)} days since merge (>= ${String(CLEAN_TENURE_DAYS)}-day ` +
        `long-tenure window). Long-tenure clean hint — owner confirms no defensible ` +
        `medium+ objection from the diff before promoting.`,
    };
  }
  return {
    weakLabel: 'unknown',
    weakLabelEvidence:
      `No corrective/revert PR found, but #${String(signals.number)} merged only ` +
      `${String(ageDays)} days ago (< ${String(CLEAN_TENURE_DAYS)}-day long-tenure window) — ` +
      `too young for a clean signal. Conservative 'unknown' until the window clears.`,
  };
}

/**
 * Derive a conservative weak label from the rubric labeler's proposal + tenure.
 *
 *  - proposal `buggy`  → `likely-buggy` (a confirmed defect-fix touched the same
 *    source file later; evidence names the fixing PR).
 *  - proposal `clean` from a refinement-only follow-up → `likely-clean`.
 *  - proposal `clean` from NO follow-up at all → `likely-clean` ONLY if the PR
 *    has cleared the long-tenure window; otherwise `unknown` (too young to be a
 *    clean signal — conservative).
 *  - proposal `borderline` (ambiguous fix) → `unknown` (never guessed).
 */
export function deriveWeakLabel(
  signals: PrSignals,
  fixTitles: ReadonlyMap<number, string>,
  ageDays: number
): WeakLabelResult {
  const proposal = proposeLabel(signals, fixTitles);
  if (proposal.class === 'buggy') {
    return { weakLabel: 'likely-buggy', weakLabelEvidence: proposal.justification };
  }
  if (proposal.class === 'borderline') {
    return { weakLabel: 'unknown', weakLabelEvidence: proposal.justification };
  }
  // proposal.class === 'clean'
  if (signals.followUpFixes.length > 0) return refinementClean(proposal.justification);
  return noFixTenure(signals, ageDays);
}

// ============================================================================
// Older-window targeting (#4316): --min-age-days filter + gh query assembly
// ============================================================================

/**
 * Keep only PRs merged at least `minAgeDays` days before `now`. Pure and
 * Date-injectable (never calls Date.now internally). `minAgeDays <= 0` is a
 * no-op — the default `0` preserves the pre-#4316 "most recent window"
 * behavior.
 *
 * Generic over any shape carrying `mergedAt` so it works on both the raw
 * `gh pr list --json` rows and the mapped `MergedPr` shape.
 */
export function filterByMinAge<T extends { readonly mergedAt: string }>(
  prs: readonly T[],
  minAgeDays: number,
  now: Date
): readonly T[] {
  if (minAgeDays <= 0) return prs;
  return prs.filter((pr) => daysSinceMerge(pr.mergedAt, now) >= minAgeDays);
}

/** Safety ceiling on the raw `gh pr list --limit` the miner will ever request. */
export const MAX_FETCH_LIMIT = 500;

/**
 * Compute the next raw `gh pr list --limit` to request when a page didn't
 * yield enough `--min-age-days`-qualifying PRs to satisfy `targetLimit`.
 * Doubles the current raw limit (never below `targetLimit`), capped at
 * `MAX_FETCH_LIMIT` so an operator's `--min-age-days` can't trigger unbounded
 * `gh` traffic. The I/O edge re-fetches with this larger limit and re-filters;
 * it stops growing once `gh` itself returns fewer rows than requested (the
 * list is exhausted) or the cap is hit.
 */
export function growFetchLimit(rawLimit: number, targetLimit: number): number {
  return Math.min(Math.max(rawLimit * 2, targetLimit), MAX_FETCH_LIMIT);
}

export interface PrListQuery {
  readonly repo: string;
  readonly limit: number;
  /** An operator-supplied `gh search` query (e.g. `merged:<2026-06-06 is:merged`). */
  readonly search?: string | null;
}

const LIST_JSON_FIELDS = 'number,title,body,url,mergedAt,author,files,reviewDecision';

/**
 * Assemble the `gh pr list` argv for a fetch. When `search` is given, it wires
 * in as `--search <query>` INSTEAD of `--state merged` (gh rejects `--search`
 * combined with `--state`/other list filters) — the operator is expected to
 * fold `is:merged` into the query themselves when they want only merged PRs.
 * Without `search` (the default path), behavior is unchanged from pre-#4316:
 * `--state merged`.
 */
export function buildPrListArgs(query: PrListQuery): readonly string[] {
  const base = ['pr', 'list', '--repo', query.repo];
  const search = query.search;
  const filter =
    search !== null && search !== undefined && search.length > 0
      ? ['--search', search]
      : ['--state', 'merged'];
  return [...base, ...filter, '--limit', String(query.limit), '--json', LIST_JSON_FIELDS];
}

// ============================================================================
// 406-fallback assembly (#4316): files-API patch fields → bounded diff excerpt
// ============================================================================

/** One entry from `gh api repos/<owner>/<repo>/pulls/<n>/files`. */
export interface FileDiffEntry {
  readonly filename: string;
  /** Absent for binary files or files GitHub itself declined to diff. */
  readonly patch?: string;
}

const DIFF_TRUNCATED_MARKER = (cap: number): string =>
  `\n… [diff truncated at ${String(cap)} chars — see the source PR for the full diff]`;

/**
 * Assemble a bounded, unified-diff-ish excerpt from the GitHub files-API
 * `patch` fields — the fallback path when `gh pr diff` 406s (>300 files /
 * "too large"). Skips entries with no `patch` (binary or per-file-too-large)
 * rather than fabricating content, per the NEVER-invent-a-diff invariant.
 * Stops adding further files once `cap` is reached and appends the same
 * truncation marker `boundDiff` uses, so a reader can never mistake the
 * excerpt for a complete diff. Returns `''` when no file has usable patch
 * content (the caller records that as a skip, not a silent empty candidate).
 */
export function assembleDiffFromFiles(files: readonly FileDiffEntry[], cap: number): string {
  const parts: string[] = [];
  let length = 0;
  for (const f of files) {
    if (f.patch === undefined || f.patch === '') continue;
    const block = `diff --git a/${f.filename} b/${f.filename}\n${f.patch}\n`;
    if (length + block.length > cap) {
      const remaining = cap - length;
      const marker = DIFF_TRUNCATED_MARKER(cap);
      if (remaining > 0) {
        parts.push(`${block.slice(0, remaining)}${marker}`);
      } else {
        parts.push(marker.trimStart());
      }
      return parts.join('');
    }
    parts.push(block);
    length += block.length;
  }
  return parts.join('');
}

// ============================================================================
// Diff bounding (never invent — only bound the real diff)
// ============================================================================

/** Default cap on the candidate diff excerpt (chars). Keeps the file bounded. */
export const DEFAULT_DIFF_CHAR_CAP = 6000;

/**
 * Bound a real diff to `cap` chars. Returns the diff verbatim when it fits;
 * otherwise a head slice with an explicit truncation marker (so a reader never
 * mistakes a truncated excerpt for the full diff). NEVER synthesizes content.
 */
export function boundDiff(diff: string, cap: number = DEFAULT_DIFF_CHAR_CAP): string {
  if (diff.length <= cap) return diff;
  const head = diff.slice(0, cap);
  return `${head}\n… [diff truncated at ${String(cap)} chars — see the source PR for the full diff]`;
}
