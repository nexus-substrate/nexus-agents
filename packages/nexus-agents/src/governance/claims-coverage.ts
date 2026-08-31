/**
 * nexus-agents/governance - Claims coverage (anti-gaming) scanner.
 *
 * The verification runner in `claims-verify.ts` proves the claims that ARE
 * registered. It does NOT prove that the *set* of registered claims covers the
 * quantified capability claims the docs actually make — the registry is an
 * allowlist the author fully controls (#3880). Two gaming paths stay green:
 *
 *  1. **Silent removal.** Delete a claim entry from the registry; the gate
 *     happily verifies the remaining N-1. If README still makes the now-
 *     unregistered claim and it drifts, nothing catches it.
 *  2. **Mask-by-addition.** Weaken/remove a hard claim and add an easy one; the
 *     count stays plausible and `results.every(r => r.ok)` is still true.
 *
 * This module closes the gap with a *reverse* coverage check (#3880, the
 * deferred "heuristic detector for NEW undeclared doc claims" from #3826):
 * scan the key docs for a small, high-precision set of quantified capability
 * claim patterns ("N MCP tools", "N strategies", "N built-in expert types") and
 * FAIL if such a claim exists in a doc but NO registry entry covers it.
 *
 * "Covers" means: some registry entry whose `subject` is that doc declares a
 * `subjectContains` literal that the matched claim text contains (so the entry's
 * verification will, in turn, assert that exact prose stays in the doc). This is
 * the inverse of the #3877 subject check and is what makes both gaming paths
 * fail: remove the entry and the doc claim is now uncovered; the scan flags it.
 *
 * FALSE-POSITIVE DISCIPLINE: the patterns are deliberately narrow — anchored on
 * a closed set of `count + capability-noun` regexes, not "any number near any
 * word". A new capability claim only trips the gate if it matches one of these
 * sentinels, so generic prose ("3 steps", "v2.3.0") is never flagged. The cost
 * of a genuinely new sentinel capability is one registry entry — the intended
 * behavior.
 *
 * Pure functions over plain strings so the logic is unit-testable without
 * touching the real repo.
 *
 * @module governance/claims-coverage
 * (Source: Issue #3880; maps to #3826 deferred undeclared-claim detector)
 */

// @export-no-consumer-yet — see #3880
// This module's consumer is the `claims:check` CI gate (scripts/claims-check.ts),
// not another src/ module — and it cannot be wired into one without a cycle
// (claims-coverage → claims-verify → claims-registry). The gate orchestration
// legitimately lives in the script; this file is exercised by it + its tests.

import type { ClaimsRegistry } from './claims-registry.js';

/**
 * A sentinel quantified-capability claim pattern. `label` names the capability
 * for diagnostics; `regex` must capture the full claim prose (group 0) so the
 * matched text can be checked against registry `subjectContains` literals.
 *
 * Keep this list SMALL and high-precision. Each entry is a capability the
 * registry is expected to back; adding a noun here is a deliberate decision to
 * require registry coverage for it.
 */
export interface ClaimPattern {
  label: string;
  regex: RegExp;
}

/**
 * Closed set of quantified capability sentinels. Anchored on
 * `<number> <capability-noun>` so plain numeric prose (versions, step counts,
 * percentages) never matches. The `g` flag is required — the scanner uses
 * `matchAll`.
 */
export const CLAIM_PATTERNS: readonly ClaimPattern[] = [
  { label: 'MCP tool count', regex: /\b\d+\s+MCP\s+tools\b/g },
  { label: 'expert-type count', regex: /\b\d+\s+built-in\s+expert\s+types\b/g },
  { label: 'consensus-strategy count', regex: /\b\d+\s+strategies\b/g },
];

/** The docs the coverage scan polices, repo-root-relative. */
export const SCANNED_DOCS: readonly string[] = ['README.md', 'ARCHITECTURE.md'];

/** One quantified claim found in a doc with no covering registry entry. */
export interface UncoveredClaim {
  /** Repo-root-relative doc the claim was found in. */
  doc: string;
  /** Sentinel pattern label that matched. */
  pattern: string;
  /** The exact claim prose found in the doc. */
  text: string;
}

/** Aggregate coverage outcome. */
export interface CoverageReport {
  uncovered: UncoveredClaim[];
  passed: boolean;
  /**
   * Declared docs actually opened and read. Zero means the scan proved
   * nothing, which `uncovered.length === 0` cannot express (#5253).
   */
  docsScanned: number;
  /**
   * Declared docs that did not exist. Non-empty is a FAILURE, not a skip:
   * this module is the anti-gaming inverse of `claims-verify`, and skipping a
   * missing doc made it defeatable by renaming one — an easier gaming path
   * than the two it was built to catch.
   */
  docsMissing: readonly string[];
}

/**
 * Find every sentinel quantified-capability claim in `content`. De-duplicates
 * identical prose (a doc may repeat "46 MCP tools") so one missing entry is
 * reported once per distinct claim text.
 */
export function findClaimMatches(content: string): { pattern: string; text: string }[] {
  const out = new Map<string, { pattern: string; text: string }>();
  for (const { label, regex } of CLAIM_PATTERNS) {
    for (const m of content.matchAll(regex)) {
      const text = m[0];
      // Key on text only so the same prose isn't double-reported across patterns.
      if (!out.has(text)) out.set(text, { pattern: label, text });
    }
  }
  return [...out.values()];
}

/**
 * True when some registry entry whose `subject` is `doc` declares a
 * `subjectContains` literal that the matched `claimText` contains. That entry's
 * verification (via #3877) already re-asserts the literal stays in the doc, so a
 * covered claim is fully backed end-to-end. Removing the entry — or never adding
 * one for a new sentinel — leaves the claim uncovered, which is the failure.
 */
function isCovered(claimText: string, doc: string, registry: ClaimsRegistry): boolean {
  return registry.claims.some((c) => {
    if (c.subject !== doc) return false;
    const needle = c.verification.subjectContains;
    return needle !== undefined && claimText.includes(needle);
  });
}

/** Minimal read surface, injectable for tests (mirrors `ClaimFs`). */
export interface DocReader {
  exists(path: string): boolean;
  read(path: string): string;
}

/**
 * Scan the configured docs and report any quantified capability claim with no
 * covering registry entry. A doc that does not exist is simply skipped (it makes
 * no claims); the verification runner owns missing-evidence failures.
 */
export function checkCoverage(
  registry: ClaimsRegistry,
  resolve: (doc: string) => string,
  fs: DocReader,
  docs: readonly string[] = SCANNED_DOCS
): CoverageReport {
  const uncovered: UncoveredClaim[] = [];
  const docsMissing: string[] = [];
  let docsScanned = 0;

  for (const doc of docs) {
    const path = resolve(doc);
    if (!fs.exists(path)) {
      docsMissing.push(doc);
      continue;
    }
    docsScanned++;
    const content = fs.read(path);
    for (const { pattern, text } of findClaimMatches(content)) {
      if (!isCovered(text, doc, registry)) {
        uncovered.push({ doc, pattern, text });
      }
    }
  }

  // A declared doc that is absent, or a scan that opened nothing, is a
  // failure. `uncovered.length === 0` is equally true of a clean sweep and of
  // a sweep that read no files, and only one of those is evidence.
  const passed = uncovered.length === 0 && docsMissing.length === 0 && docsScanned > 0;
  return { uncovered, passed, docsScanned, docsMissing };
}
