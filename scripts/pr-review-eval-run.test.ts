/**
 * Tests for the v6 pr_review eval batch orchestrator (#4311, epic #3845;
 * unblocks #3849).
 *
 * Drives {@link runEval} end-to-end with EVERY collaborator injected: a
 * deterministic STUB panel (fixed votes, never `simulateVotes` standing in
 * for a live run — this is test-only plumbing), an in-memory dataset, a
 * temp-file-backed real `PrReviewEvalStore`, and a captured doc sink. No live
 * model calls, no `gh` calls, no writes outside a tmpdir.
 *
 * Covers: corpus load -> per-case panel run -> #3848 scoring -> aggregation
 * -> store append -> doc write, for a buggy case (catch + miss) and a clean
 * case (false positive), plus the real-dataset smoke test (loads the actual
 * n=19 corpus and validates every case resolves a diff).
 *
 * @module scripts/pr-review-eval-run.test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runEval, loadDatasetFromDisk, resolveDiff, DATASET_PATH } from './pr-review-eval-run.js';
import type { PanelRunner, PanelVoterOutcome } from './pr-review-eval-run-core.js';
import { PrReviewEvalStore } from '../packages/nexus-agents/src/mcp/tools/pr-review-eval-store.js';
import type { PrReviewDataset } from './curate-pr-review-dataset-schema.js';

const TS = '2026-07-17T12:00:00.000Z';

function dataset(over: Partial<PrReviewDataset> = {}): PrReviewDataset {
  return {
    rubricVersion: '1.0.0',
    curatedAt: '2026-07-17',
    methodology: 'test fixture',
    prs: [
      {
        number: 'buggy-case',
        rubricVersion: '1.0.0',
        class: 'buggy',
        title: 'a buggy fixture case',
        customDescription: 'desc',
        customDiff: 'diff --git a/src/foo.ts b/src/foo.ts\n+bug here',
        provenance: { source: 'synthetic', fixReference: null, discoveredBy: null },
        knownBugs: [
          {
            summary: 'a real bug',
            severity: 'high',
            location: 'src/foo.ts:10',
            locationTolerance: 'line',
            fixReference: 'synthetic',
          },
        ],
        borderlineConcerns: [],
        adjudication: {
          adjudicatedAt: '2026-07-17',
          adjudicatedUnder: '1.0.0',
          rationale: 'fixture rationale text long enough',
        },
      },
      {
        number: 'clean-case',
        rubricVersion: '1.0.0',
        class: 'clean',
        title: 'a clean fixture case',
        customDescription: 'desc',
        customDiff: 'diff --git a/src/bar.ts b/src/bar.ts\n+harmless',
        provenance: { source: 'synthetic', fixReference: null, discoveredBy: null },
        knownBugs: [],
        borderlineConcerns: [],
        adjudication: {
          adjudicatedAt: '2026-07-17',
          adjudicatedUnder: '1.0.0',
          rationale: 'fixture rationale text long enough',
        },
      },
    ],
    ...over,
  };
}

/**
 * A deterministic stub panel: architect+security flag the buggy case's known
 * bug (one at the exact line, one nearby, within ±5); devex/catfish/scope_steward
 * approve. On the clean case, catfish raises an unverified concern (must not
 * count as FP) and everyone else approves.
 */
const stubPanel: PanelRunner = (input) => {
  if (input.caseNumber === 'buggy-case') {
    const outcomes: PanelVoterOutcome[] = [
      {
        role: 'architect',
        decision: 'request_changes',
        source: 'llm',
        findings: [
          {
            summary: 'the known bug',
            location: 'src/foo.ts:10',
            severity: 'high',
            verified: true,
          },
        ],
      },
      {
        role: 'security',
        decision: 'request_changes',
        source: 'llm',
        findings: [
          {
            summary: 'the known bug, nearby line',
            location: 'src/foo.ts:12',
            severity: 'high',
            verified: true,
          },
        ],
      },
      { role: 'devex', decision: 'approve', source: 'llm', findings: [] },
      { role: 'catfish', decision: 'approve', source: 'llm', findings: [] },
      { role: 'scope_steward', decision: 'approve', source: 'llm', findings: [] },
    ];
    return Promise.resolve(outcomes);
  }
  // clean-case
  const outcomes: PanelVoterOutcome[] = [
    { role: 'architect', decision: 'approve', source: 'llm', findings: [] },
    { role: 'security', decision: 'approve', source: 'llm', findings: [] },
    { role: 'devex', decision: 'approve', source: 'llm', findings: [] },
    {
      role: 'catfish',
      decision: 'approve',
      source: 'llm',
      findings: [
        { summary: 'minor nit', location: 'src/bar.ts:1', severity: 'low', verified: false },
      ],
    },
    { role: 'scope_steward', decision: 'approve', source: 'llm', findings: [] },
  ];
  return Promise.resolve(outcomes);
};

let dir: string;
let storeFile: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pr-review-eval-run-'));
  storeFile = join(dir, 'pr-review-eval.jsonl');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('runEval (v6 batch orchestrator, stub panel)', () => {
  it('scores a buggy case: two catches (architect+security) and three approvers with no findings', async () => {
    let writtenDoc = '';
    const result = await runEval({
      loadDataset: dataset,
      panelRunner: stubPanel,
      store: new PrReviewEvalStore({ filePath: storeFile }),
      writeDoc: (md) => {
        writtenDoc = md;
      },
      now: () => new Date(TS),
      runId: 'test-run',
      onProgress: () => {},
    });

    expect(result.runId).toBe('test-run');
    const buggyCase = result.caseResults.find((c) => c.number === 'buggy-case');
    expect(buggyCase).toBeDefined();
    expect(buggyCase?.verdicts).toHaveLength(5); // one per non-error voter

    const architectV = buggyCase?.verdicts.find((v) => v.role === 'architect');
    expect(architectV).toMatchObject({ truePositives: 1, falseNegatives: 0, falsePositives: 0 });
    const securityV = buggyCase?.verdicts.find((v) => v.role === 'security');
    expect(securityV).toMatchObject({ truePositives: 1, falseNegatives: 0, falsePositives: 0 });
    const devexV = buggyCase?.verdicts.find((v) => v.role === 'devex');
    expect(devexV).toMatchObject({ truePositives: 0, falseNegatives: 1, falsePositives: 0 });

    expect(result.report.byRole.architect.truePositives).toBe(1);
    expect(result.report.byRole.security.truePositives).toBe(1);
    expect(result.report.byRole.devex.falseNegatives).toBe(1);

    expect(writtenDoc).toContain('| buggy-case | buggy | 2 |');
    expect(writtenDoc).toBe(result.doc);
  });

  it('scores a clean case: an unverified finding is not a false positive', async () => {
    const result = await runEval({
      loadDataset: dataset,
      panelRunner: stubPanel,
      store: new PrReviewEvalStore({ filePath: storeFile }),
      writeDoc: () => {},
      now: () => new Date(TS),
      onProgress: () => {},
    });

    const cleanCase = result.caseResults.find((c) => c.number === 'clean-case');
    expect(cleanCase?.verdicts.every((v) => v.falsePositives === 0)).toBe(true);
    expect(result.report.aggregate.falsePositives).toBe(0);
  });

  it('persists every verdict to the injected store (JSONL round-trip)', async () => {
    const store = new PrReviewEvalStore({ filePath: storeFile });
    const result = await runEval({
      loadDataset: dataset,
      panelRunner: stubPanel,
      store,
      writeDoc: () => {},
      now: () => new Date(TS),
      onProgress: () => {},
    });

    expect(existsSync(storeFile)).toBe(true);
    const totalVerdicts = result.caseResults.reduce((n, c) => n + c.verdicts.length, 0);
    expect(store.size).toBe(totalVerdicts);

    // Fresh store instance hydrates the same verdicts (persistence is real).
    const reader = new PrReviewEvalStore({ filePath: storeFile });
    expect(reader.size).toBe(totalVerdicts);
    expect(reader.query({ runId: result.runId })).toHaveLength(totalVerdicts);
  });

  it('writes the results doc via the injected sink, matching renderResultsDoc shape', async () => {
    let doc = '';
    await runEval({
      loadDataset: dataset,
      panelRunner: stubPanel,
      store: new PrReviewEvalStore({ filePath: storeFile }),
      writeDoc: (md) => {
        doc = md;
      },
      now: () => new Date(TS),
      onProgress: () => {},
    });

    expect(doc.startsWith('---\n')).toBe(true);
    expect(doc).toContain('title: pr_review experiment v6');
    expect(doc).toContain('n=2: 1 buggy / 1 clean / 0 borderline');
    expect(doc).toContain('| Role | TP | FP | FN | Precision | Recall | Cases |');
  });

  it('resolveDiff returns customDiff verbatim for synthetic cases (no gh fetch)', async () => {
    const ds = dataset();
    const c = ds.prs[0];
    if (c === undefined) throw new Error('fixture missing');
    const diff = await resolveDiff(c);
    expect(diff).toBe(c.customDiff);
  });

  it('resolveDiff throws for a non-numeric case number with no customDiff', async () => {
    const c = {
      number: 'synthetic-no-diff',
      rubricVersion: '1.0.0',
      class: 'clean' as const,
      title: 'missing diff',
      provenance: { source: 'synthetic' as const, fixReference: null, discoveredBy: null },
      knownBugs: [],
      borderlineConcerns: [],
      adjudication: {
        adjudicatedAt: '2026-07-17',
        adjudicatedUnder: '1.0.0',
        rationale: 'x'.repeat(20),
      },
    };
    await expect(resolveDiff(c)).rejects.toThrow(/cannot resolve a diff/);
  });
});

describe('loadDatasetFromDisk (real corpus smoke test)', () => {
  it('loads the real n=19 corpus and every case resolves either customDiff or a numeric PR number', () => {
    const ds = loadDatasetFromDisk(DATASET_PATH);
    expect(ds.prs.length).toBeGreaterThanOrEqual(19);
    for (const c of ds.prs) {
      const hasCustomDiff = c.customDiff !== undefined && c.customDiff !== '';
      const hasNumericPr = typeof c.number === 'number';
      expect(hasCustomDiff || hasNumericPr).toBe(true);
    }
  });
});
