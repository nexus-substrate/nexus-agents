/**
 * mine-pr-review-candidates-assemble.ts — PURE assembly of CANDIDATE cases for
 * the pr_review eval curation pipeline (#3847).
 *
 * Turns objective merged-PR signals + a weak label into a CANDIDATE case whose
 * shape mirrors testing/datasets/pr-review-sample.json (rubricVersion, class,
 * title, provenance, knownBugs, borderlineConcerns, adjudication) PLUS the
 * candidate-only fields `weakLabel`, `weakLabelEvidence`, and
 * `adjudicated: false`. These are PROPOSALS for the owner to adjudicate per the
 * rubric — NOT final dataset entries.
 *
 * Critical no-fabrication property: the assembled `class` is always the neutral
 * placeholder `'borderline'` with empty `knownBugs`/`borderlineConcerns` and an
 * adjudication rationale that says "UNADJUDICATED". The miner does NOT assert
 * buggy/clean — only the `weakLabel` triage hint carries the signal, and the
 * owner sets the real class during adjudication. This keeps the candidates file
 * schema-recognizable without ever encoding a fabricated verdict.
 *
 * @module scripts/mine-pr-review-candidates-assemble
 * (Source: Issue #3847, epic #3845; rubric #3846)
 */

import { signalsFor, type RawPrLike } from './curate-pr-review-harvest.js';
import {
  boundDiff,
  daysSinceMerge,
  deriveWeakLabel,
  isBotAuthored,
  type DedupIndex,
  type MergedPrWithDiff,
  type WeakLabel,
} from './mine-pr-review-candidates-core.js';

// ============================================================================
// The candidate case schema (mirrors pr-review-sample.json + candidate fields)
// ============================================================================

/** A candidate pr_review eval case — a PROPOSAL, never an adjudicated entry. */
export interface CandidateCase {
  readonly number: number;
  readonly rubricVersion: string;
  /**
   * Always the neutral 'borderline' placeholder until the owner adjudicates.
   * The triage signal lives in `weakLabel`, NOT here — the miner never asserts
   * buggy/clean.
   */
  readonly class: 'borderline';
  readonly title: string;
  readonly customDescription: string;
  /** The bounded, REAL gh-fetched diff excerpt (never synthesized). */
  readonly customDiff: string;
  readonly provenance: {
    readonly source: 'outcome-mined';
    readonly sourcePrUrl: string;
    readonly mergedAt: string;
    readonly fixReference: string | null;
    readonly discoveredBy: null;
  };
  readonly knownBugs: readonly never[];
  readonly borderlineConcerns: readonly never[];
  /** TRIAGE HINT only — 'likely-buggy' | 'likely-clean' | 'unknown'. Not a verdict. */
  readonly weakLabel: WeakLabel;
  readonly weakLabelEvidence: string;
  /** Always false on emission — flips to true only by owner adjudication. */
  readonly adjudicated: false;
  readonly adjudication: {
    readonly adjudicatedAt: null;
    readonly adjudicatedUnder: null;
    readonly rationale: string;
  };
}

/** The candidates file: a thin wrapper around the candidate array. */
export interface CandidatesFile {
  readonly rubricVersion: string;
  readonly generatedAt: string;
  readonly generatedBy: 'scripts/mine-pr-review-candidates.ts';
  readonly note: string;
  readonly candidates: readonly CandidateCase[];
}

const UNADJUDICATED_RATIONALE =
  'UNADJUDICATED candidate mined from merged-PR history. The weakLabel is a triage ' +
  'hint, NOT a verdict. The owner adjudicates this into buggy/clean/borderline per ' +
  'the rubric (docs/research/pr-review-eval-labeling-rubric.md) and only then is it ' +
  'promoted into pr-review-sample.json. The miner asserts no class.';

const CANDIDATES_FILE_NOTE =
  'CANDIDATE pr_review eval cases mined from merged-PR history for OWNER ADJUDICATION ' +
  '(#3847). These are PROPOSALS, not dataset entries: every case is adjudicated:false ' +
  'and carries a weakLabel triage hint (likely-buggy|likely-clean|unknown), never a ' +
  'verdict. The pipeline does NOT fabricate adjudicated eval data. Flow: mine → owner ' +
  'adjudicates each per the rubric → promote adjudicated cases into pr-review-sample.json.';

// ============================================================================
// Per-PR assembly (pure)
// ============================================================================

/** Map a MergedPrWithDiff onto the RawPrLike shape the harvest helpers consume. */
function toRawPrLike(pr: MergedPrWithDiff): RawPrLike {
  return {
    number: pr.number,
    title: pr.title,
    body: pr.body,
    url: pr.url,
    files: pr.files.map((path) => ({ path })),
  };
}

export interface MineOptions {
  readonly rubricVersion: string;
  readonly now: Date;
  readonly diffCharCap: number;
}

/**
 * Build one candidate case from a merged PR, its real diff, the full page (for
 * follow-up detection), and the fix-title index. Pure.
 */
export function assembleCandidate(
  pr: MergedPrWithDiff,
  page: readonly MergedPrWithDiff[],
  fixTitles: ReadonlyMap<number, string>,
  opts: MineOptions
): CandidateCase {
  const signals = signalsFor(toRawPrLike(pr), page.map(toRawPrLike));
  const ageDays = daysSinceMerge(pr.mergedAt, opts.now);
  const { weakLabel, weakLabelEvidence } = deriveWeakLabel(signals, fixTitles, ageDays);
  const firstFix = signals.followUpFixes[0];
  const fixReference =
    weakLabel === 'likely-buggy' && firstFix !== undefined
      ? `#${String(firstFix.fixPrNumber)}`
      : null;
  return {
    number: pr.number,
    rubricVersion: opts.rubricVersion,
    class: 'borderline',
    title: pr.title,
    customDescription: pr.body.slice(0, 500),
    customDiff: boundDiff(pr.diff, opts.diffCharCap),
    provenance: {
      source: 'outcome-mined',
      sourcePrUrl: pr.url,
      mergedAt: pr.mergedAt,
      fixReference,
      discoveredBy: null,
    },
    knownBugs: [],
    borderlineConcerns: [],
    weakLabel,
    weakLabelEvidence,
    adjudicated: false,
    adjudication: {
      adjudicatedAt: null,
      adjudicatedUnder: null,
      rationale: UNADJUDICATED_RATIONALE,
    },
  };
}

// ============================================================================
// Batch mining (pure): filter bots + dedup, assemble survivors, merge
// ============================================================================

/** A PR is eligible if it is human-authored, touches source, and is not a dedup hit. */
function isEligible(pr: MergedPrWithDiff, dedup: DedupIndex): boolean {
  if (isBotAuthored(pr.author)) return false;
  if (dedup.datasetNumbers.has(pr.number)) return false;
  if (dedup.existingCandidateNumbers.has(pr.number)) return false;
  const touchesSource = pr.files.some(
    (f) => f.startsWith('packages/nexus-agents/src/') && !f.endsWith('.test.ts')
  );
  return touchesSource;
}

/**
 * Mine a fetched page into NEW candidate cases.
 *
 * Idempotent + safe: excludes bot PRs, PRs already in the dataset, and PRs
 * already emitted as candidates (dedup against BOTH). The whole `page` is used
 * for follow-up-fix detection even though only eligible PRs become candidates,
 * so a later fix among the existing/bot PRs still informs the weak label.
 */
export function mineCandidates(
  page: readonly MergedPrWithDiff[],
  dedup: DedupIndex,
  opts: MineOptions
): readonly CandidateCase[] {
  const fixTitles = new Map(page.map((p) => [p.number, p.title]));
  return page
    .filter((pr) => isEligible(pr, dedup))
    .map((pr) => assembleCandidate(pr, page, fixTitles, opts));
}

/**
 * Merge newly-mined candidates into the prior candidates list WITHOUT ever
 * overwriting a candidate the owner has already adjudicated. A prior candidate
 * with `adjudicated: true` is preserved verbatim; new candidates that collide
 * on `number` with ANY prior candidate are dropped (re-running never clobbers).
 */
export function mergeCandidates(
  prior: readonly CandidateCase[],
  mined: readonly CandidateCase[]
): readonly CandidateCase[] {
  const priorNumbers = new Set(prior.map((c) => c.number));
  const fresh = mined.filter((c) => !priorNumbers.has(c.number));
  return [...prior, ...fresh];
}

export function buildCandidatesFile(
  candidates: readonly CandidateCase[],
  rubricVersion: string,
  now: Date
): CandidatesFile {
  return {
    rubricVersion,
    generatedAt: now.toISOString().slice(0, 10),
    generatedBy: 'scripts/mine-pr-review-candidates.ts',
    note: CANDIDATES_FILE_NOTE,
    candidates,
  };
}
