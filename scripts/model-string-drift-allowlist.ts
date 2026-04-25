/**
 * Allowlist for the model-string drift fitness-guard (#2199 Child 2).
 *
 * Each entry grandfathers an existing hardcoded model-version string that
 * lives outside `packages/nexus-agents/src/config/`. Migration of these
 * sites is tracked in companion epic #2200 — every entry here MUST cite a
 * tracking-issue number so the allowlist can shrink as that epic lands.
 *
 * Adding a new entry without a real tracking issue is the failure mode this
 * file is designed to prevent. Reviewers: reject PRs that add entries
 * without a `trackingIssue` referencing an open ticket.
 *
 * @module scripts/model-string-drift-allowlist
 */

/** Structured allowlist entry — see file header. */
export interface AllowlistEntry {
  /** Repo-relative file path (POSIX separators) the entry applies to. */
  readonly file: string;
  /**
   * Optional literal. When omitted the entry applies to ALL violating
   * literals in that file. Prefer specifying when feasible — broad
   * file-level entries should be temporary.
   */
  readonly literal?: string;
  /** Why this site is grandfathered. */
  readonly reason: string;
  /** GitHub issue tracking the migration of this site. */
  readonly trackingIssue: number;
}

/**
 * Day-1 allowlist captured during research for #2199. Sourced from the
 * Category-A audit in the epic body. Each file-level entry covers all the
 * legacy version strings discovered there; tightening to per-literal
 * entries happens as the migration epic #2200 lands children.
 */
export const ALLOWLIST: readonly AllowlistEntry[] = [
  {
    file: 'packages/nexus-agents/src/adapters/gemini-types.ts',
    reason:
      'Runtime model id constants + alias map for Gemini. Migrate to ModelCapability.aliases via #2200 Child 2.',
    trackingIssue: 2200,
  },
  {
    file: 'packages/nexus-agents/src/adapters/openai-types.ts',
    reason:
      'Runtime model id constants + alias map for OpenAI / GPT. Migrate to ModelCapability.aliases via #2200 Child 3.',
    trackingIssue: 2200,
  },
  {
    file: 'packages/nexus-agents/src/cli-adapters/adapters/codex-adapter-helpers.ts',
    reason:
      'Codex/o3/o4 fallback display + cost data. Models not yet canonical; collapse into registry once o3/o4 land.',
    trackingIssue: 2200,
  },
  {
    file: 'packages/nexus-agents/src/cli/setup-custom-api.ts',
    reason:
      'Default `gpt-4o` for custom API fallback. Migrate to a config constant via #2200 Child 4.',
    trackingIssue: 2200,
  },
  {
    file: 'packages/nexus-agents/src/adapters/auto-adapter.ts',
    literal: 'gpt-4o',
    reason:
      'Fallback when NEXUS_CUSTOM_MODEL env var is unset. Same migration target as setup-custom-api.ts — #2200 Child 4.',
    trackingIssue: 2200,
  },
  {
    file: 'packages/nexus-agents/src/context/token-counter-types.ts',
    reason:
      'tiktoken model map (external library mapping). May legitimately stay; review in #2200 Child 4.',
    trackingIssue: 2200,
  },
];

/**
 * Pure predicate — is this `(file, literal)` pair grandfathered?
 *
 * @param fileRel Repo-relative POSIX path (e.g. `packages/nexus-agents/src/...`)
 * @param literal The string literal that tripped the rule
 * @param allowlist Allowlist to check (defaults to {@link ALLOWLIST})
 */
export function isAllowed(
  fileRel: string,
  literal: string,
  allowlist: readonly AllowlistEntry[] = ALLOWLIST
): boolean {
  const normalized = fileRel.replace(/\\/g, '/');
  for (const entry of allowlist) {
    if (entry.file !== normalized) continue;
    if (entry.literal === undefined) return true;
    if (entry.literal === literal) return true;
  }
  return false;
}
