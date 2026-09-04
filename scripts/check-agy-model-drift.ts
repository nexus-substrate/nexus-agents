/**
 * Compare `AGY_MODEL_SLUGS` against what `agy models` actually serves (#5085).
 *
 * ## Why this can exist now
 *
 * #4393 recorded that `agy models` HANGS without a TTY — 90s, exit 124, zero
 * output on v1.1.11 — so there was no programmatic enumeration to check
 * against and the map was maintained by hand. That was an upstream defect and
 * it is fixed: on v1.1.21 the command completes piped in ~1s, exit 0, over
 * three consecutive runs. This check is what that fix makes possible.
 *
 * ## What it compares, and what it deliberately ignores
 *
 * Only the Gemini family. agy also fronts `claude-sonnet-4-6`,
 * `claude-opus-4-6-thinking` and `gpt-oss-120b-medium`; #4346 decided 7/0 that
 * the `gemini` routing arm means Gemini-family models, with Claude and GPT-OSS
 * routed through their own arms. Reporting those as drift would fight a
 * ratified decision, so they are filtered out and named here rather than
 * silently dropped.
 *
 * ## Absence is not agreement
 *
 * When `agy` is not installed the check reports `unmeasured` and exits
 * non-zero. A drift check that passes because it could not look is the failure
 * mode this repo treats as a p1 on instrumentation — it would report the map
 * current on every machine without the CLI, which is every CI runner.
 *
 * @module scripts/check-agy-model-drift
 * (Source: Issue #5085, unblocked by #4393)
 */
import { execFileSync } from 'node:child_process';

import { AGY_MODEL_SLUGS } from '../packages/nexus-agents/src/config/agy-model-map.js';

/** Gemini-family prefix — the subset #4346 scoped this arm to. */
const GEMINI_PREFIX = 'gemini-';

/**
 * Generous relative to the ~1s observed, because this is a correctness gate,
 * not a latency measurement: a slow network should report drift honestly, not
 * time out into `unmeasured`.
 */
const PROBE_TIMEOUT_MS = 30_000;

export interface AgyDriftVerdict {
  readonly ok: boolean;
  /** Slugs agy serves that the map lacks. */
  readonly missingFromMap: readonly string[];
  /** Slugs the map claims that agy no longer serves. */
  readonly staleInMap: readonly string[];
  /** Non-Gemini slugs agy serves, excluded by #4346. Reported, never drift. */
  readonly excluded: readonly string[];
  /** Set when the CLI could not be probed at all. */
  readonly unmeasured?: boolean;
  readonly reason?: string;
}

/**
 * Parse `agy models` output: TAB-separated `slug\tDisplay Name`.
 *
 * Filtering on the tab rather than skipping line 1 is deliberate: agy prints a
 * `Fetching available models...` header only on a cold fetch, and on stderr in
 * some invocations, so a positional skip drops a real model on the warm path.
 */
export function parseAgyModels(stdout: string): string[] {
  return stdout
    .split('\n')
    .filter((line) => line.includes('\t'))
    .map((line) => (line.split('\t')[0] ?? '').trim())
    .filter((slug) => slug.length > 0);
}

/** Compare a live slug list against the static map. */
export function compareAgyModels(live: readonly string[]): AgyDriftVerdict {
  const excluded = live.filter((s) => !s.startsWith(GEMINI_PREFIX)).sort();
  const liveGemini = new Set(live.filter((s) => s.startsWith(GEMINI_PREFIX)));
  const mapped = new Set<string>(AGY_MODEL_SLUGS);

  const missingFromMap = [...liveGemini].filter((s) => !mapped.has(s)).sort();
  const staleInMap = [...mapped].filter((s) => !liveGemini.has(s)).sort();

  return {
    ok: missingFromMap.length === 0 && staleInMap.length === 0,
    missingFromMap,
    staleInMap,
    excluded,
  };
}

/* eslint-disable no-console */
function probe(): AgyDriftVerdict {
  let stdout: string;
  try {
    stdout = execFileSync('agy', ['models'], {
      encoding: 'utf-8',
      timeout: PROBE_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (error: unknown) {
    return {
      ok: false,
      missingFromMap: [],
      staleInMap: [],
      excluded: [],
      unmeasured: true,
      reason: `agy models could not be run: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const live = parseAgyModels(stdout);
  if (live.length === 0) {
    return {
      ok: false,
      missingFromMap: [],
      staleInMap: [],
      excluded: [],
      unmeasured: true,
      reason: 'agy models produced no parseable rows — output format may have changed',
    };
  }
  return compareAgyModels(live);
}

function main(): void {
  const verdict = probe();

  if (verdict.unmeasured === true) {
    console.error(`::error::agy model drift UNMEASURED — ${verdict.reason ?? 'unknown'}`);
    console.error(
      '  Absence of a probe is not agreement. Install agy, or run this where it exists.'
    );
    process.exitCode = 1;
    return;
  }

  if (verdict.excluded.length > 0) {
    console.log(`Excluded by #4346 (non-Gemini, routed elsewhere): ${verdict.excluded.join(', ')}`);
  }

  if (verdict.ok) {
    console.log(
      `agy model map is current (${String(AGY_MODEL_SLUGS.length)} Gemini-family slugs).`
    );
    return;
  }

  console.error('::error::agy model map has drifted from `agy models`.');
  if (verdict.missingFromMap.length > 0) {
    console.error(`  agy serves, map lacks:   ${verdict.missingFromMap.join(', ')}`);
  }
  if (verdict.staleInMap.length > 0) {
    console.error(`  map claims, agy dropped: ${verdict.staleInMap.join(', ')}`);
  }
  console.error('  Update AGY_MODEL_SLUGS in packages/nexus-agents/src/config/agy-model-map.ts');
  console.error('  and re-check CANONICAL_TO_AGY, which maps by tier semantics, not version.');
  process.exitCode = 1;
}

if (process.argv[1]?.endsWith('check-agy-model-drift.ts') === true) {
  main();
}
