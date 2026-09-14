/**
 * What the panel READ, as a pr_review record states it (#6190) — the governor
 * gate's read side for the coverage disclosure. Split out of
 * `check-governor-review.ts` for that file's line budget; the gate appends
 * {@link panelCoverageCaveat} to its pass line.
 *
 * @module scripts/governor-review-panel-coverage
 */

import type { PrReviewRecord } from '../packages/nexus-agents/src/audit/index.js';

/**
 * What the panel READ, as the record states it (#6190) — read from the
 * structured field first, from the summary stamp only for a record that
 * predates the field.
 *
 * `source: 'field'` is the hash-covered `coverage` field a 1.4 record carries:
 * the COMPLETE dropped-file list. `source: 'summary'` is the pre-#6190 stamp
 * `[partial coverage: n/m files reviewed, dropped: …]`, parsed out of a
 * summary the store capped at 500 chars — so its list is whatever survived
 * the cap, and a path cut mid-word is dropped rather than reported as a file.
 * `undefined` when the record states nothing either way, which is NOT a
 * full read: the local-ledger producer never packs and never stamps.
 */
export interface PanelCoverageReading {
  readonly source: 'field' | 'summary';
  readonly panelRead: 'full' | 'partial';
  readonly reviewedFiles: number;
  readonly totalFiles: number;
  readonly droppedFiles: readonly string[];
}

/** The pre-#6190 summary stamp; the list runs to the closing bracket or the cap. */
const LEGACY_COVERAGE_STAMP =
  /\[partial coverage: (\d+)\/(\d+) files reviewed, dropped: ([^\]]*)(\]?)/;

function legacyStampCoverage(summary: string): PanelCoverageReading | undefined {
  const m = LEGACY_COVERAGE_STAMP.exec(summary);
  if (m === null) return undefined;
  const closed = m[4] === ']';
  const listed = (m[3] ?? '')
    .split(', ')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  // An unclosed stamp was cut by the store's cap (the store appends `...`), so
  // the LAST entry is a fragment of a path, not a path.
  const droppedFiles = closed ? listed : listed.slice(0, -1);
  return {
    source: 'summary',
    panelRead: 'partial',
    reviewedFiles: Number(m[1]),
    totalFiles: Number(m[2]),
    droppedFiles,
  };
}

export function readPanelCoverage(record: PrReviewRecord): PanelCoverageReading | undefined {
  if (record.coverage !== undefined) {
    return {
      source: 'field',
      panelRead: record.coverage.panelRead,
      reviewedFiles: record.coverage.reviewedFiles,
      totalFiles: record.coverage.totalFiles,
      droppedFiles: record.coverage.droppedFiles,
    };
  }
  return legacyStampCoverage(record.summary);
}

/**
 * Names the files the panel never saw (#6190), and WHERE the gate learned it.
 *
 * A partial panel read cannot verified-approve (the C1 gate degrades that to
 * an abstain, which warns above), but an unverified approve over a partial
 * read still passes here — and a pass that does not say the panel read 2 of
 * 42 files is the partial-review-recorded-as-complete failure this file
 * already guards against twice. The source is stated because the two are not
 * equally strong: the field is the whole list; the stamp is what fit.
 */
export function panelCoverageCaveat(match: PrReviewRecord): string {
  const read = readPanelCoverage(match);
  if (read?.panelRead !== 'partial') return '';
  const files = `${String(read.reviewedFiles)} of ${String(read.totalFiles)} files`;
  const dropped =
    read.droppedFiles.length > 0
      ? `${String(read.droppedFiles.length)} dropped: ${read.droppedFiles.join(', ')}`
      : 'dropped list not recorded';
  const provenance =
    read.source === 'field'
      ? 'from the record’s coverage field'
      : 'parsed from the summary stamp of a pre-#6190 record; the list may be incomplete';
  return ` — PARTIAL: the panel read ${files} (${dropped}; ${provenance})`;
}
