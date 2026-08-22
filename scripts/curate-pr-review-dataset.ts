#!/usr/bin/env npx tsx
/**
 * curate-pr-review-dataset.ts — the pr_review eval-set curation pipeline (#3847).
 *
 * Single, reproducible entry point for growing and validating the pr_review
 * evaluation dataset (testing/datasets/pr-review-sample.json) under the labeling
 * rubric (docs/research/pr-review-eval-labeling-rubric.md, #3846).
 *
 * Subcommands:
 *   validate    Validate every entry against the rubric schema + check the
 *               dataset rubricVersion matches the rubric doc. (Used by the test.)
 *   stats       Print n + class balance (buggy/clean/borderline) + source split.
 *   add <kind>  Print a rubric-stamped skeleton entry for a new case so adding
 *               case N+1 cannot forget the stamp. <kind> = buggy | clean |
 *               borderline | synthetic-buggy | synthetic-clean.
 *
 * The validator (parseDataset) is the single source of truth for the dataset
 * shape — imported by the test so the dataset cannot drift from the rubric.
 * Sourcing procedure + the honest n>=50 assessment live in
 * docs/research/pr-review-dataset-curation.md. This script does NOT fabricate
 * cases: `add` only emits a skeleton for a human/real-data-sourced case.
 *
 * @module scripts/curate-pr-review-dataset
 * (Source: Issue #3847, epic #3845; rubric #3846)
 */

/* eslint-disable no-console -- this is a CLI script that prints progress */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CLASSES,
  PROVENANCE_SOURCES,
  parseDataset,
  type CaseClass,
  type ProvenanceSource,
  type PrReviewDataset,
} from './curate-pr-review-dataset-schema.js';

// ============================================================================
// Paths
// ============================================================================

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const DATASET_PATH = path.join(REPO_ROOT, 'testing/datasets/pr-review-sample.json');
const RUBRIC_PATH = path.join(REPO_ROOT, 'docs/research/pr-review-eval-labeling-rubric.md');

// ============================================================================
// Load + rubric-version cross-check
// ============================================================================

export function loadDataset(datasetPath: string = DATASET_PATH): PrReviewDataset {
  const raw = JSON.parse(fs.readFileSync(datasetPath, 'utf-8')) as unknown;
  const result = parseDataset(raw);
  if (!result.success) {
    throw new Error(`Invalid dataset ${datasetPath}:\n  ${result.errors.join('\n  ')}`);
  }
  return result.data;
}

/** Extract the `**Rubric version:** \`x.y.z\`` from the rubric doc header. */
export function rubricDocVersion(rubricPath: string = RUBRIC_PATH): string {
  const body = fs.readFileSync(rubricPath, 'utf-8');
  const m = /\*\*Rubric version:\*\*\s*`([^`]+)`/.exec(body);
  if (m === null) {
    throw new Error(`Could not find "**Rubric version:**" in ${rubricPath}`);
  }
  const version = m[1];
  if (version === undefined) {
    throw new Error(`"**Rubric version:**" matched but captured nothing in ${rubricPath}`);
  }
  return version;
}

export interface ValidationResult {
  readonly dataset: PrReviewDataset;
  readonly docVersion: string;
  readonly versionMatches: boolean;
}

/** Validate the dataset and cross-check its rubricVersion against the doc. */
export function validateDataset(
  datasetPath: string = DATASET_PATH,
  rubricPath: string = RUBRIC_PATH
): ValidationResult {
  const dataset = loadDataset(datasetPath);
  const docVersion = rubricDocVersion(rubricPath);
  return {
    dataset,
    docVersion,
    versionMatches: dataset.rubricVersion === docVersion,
  };
}

// ============================================================================
// Stats
// ============================================================================

export interface DatasetStats {
  readonly n: number;
  readonly byClass: Record<(typeof CLASSES)[number], number>;
  readonly bySource: Record<(typeof PROVENANCE_SOURCES)[number], number>;
}

export function computeStats(dataset: PrReviewDataset): DatasetStats {
  const byClass: Record<CaseClass, number> = { buggy: 0, clean: 0, borderline: 0 };
  const bySource: Record<ProvenanceSource, number> = {
    historical: 0,
    'historical-clean': 0,
    synthetic: 0,
    'outcome-mined': 0,
  };
  for (const c of dataset.prs) {
    byClass[c.class] += 1;
    bySource[c.provenance.source] += 1;
  }
  return { n: dataset.prs.length, byClass, bySource };
}

// ============================================================================
// add — emit a rubric-stamped skeleton (never a fabricated case)
// ============================================================================

type AddKind = 'buggy' | 'clean' | 'borderline' | 'synthetic-buggy' | 'synthetic-clean';

function skeletonClass(kind: AddKind): CaseClass {
  if (kind === 'buggy' || kind === 'synthetic-buggy') return 'buggy';
  if (kind === 'borderline') return 'borderline';
  return 'clean';
}

function skeletonSource(cls: CaseClass, synthetic: boolean): ProvenanceSource {
  if (synthetic) return 'synthetic';
  if (cls === 'clean') return 'historical-clean';
  return 'historical';
}

export function skeletonEntry(kind: AddKind, rubricVersion: string): unknown {
  const today = new Date().toISOString().slice(0, 10);
  const synthetic = kind.startsWith('synthetic');
  const cls = skeletonClass(kind);
  const base: Record<string, unknown> = {
    number: synthetic ? 'synthetic-TODO' : 'TODO-pr-number',
    rubricVersion,
    class: cls,
    title: 'TODO: PR title',
    provenance: {
      source: skeletonSource(cls, synthetic),
      fixReference: cls === 'buggy' ? 'TODO: fixing PR/commit' : null,
      discoveredBy: cls === 'buggy' ? 'TODO: who/what caught it' : null,
    },
    knownBugs:
      cls === 'buggy'
        ? [
            {
              summary: 'TODO: >=10 chars; statable failing condition',
              severity: 'medium',
              location: 'path/to/file.ts:1',
              locationTolerance: 'line',
              fixReference: 'TODO: fixing PR/commit',
            },
          ]
        : [],
    borderlineConcerns:
      cls === 'borderline'
        ? [{ summary: 'TODO: defensible context-dependent concern', raisedBy: 'TODO' }]
        : [],
    adjudication: {
      adjudicatedAt: today,
      adjudicatedUnder: rubricVersion,
      rationale: 'TODO: reachable failure (buggy) or why none exists (clean/borderline)',
    },
  };
  if (synthetic) {
    base['customDescription'] = 'TODO';
    base['customDiff'] = 'TODO: unified diff with the planted defect at a known file:line';
  }
  return base;
}

// ============================================================================
// CLI
// ============================================================================

function printStats(): void {
  const dataset = loadDataset();
  const s = computeStats(dataset);
  console.log(`pr_review eval dataset — rubric ${dataset.rubricVersion}`);
  console.log(`n = ${String(s.n)}`);
  console.log(
    `class: buggy=${String(s.byClass.buggy)} clean=${String(s.byClass.clean)} ` +
      `borderline=${String(s.byClass.borderline)}`
  );
  console.log(
    `source: historical=${String(s.bySource.historical)} ` +
      `historical-clean=${String(s.bySource['historical-clean'])} ` +
      `synthetic=${String(s.bySource.synthetic)} ` +
      `outcome-mined=${String(s.bySource['outcome-mined'])}`
  );
  const target = 50;
  console.log(
    s.n >= target
      ? `✓ n>=${String(target)} target met`
      : `… ${String(target - s.n)} more cases needed to reach n>=${String(target)} ` +
          `(see docs/research/pr-review-dataset-curation.md)`
  );
}

function runValidate(): void {
  const { dataset, docVersion, versionMatches } = validateDataset();
  if (!versionMatches) {
    console.error(
      `::error::dataset rubricVersion "${dataset.rubricVersion}" != rubric doc "${docVersion}"`
    );
    process.exit(1);
  }
  console.log(`✓ dataset valid: n=${String(dataset.prs.length)}, rubric ${dataset.rubricVersion}`);
}

function runAdd(kind: string | undefined): void {
  const allowed: readonly AddKind[] = [
    'buggy',
    'clean',
    'borderline',
    'synthetic-buggy',
    'synthetic-clean',
  ];
  if (kind === undefined || !(allowed as readonly string[]).includes(kind)) {
    console.error(`usage: add <${allowed.join('|')}>`);
    process.exit(1);
  }
  const dataset = loadDataset();
  console.log(JSON.stringify(skeletonEntry(kind as AddKind, dataset.rubricVersion), null, 2));
}

function main(): void {
  const [cmd, arg] = process.argv.slice(2);
  switch (cmd) {
    case 'validate':
      runValidate();
      break;
    case 'stats':
      printStats();
      break;
    case 'add':
      runAdd(arg);
      break;
    default:
      console.error('usage: curate-pr-review-dataset.ts <validate|stats|add>');
      process.exit(1);
  }
}

// Only run as a CLI when invoked directly (not when imported by the test).
const invokedPath = process.argv[1] ?? '';
if (import.meta.url === `file://${invokedPath}`) {
  main();
}
