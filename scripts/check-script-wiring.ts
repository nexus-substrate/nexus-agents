/**
 * Every check script must be reachable from CI (#4562).
 *
 * A gate that no workflow invokes is indistinguishable from no gate — except
 * that it also produces false confidence, because the script, its tests and
 * its documentation all exist. `check-schema-fanout.ts` sat unwired for over
 * three months while two documents stated it ran in CI (#4553), and an audit
 * then found six more in the same state, including one whose own header calls
 * it "the CI half of the authority-ladder enforcement layer".
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
 * Scripts deliberately not wired into CI, each with the reason.
 *
 * Add an entry only when a script is genuinely meant to be run by hand. An
 * entry without a real reason converts this gate into paperwork.
 */
export const MANUAL_ONLY: Readonly<Record<string, string>> = {};

export interface WiringInput {
  /** Basenames of `scripts/check-*.ts`, excluding tests. */
  readonly checkScripts: readonly string[];
  /** Combined text of every workflow file. */
  readonly workflowText: string;
  /** package.json `scripts` map. */
  readonly npmScripts: Readonly<Record<string, string>>;
}

export interface WiringVerdict {
  readonly wired: string[];
  readonly unwired: string[];
  readonly manualOnly: string[];
}

/**
 * Is `basename` reachable from a workflow, directly or via an npm script?
 *
 * The npm hop matters: `check-pricing-drift.ts` appears in no workflow, but
 * `check:pricing-drift` does, and the script body names the file. Treating
 * that as unwired would be a false positive, and false positives are what
 * teach people to ignore a gate.
 */
export function isReachableFromCi(
  basename: string,
  workflowText: string,
  npmScripts: Readonly<Record<string, string>>
): boolean {
  if (workflowText.includes(basename)) return true;

  for (const [name, body] of Object.entries(npmScripts)) {
    if (!body.includes(basename)) continue;
    // The workflow must invoke this npm script by name — `pnpm <name>`,
    // `npm run <name>`, or with flags between (`pnpm --silent <name>`, which
    // ci.yml actually uses for check:model-drift and which a stricter pattern
    // reported as unwired. Found by running this gate, not by reading it).
    // A bare mention of the name elsewhere is not an invocation.
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (
      new RegExp(`(?:pnpm|npm run|yarn)\\s+(?:--?[\\w-]+\\s+)*${escaped}\\b`).test(workflowText)
    ) {
      return true;
    }
  }
  return false;
}

/** Partition the check scripts into wired, unwired, and deliberately manual. */
export function assessWiring(input: WiringInput): WiringVerdict {
  const wired: string[] = [];
  const unwired: string[] = [];
  const manualOnly: string[] = [];

  for (const basename of input.checkScripts) {
    if (Object.prototype.hasOwnProperty.call(MANUAL_ONLY, basename)) {
      manualOnly.push(basename);
      continue;
    }
    if (isReachableFromCi(basename, input.workflowText, input.npmScripts)) wired.push(basename);
    else unwired.push(basename);
  }
  return { wired, unwired, manualOnly };
}

function readWorkflowText(): string {
  if (!existsSync(WORKFLOW_DIR)) return '';
  return readdirSync(WORKFLOW_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .map((f) => readFileSync(join(WORKFLOW_DIR, f), 'utf-8'))
    .join('\n');
}

function readCheckScripts(): string[] {
  return readdirSync(SCRIPTS_DIR)
    .filter((f) => f.startsWith('check-') && f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .sort();
}

function readNpmScripts(): Record<string, string> {
  const parsed: unknown = JSON.parse(readFileSync(ROOT_PACKAGE_JSON, 'utf-8'));
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
    checkScripts: readCheckScripts(),
    workflowText,
    npmScripts,
  });

  console.log(`Script wiring: ${String(verdict.wired.length)} reachable from CI.`);
  for (const m of verdict.manualOnly) {
    console.log(`  manual-only: ${m} — ${MANUAL_ONLY[m] ?? ''}`);
  }

  if (verdict.unwired.length === 0) return 0;

  console.error(`\n${String(verdict.unwired.length)} check script(s) no workflow invokes:`);
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
