/**
 * Claims Check Gate
 *
 * Loads the claims registry (`governance/claims-registry.yaml`), validates it
 * against the Zod schema, then verifies every claim against live source. Exits
 * non-zero on drift — a missing evidence path, a vanished doc claim, a count
 * mismatch, or an aspirational claim whose roadmap marker disappeared.
 *
 * #3880: ALSO runs a reverse coverage scan (`claims-coverage.ts`) so the gate is
 * not a purely author-controlled allowlist. It fails when a key doc makes a
 * quantified capability claim ("N MCP tools" etc.) with no covering registry
 * entry — catching both silent registry shrink and mask-by-addition.
 *
 * This follows the established governance-gate pattern (cf.
 * `scripts/inject-governance.ts check`): a single CLI that reads source-of-truth
 * and fails the build on documentation drift. #3826 wires it into CI as a gate.
 *
 * Usage:
 *   pnpm exec tsx scripts/claims-check.ts        # verify, exit 1 on drift
 *   pnpm claims:check
 *
 * @module scripts/claims-check
 * (Source: Issue #3824, #3825, #3826)
 */

/* eslint-disable no-console */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './script-paths.js';
import { loadClaimsRegistry } from '../packages/nexus-agents/src/governance/claims-registry.js';
import { verifyClaims } from '../packages/nexus-agents/src/governance/claims-verify.js';
import { checkCoverage } from '../packages/nexus-agents/src/governance/claims-coverage.js';

const REGISTRY_PATH = join(ROOT, 'governance/claims-registry.yaml');

/** Run the claims gate. Returns true when all claims hold. */
export function checkClaims(): boolean {
  let registry;
  try {
    registry = loadClaimsRegistry(REGISTRY_PATH);
  } catch (err) {
    console.error(`Claims registry failed to load/validate: ${(err as Error).message}`);
    return false;
  }

  const report = verifyClaims(registry, ROOT);

  for (const r of report.results) {
    if (r.ok) {
      console.log(`  ok   ${r.id}${r.detail ? ` (${r.detail})` : ''}`);
    } else {
      console.error(`  FAIL ${r.id}: ${r.detail}`);
    }
  }

  // #3880 anti-gaming: reverse coverage. The check above proves the claims that
  // ARE registered; this proves the docs make no quantified capability claim
  // that LACKS a registry entry — catching silent removal and mask-by-addition.
  const coverage = checkCoverage(registry, (doc) => join(ROOT, doc), {
    exists: (p): boolean => existsSync(p),
    read: (p): string => readFileSync(p, 'utf-8'),
  });
  for (const u of coverage.uncovered) {
    console.error(`  UNCOVERED ${u.doc}: "${u.text}" (${u.pattern}) has no claims-registry entry`);
  }
  for (const doc of coverage.docsMissing) {
    console.error(
      `  MISSING ${doc}: declared in SCANNED_DOCS but not found — the reverse-coverage ` +
        `arm read nothing for it. Restore the doc or update SCANNED_DOCS (#5253).`
    );
  }

  const passed = report.passed && coverage.passed;
  if (passed) {
    // The scanned count is the coverage half. `registry.claims.length` is the
    // FORWARD number and says nothing about how many docs the reverse scan
    // opened, so on its own it read as coverage the scan never had.
    console.log(
      `Claims check passed: ${String(registry.claims.length)} claims verified, ` +
        `${String(coverage.docsScanned)} doc(s) scanned for uncovered claims.`
    );
  } else if (!report.passed) {
    const failed = report.results.filter((r) => !r.ok).length;
    console.error(
      `Claims check FAILED: ${String(failed)} of ${String(registry.claims.length)} claims drifted.`
    );
  } else {
    console.error(
      `Claims check FAILED: ${String(coverage.uncovered.length)} doc claim(s) have no registry ` +
        `entry (#3880); ${String(coverage.docsMissing.length)} declared doc(s) missing; ` +
        `${String(coverage.docsScanned)} doc(s) scanned.`
    );
  }
  return passed;
}

const invokedPath = process.argv[1] ?? '';
if (import.meta.url === `file://${invokedPath}`) {
  process.exit(checkClaims() ? 0 : 1);
}
