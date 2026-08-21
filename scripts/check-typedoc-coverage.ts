#!/usr/bin/env npx tsx
/**
 * TypeDoc entry-point coverage gate (#4504).
 *
 * `typedoc.markdown.json` declares 19 entry points; generation produced 17
 * pages. Three barrels — `pipeline`, `benchmarks`, `agents-ictm` — emit
 * nothing, so `PipelineRunner` (a CLAUDE.md canonical path) and
 * `BenchmarkAdapter` have no published API reference at all.
 *
 * That went unnoticed for months because the committed docs tree still held
 * stale pages for those modules, left over from an older config. Deleting the
 * committed tree (#4449) is what exposed it.
 *
 * ## Why a gate rather than a fix
 *
 * Chosen by a 7-voter `higher_order` panel on #4504 (4-2 for this option, one
 * reject). The cause is unconfirmed — the "re-export barrel" theory fits two
 * of the three modules but not `benchmarks.ts`, which has 20 export
 * statements — so committing to a fix means committing unbounded effort
 * against an undiagnosed defect. The panel's reasoning was that the durable
 * problem is not the three pages but that the pipeline *claimed* 19 and
 * silently delivered 16. This makes that claim checkable.
 *
 * ## Why an allowlist is not a disarmed gate
 *
 * The allowlist enumerates exactly the known-failing entry points and is the
 * condition both A-voters attached to accepting C. The distinction the panel
 * drew: the stale committed pages were an *invisible default reading as a
 * pass*, whereas an enumerated allowlist is partial coverage honestly
 * labelled. The gate still fails closed on any FOURTH divergence, and the
 * list is a monotonically decreasing coverage metric — each barrel fixed
 * removes an entry and the gate proves it.
 *
 * A stale entry (one that has started generating) is reported so the list
 * shrinks rather than rots.
 *
 * @module scripts/check-typedoc-coverage
 * (Source: Issue #4504)
 */

import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { ROOT } from './script-paths.js';

/**
 * Entry points known to emit no page, pending diagnosis in #4504.
 *
 * Every entry here is a documented gap in the published API reference, not an
 * intentional omission. Remove an entry the moment it starts generating.
 */
export const KNOWN_MISSING = ['pipeline', 'benchmarks', 'agents-ictm'] as const;

export interface CoverageInput {
  readonly declared: readonly string[];
  readonly generated: readonly string[];
  readonly allowlist: readonly string[];
}

export interface CoverageVerdict {
  readonly ok: boolean;
  /** Declared, absent, and NOT allowlisted — these fail the gate. */
  readonly missing: string[];
  /** Declared, absent, allowlisted — reported, tolerated. */
  readonly knownMissing: string[];
  /** Allowlisted but now generating — the allowlist can shrink. */
  readonly staleAllowlist: string[];
  readonly reason: string;
}

/** Compare declared entry points against pages actually produced. */
export function assessCoverage(input: CoverageInput): CoverageVerdict {
  const generated = new Set(input.generated);
  const allowed = new Set(input.allowlist);

  const absent = input.declared.filter((e) => !generated.has(e)).sort();
  const missing = absent.filter((e) => !allowed.has(e));
  const knownMissing = absent.filter((e) => allowed.has(e));
  const staleAllowlist = input.allowlist.filter((e) => generated.has(e)).sort();

  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`${String(missing.length)} entry point(s) produced no page: ${missing.join(', ')}`);
  }
  if (knownMissing.length > 0) {
    parts.push(
      `${String(knownMissing.length)} known-missing (allowlisted, #4504): ${knownMissing.join(', ')}`
    );
  }
  if (staleAllowlist.length > 0) {
    parts.push(
      `allowlist is stale — now generating, remove from KNOWN_MISSING: ${staleAllowlist.join(', ')}`
    );
  }
  if (parts.length === 0) {
    parts.push(`All ${String(input.declared.length)} declared entry points produced a page.`);
  }

  return {
    ok: missing.length === 0,
    missing,
    knownMissing,
    staleAllowlist,
    reason: parts.join('; '),
  };
}

/** Entry-point base names declared in the markdown TypeDoc config. */
function readDeclared(): string[] {
  const cfg = join(ROOT, 'packages/nexus-agents/typedoc.markdown.json');
  const parsed = JSON.parse(readFileSync(cfg, 'utf-8')) as { entryPoints?: string[] };
  return (parsed.entryPoints ?? []).map((p) => basename(p, '.ts'));
}

/** Module pages actually generated, excluding the index. */
function readGenerated(): string[] {
  const dir = join(ROOT, 'docs/api');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== 'index.md')
    .map((f) => basename(f, '.md'));
}

/* eslint-disable no-console */
function main(): void {
  const verdict = assessCoverage({
    declared: readDeclared(),
    generated: readGenerated(),
    allowlist: [...KNOWN_MISSING],
  });

  console.log(verdict.reason);
  if (!verdict.ok) {
    console.log(`::error::TypeDoc entry-point coverage regressed. ${verdict.reason}`);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('check-typedoc-coverage.ts') === true) {
  main();
}
