#!/usr/bin/env npx tsx
/**
 * Claims Check Gate
 *
 * Loads the claims registry (`governance/claims-registry.yaml`), validates it
 * against the Zod schema, then verifies every claim against live source. Exits
 * non-zero on drift — a missing evidence path, a vanished doc claim, a count
 * mismatch, or an aspirational claim whose roadmap marker disappeared.
 *
 * This follows the established governance-gate pattern (cf.
 * `scripts/inject-governance.ts check`): a single CLI that reads source-of-truth
 * and fails the build on documentation drift. #3826 wires it into CI as a gate.
 *
 * Usage:
 *   npx tsx scripts/claims-check.ts        # verify, exit 1 on drift
 *   pnpm claims:check
 *
 * @module scripts/claims-check
 * (Source: Issue #3824, #3825, #3826)
 */

/* eslint-disable no-console */

import { join } from 'node:path';
import { ROOT } from './script-paths.js';
import { loadClaimsRegistry } from '../packages/nexus-agents/src/governance/claims-registry.js';
import { verifyClaims } from '../packages/nexus-agents/src/governance/claims-verify.js';

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

  if (report.passed) {
    console.log(`Claims check passed: ${String(registry.claims.length)} claims verified.`);
  } else {
    const failed = report.results.filter((r) => !r.ok).length;
    console.error(
      `Claims check FAILED: ${String(failed)} of ${String(registry.claims.length)} claims drifted.`
    );
  }
  return report.passed;
}

const invokedPath = process.argv[1] ?? '';
if (import.meta.url === `file://${invokedPath}`) {
  process.exit(checkClaims() ? 0 : 1);
}
