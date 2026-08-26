#!/usr/bin/env npx tsx
/**
 * Surface open issues whose named blockers have all closed (#4617).
 *
 * `CLAUDE.md` requires two halves. The FILING half works: blocked issues in
 * this repo genuinely record "blocked by #N" and a named unblock trigger. The
 * SURFACING half — "a finished dependency should surface its dependents" — is
 * a rule addressed to whoever closes the blocker, with nothing behind it.
 *
 * Measured before building, as #4617 asked: of the 136 open issues,
 * **12 name a blocker and all 12 have every blocker closed.** Not one stale
 * instance — the mechanism had never surfaced anything. #4440 sat ten days
 * after its blocker closed, which is what prompted the issue.
 *
 * ## Advisory, never blocking
 *
 * A gate that fails CI because somebody finished a dependency would be
 * actively hostile. This reports; the scheduled workflow files the result as a
 * tracking issue, which is the durable surface (same shape as #4506's deploy
 * staleness check). Per #4562 a script with no consumer is the very thing this
 * exists to fix, so the workflow is part of the change, not a follow-up.
 *
 * ## Why parse prose rather than use GitHub's own relationships
 *
 * #4617 asked this to be checked first. GitHub's sub-issue and Projects
 * `blocked-by` fields would work, but nothing in this repo populates them —
 * the convention in 136 open issues is prose in the body. A native-relationship
 * check would report zero blocked issues today and be a gate that cannot fire.
 * Reading what is actually written is what makes this measure anything.
 *
 * @module scripts/check-unblocked
 * (Source: Issue #4617)
 */

/**
 * Blocker references as they are actually written in this repo's issues.
 *
 * Derived from a survey of all 136 open issues rather than guessed: `blocked
 * by` (4), `depends on` (3), `once #N` (1), plus `blocked on` / `after #N
 * lands` which currently match nothing but are the same convention and cost
 * nothing to accept. Anchored on the verb so a bare `#N` cross-reference —
 * overwhelmingly the common case, and almost never a dependency — is ignored.
 */
const BLOCKER_PATTERN = /(?:blocked\s+(?:by|on)|depends\s+on|after|once)\s+#(\d+)/gi;

export interface IssueSummary {
  readonly number: number;
  readonly title: string;
  readonly body: string;
}

/** An open issue every one of whose named blockers has closed. */
export interface UnblockedIssue {
  readonly number: number;
  readonly title: string;
  readonly blockers: readonly number[];
}

export interface UnblockedVerdict {
  readonly unblocked: readonly UnblockedIssue[];
  /** Open issues that name at least one blocker, closed or not. */
  readonly tracked: number;
  /**
   * Set when NO open issue names a blocker at all (#4617).
   *
   * Zero unblocked issues means two very different things: the backlog is
   * current, or the "blocked by #N" convention stopped being written and this
   * check is reading an empty corpus. `unblocked: []` looks identical in both
   * cases, so the second is stated rather than inferred — a check whose input
   * vanished must not report the same clean result as one that ran.
   */
  readonly unmeasured?: boolean;
}

/** Blocker issue numbers named in an issue body. Deduplicated, ascending. */
export function parseBlockers(body: string): number[] {
  const found = new Set<number>();
  for (const m of body.matchAll(BLOCKER_PATTERN)) {
    const n = Number(m[1]);
    if (Number.isSafeInteger(n) && n > 0) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Open issues whose every named blocker is closed.
 *
 * `isClosed` is injected so the decision is testable without the network —
 * the resolution itself is the only part that needs `gh`.
 *
 * An issue naming a blocker whose state could not be resolved is NOT reported
 * as unblocked. An unresolvable reference is unknown, and treating unknown as
 * closed would surface work that is still blocked, which erodes trust in the
 * report faster than missing one would.
 */
export function selectUnblocked(
  issues: readonly IssueSummary[],
  isClosed: (blocker: number) => boolean | undefined
): UnblockedVerdict {
  const unblocked: UnblockedIssue[] = [];
  let tracked = 0;

  for (const issue of issues) {
    const blockers = parseBlockers(issue.body);
    if (blockers.length === 0) continue;
    tracked += 1;
    if (blockers.every((b) => isClosed(b) === true)) {
      unblocked.push({ number: issue.number, title: issue.title, blockers });
    }
  }

  unblocked.sort((a, b) => a.number - b.number);
  if (tracked === 0) return { unblocked, tracked, unmeasured: true };
  return { unblocked, tracked };
}

/** Markdown body for the tracking issue. */
export function formatReport(verdict: UnblockedVerdict): string {
  if (verdict.unmeasured === true) {
    return (
      'No open issue names a blocker (`blocked by #N`, `depends on #N`, …).\n\n' +
      'Reported as **unmeasured** rather than clean: an empty corpus and a current ' +
      'backlog produce the same empty result, and the likelier explanation for a ' +
      'repo this size is that the convention stopped being written. See #4617.\n'
    );
  }
  if (verdict.unblocked.length === 0) {
    return `All ${String(verdict.tracked)} blocked issue(s) still have an open blocker. Nothing to pick up.\n`;
  }
  const rows = verdict.unblocked
    .map(
      (u) =>
        `| #${String(u.number)} | ${u.blockers.map((b) => `#${String(b)}`).join(', ')} | ${u.title} |`
    )
    .join('\n');
  return (
    `${String(verdict.unblocked.length)} of ${String(verdict.tracked)} blocked issue(s) ` +
    'now have **every** named blocker closed:\n\n' +
    '| issue | blockers (all closed) | title |\n| --- | --- | --- |\n' +
    `${rows}\n\n` +
    'Each records an unblock trigger in its body — that is the handoff. Pick them up ' +
    'or re-prioritise them explicitly; leaving one here is how #4440 sat ten days ' +
    'after its blocker closed (#4617).\n'
  );
}

/* eslint-disable no-console */
import { readFileSync } from 'node:fs';

/**
 * Open issues, read from STDIN.
 *
 * Not an env var, which is how this was first written: 136 issue bodies is
 * roughly 700 KB and `execve` rejected it with `E2BIG` — the script and the
 * workflow would both have died on the real backlog while passing every unit
 * test. The sibling `check-stuck-runs.ts` uses `RUNS_JSON` safely because run
 * summaries are tiny; issue bodies are not.
 */
function readIssues(): IssueSummary[] {
  const raw = readFileSync(0, 'utf-8');
  if (raw.trim() === '') return [];
  const parsed = JSON.parse(raw) as Array<{ number: number; title: string; body?: string }>;
  return parsed.map((i) => ({ number: i.number, title: i.title, body: i.body ?? '' }));
}

/**
 * Blocker states from `BLOCKER_STATES_JSON`, a `{ "4439": "CLOSED" }` map the
 * workflow resolves with `gh`. A number absent from the map resolves to
 * `undefined` — unknown, which `selectUnblocked` refuses to treat as closed.
 */
function readBlockerStates(): (blocker: number) => boolean | undefined {
  const raw = process.env['BLOCKER_STATES_JSON'];
  if (raw === undefined || raw.trim() === '') return () => undefined;
  const map = JSON.parse(raw) as Record<string, string>;
  return (blocker) => {
    const state = map[String(blocker)];
    if (state === undefined) return undefined;
    return state === 'CLOSED' || state === 'MERGED';
  };
}

function main(): void {
  const verdict = selectUnblocked(readIssues(), readBlockerStates());
  console.log(formatReport(verdict));
  // Advisory by design (#4617): a gate that fails CI because somebody finished
  // a dependency would be hostile. The workflow reads stdout and files the
  // tracking issue; the exit code stays 0 either way.
}

if (process.argv[1]?.endsWith('check-unblocked.ts') === true) {
  main();
}
