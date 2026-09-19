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

/**
 * Markdown code: fenced blocks first (so a backtick inside a fence is not read
 * as opening a span), then inline spans. Text inside either is QUOTED, not
 * stated by the issue that contains it.
 *
 * The rule exists because the tracker this script files renders other issues'
 * titles in backticks (see {@link renderTitle}), one of those titles read
 * "(blocked by #4888)", and the tracker re-listed itself as blocked by #4888
 * on every run (#5237). The same holds for any issue quoting a commit
 * message, a log line or another issue's title: a blocker phrase in a code
 * span is evidence about the quoted text, not a dependency of the quoting
 * issue. Blockers stated outside the span are still read.
 */
const QUOTED_CODE = /```[\s\S]*?```|`[^`\n]*`/g;

/**
 * The label the workflow puts on the single tracking issue it files (#5238).
 * An issue carrying it is the report, never a subject of the report.
 */
export const TRACKER_LABEL = 'ops:unblocked-tracker';

export interface IssueSummary {
  readonly number: number;
  readonly title: string;
  readonly body: string;
  /** Label names. Optional so callers that do not fetch labels still work. */
  readonly labels?: readonly string[];
}

/** Classification of an issue's stated trigger (#6327). */
export type TriggerKind = 'issue-only' | 'unverified' | 'none';

/** An open issue every one of whose named blockers has closed. */
export interface UnblockedIssue {
  readonly number: number;
  readonly title: string;
  readonly blockers: readonly number[];
  readonly trigger?: string | undefined;
  readonly triggerKind?: TriggerKind | undefined;
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
  /**
   * Issues skipped because they carry {@link TRACKER_LABEL} — the tracker
   * itself. Named in the report so a reader can tell "skipped by identity"
   * from "not blocked". Empty when no open issue carries the label.
   */
  readonly excluded?: readonly number[];
}

/**
 * Blocker issue numbers named in an issue body. Deduplicated, ascending.
 * Quoted code (fenced or inline) is removed first — see {@link QUOTED_CODE}.
 */
export function parseBlockers(body: string): number[] {
  const found = new Set<number>();
  const stated = body.replace(QUOTED_CODE, ' ');
  for (const m of stated.matchAll(BLOCKER_PATTERN)) {
    const n = Number(m[1]);
    if (Number.isSafeInteger(n) && n > 0) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Headings that introduce an unblock trigger section in an issue body (#6327).
 *
 * Derived from a survey of open issues (#6327): `## Trigger`, `## Unblock trigger`,
 * `## Trigger to unblock`, `**Trigger:**`, `## Trigger / unblock`, `## The trigger`,
 * `**Unblock trigger:**`, `**Trigger to pick this up:**`, `## Trigger — do not build before this`.
 */
const TRIGGER_HEADING =
  /^[ \t]*#{1,6}[ \t]*(?:the\s+)?(?:unblock\s+trigger|trigger)(?:[ \t]+(?:to\s+(?:unblock|pick\s+this\s+up)|\/|—|-|–|do\s+not\s+build\s+before\s+this).*)?[ \t]*$/im;

const TRIGGER_BOLD =
  /^[ \t]*\*\*(?:the\s+)?(?:unblock\s+trigger|trigger(?:\s+to\s+pick\s+this\s+up)?):\*\*[ \t]*(.*)$/im;

const CONNECTOR_WORD_PATTERN =
  /^(?:once|after|lands?|merges?|merged|blocked|by|on|and|or|the|when|pick|up|before|this|landing|pr|prs|issue|issues|part|step|in|at|to|fix|fixes)$/iu;

function isIssueShapedToken(token: string): boolean {
  return /^#?\d+$/u.test(token) || CONNECTOR_WORD_PATTERN.test(token);
}

/**
 * Extract the first sentence of an issue's stated trigger (#6327).
 * Quoted code is stripped first, and markdown lists/formatting are cleaned.
 */
function firstSectionLine(text: string): string {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) break;
    if (trimmed.length > 0) return trimmed;
  }
  return '';
}

function rawTriggerText(stated: string): string {
  const headMatch = stated.match(TRIGGER_HEADING);
  if (headMatch?.index !== undefined) {
    return firstSectionLine(stated.slice(headMatch.index + headMatch[0].length));
  }
  const boldMatch = stated.match(TRIGGER_BOLD);
  if (boldMatch?.index !== undefined) {
    const inline = boldMatch[1]?.trim() ?? '';
    return inline.length > 0
      ? inline
      : firstSectionLine(stated.slice(boldMatch.index + boldMatch[0].length));
  }
  return '';
}

/**
 * Extract the first sentence of an issue's stated trigger (#6327).
 * Quoted code is stripped first, and markdown lists/formatting are cleaned.
 */
export function extractTrigger(body: string): string | undefined {
  const raw = rawTriggerText(body.replace(QUOTED_CODE, ' '));
  if (raw.length === 0) return undefined;
  const cleaned = raw.replace(/^[-*]\s+(\[[ x]\]\s*)?/, '').trim();
  if (cleaned.length === 0) return undefined;
  const sentenceMatch = cleaned.match(/^.*?[.?!][*`_]*(?:\s|$)/);
  const sentence = (sentenceMatch ? sentenceMatch[0].trim() : cleaned).replace(/[*`_]/g, '').trim();
  return sentence.length > 0 ? sentence : undefined;
}

/**
 * Classify a trigger as issue-only, unverified prose, or none (#6327).
 */
export function classifyTrigger(trigger: string | undefined): TriggerKind {
  if (trigger === undefined || trigger.trim().length === 0) return 'none';
  const tokens = trigger.match(/[a-z0-9#]+/giu) ?? [];
  if (tokens.length === 0) return 'none';
  return tokens.every(isIssueShapedToken) ? 'issue-only' : 'unverified';
}

/**
 * Render trigger text into a table cell (#5088, #6327).
 */
export function renderTrigger(trigger: string | undefined, kind: TriggerKind): string {
  if (kind === 'none' || trigger === undefined || trigger.trim().length === 0) return '(none)';
  const flattened = trigger
    .replace(/[`|\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const capped = flattened.length > TITLE_MAX ? `${flattened.slice(0, TITLE_MAX)}…` : flattened;
  const display = capped.length > 0 ? capped : '(empty)';
  if (kind === 'unverified') {
    return `trigger: unverified (\`${display}\`)`;
  }
  return `\`${display}\``;
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
 *
 * The tracker issue is excluded by identity ({@link TRACKER_LABEL}), not by
 * parsing: quoted-title matches are already ignored, but a report format that
 * ever states a blocker in plain text would re-list the tracker again (#5237).
 */
export function selectUnblocked(
  issues: readonly IssueSummary[],
  isClosed: (blocker: number) => boolean | undefined
): UnblockedVerdict {
  const unblocked: UnblockedIssue[] = [];
  const excluded: number[] = [];
  let tracked = 0;

  for (const issue of issues) {
    if (issue.labels?.includes(TRACKER_LABEL) === true) {
      excluded.push(issue.number);
      continue;
    }
    const blockers = parseBlockers(issue.body);
    if (blockers.length === 0) continue;
    tracked += 1;
    if (blockers.every((b) => isClosed(b) === true)) {
      const trigger = extractTrigger(issue.body);
      const triggerKind = classifyTrigger(trigger);
      unblocked.push({
        number: issue.number,
        title: issue.title,
        blockers,
        trigger,
        triggerKind,
      });
    }
  }

  unblocked.sort((a, b) => a.number - b.number);
  excluded.sort((a, b) => a - b);
  if (tracked === 0) return { unblocked, tracked, unmeasured: true, excluded };
  return { unblocked, tracked, excluded };
}

/**
 * Render one issue title for a table cell (#5088).
 *
 * Titles are Tier-3 hostile input — any GitHub user can set one. This is the
 * only place untrusted text reaches an artifact the workflow writes with
 * `issues: write`, and this repo's own agents read tracking issues when
 * choosing work, so an unescaped title is a prompt-injection channel into an
 * autonomous consumer, not merely a broken table.
 *
 * Backtick-wrapped so markdown, links and `@mentions` render inert; internal
 * backticks and pipes stripped so the cell cannot break out of its column; and
 * length-capped so one title cannot dominate the report.
 */
export function renderTitle(title: string): string {
  const flattened = title
    .replace(/[`|\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const capped = flattened.length > TITLE_MAX ? `${flattened.slice(0, TITLE_MAX)}…` : flattened;
  return `\`${capped || '(untitled)'}\``;
}

/** Longest title rendered into the report. */
const TITLE_MAX = 120;

/**
 * Machine-readable first line, so the workflow never has to grep the prose
 * (#5088).
 *
 * The workflow used to branch on `grep -q 'still have an open blocker'` over a
 * body that also contains attacker-controlled titles — an issue titled
 * "... all still have an open blocker" put its own row in the unblocked table
 * AND matched the sentinel, closing the tracking issue with a comment that was
 * factually false. Untrusted text must not reach control flow.
 */
export function statusLine(verdict: UnblockedVerdict): string {
  if (verdict.unmeasured === true) return 'STATUS: unmeasured';
  return verdict.unblocked.length > 0 ? 'STATUS: unblocked' : 'STATUS: none';
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
        `| #${String(u.number)} | ${u.blockers.map((b) => `#${String(b)}`).join(', ')} | ${renderTitle(u.title)} | ${renderTrigger(u.trigger, u.triggerKind ?? 'none')} |`
    )
    .join('\n');
  const excluded = verdict.excluded ?? [];
  const exclusionNote =
    excluded.length > 0
      ? `Tracker issue(s) excluded by label: ${excluded.map((n) => `#${String(n)}`).join(', ')}.\n\n`
      : '';
  return (
    `${String(verdict.unblocked.length)} of ${String(verdict.tracked)} blocked issue(s) ` +
    'now have **every** named blocker closed:\n\n' +
    '| issue | blockers (all closed) | title (copied verbatim from the issue) | trigger |\n' +
    '| --- | --- | --- | --- |\n' +
    `${rows}\n\n` +
    exclusionNote +
    'Each records an unblock trigger in its body — that is the handoff. ' +
    'Rows marked `trigger: unverified` carry prose conditions that must be checked manually before picking up (#6327). ' +
    'Leaving one here is how #4440 sat ten days after its blocker closed (#4617).\n'
  );
}

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
  const parsed = JSON.parse(raw) as Array<{
    number: number;
    title: string;
    body?: string;
    labels?: Array<{ name: string }>;
  }>;
  return parsed.map((i) => ({
    number: i.number,
    title: i.title,
    body: i.body ?? '',
    labels: (i.labels ?? []).map((l) => l.name),
  }));
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
  console.log(statusLine(verdict));
  console.log(formatReport(verdict));
  // Advisory by design (#4617): a gate that fails CI because somebody finished
  // a dependency would be hostile. The workflow reads stdout and files the
  // tracking issue; the exit code stays 0 either way.
}

if (process.argv[1]?.endsWith('check-unblocked.ts') === true) {
  main();
}
