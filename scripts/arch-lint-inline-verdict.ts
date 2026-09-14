/**
 * Inline-verdict ratchet for arch-lint: a verdict is not re-implemented by
 * comparing a tally against a threshold LITERAL outside `consensus/decision/`.
 *
 * A sibling of arch-lint.ts (same shape as arch-lint-suppression.ts), so the
 * rule collection can grow without the collector needing a suppression.
 *
 * Companion to the `no-restricted-imports` block in
 * `eslint-rules/governed-decision-imports-6000.js`. That block guarantees the
 * governed SYMBOLS are reached only through `consensus/decision/`; it cannot
 * see a file that imports nothing and writes `if (ratio >= 0.667)` instead.
 * This rule covers that literal form, and only that form.
 *
 * What it cannot catch, stated rather than papered over:
 *  - a comparison against an integer (`votes >= 1`, `=== 1` for unanimous):
 *    too common outside voting to police, so `1` is not in the literal set;
 *  - a threshold read from a governed constant and compared inline
 *    (`ratio >= VOTING_THRESHOLDS.supermajority`): that is what the stayed
 *    strategy classes legitimately do (#6160 verdict-site map);
 *  - control flow that overrides an imported verdict (`decision || true`):
 *    no static probe sees that — it is a review concern (#6000 contrarian);
 *  - a swap: a baselined file may trade one hit for another at the same count.
 *
 * The baseline is per file, measured on the tree at #6160 (9 hits, 8 files);
 * none of them is a voting verdict — they are research-quality, health and
 * reward bands that happen to share the number 0.5. A file above its baseline
 * errors, naming every hit; a file below it warns, so the entry gets lowered
 * rather than left as slack for a future hit to hide in.
 *
 * @module scripts/arch-lint-inline-verdict
 * (Source: Issue #6000, step 2)
 */

import { relative } from 'node:path';
import type { Violation } from './arch-lint.js';
import { SRC_ROOT } from './script-paths.js';

/**
 * The values `VOTING_THRESHOLDS` / `ERROR_FLOOR_FRACTION` take, in every
 * spelling a re-implementation would plausibly use: the exact `2 / 3`, its
 * decimal roundings (`0.67` rejected a 2-of-3 quorum, #5543), the 0.5
 * majority/error floor, and the `1.0` unanimous bar. Bare `1` is excluded on
 * purpose (see the module header).
 */
const THRESHOLD_LITERAL = String.raw`(?:0\.5|0\.66|0\.667|0\.6667|0\.67|2\s*/\s*3|1\.0)`;
const COMPARATOR = String.raw`(?:>=|<=|===|!==|==|!=|>|<)`;

/** `x >= 0.667`, and the mirrored `0.667 <= x`. */
const INLINE_VERDICT = new RegExp(
  String.raw`${COMPARATOR}\s*${THRESHOLD_LITERAL}(?![\d.])|(?<![\d.\w])${THRESHOLD_LITERAL}\s*${COMPARATOR}`
);

/** The dirs the gate covers (#6000): where a verdict site could plausibly live. */
const IN_SCOPE_PREFIXES = ['consensus/', 'cli/', 'mcp/tools/'] as const;

/** The governed module itself is where the comparisons are supposed to be. */
const GOVERNED_PREFIX = 'consensus/decision/';

/**
 * Per-file hit count at #6160. Every entry was read: none computes a vote
 * verdict. Lower an entry when its file drops a hit; never raise one without
 * the governor's review — raising is the ratchet giving way.
 */
export const INLINE_VERDICT_BASELINE: Readonly<Record<string, number>> = Object.freeze({
  'consensus/voting-protocol-helpers.ts': 1, // agreementRatio >= 0.5 — VotingProtocol path, no in-tree caller (#4666)
  'cli/warm-up.ts': 1, // reward >= 0.5 — bandit warm-up success band
  'cli/research-helpers-overlap.ts': 1, // overlapScore > 0.5 — research topic overlap
  'cli/e2e-eval.ts': 2, // roll < 0.5, convergenceScore > 0.5 — eval harness
  'mcp/tools/weather-report.ts': 1, // successRate < 0.5 — degraded flag
  'mcp/tools/orchestrate-aorchestra.ts': 1, // rate < 0.5 — expert exclusion band
  'mcp/tools/memory-promotion.ts': 1, // confidence >= 0.5 — belief confidence band
  'mcp/tools/improvement-review.ts': 1, // share <= 0.5 — failure-category share
});

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

/** True when the file is one this rule measures at all. */
function isInScope(relPath: string): boolean {
  if (relPath.includes('.test.') || relPath.startsWith(GOVERNED_PREFIX)) return false;
  return IN_SCOPE_PREFIXES.some((prefix) => relPath.startsWith(prefix));
}

/** 1-based line numbers of every inline threshold comparison in the file. */
function inlineVerdictLines(content: string): number[] {
  return content
    .split('\n')
    .flatMap((line, i) => (!isCommentLine(line) && INLINE_VERDICT.test(line) ? [i + 1] : []));
}

/**
 * The raw hit count for a file, or 0 when the file is out of scope. Exported
 * so the source-tree test can prove the baseline is what the tree measures,
 * not a number that happens to be large enough.
 */
export function countInlineVerdictHits(filePath: string, content: string): number {
  const relPath = relative(SRC_ROOT, filePath);
  return isInScope(relPath) ? inlineVerdictLines(content).length : 0;
}

/**
 * Check that a file has no more inline threshold comparisons than its
 * baseline (#6000 step 2). A file with no baseline entry has a baseline of 0.
 */
export function checkInlineVerdict(filePath: string, content: string): Violation[] {
  const file = relative(SRC_ROOT, filePath);
  if (!isInScope(file)) return [];

  const hits = inlineVerdictLines(content);
  const baseline = INLINE_VERDICT_BASELINE[file] ?? 0;
  const category = 'Governed Decision';

  if (hits.length > baseline) {
    const message =
      `Inline threshold comparison (${String(hits.length)} in file, baseline ${String(baseline)}): ` +
      'a verdict is computed in consensus/decision/ (#6000); import evaluateThreshold / ' +
      'resolveVoteDecision instead of comparing against the literal';
    return hits.map((line) => ({
      file,
      line,
      rule: 'inline-verdict',
      category,
      message,
      severity: 'error',
    }));
  }

  if (hits.length < baseline) {
    return [
      {
        file,
        line: 0,
        rule: 'inline-verdict',
        category,
        message:
          `Stale baseline: ${String(hits.length)} inline threshold comparison(s) measured, ` +
          `INLINE_VERDICT_BASELINE says ${String(baseline)} — lower the entry in scripts/arch-lint-inline-verdict.ts`,
        severity: 'warning',
      },
    ];
  }

  return [];
}
