#!/usr/bin/env tsx
/**
 * Phase 5 of #2805 — CI drift gate for the federated AGENTS.md adoption.
 *
 * Fails the build when any of the known harness-discovery files exists
 * but doesn't reference `AGENTS.md`. The federation invariant (per
 * `docs/architecture/AGENT_COMPATIBILITY.md`) is that those files MUST
 * point at AGENTS.md and never duplicate content — drift means somebody
 * pasted content into a harness file instead of refactoring to a
 * redirect, which is exactly what the federation was meant to prevent.
 *
 * Run from repo root: `pnpm exec tsx scripts/check-harness-alignment.ts`
 *
 * Exits:
 *   0 — AGENTS.md present + every existing harness file references it
 *   1 — drift detected, or AGENTS.md is missing entirely
 *
 * @module scripts/check-harness-alignment
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..');

async function main(): Promise<void> {
  const { checkHarnessAlignment } =
    await import('../packages/nexus-agents/src/cli/doctor-harness-alignment.ts');

  const check = checkHarnessAlignment(REPO_ROOT);

  if (!check.agentsMdExists) {
    process.stderr.write(
      '✗ AGENTS.md is missing from the repo root.\n' +
        '  The federation invariant requires AGENTS.md to be the single source\n' +
        '  of truth. See docs/architecture/AGENT_COMPATIBILITY.md.\n'
    );
    process.exit(1);
  }

  const drift = check.files.filter((f) => f.exists && !f.redirectsToAgentsMd);

  if (drift.length === 0) {
    process.stdout.write(
      `✓ Harness alignment OK — ${String(check.alignedCount)} aligned, ${String(check.missingCount)} absent\n`
    );
    return;
  }

  process.stderr.write(`✗ Harness alignment drift detected (${String(drift.length)}):\n\n`);
  for (const f of drift) {
    process.stderr.write(`  ${f.harness}: ${f.path}\n`);
    process.stderr.write(`    File exists but does NOT mention 'AGENTS.md'.\n`);
  }
  process.stderr.write(
    `\nThe federation invariant (option B of #2764, #2805): harness-specific\n` +
      `configs MUST redirect to AGENTS.md, never duplicate content.\n\n` +
      `Fix: refactor the drifted file(s) to a one-line redirect to AGENTS.md.\n` +
      `See docs/architecture/AGENT_COMPATIBILITY.md for the contract.\n`
  );
  process.exit(1);
}

const invokedDirectly =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  void main();
}
