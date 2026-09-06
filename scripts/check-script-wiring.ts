/**
 * Every gate-shaped script must be reachable from CI (#4562).
 *
 * A gate that no workflow invokes is indistinguishable from no gate — except
 * that it also produces false confidence, because the script, its tests and
 * its documentation all exist. `check-schema-fanout.ts` sat unwired for over
 * three months while two documents stated it ran in CI (#4553), and an audit
 * then found six more in the same state, including one whose own header calls
 * it "the CI half of the authority-ladder enforcement layer".
 *
 * ## Scope: `check-*.ts`, plus anything with a CLI entry guard
 *
 * Until #5458 this gate enumerated only `scripts/check-*.ts`, so a gate-shaped
 * script under any other name — `analyze-timeout-mismatch.ts`,
 * `curate-pr-review-harvest.ts` — was invisible to it: the #4553 class, sitting
 * just outside the glob. Scope is now every non-test `scripts/*.ts` that is
 * either named `check-*` (unconditionally, as before) or carries a CLI entry
 * guard — the `if (invoked directly) main()` idiom that marks a file as an
 * entry point rather than a library. The guard is detected by the shapes the
 * repo actually uses (`CLI_ENTRY_GUARD_SHAPES`), not by a list of filenames,
 * so a new entry point is in scope the day it is written.
 *
 * Not in scope, and stated so nothing infers coverage that does not exist:
 * scripts that run their body unconditionally at module top level with no
 * guard (`review-pr.ts`, the `generate-*-index.ts` family, `sync-*.ts`).
 * They are entry points too, but a top-level `process.exit(` is not a
 * detectable idiom the way a guard is; widening to them is a separate change.
 *
 * ## Reachability
 *
 * A script counts as wired when a workflow names it directly, OR when a
 * package.json script mentions it and a workflow runs THAT script name. The
 * indirection is real and common here (`check:pricing-drift` → workflow), so
 * a naive filename grep would report three false positives.
 *
 * ## This gate checks itself
 *
 * The first assertion is that this script is itself reachable. A wiring gate
 * that is not wired would be the joke writing itself, and the panel that chose
 * this option named that risk as the reason it scored worst on immunity.
 *
 * ## Allowlist entries carry a reason
 *
 * A script legitimately meant for local or manual use is fine — silence is
 * not. Each exemption states why, so the next reader can tell a decision from
 * an oversight.
 *
 * @module scripts/check-script-wiring
 * (Source: Issue #4562)
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOW_DIR = '.github/workflows';
const SCRIPTS_DIR = 'scripts';
const ROOT_PACKAGE_JSON = 'package.json';

/** This gate's own filename — asserted reachable before anything else. */
export const SELF = 'check-script-wiring.ts';

/**
 * Scripts deliberately not wired into CI, each with the reason and, where one
 * exists, the issue that decided it.
 *
 * Add an entry only when a script is genuinely meant to be run by hand or is
 * reached by something CI cannot see (a hook, an operator runbook). An entry
 * without a real reason converts this gate into paperwork.
 *
 * The table is measured, not trusted: `assessWiring` reports an entry as
 * `stale` when the script is no longer enumerated (deleted, renamed, or lost
 * its guard) or when a workflow now runs it, and `main()` fails on either. A
 * test also asserts each entry against the real tree.
 */
export const MANUAL_ONLY: Readonly<Record<string, string>> = {
  // Requires the `agy` binary, which no CI runner has. Wiring it into a
  // workflow would make it report `unmeasured` — a failure — on every run, so
  // it is operator-invoked: `pnpm exec tsx scripts/check-agy-model-drift.ts`, and on
  // each agy upgrade (#5085). Listed rather than silently unwired, because an
  // unlisted gate nothing runs is what #4553 is about.
  'check-agy-model-drift.ts': 'needs the agy CLI; not installable on CI runners',
  // Reads runtime telemetry from $NEXUS_DATA_DIR/mcp-timing.jsonl, which only a
  // long-running local MCP session produces; a CI runner has none. Operator
  // runbook in its header; logic covered by analyze-timeout-mismatch.test.ts
  // (#2703, surfaced as unwired by #5458).
  'analyze-timeout-mismatch.ts': 'reads local MCP telemetry a CI runner never has; operator-run',
  // The pr_review eval-set curation CLI (validate|stats|add). Runs by hand when
  // the dataset changes; the assembled dataset, not this script, is what CI
  // consumes (#3847, surfaced by #5458).
  'curate-pr-review-dataset.ts':
    'eval-set curation CLI, run by hand when the dataset changes (#3847)',
  // The gh-fetch harvest step of the same pipeline; needs an authenticated gh
  // and writes a candidates file for human labeling. Its pure helpers are
  // imported by mine-pr-review-candidates-assemble.ts, which IS wired, and by
  // curate-pr-review-labeling.test.ts (#3847, surfaced by #5458).
  'curate-pr-review-harvest.ts': 'gh-fetch harvest step run by hand before labeling (#3847)',
  // Subscription-quota local runner for pr_review (`--watch` poll loop). CI has
  // its own path, pr-review.yml → the pr_review MCP tool; this script is the
  // documented local alternative and must not run on a shared runner because
  // it posts review comments under the operator's own account.
  'pr-review-local.ts': 'operator-run local pr_review path; CI uses pr-review.yml instead',
  // Its extraction logic runs in CI every push: check-api-surface.ts (ci.yml)
  // imports it to diff the live surface against api-surface.txt. The guarded
  // CLI (`pnpm api:surface`) is the by-hand path that REGENERATES the snapshot
  // after a ratified API change, and must not run in CI (#4749).
  'extract-api-surface.ts':
    'library of the wired check-api-surface.ts; its CLI regenerates the snapshot by hand (#4749)',
  // `pnpm eval:mine-candidates`: gh-fetches merged PRs to propose pr_review
  // eval candidates for human labeling. Needs gh auth and a human after it;
  // documented in docs/research/pr-review-eval-curation.md (#3847).
  'mine-pr-review-candidates.ts':
    'gh-fetch candidate mining for human labeling, run by hand (#3847)',
  // `pnpm eval:run`: scores pr_review against the labeled dataset with LIVE
  // voters — real LLM calls on the operator's quota, results committed under
  // docs/research/pr-review-experiment-results-*.md. Not a per-push gate.
  'pr-review-eval-run.ts':
    'live-voter eval run on operator quota; results are committed, not gated',
  // `pnpm review <PR#>`: the contributor-run CLI review. verify-review.yml
  // tells the author to run it, CONTRIBUTION_GUIDE documents it, and it posts
  // the review comment and the `cli-reviewed` label to GitHub under the
  // operator's own account — which is why no workflow runs it. Guarded so the
  // gate can see it (#5501).
  'review-pr.ts':
    'operator-run; verify-review.yml and CONTRIBUTION_GUIDE instruct contributors to run it; posts to GitHub',
  // One-off enrichment of docs/research/registry/papers.yaml from Semantic
  // Scholar (rate-limited network fetch, writes the registry). The research_add
  // tool's message names it as the follow-up for a preprint with no citation
  // data; not a per-push gate (#5501).
  'backfill-research-quality.ts':
    "one-off Semantic Scholar enrichment referenced by research-add.ts's tool message; network + registry write",
};

/**
 * The shapes a script in `scripts/` uses to run `main()` only when invoked
 * directly. Grepped from the tree, not invented; each is annotated with one
 * file that uses it. A file matching any shape is an entry point and in scope.
 */
export const CLI_ENTRY_GUARD_SHAPES: readonly RegExp[] = [
  // process.argv[1]?.endsWith('self.ts') === true      — check-*, arch-lint, stratify-outcomes
  /process\.argv\[1\]\??\.endsWith\(/,
  // import.meta.url === `file://${process.argv[1]}`   — claims-check, pr-review-local, meta-shadow-soak
  // import.meta.url === pathToFileURL(argv[1]).href   — inject-governance, generate-tool-reference
  /import\.meta\.url\s*===/,
  // fileURLToPath(import.meta.url) === process.argv[1] — check-harness-alignment
  /fileURLToPath\(import\.meta\.url\)\s*===/,
];

/** Does this source text run its body only when invoked directly? */
export function hasCliEntryGuard(source: string): boolean {
  return CLI_ENTRY_GUARD_SHAPES.some((shape) => shape.test(source));
}

export interface WiringInput {
  /** Basenames of the in-scope `scripts/*.ts` (see `readInScopeScripts`), excluding tests. */
  readonly inScopeScripts: readonly string[];
  /** Combined text of every workflow file. */
  readonly workflowText: string;
  /** package.json `scripts` map. */
  readonly npmScripts: Readonly<Record<string, string>>;
  /** Exemption table; defaults to `MANUAL_ONLY`. Injectable so tests can prove staleness fires. */
  readonly allowlist?: Readonly<Record<string, string>>;
}

/** Why an allowlist entry no longer describes reality. */
export type StaleReason = 'wired' | 'not-enumerated';

export interface WiringVerdict {
  readonly wired: string[];
  readonly unwired: string[];
  readonly manualOnly: string[];
  /** Allowlist entries whose claim is false; empty when every entry still holds. */
  readonly stale: Array<{ basename: string; reason: StaleReason }>;
}

/**
 * Is `basename` reachable from a workflow, directly or via an npm script?
 *
 * The npm hop matters: `check-pricing-drift.ts` appears in no workflow, but
 * `check:pricing-drift` does, and the script body names the file. Treating
 * that as unwired would be a false positive, and false positives are what
 * teach people to ignore a gate.
 */
/** Runners a workflow step uses to execute a script directly. */
const INVOCATION_RUNNERS = ['tsx', 'node', 'ts-node', 'bash', 'sh'] as const;

type Quote = "'" | '"' | '`';

function isQuote(character: string | undefined): character is Quote {
  return character === "'" || character === '"' || character === '`';
}

function unclosedQuote(text: string): Quote | undefined {
  let quote: Quote | undefined;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '\\') {
      index += 1;
    } else if (isQuote(character)) {
      quote = quote === undefined ? character : quote === character ? undefined : quote;
    }
  }
  return quote;
}

/** Does `pattern` match outside a quoted string on some line? */
function matchesUnquotedOnSomeLine(text: string, pattern: RegExp): boolean {
  for (const line of text.split('\n')) {
    for (const match of line.matchAll(pattern)) {
      const prefix = line.slice(0, match.index);
      // #5501: text a workflow prints or posts is not a CI invocation.
      if (unclosedQuote(prefix) === undefined) return true;
    }
  }
  return false;
}

/**
 * True when some line runs `<runner> … <basename>` — an execution, not a
 * mention. `paths:` entries and comments name the file without running it.
 */
function invokesOnSomeLine(workflowText: string, runner: string, basename: string): boolean {
  const escaped = basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\b${runner}\\s+.*${escaped}`, 'g');
  return matchesUnquotedOnSomeLine(workflowText, pattern);
}

export function isReachableFromCi(
  basename: string,
  workflowText: string,
  npmScripts: Readonly<Record<string, string>>
): boolean {
  // #5028: a bare `includes` counted ANY textual occurrence — including a
  // `paths:` trigger entry, which never executes anything. Deleting the
  // `run: pnpm exec tsx scripts/check-governor-ratification.ts` step from
  // governor-review.yml left the filename in two `paths:` blocks, so the gate
  // whose job is catching unwired gates reported it reachable. Require an
  // actual invocation: a runner followed by the path on the same line.
  if (INVOCATION_RUNNERS.some((r) => invokesOnSomeLine(workflowText, r, basename))) return true;

  for (const [name, body] of Object.entries(npmScripts)) {
    if (!body.includes(basename)) continue;
    // The workflow must invoke this npm script by name — `pnpm <name>`,
    // `npm run <name>`, or with flags between (`pnpm --silent <name>`, which
    // ci.yml actually uses for check:model-drift and which a stricter pattern
    // reported as unwired. Found by running this gate, not by reading it).
    // A bare mention of the name elsewhere is not an invocation.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (
      matchesUnquotedOnSomeLine(
        workflowText,
        new RegExp(`(?:pnpm|npm run|yarn)\\s+(?:--?[\\w-]+\\s+)*${escaped}\\b`, 'g')
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Partition the in-scope scripts into wired, unwired, and deliberately manual,
 * and audit the allowlist itself: an entry that is wired after all, or that
 * names nothing the gate enumerates, is `stale`.
 */
export function assessWiring(input: WiringInput): WiringVerdict {
  const allowlist = input.allowlist ?? MANUAL_ONLY;
  const wired: string[] = [];
  const unwired: string[] = [];
  const manualOnly: string[] = [];
  const stale: Array<{ basename: string; reason: StaleReason }> = [];
  const enumerated = new Set(input.inScopeScripts);

  for (const basename of input.inScopeScripts) {
    const reachable = isReachableFromCi(basename, input.workflowText, input.npmScripts);
    if (Object.prototype.hasOwnProperty.call(allowlist, basename)) {
      if (reachable) stale.push({ basename, reason: 'wired' });
      else manualOnly.push(basename);
      continue;
    }
    if (reachable) wired.push(basename);
    else unwired.push(basename);
  }
  for (const basename of Object.keys(allowlist)) {
    if (!enumerated.has(basename)) stale.push({ basename, reason: 'not-enumerated' });
  }
  return { wired, unwired, manualOnly, stale };
}

export function readWorkflowText(root = '.'): string {
  const dir = join(root, WORKFLOW_DIR);
  if (!existsSync(dir)) return '';
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => readFileSync(join(dir, f), 'utf-8'))
    .join('\n');
}

/**
 * Basenames of every non-test `scripts/*.ts` in scope: `check-*` unconditionally,
 * anything else only if it carries a CLI entry guard (#5458).
 */
export function readInScopeScripts(root = '.'): string[] {
  const dir = join(root, SCRIPTS_DIR);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .filter((f) => f.startsWith('check-') || hasCliEntryGuard(readFileSync(join(dir, f), 'utf-8')))
    .sort();
}

export function readNpmScripts(root = '.'): Record<string, string> {
  const parsed: unknown = JSON.parse(readFileSync(join(root, ROOT_PACKAGE_JSON), 'utf-8'));
  if (typeof parsed !== 'object' || parsed === null) return {};
  const scripts = (parsed as { scripts?: unknown }).scripts;
  if (typeof scripts !== 'object' || scripts === null) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(scripts)) if (typeof v === 'string') out[k] = v;
  return out;
}

/* eslint-disable no-console */
function main(): number {
  const workflowText = readWorkflowText();
  const npmScripts = readNpmScripts();

  // Self-check first: a wiring gate that is not wired proves nothing.
  if (!isReachableFromCi(SELF, workflowText, npmScripts)) {
    console.error(`::error::${SELF} is not invoked by any workflow — this gate is not wired.`);
    return 1;
  }

  const verdict = assessWiring({
    inScopeScripts: readInScopeScripts(),
    workflowText,
    npmScripts,
  });

  console.log(`Script wiring: ${String(verdict.wired.length)} reachable from CI.`);
  for (const m of verdict.manualOnly) {
    console.log(`  manual-only: ${m} — ${MANUAL_ONLY[m] ?? ''}`);
  }

  if (verdict.stale.length > 0) {
    console.error(`\n${String(verdict.stale.length)} MANUAL_ONLY entr(y|ies) no longer true:`);
    for (const { basename, reason } of verdict.stale) {
      console.error(
        `  ✗ ${basename} — ${reason === 'wired' ? 'a workflow now runs it; drop the entry' : 'not enumerated (deleted, renamed, or lost its CLI guard); drop or fix the entry'}`
      );
    }
  }

  if (verdict.unwired.length === 0) return verdict.stale.length === 0 ? 0 : 1;

  console.error(`\n${String(verdict.unwired.length)} gate-shaped script(s) no workflow invokes:`);
  for (const u of verdict.unwired) console.error(`  ✗ ${u}`);
  console.error(
    '\nA gate nothing runs is indistinguishable from no gate, and worse: the\n' +
      'script and its docs imply coverage that does not exist (#4553).\n' +
      'Wire it into a workflow, or add it to MANUAL_ONLY with the reason.'
  );
  return 1;
}

if (process.argv[1]?.endsWith('check-script-wiring.ts') === true) {
  process.exit(main());
}
