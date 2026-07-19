/**
 * meta-shadow-soak-core.ts — PURE goal-selection/formatting logic for the
 * MetaOrchestrator shadow-training soak (#4310, feeder for #3552).
 *
 * The shadow-training MECHANISM already works: `NEXUS_META_SHADOW_TRAIN=1`
 * makes `executeGoal` (packages/nexus-agents/src/mcp/tools/run-tool.ts) feed
 * every live `run` dispatch outcome into the MetaOrchestrator shadow selector
 * and persist a sanitized record to `learning/meta-outcomes.jsonl` (#3593).
 * Nothing ever TRIGGERS it, though — training only fires on a live `run
 * {execute:true}` call, and no CI/cron/CLI ever makes one. This module is the
 * TESTABLE half of the trigger: given an already-fetched list of backlog
 * issues, deterministically select a bounded set and format each into a goal
 * string. It contains ZERO I/O — the `gh issue list` shelling-out and the live
 * `executeGoal` calls live in the thin edge script (meta-shadow-soak.ts), like
 * the curate-pr-review-harvest.ts / mine-pr-review-candidates-core.ts split
 * (#3847).
 *
 * Sourcing REAL backlog goals (not synthetic) is a ratified decision for
 * #4310: synthetic goals would exercise the router on distributions that
 * don't resemble what `run` actually sees in production, undermining the
 * shadow-agreement evidence the #3552 flip decision depends on.
 *
 * @module scripts/meta-shadow-soak-core
 * (Source: Issue #4310, feeder for #3552)
 */

/** Default number of backlog goals one soak run drives through `executeGoal`. */
export const DEFAULT_SOAK_GOAL_COUNT = 12;

/** Cap on the formatted goal-body paragraph so a runaway issue body can't blow up prompt size. */
const MAX_PARAGRAPH_CHARS = 500;

/**
 * The minimal shape of a `gh issue list --json number,title,body` entry this
 * module consumes. Deliberately narrow — the gh-fetch edge may return more
 * fields, but only these three are objective, real backlog signal.
 */
export interface BacklogIssue {
  readonly number: number;
  readonly title: string;
  readonly body: string;
}

/** One selected + formatted soak goal, ready to hand to `executeGoal`. */
export interface SoakGoal {
  /** Source issue number — provenance, and the dedup key. */
  readonly issueNumber: number;
  /** Source issue title, unformatted. */
  readonly title: string;
  /** The natural-language goal string passed to `executeGoal({ goal })`. */
  readonly goal: string;
}

/**
 * Extracts the first non-empty paragraph from a (markdown) issue body, with
 * internal whitespace/newlines collapsed to single spaces and a length cap
 * (truncated with an ellipsis) so one oversized issue body can't dominate the
 * goal string. Empty/whitespace-only input returns `''`.
 */
export function extractFirstParagraph(body: string): string {
  const normalized = body.replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) return '';
  const firstBlock = normalized.split(/\n\s*\n/)[0] ?? '';
  const collapsed = firstBlock.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= MAX_PARAGRAPH_CHARS) return collapsed;
  return `${collapsed.slice(0, MAX_PARAGRAPH_CHARS).trimEnd()}…`;
}

/**
 * Formats one backlog issue into a natural-language goal string: `#<number>:
 * <title>` plus the first body paragraph (when present) on a blank line
 * after, mirroring how a human would paste an issue into `run`.
 */
export function formatGoal(issue: BacklogIssue): string {
  const title = issue.title.trim();
  const header = `#${String(issue.number)}: ${title}`;
  const paragraph = extractFirstParagraph(issue.body);
  return paragraph.length > 0 ? `${header}\n\n${paragraph}` : header;
}

/**
 * Deterministically selects up to `limit` backlog issues and formats each
 * into a {@link SoakGoal}. Deterministic in two ways, so the same input list
 * always yields the same output regardless of the order `gh` happened to
 * return it in:
 *   1. Dedupes by issue number (first occurrence wins).
 *   2. Stable-sorts most-recent-first by issue number descending — issue
 *      numbers are monotonically assigned, so this is a reproducible proxy
 *      for "most recently filed" without depending on wall-clock `Date.now()`
 *      or a `createdAt` timestamp the caller may not have fetched.
 *
 * `limit <= 0` returns an empty array.
 */
export function selectSoakGoals(
  issues: readonly BacklogIssue[],
  limit: number = DEFAULT_SOAK_GOAL_COUNT
): SoakGoal[] {
  const seen = new Set<number>();
  const deduped: BacklogIssue[] = [];
  for (const issue of issues) {
    if (seen.has(issue.number)) continue;
    seen.add(issue.number);
    deduped.push(issue);
  }
  const sorted = [...deduped].sort((a, b) => b.number - a.number);
  return sorted.slice(0, Math.max(0, limit)).map((issue): SoakGoal => ({
    issueNumber: issue.number,
    title: issue.title,
    goal: formatGoal(issue),
  }));
}
