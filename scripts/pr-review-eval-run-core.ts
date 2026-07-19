/**
 * pr-review-eval-run-core.ts — PURE scoring + doc-rendering core for the v6
 * pr_review eval batch runner (#4311, epic #3845; unblocks #3849).
 *
 * The connective tissue this issue exists to build: feed the rubric-adjudicated
 * corpus (`testing/datasets/pr-review-sample.json`, #3846/#3847) through the
 * pr_review panel and the #3848 scorer to produce per-voter precision/recall.
 * This module owns the two PURE pieces —
 *
 * - {@link matchesKnownBug}: rubric Rule 2 location-tolerance matching (a panel
 *   finding vs one known bug — `±5` lines for `line`-tolerance bugs, same-file
 *   for `structural`-tolerance bugs whose defect has no single line).
 * - {@link scoreCaseVoters}: turn one case's per-voter panel outcomes into
 *   {@link VoterEvalVerdict} records via the #3848 `scoreVoterCase`.
 * - {@link renderResultsDoc}: render the v6 results markdown doc.
 *
 * ZERO I/O. The panel invocation (live LLM calls) and file/gh access live in the
 * thin `pr-review-eval-run.ts` orchestrator, which injects a {@link PanelRunner}
 * — this keeps the scoring/aggregation/doc-shape plumbing deterministically
 * unit-testable with a stub panel (no model auth needed in CI).
 *
 * @module scripts/pr-review-eval-run-core
 * (Source: #4311, epic #3845, unblocks #3849; scorer from #3848; rubric #3846)
 */

import { scoreVoterCase } from '../packages/nexus-agents/src/mcp/tools/pr-review-eval-scoring.js';
import { PR_REVIEW_EVAL_ROLES } from '../packages/nexus-agents/src/mcp/tools/pr-review-eval-types.js';
import type {
  PrReviewCaseClass,
  PrReviewEvalRole,
  VoterEvalVerdict,
  PerVoterPrecisionRecallReport,
  VoterPrecisionRecall,
} from '../packages/nexus-agents/src/mcp/tools/pr-review-eval-types.js';
import type { KnownBug, PrReviewDataset } from './curate-pr-review-dataset-schema.js';

// ============================================================================
// Panel output shapes — the injectable seam's contract (#4311)
// ============================================================================

/** One finding as the eval harness needs it — a trimmed, verification-resolved
 * projection of `mcp/tools/pr-review-findings.ts`'s `Finding` (no raw gate
 * detail; the harness only needs whether it passed the gate). */
export interface PanelFinding {
  readonly summary: string;
  /** `path/file.ext:line` or `path/file.ext` (structural). */
  readonly location: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  /** Did all 4 verification-gate checks pass (`isFindingVerified`)? Only
   * verified findings are scored — see rubric Rules 1-4. */
  readonly verified: boolean;
}

/** One voter's outcome on one case, as the panel runner reports it. */
export interface PanelVoterOutcome {
  readonly role: PrReviewEvalRole;
  readonly decision: 'approve' | 'request_changes' | 'abstain';
  readonly findings: readonly PanelFinding[];
  /** Mirrors `AgentVoteResult.source` — 'error' outcomes are excluded from
   * scoring by {@link scoreCaseVoters} (a transport/auth failure is not a
   * scored miss). */
  readonly source: 'llm' | 'simulation' | 'error';
}

/** The input one case resolves to before it reaches the panel. */
export interface EvalPanelInput {
  readonly caseNumber: string;
  readonly title: string;
  readonly description: string;
  readonly diff: string;
}

/** The injectable seam: production wires the live 5-voter pr_review panel;
 * tests inject a deterministic stub. NEVER `simulateVotes` standing in for a
 * live run — a stub used here is explicitly test-only plumbing, not a
 * pretend measurement. */
export type PanelRunner = (input: EvalPanelInput) => Promise<readonly PanelVoterOutcome[]>;

// ============================================================================
// Location-tolerance matching (rubric Rule 2)
// ============================================================================

interface ParsedLocation {
  readonly file: string;
  readonly line: number | undefined;
}

/** Splits a `path:line` or bare `path` citation into file + optional line. */
function parseLocation(loc: string): ParsedLocation {
  const trimmed = loc.trim();
  const m = /^(.*):(\d+)$/.exec(trimmed);
  if (m?.[1] !== undefined && m[2] !== undefined && m[1] !== '') {
    return { file: m[1], line: Number(m[2]) };
  }
  return { file: trimmed, line: undefined };
}

/** Same file when the paths are equal or one is a path-suffix of the other —
 * tolerates a voter citing a repo-root-relative path against a monorepo-
 * relative (or vice versa) known-bug location. */
function sameFile(a: string, b: string): boolean {
  if (a === '' || b === '') return false;
  if (a === b) return true;
  return a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

/**
 * Rubric Rule 2 (`docs/research/pr-review-eval-labeling-rubric.md`): a panel
 * finding MATCHES a known bug when both cite the same file, AND:
 * - `locationTolerance: 'line'` — the finding's cited line is within ±5 lines
 *   of the bug's line;
 * - `locationTolerance: 'structural'` — matches on file alone; the defect (a
 *   missing `Record` entry, a union-member gap) has no single line to compare,
 *   so requiring a line match would score a real catch as a miss.
 */
export function matchesKnownBug(finding: PanelFinding, bug: KnownBug): boolean {
  const findingLoc = parseLocation(finding.location);
  const bugLoc = parseLocation(bug.location);
  if (!sameFile(findingLoc.file, bugLoc.file)) return false;
  if (bug.locationTolerance === 'structural') return true;
  if (findingLoc.line === undefined || bugLoc.line === undefined) return false;
  return Math.abs(findingLoc.line - bugLoc.line) <= 5;
}

// ============================================================================
// Per-case, per-voter scoring
// ============================================================================

export interface ScoreCaseInput {
  readonly runId: string;
  readonly caseNumber: string;
  readonly caseClass: PrReviewCaseClass;
  readonly knownBugs: readonly KnownBug[];
  readonly rubricVersion: string;
  readonly timestamp: string;
}

/**
 * Score every non-errored voter outcome for one eval case against its ground
 * truth. Applies rubric Rule 2 matching ({@link matchesKnownBug}) to resolve
 * `matchedBugCount` and `verifiedFindingCount`, then hands off to the pure
 * #3848 {@link scoreVoterCase} for the TP/FP/FN tally.
 *
 * Errored voters (`source: 'error'`) are excluded entirely — an LLM/transport
 * failure produces no verdict for that role on this case, rather than being
 * scored as a full miss (which would unfairly inflate false negatives).
 */
export function scoreCaseVoters(
  input: ScoreCaseInput,
  outcomes: readonly PanelVoterOutcome[]
): readonly VoterEvalVerdict[] {
  const verdicts: VoterEvalVerdict[] = [];
  for (const outcome of outcomes) {
    if (outcome.source === 'error') continue;
    const verifiedFindings = outcome.findings.filter((f) => f.verified);
    const matchedBugCount = input.knownBugs.filter((bug) =>
      verifiedFindings.some((f) => matchesKnownBug(f, bug))
    ).length;
    verdicts.push(
      scoreVoterCase({
        runId: input.runId,
        caseNumber: input.caseNumber,
        caseClass: input.caseClass,
        role: outcome.role,
        knownBugCount: input.knownBugs.length,
        matchedBugCount,
        verifiedFindingCount: verifiedFindings.length,
        rubricVersion: input.rubricVersion,
        timestamp: input.timestamp,
      })
    );
  }
  return verdicts;
}

// ============================================================================
// Results doc rendering (markdown)
// ============================================================================

/** One case's outcomes + verdicts, folded for the results doc. */
export interface EvalCaseResult {
  readonly number: string;
  readonly class: PrReviewCaseClass;
  readonly title: string;
  readonly outcomes: readonly PanelVoterOutcome[];
  readonly verdicts: readonly VoterEvalVerdict[];
}

export interface RenderDocParams {
  readonly runId: string;
  readonly timestamp: string;
  readonly dataset: Pick<PrReviewDataset, 'rubricVersion'>;
  readonly report: PerVoterPrecisionRecallReport;
  readonly caseResults: readonly EvalCaseResult[];
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function roleRow(role: PrReviewEvalRole, r: VoterPrecisionRecall): string {
  return (
    `| ${role} | ${String(r.truePositives)} | ${String(r.falsePositives)} | ` +
    `${String(r.falseNegatives)} | ${pct(r.precision)} | ${pct(r.recall)} | ${String(r.caseCount)} |`
  );
}

function caseRow(c: EvalCaseResult): string {
  const verifiedCount = c.outcomes.reduce(
    (n, o) => n + o.findings.filter((f) => f.verified).length,
    0
  );
  return `| ${c.number} | ${c.class} | ${String(verifiedCount)} |`;
}

function renderFrontmatterAndTitle(): readonly string[] {
  return [
    '---',
    'title: pr_review experiment v6 — per-voter precision/recall from the eval batch harness',
    'description: Batch run of the pr_review panel against the rubric-adjudicated ' +
      'corpus (#3846/#3847), scored per-voter via the #3848 scorer. Generated by ' +
      'scripts/pr-review-eval-run.ts (#4311, epic #3845, unblocks #3849).',
    'tier: 2',
    'keywords: [pr-review, eval, v6, precision, recall, autonomous-sdlc]',
    '---',
    '',
    '# pr_review experiment v6 — per-voter precision/recall from the eval batch harness',
    '',
  ];
}

interface HeaderCounts {
  readonly n: number;
  readonly buggyN: number;
  readonly cleanN: number;
  readonly borderlineN: number;
}

function renderHeader(
  runId: string,
  timestamp: string,
  rubricVersion: string,
  counts: HeaderCounts
): readonly string[] {
  return [
    `**Run id:** \`${runId}\``,
    '',
    `**Generated:** ${timestamp}`,
    '',
    `**Dataset:** \`testing/datasets/pr-review-sample.json\` (rubricVersion ` +
      `${rubricVersion}, n=${String(counts.n)}: ${String(counts.buggyN)} buggy / ` +
      `${String(counts.cleanN)} clean / ${String(counts.borderlineN)} borderline)`,
    '',
    '**Harness:** `scripts/pr-review-eval-run.ts` (#4311, epic #3845; unblocks #3849) — ' +
      'feeds the corpus through the live 5-voter pr_review panel and scores each voter ' +
      'verdict against ground truth via the #3848 scorer (`scoreVoterCase` / ' +
      '`computePerVoterPrecisionRecall`).',
    '',
    `> **Metric-honesty guardrail (#3903).** n=${String(counts.n)} remains a small corpus — ` +
      'treat every figure below as directional, not statistically significant, the same ' +
      'guardrail that governs every prior pr_review eval doc in this series ' +
      '(`pr-review-experiment-results-v5.md`). Always carry the n and the class split ' +
      'when citing any number from this run.',
    '',
  ];
}

function renderVoterTable(report: PerVoterPrecisionRecallReport): readonly string[] {
  return [
    '## Per-voter precision / recall',
    '',
    '| Role | TP | FP | FN | Precision | Recall | Cases |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...PR_REVIEW_EVAL_ROLES.map((role) => roleRow(role, report.byRole[role])),
    `| **aggregate** | ${String(report.aggregate.truePositives)} | ` +
      `${String(report.aggregate.falsePositives)} | ${String(report.aggregate.falseNegatives)} | ` +
      `${pct(report.aggregate.precision)} | ${pct(report.aggregate.recall)} | ` +
      `${String(report.aggregate.caseCount)} |`,
    '',
    `Total verdicts recorded: ${String(report.totalVerdicts)}.`,
    '',
  ];
}

function renderCaseTable(caseResults: readonly EvalCaseResult[]): readonly string[] {
  return [
    '## Per-case results',
    '',
    '| Case | Class | Verified findings (all voters) |',
    '| --- | --- | --- |',
    ...caseResults.map(caseRow),
    '',
  ];
}

function renderReproSection(n: number): readonly string[] {
  return [
    '## How to reproduce / run live',
    '',
    '```bash',
    'npm run eval:run',
    '# or: npx tsx scripts/pr-review-eval-run.ts',
    '```',
    '',
    'The default invocation runs the LIVE 5-voter pr_review panel — 5 LLM calls per ' +
      `case (${String(n)} cases in the current corpus) — and requires model auth (a CLI ` +
      'adapter such as claude/gemini/codex, or `ANTHROPIC_API_KEY`). Results are appended ' +
      'to the #3848 JSONL store (`~/.nexus-agents/learning/pr-review-eval.jsonl` by default, ' +
      '`NEXUS_DATA_DIR`-relocatable) and this doc is regenerated in place. The plumbing above ' +
      '(corpus load, scoring, aggregation, doc/store write) is unit-tested with a deterministic ' +
      'stub panel — see `scripts/pr-review-eval-run.test.ts` and ' +
      '`scripts/pr-review-eval-run-core.test.ts`; no live model calls happen in CI.',
    '',
  ];
}

/**
 * Render the v6 results markdown doc (`docs/research/pr-review-experiment-results-v6.md`).
 * Pure string building — no file I/O (the orchestrator writes the returned
 * string). Mirrors the frontmatter + per-voter/per-case table shape of the
 * prior `pr-review-experiment-results-v5.md`, carries forward the #3903
 * metric-honesty guardrail note, and documents the live-run reproduction
 * command.
 */
export function renderResultsDoc(params: RenderDocParams): string {
  const { runId, timestamp, dataset, report, caseResults } = params;
  const counts: HeaderCounts = {
    n: caseResults.length,
    buggyN: caseResults.filter((c) => c.class === 'buggy').length,
    cleanN: caseResults.filter((c) => c.class === 'clean').length,
    borderlineN: caseResults.filter((c) => c.class === 'borderline').length,
  };

  const lines: readonly string[] = [
    ...renderFrontmatterAndTitle(),
    ...renderHeader(runId, timestamp, dataset.rubricVersion, counts),
    ...renderVoterTable(report),
    ...renderCaseTable(caseResults),
    ...renderReproSection(counts.n),
  ];
  return `${lines.join('\n')}\n`;
}
