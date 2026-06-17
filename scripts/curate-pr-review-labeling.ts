/**
 * curate-pr-review-labeling.ts — PURE signal→label logic for the pr_review
 * eval-set curation pipeline (#3847).
 *
 * This is the testable core of the curation pipeline. It contains ZERO I/O: it
 * takes already-fetched OBJECTIVE signals about a merged PR (the merge outcome,
 * the review verdict, and — critically — whether a LATER PR fixed/reverted code
 * it touched) and applies the labeling rubric (docs/research/
 * pr-review-eval-labeling-rubric.md, #3846) to PROPOSE a class + severity.
 *
 * The gh-fetch I/O lives in curate-pr-review-harvest.ts. Keeping the logic pure
 * here means every rubric decision below is unit-tested against fixtures rather
 * than against a live GitHub round-trip.
 *
 * Hard rule (owner-mandated, non-negotiable): NO INVENTED LABELS. Every `buggy`
 * label must trace to an objective post-merge-fix signal. When the signal is
 * present but its severity/reachability cannot be established from the signal
 * alone (e.g. the follow-up was a heuristic refinement or a no-behavior-change
 * DRY hardening), the case is emitted as `borderline` with `needsAdjudication`,
 * NEVER forced to `buggy` or `clean`. Fabricated eval data is forbidden.
 *
 * @module scripts/curate-pr-review-labeling
 * (Source: Issue #3847, epic #3845; rubric #3846)
 */

import type {
  CaseClass,
  PrReviewCase,
  ProvenanceSource,
  Severity,
} from './curate-pr-review-dataset-schema.js';

// ============================================================================
// Objective signals (what the harvester extracts per merged PR)
// ============================================================================

/**
 * A later PR that fixed/reverted code the candidate PR touched. This is the
 * ground-truth "the diff shipped a defect" signal (rubric Rule 5.3).
 */
export interface FollowUpFix {
  /** The fixing/reverting PR number. */
  readonly fixPrNumber: number;
  /** Its conventional-commit type, lower-cased: `fix` | `revert` | other. */
  readonly fixType: string;
  /** Source (non-test, non-changeset) files BOTH PRs touched — the overlap. */
  readonly overlappingSourceFiles: readonly string[];
}

/** Objective signals for one merged PR, all extracted via `gh` (no judgment). */
export interface PrSignals {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  /** Source (non-test, non-changeset) files this PR changed. */
  readonly changedSourceFiles: readonly string[];
  /** Later PRs that fixed/reverted files this PR touched (may be empty). */
  readonly followUpFixes: readonly FollowUpFix[];
  /** GitHub review decision when known: 'APPROVED' | 'CHANGES_REQUESTED' | … */
  readonly reviewDecision: string | null;
}

// ============================================================================
// Proposed label (what the pipeline emits before human adjudication)
// ============================================================================

export interface ProposedLabel {
  readonly class: CaseClass;
  /** Severity for buggy proposals; null for clean/borderline. */
  readonly severity: Severity | null;
  /** True when a human must confirm before this case is trusted. */
  readonly needsAdjudication: boolean;
  /** 0..1 — heuristic confidence in the proposal, for triage ordering. */
  readonly confidence: number;
  /** Objective justification: which signal drove the proposal. */
  readonly justification: string;
}

// ============================================================================
// Severity heuristics (conservative; default to lower per rubric Rule 5.1)
// ============================================================================

/**
 * Defect-domain hints that, when a follow-up FIX touches them, indicate a
 * confirmed correctness/integrity defect (medium+ under Rule 1) rather than a
 * pure refactor/heuristic tweak. Matched against overlapping file paths.
 */
const CORRECTNESS_DOMAINS: readonly string[] = [
  '/audit/',
  '/security/',
  '/auth/',
  '/governance/',
  '/pipeline/',
];

/**
 * Title markers on the FOLLOW-UP fix that signal it was NOT a confirmed runtime
 * bug — a heuristic refinement or a no-behavior-change hardening. These force
 * `borderline` + `needsAdjudication` instead of `buggy` (Rule 4 / Rule 5.1).
 */
const NON_BUG_FIX_MARKERS: readonly string[] = [
  'refine',
  'harden',
  'tighten',
  'heuristic',
  'dry',
  'split-brain',
  'no behavior change',
  'no behaviour change',
  'no live',
];

function looksLikeNonBugFix(fix: FollowUpFix, fixTitle: string): boolean {
  // A `revert` is always a confirmed correction — never treat it as a non-bug.
  if (fix.fixType === 'revert') return false;
  const t = fixTitle.toLowerCase();
  return NON_BUG_FIX_MARKERS.some((m) => t.includes(m));
}

function touchesCorrectnessDomain(files: readonly string[]): boolean {
  return files.some((f) => CORRECTNESS_DOMAINS.some((d) => f.includes(d)));
}

/**
 * Propose a severity for a confirmed buggy case. The post-merge-fix SIGNAL only
 * establishes that a real defect existed and was corrected — it cannot, on its
 * own, distinguish `medium` from `high`/`critical`. So we always propose the
 * rubric floor (`medium`, Rule 5.1: default to the lower severity) and let
 * adjudication escalate with an explicit reachability/exploit rationale. Never
 * auto-`critical`.
 */
function proposeSeverity(): Severity {
  return 'medium';
}

// ============================================================================
// The core decision (pure, fully tested)
// ============================================================================

/**
 * Apply the rubric to a PR's objective signals and PROPOSE a label.
 *
 * Decision table:
 *  - No follow-up fix at all → propose `clean` (Rule 3). Absence of a post-merge
 *    correction is a strong clean signal; the justification records that a
 *    reviewer should still confirm no defensible medium+ objection from the diff.
 *  - A follow-up `fix`/`revert` touching the same source files, in a
 *    correctness/integrity domain, NOT marked as a refine/harden tweak →
 *    propose `buggy` at the medium floor (Rule 5.3 gold).
 *  - A follow-up fix that is a heuristic refinement / no-behavior-change
 *    hardening, OR sits outside a correctness domain → propose `borderline`
 *    with `needsAdjudication` (Rule 4): the signal is real but not a confirmed
 *    runtime bug. NEVER guessed into buggy/clean.
 */
export function proposeLabel(
  signals: PrSignals,
  fixTitles: ReadonlyMap<number, string>
): ProposedLabel {
  const fix = signals.followUpFixes[0];
  if (fix === undefined) {
    return {
      class: 'clean',
      severity: null,
      needsAdjudication: false,
      confidence: 0.7,
      justification:
        `No later PR fixed or reverted any source file #${String(signals.number)} touched ` +
        `(within the harvested window). Rule 3 clean candidate; a reviewer confirms ` +
        `no defensible medium+ objection from the diff before trusting.`,
    };
  }

  const fixTitle = fixTitles.get(fix.fixPrNumber) ?? '';
  const nonBug = looksLikeNonBugFix(fix, fixTitle);
  const correctness = touchesCorrectnessDomain(fix.overlappingSourceFiles);

  if (nonBug || !correctness) {
    return {
      class: 'borderline',
      severity: null,
      needsAdjudication: true,
      confidence: 0.4,
      justification:
        `Later PR #${String(fix.fixPrNumber)} (${fixTitle || fix.fixType}) touched the same ` +
        `source file(s) [${fix.overlappingSourceFiles.join(', ')}], but the follow-up reads as a ` +
        `${nonBug ? 'heuristic refinement / no-behavior-change hardening' : 'change outside a correctness/integrity domain'}. ` +
        `Real signal, NOT a confirmed runtime bug — flagged for human adjudication (Rule 4 / 5.1). Not guessed.`,
    };
  }

  return {
    class: 'buggy',
    severity: proposeSeverity(),
    needsAdjudication: true,
    confidence: 0.75,
    justification:
      `Later PR #${String(fix.fixPrNumber)} (${fixTitle || fix.fixType}) fixed/reverted the same ` +
      `correctness/integrity source file(s) [${fix.overlappingSourceFiles.join(', ')}] #${String(signals.number)} ` +
      `introduced — a confirmed post-merge correction (Rule 5.3 gold). Severity proposed conservatively; ` +
      `the exact line + final severity are set during adjudication.`,
  };
}

// ============================================================================
// Provenance assembly (maps a proposal onto the dataset schema's source enum)
// ============================================================================

export function provenanceSourceFor(label: ProposedLabel): ProvenanceSource {
  return label.class === 'clean' ? 'historical-clean' : 'historical';
}

/**
 * Build the schema-shaped case skeleton from a proposal + signals. The author
 * still fills the exact knownBug location/line during adjudication (the harvest
 * cannot know the line a reviewer would cite); here we emit a structural
 * location so the entry is shape-valid and honestly provisional. Returns a
 * partial — the harvester serializes it into the candidates file with the
 * full-provenance fields.
 */
export interface CandidateCase extends PrReviewCase {
  readonly sourcePrUrl: string;
  readonly objectiveSignals: PrSignals;
  readonly proposal: ProposedLabel;
}
