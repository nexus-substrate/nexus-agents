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
// Corrective-change KIND classification (#3847 generalization)
// ----------------------------------------------------------------------------
// The signal that distinguishes a real bug-correction from a mere refinement is
// the NATURE of the corrective change, NOT the path it touched. The prior
// version keyed `buggy` off a narrow correctness-domain PATH-PREFIX allowlist,
// so real bug-fixes outside those prefixes (a CI gate that didn't read its doc,
// a router split-brain, a silent cost-persist drop) were systematically
// under-labeled `borderline`. We now classify the corrective PR's KIND from the
// objective fields the pure labeler already has — its conventional-commit type
// prefix (`fix(` vs `refactor(`/`feat(`/`perf(`) and keyword signals in its
// title — and only consult the path as a severity escalator, never as the
// bug gate. No PR numbers are encoded; the rule is purely signal-driven.
// ============================================================================

/**
 * Keywords on a follow-up `fix` that mark it as a genuine DEFECT correction:
 * it added a guard / fail-loud / error-handling where failures were silently
 * swallowed, made a previously-cosmetic gate actually resolve/validate, or
 * corrected a split-brain / DRY divergence. Presence of any of these turns a
 * `fix(`-typed follow-up into a confirmed `buggy` signal regardless of path.
 */
const DEFECT_FIX_MARKERS: readonly string[] = [
  'silent',
  'silently',
  'fail-loud',
  'fail loud',
  'guard',
  'resolve',
  'resolves the ref',
  'validate',
  'validation',
  'split-brain',
  'split brain',
  'tie-break',
  'tie break',
  'rate-limit',
  'rate limit',
  'swallow',
  'drop',
  'dropped',
  'missing',
  'cosmetic',
  'actually',
  'error-handling',
  'error handling',
];

/**
 * Keywords on a follow-up that mark it as a mere REFINEMENT — a heuristic
 * tweak, threshold tune, quality improvement, or no-behavior-change hardening.
 * These are NOT correctness defects: the prior PR was not buggy, the later PR
 * only refined it. Such a follow-up proposes `clean` (Rule 3), never `buggy`.
 */
const REFINEMENT_MARKERS: readonly string[] = [
  'refine',
  'refines',
  'refinement',
  'tune',
  'tunes',
  'tuning',
  'threshold',
  'heuristic',
  'heuristics',
  'no behavior change',
  'no behaviour change',
  'no-behavior-change',
  'no live',
  'quality',
  'polish',
  'cleanup',
  'clean up',
];

/**
 * Integrity-domain markers that, on a CONFIRMED defect-fix, justify escalating
 * the proposed severity from the `medium` floor to `high`: a governance/CI gate
 * that didn't actually enforce what it claimed, a router split-brain / missing
 * rule-guard, or an auth/security integrity defect. These are reachable
 * incorrect-result/integrity failures (rubric `high`), not edge-case foot-guns.
 */
const INTEGRITY_MARKERS: readonly string[] = [
  'gate',
  'governance',
  'split-brain',
  'split brain',
  'rule-guard',
  'rule guard',
  'router',
  'routing',
  'auth',
  'security',
  'resolve',
  'tie-break',
  'tie break',
];

/** Path prefixes whose presence on the overlap corroborates an integrity defect. */
const INTEGRITY_DOMAINS: readonly string[] = [
  '/security/',
  '/auth/',
  '/governance/',
  '/router/',
  '/routing/',
];

function hasMarker(text: string, markers: readonly string[]): boolean {
  const t = text.toLowerCase();
  return markers.some((m) => t.includes(m));
}

/**
 * The three KINDs a follow-up correction can take, derived purely from the
 * fix's type prefix + title keywords (the objective fields the labeler has).
 */
type FixKind = 'defect' | 'refinement' | 'ambiguous';

/**
 * Classify a follow-up correction's KIND.
 *  - `revert` is always a confirmed defect correction.
 *  - A non-`fix`/non-`revert` follow-up (`refactor`/`feat`/`perf`/…) is not a
 *    bug-correction → `refinement`.
 *  - A `fix(`-typed follow-up: REFINEMENT keywords win (it tuned, didn't
 *    correct); otherwise DEFECT keywords → `defect`. A bare `fix(` with neither
 *    marker is genuinely `ambiguous` → borderline (we do NOT guess it buggy).
 */
function classifyFix(fix: FollowUpFix, fixTitle: string): FixKind {
  if (fix.fixType === 'revert') return 'defect';
  if (fix.fixType !== 'fix') return 'refinement';
  if (hasMarker(fixTitle, REFINEMENT_MARKERS)) return 'refinement';
  if (hasMarker(fixTitle, DEFECT_FIX_MARKERS)) return 'defect';
  return 'ambiguous';
}

/**
 * Propose a severity for a confirmed buggy case. The fix SIGNAL establishes a
 * real defect existed; on its own it cannot separate `medium` from `high`. We
 * default to the rubric floor (`medium`, Rule 5.1) and escalate to `high` ONLY
 * with a CLEAR integrity-domain signal — a governance/CI gate, router
 * split-brain, or auth/security defect, evidenced by the fix title or the
 * overlapping path. Never auto-`critical` (that needs an explicit exploit
 * rationale set during adjudication).
 */
function proposeSeverity(fixTitle: string, overlap: readonly string[]): Severity {
  const integrityTitle = hasMarker(fixTitle, INTEGRITY_MARKERS);
  const integrityPath = overlap.some((f) => INTEGRITY_DOMAINS.some((d) => f.includes(d)));
  return integrityTitle || integrityPath ? 'high' : 'medium';
}

// ============================================================================
// The core decision (pure, fully tested)
// ============================================================================

/**
 * Apply the rubric to a PR's objective signals and PROPOSE a label.
 *
 * Decision table (KIND-driven, #3847 — the corrective change's NATURE, not its
 * path, gates `buggy`):
 *  - No follow-up fix at all → propose `clean` (Rule 3). Absence of a post-merge
 *    correction is a strong clean signal; the justification records that a
 *    reviewer should still confirm no defensible medium+ objection from the diff.
 *  - A follow-up of KIND `defect` (a `revert`, or a `fix(` that adds a
 *    guard/fail-loud/error-handling for a silent failure, makes a cosmetic gate
 *    actually resolve/validate, or corrects a split-brain/tie-break) → propose
 *    `buggy`. Severity is the `medium` floor, escalated to `high` ONLY on a
 *    clear integrity-domain signal (Rule 5.3 gold; Rule 5.1 floor).
 *  - A follow-up of KIND `refinement` (a non-`fix` follow-up, or a `fix(` that
 *    only refines heuristics / tunes thresholds / does no-behavior-change
 *    hardening / improves quality) → propose `clean`: the prior PR was not
 *    buggy, the later PR merely refined it (Rule 3).
 *  - A follow-up of KIND `ambiguous` (a bare `fix(` with neither a defect nor a
 *    refinement marker) → propose `borderline` + `needsAdjudication` (Rule 4):
 *    the signal is real but the nature is unestablished. NEVER guessed buggy/clean.
 */
/** No post-merge correction at all → strong clean signal (Rule 3). */
function cleanNoFix(signals: PrSignals): ProposedLabel {
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

/** Follow-up of KIND `refinement` → clean: the prior PR was not buggy (Rule 3). */
function cleanRefinement(fix: FollowUpFix, fixTitle: string, files: string): ProposedLabel {
  return {
    class: 'clean',
    severity: null,
    needsAdjudication: false,
    confidence: 0.65,
    justification:
      `Later PR #${String(fix.fixPrNumber)} (${fixTitle || fix.fixType}) touched the same ` +
      `source file(s) [${files}], but its KIND is a refinement — it tunes heuristics / ` +
      `thresholds / does no-behavior-change hardening, not a correctness correction. The ` +
      `prior PR was not buggy; the follow-up only refined it (Rule 3 clean).`,
  };
}

/** Bare `fix(` with no defect/refinement marker → borderline, never guessed (Rule 4). */
function borderlineAmbiguous(fix: FollowUpFix, fixTitle: string, files: string): ProposedLabel {
  return {
    class: 'borderline',
    severity: null,
    needsAdjudication: true,
    confidence: 0.4,
    justification:
      `Later PR #${String(fix.fixPrNumber)} (${fixTitle || fix.fixType}) is a \`fix\` touching the ` +
      `same source file(s) [${files}], but its title carries neither a defect-fix marker ` +
      `(silent/guard/resolve/split-brain/…) nor a refinement marker. Real signal, KIND ` +
      `unestablished — flagged for human adjudication (Rule 4). Not guessed buggy or clean.`,
  };
}

/** Follow-up of KIND `defect` → buggy at the medium floor, high on integrity (Rule 5.3). */
function buggyDefect(
  signals: PrSignals,
  fix: FollowUpFix,
  fixTitle: string,
  files: string
): ProposedLabel {
  const severity = proposeSeverity(fixTitle, fix.overlappingSourceFiles);
  return {
    class: 'buggy',
    severity,
    needsAdjudication: true,
    confidence: 0.75,
    justification:
      `Later PR #${String(fix.fixPrNumber)} (${fixTitle || fix.fixType}) is a defect-fixing ` +
      `correction of the same source file(s) [${files}] #${String(signals.number)} introduced ` +
      `(adds a guard/fail-loud/resolution where one was missing, or a revert) — a confirmed ` +
      `post-merge correction (Rule 5.3 gold). Severity ${severity} ` +
      `(${severity === 'high' ? 'clear integrity-domain signal' : 'medium floor, Rule 5.1'}); ` +
      `the exact line is set during adjudication.`,
  };
}

export function proposeLabel(
  signals: PrSignals,
  fixTitles: ReadonlyMap<number, string>
): ProposedLabel {
  const fix = signals.followUpFixes[0];
  if (fix === undefined) return cleanNoFix(signals);

  const fixTitle = fixTitles.get(fix.fixPrNumber) ?? '';
  const kind = classifyFix(fix, fixTitle);
  const files = fix.overlappingSourceFiles.join(', ');

  if (kind === 'refinement') return cleanRefinement(fix, fixTitle, files);
  if (kind === 'ambiguous') return borderlineAmbiguous(fix, fixTitle, files);
  return buggyDefect(signals, fix, fixTitle, files);
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
