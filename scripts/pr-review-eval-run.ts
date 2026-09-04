/**
 * pr-review-eval-run.ts — v6 pr_review eval batch runner (#4311, epic #3845;
 * unblocks #3849).
 *
 * The missing connective harness: loads the rubric-adjudicated corpus
 * (`testing/datasets/pr-review-sample.json`, #3846/#3847), obtains each case's
 * diff (`customDiff` for synthetic cases; `gh` fetch for real PR numbers that
 * carry none), runs it through the live 5-voter pr_review panel, scores each
 * voter's verdict against the case's gold `class`/`knownBugs` via the #3848
 * scorer, aggregates per-voter TP/FP/FN + precision/recall, writes the
 * verdicts to the #3848 JSONL eval store, and regenerates
 * `docs/research/pr-review-experiment-results-v6.md`.
 *
 * All scoring/aggregation/doc-shape logic is PURE and lives in
 * `pr-review-eval-run-core.ts`; this file is the thin I/O edge (mirrors the
 * curate-pr-review-harvest / -labeling split and mine-pr-review-candidates'
 * assemble/thin-script split).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LIVE MODEL CALLS (read before running)
 * ─────────────────────────────────────────────────────────────────────────
 * The default panel runner calls `collectRealVotes` — 5 real LLM calls per
 * case (n cases in the corpus). This requires model auth: a CLI adapter
 * (claude/gemini/codex) or `ANTHROPIC_API_KEY`. It is NOT run in CI or in this
 * package's automated test suite — the tests inject a deterministic STUB
 * panel (`PanelRunner`) so the plumbing (corpus load → diff resolution →
 * scoring → aggregation → doc/store write) is verified without touching a
 * model. Never `simulateVotes` standing in for a live run.
 *
 * Usage:
 *   npm run eval:run
 *   pnpm exec tsx scripts/pr-review-eval-run.ts
 *
 * @module scripts/pr-review-eval-run
 * (Source: #4311, epic #3845, unblocks #3849; scorer from #3848; rubric #3846)
 */

/* eslint-disable no-console -- CLI script that prints progress */

import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  parseDataset,
  type PrReviewCase,
  type PrReviewDataset,
} from './curate-pr-review-dataset-schema.js';
import { ROOT } from './script-paths.js';
import { fetchGhDiff } from './pr-review-local-ledger.js';
import {
  scoreCaseVoters,
  renderResultsDoc,
  type PanelRunner,
  type PanelVoterOutcome,
  type EvalCaseResult,
} from './pr-review-eval-run-core.js';

import {
  buildPrReviewProposal,
  PR_REVIEW_ROLES,
  mapVoteDecisionToPrDecision,
} from '../packages/nexus-agents/src/mcp/tools/pr-review-tool.js';
import { collectRealVotes } from '../packages/nexus-agents/src/cli/voter-agents.js';
import { isFindingVerified } from '../packages/nexus-agents/src/mcp/tools/pr-review-findings.js';
import { PrReviewEvalStore } from '../packages/nexus-agents/src/mcp/tools/pr-review-eval-store.js';
import { computePerVoterPrecisionRecall } from '../packages/nexus-agents/src/mcp/tools/pr-review-eval-scoring.js';
import type {
  PrReviewEvalRole,
  VoterEvalVerdict,
} from '../packages/nexus-agents/src/mcp/tools/pr-review-eval-types.js';

export const DATASET_PATH = path.join(ROOT, 'testing/datasets/pr-review-sample.json');
export const RESULTS_DOC_PATH = path.join(ROOT, 'docs/research/pr-review-experiment-results-v6.md');

// ============================================================================
// Dataset load (read-only file I/O)
// ============================================================================

/** Load + validate the corpus off disk. Throws on any schema violation —
 * a bad dataset must fail loudly, never silently score against garbage. */
export function loadDatasetFromDisk(filePath: string = DATASET_PATH): PrReviewDataset {
  const raw: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const parsed = parseDataset(raw);
  if (!parsed.success) {
    throw new Error(`invalid pr_review eval dataset (${filePath}):\n${parsed.errors.join('\n')}`);
  }
  return parsed.data;
}

// ============================================================================
// Diff resolution (customDiff, or gh fetch for real PR numbers)
// ============================================================================

/**
 * Resolve the diff a case's panel run reviews. Synthetic cases carry
 * `customDiff` directly (no fetch). Real PR numbers without a stored diff are
 * fetched live via `gh` (the #4229 fallback path — the eval's diff does not
 * need ledger-hash parity, so the plain `v3.diff` fetch is sufficient here).
 */
export async function resolveDiff(c: PrReviewCase): Promise<string> {
  if (c.customDiff !== undefined && c.customDiff !== '') return c.customDiff;
  if (typeof c.number === 'number') {
    const { diff } = await fetchGhDiff(c.number);
    return diff;
  }
  throw new Error(
    `case "${c.number}": no customDiff and a non-numeric number — cannot resolve a diff`
  );
}

// ============================================================================
// Live panel runner (default; injectable for tests)
// ============================================================================

/**
 * The default {@link PanelRunner}: runs the live 5-voter pr_review panel via
 * `collectRealVotes` (real LLM calls — see the module-level auth note).
 * Mirrors `scripts/pr-review-local.ts`'s vote-mapping so a live v6 run scores
 * the SAME finding/verification shape a real `pr_review` invocation produces.
 */
export const livePanelRunner: PanelRunner = async (input) => {
  const proposal = buildPrReviewProposal({
    prTitle: input.title,
    prDescription: input.description,
    prDiff: input.diff,
  });
  const voteResults = await collectRealVotes({ roles: PR_REVIEW_ROLES, proposal, simulate: false });
  return voteResults.map((r): PanelVoterOutcome => {
    const rawFindings = r.vote.findings ?? [];
    return {
      role: r.role as PrReviewEvalRole,
      decision: mapVoteDecisionToPrDecision(r.vote.decision),
      findings: rawFindings.map((f) => ({
        summary: f.summary,
        location: f.location,
        severity: f.severity,
        verified: isFindingVerified(f.gate),
      })),
      source: r.source,
    };
  });
};

// ============================================================================
// Orchestration
// ============================================================================

export interface EvalRunDeps {
  readonly loadDataset?: () => PrReviewDataset;
  readonly resolveDiff?: (c: PrReviewCase) => Promise<string>;
  readonly panelRunner?: PanelRunner;
  readonly store?: PrReviewEvalStore;
  readonly writeDoc?: (markdown: string) => void;
  readonly now?: () => Date;
  readonly runId?: string;
  /** Progress hook (defaults to `console.log`); tests can silence/capture it. */
  readonly onProgress?: (message: string) => void;
}

export interface EvalRunResult {
  readonly runId: string;
  readonly report: ReturnType<typeof computePerVoterPrecisionRecall>;
  readonly caseResults: readonly EvalCaseResult[];
  readonly doc: string;
}

/** Every {@link EvalRunDeps} collaborator with its default filled in. */
interface ResolvedDeps {
  readonly loadDataset: () => PrReviewDataset;
  readonly resolveDiff: (c: PrReviewCase) => Promise<string>;
  readonly panelRunner: PanelRunner;
  readonly store: PrReviewEvalStore;
  readonly writeDoc: (markdown: string) => void;
  readonly now: () => Date;
  readonly onProgress: (message: string) => void;
}

function resolveDeps(deps: EvalRunDeps): ResolvedDeps {
  return {
    loadDataset: deps.loadDataset ?? (() => loadDatasetFromDisk()),
    resolveDiff: deps.resolveDiff ?? resolveDiff,
    panelRunner: deps.panelRunner ?? livePanelRunner,
    store: deps.store ?? new PrReviewEvalStore(),
    writeDoc:
      deps.writeDoc ??
      ((md: string) => {
        fs.writeFileSync(RESULTS_DOC_PATH, md, 'utf-8');
      }),
    now: deps.now ?? (() => new Date()),
    onProgress:
      deps.onProgress ??
      ((msg: string) => {
        console.log(msg);
      }),
  };
}

/** Run one case through the panel + #3848 scorer, appending its verdicts to the store. */
async function runCase(
  c: PrReviewCase,
  ctx: { readonly runId: string; readonly timestamp: string; readonly rubricVersion: string },
  resolved: ResolvedDeps
): Promise<EvalCaseResult> {
  const caseNumber = String(c.number);
  resolved.onProgress(`[${caseNumber}] resolving diff…`);
  const diff = await resolved.resolveDiff(c);
  resolved.onProgress(`[${caseNumber}] running panel (${String(PR_REVIEW_ROLES.length)} voters)…`);
  const outcomes = await resolved.panelRunner({
    caseNumber,
    title: c.title,
    description: c.customDescription ?? '',
    diff,
  });
  const verdicts = scoreCaseVoters(
    {
      runId: ctx.runId,
      caseNumber,
      caseClass: c.class,
      knownBugs: c.knownBugs,
      rubricVersion: ctx.rubricVersion,
      timestamp: ctx.timestamp,
    },
    outcomes
  );
  for (const v of verdicts) resolved.store.append(v);
  resolved.onProgress(`[${caseNumber}] scored ${String(verdicts.length)} voter verdict(s).`);
  return { number: caseNumber, class: c.class, title: c.title, outcomes, verdicts };
}

/**
 * Run the full v6 batch: dataset -> per-case panel run -> per-voter scoring ->
 * store append -> results doc. Every collaborator is injectable so this is
 * unit-testable end-to-end with a deterministic stub panel and an in-memory
 * doc sink — see `pr-review-eval-run.test.ts`.
 */
export async function runEval(deps: EvalRunDeps = {}): Promise<EvalRunResult> {
  const resolved = resolveDeps(deps);
  const timestamp = resolved.now().toISOString();
  const runId = deps.runId ?? `v6-${timestamp}`;
  const dataset = resolved.loadDataset();

  const caseResults: EvalCaseResult[] = [];
  for (const c of dataset.prs) {
    const result = await runCase(
      c,
      { runId, timestamp, rubricVersion: dataset.rubricVersion },
      resolved
    );
    caseResults.push(result);
  }

  const allVerdicts: VoterEvalVerdict[] = caseResults.flatMap((c) => c.verdicts);
  const report = computePerVoterPrecisionRecall(allVerdicts);
  const doc = renderResultsDoc({
    runId,
    timestamp,
    dataset: { rubricVersion: dataset.rubricVersion },
    report,
    caseResults,
  });
  resolved.writeDoc(doc);

  return { runId, report, caseResults, doc };
}

// ============================================================================
// CLI entry
// ============================================================================

async function main(): Promise<void> {
  console.log(
    'Running pr_review v6 eval batch — LIVE panel (requires model auth: a CLI ' +
      'adapter or ANTHROPIC_API_KEY). See the module doc for the stub-panel test path.'
  );
  const result = await runEval();
  console.log(`\nDone. runId=${result.runId}`);
  console.log(`Wrote ${RESULTS_DOC_PATH}`);
  for (const role of Object.keys(result.report.byRole) as PrReviewEvalRole[]) {
    const r = result.report.byRole[role];
    console.log(
      `  ${role}: precision=${r.precision.toFixed(2)} recall=${r.recall.toFixed(2)} ` +
        `(tp=${String(r.truePositives)} fp=${String(r.falsePositives)} fn=${String(r.falseNegatives)})`
    );
  }
}

const invokedPath = process.argv[1] ?? '';
if (import.meta.url === `file://${invokedPath}`) {
  await main();
}
