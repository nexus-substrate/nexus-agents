/**
 * The stamp-only exemption for the governor-path ratification gate (#5944).
 *
 * A sibling module rather than an addition to either gate script: the two
 * scripts that need it are already at or over their line caps, and the
 * classifier is a pure decision worth reading on its own. Ratified 6-1 at
 * `supermajority` with `errorPolicy: absolute_quorum`.
 *
 * @module scripts/governance-stamp-exemption
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * The two files the governance injector generates. Nothing else is ever
 * eligible for the stamp-only exemption (#5944), however its content compares.
 */
export const GENERATED_GOVERNANCE_FILES: readonly string[] = ['CLAUDE.md', 'AGENTS.md'];

/**
 * How many hex characters of the sha256 the stamp carries (#5943). Long enough
 * that an accidental collision across four source files is not a concern;
 * short enough to read.
 */
export const GOVERNANCE_STAMP_DIGEST_LENGTH = 12;

/**
 * The stamp line `scripts/inject-governance.ts` rewrites on every regeneration.
 *
 * THE one definition. Exported so the renderer, the AGENTS.md sync pattern and
 * this module's exemption predicate all match the same shape — the architect's
 * condition on the #5943 ratification, because "every site moved" is only
 * checkable if there is one site to move. `scripts/inject-governance.test.ts`
 * asserts the rendered line matches this.
 *
 * Anchored, and the digest shape is fixed — a hand-edited or reworded stamp
 * does not match, so it is not exempt.
 */
export const GOVERNANCE_STAMP_PATTERN = new RegExp(
  `^_Governance Version: [0-9a-f]{${String(GOVERNANCE_STAMP_DIGEST_LENGTH)}}_$`
);

/**
 * The generated spans a regeneration may move without ratification (#6022,
 * ratified 6-1 at `supermajority` with `errorPolicy: absolute_quorum`).
 *
 * A NAMED SUBSET, not every span. The panel weighed exempting all of them and
 * chose not to: `RULES_INDEX` is the cross-adapter bridge telling Codex, Gemini
 * and OpenCode which rules exist, so its content decides what non-Claude
 * harnesses obey. Its source `.rules/` is itself governor-gated (#5999), so
 * leaving it out costs nothing — a PR that moves it already needs ratification
 * at the source.
 *
 * `MODEL_LIST` is deliberately ABSENT pending its own decision (#6024). It has
 * the strongest case for inclusion — model additions are the most frequent
 * change here, and #5491 already held that model data is not governance content
 * — but widening a governance exemption past what a panel approved is the thing
 * these gates exist to prevent.
 *
 * Every name here must exist in `GOVERNANCE_SPAN_NAMES` (scripts/governance-markers.ts);
 * a test pins the subset relation so this list cannot name a span that is gone.
 *
 * MODEL_LIST joined in #6024, by its own 6-1 vote rather than on #6022's
 * mandate. Three measurements decided it. The span renders IDENTIFIERS ONLY —
 * one comma-separated sentence, no capability rows, no pricing — which is the
 * same shape as TOOL_INDEX, already in the subset with the same ungated source.
 * Nothing at runtime reads that sentence: routing and voter pinning go through
 * `getDefaultRegistry()`, so the span is a mirror of `in-tree-data.ts`, never a
 * consumption point, and withholding the exemption gated the shadow rather than
 * the object. And `in-tree-data.ts` is NOT a GOVERNANCE_STAMP_SOURCE, so a model
 * addition moves the span WITHOUT moving the stamp — #5944's stamp-line
 * exemption neither did nor ever could cover it.
 *
 * The #6024 issue's frequency argument was measured and found WRONG (the span
 * took 5 distinct values in six months, not the high-churn path it claimed);
 * that weakened the urgency, not the case. RULES_INDEX stays out: its `.rules/`
 * source is governor-gated since #5999, so excluding it costs nothing.
 */
export const EXEMPT_SPAN_NAMES: readonly string[] = [
  'VERSION',
  'TOOL_INDEX',
  'WORKFLOW_INDEX',
  'MODEL_LIST',
];

/**
 * Blank the CONTENT of each exempt span, keeping its markers.
 *
 * Unbalanced or missing markers simply do not match, so the raw text survives
 * into the comparison and the diff is not exempt — removing a span cannot be
 * laundered as a regeneration.
 */
function normalizeGenerated(text: string): string {
  // The stamp LINE is still normalised wherever it appears, not only inside the
  // VERSION span. In a real generated file it lives inside that span, so this is
  // belt-and-braces — but the predicate is fed whole texts, including fixtures
  // and any future layout, and losing the line-level case would narrow the
  // exemption that #5944 ratified.
  //
  // Safe against camouflage: a stamp-shaped line ADDED on one side only leaves
  // the two texts different lengths, so they still compare unequal. Only a line
  // matching the anchored pattern on BOTH sides collapses.
  let out = text
    .split('\n')
    .map((line) => (GOVERNANCE_STAMP_PATTERN.test(line) ? '_Governance Version: <stamp>_' : line))
    .join('\n');
  for (const name of EXEMPT_SPAN_NAMES) {
    const span = new RegExp(
      `(<!-- GOVERNANCE:${name}:START -->)[\\s\\S]*?(<!-- GOVERNANCE:${name}:END -->)`,
      'g'
    );
    out = out.replace(span, `$1<exempt:${name}>$2`);
  }
  return out;
}

/**
 * True when `before` and `after` differ ONLY in the generated governance stamp
 * (#5944, ratified 6-1 with `absolute_quorum`).
 *
 * The gate used to fire on every PR touching any of the four
 * `GOVERNANCE_STAMP_SOURCES`, because regenerating the derived stamp puts
 * CLAUDE.md and AGENTS.md in the diff. #5940 was a parameter rename. That
 * trains a reviewer to wave through CLAUDE.md diffs, which is the one file
 * where waving through is fatal.
 *
 * Deliberately NOT a diff parser. The panel's rejecting voter attacked that
 * surface — `.gitattributes` overrides, custom diff drivers, unified-diff edge
 * cases — and proving the ABSENCE of other changes through a parser is the hard
 * direction. Whole texts are compared with the stamp normalised, so "nothing
 * else changed" is a byte equality rather than an inference, and there is no
 * truncation mode to fail closed against.
 *
 * FAILS CLOSED in every ambiguous case: unreadable content on either side, and
 * identical content (a file the changed-list named but whose text did not move
 * means the gate's two inputs disagree — a rename, a mode change or a bad read,
 * none of which is evidence of a stamp-only change).
 */
export function isStampOnlyChange(before: string | undefined, after: string | undefined): boolean {
  if (before === undefined || after === undefined) return false;
  if (before === after) return false;
  return normalizeGenerated(before) === normalizeGenerated(after);
}

/**
 * The subset of `changedFiles` that may skip ratification because the only
 * thing that moved in them is the generated stamp.
 *
 * Readers are injected so the decision stays a pure function of file text —
 * the caller does the I/O, and passes `undefined` for anything it could not
 * read, which {@link isStampOnlyChange} treats as not-exempt.
 */
export function stampOnlyExemptFiles(
  changedFiles: readonly string[],
  readAtBase: (path: string) => string | undefined,
  readAtHead: (path: string) => string | undefined,
  injectorIsClean: () => boolean
): string[] {
  // THE precondition, and the half that makes widening the normalizer safe
  // (#6022). Blanking span content without it would make everything between the
  // markers free-form text that skips ratification. Requiring head to be
  // injector-clean means each span equals what the deterministic renderer
  // produces from in-repo sources, so "regenerated" is verified rather than
  // asserted by whoever opened the PR.
  //
  // Required, not defaulted: a caller that forgets it would silently get the
  // widened exemption with no guard, so the compiler names every call site.
  if (!injectorIsClean()) return [];
  return changedFiles
    .filter((f) => GENERATED_GOVERNANCE_FILES.includes(f))
    .filter((f) => isStampOnlyChange(readAtBase(f), readAtHead(f)));
}

/**
 * Whether the checkout matches what the injector would generate (#6022).
 *
 * FAILS CLOSED on anything that is not an unambiguous success: a non-zero exit,
 * a spawn error, a timeout, or a missing status all return false. "Could not
 * determine" and "clean" must never collapse into the same answer here — the
 * whole exemption rests on this.
 */
export function injectorIsClean(): boolean {
  const result = spawnSync('pnpm', ['exec', 'tsx', 'scripts/inject-governance.ts', 'check'], {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error !== undefined) return false;
  return result.status === 0;
}

/**
 * Reads a governed file as of the PR's base commit, for the stamp-only
 * exemption (#5944).
 *
 * Returns `undefined` for anything it cannot read — a missing base sha, a file
 * absent at base, a git failure — which `stampOnlyExemptFiles` treats as NOT
 * exempt. The exemption can therefore only ever be granted on evidence, never
 * on the absence of it.
 *
 * `git show` is invoked with a fixed argument array and never a shell, and the
 * path is one of the two hardcoded entries in `GENERATED_GOVERNANCE_FILES`
 * (ratification condition 4), so nothing here interpolates untrusted input.
 */
export function readAtBase(baseSha: string | undefined): (path: string) => string | undefined {
  return (path) => {
    if (baseSha === undefined || !/^[0-9a-f]{40}$/.test(baseSha)) return undefined;
    const result = spawnSync('git', ['show', `${baseSha}:${path}`], {
      cwd: ROOT,
      encoding: 'utf-8',
      maxBuffer: 32 * 1024 * 1024,
    });
    if (result.status !== 0 || typeof result.stdout !== 'string') return undefined;
    return result.stdout;
  };
}

/** Reads a governed file as it stands in the checkout (the PR head). */
export function readAtHead(path: string): string | undefined {
  try {
    return readFileSync(join(ROOT, path), 'utf-8');
  } catch {
    return undefined;
  }
}
