/**
 * Allowlist for the model-string drift fitness-guard (#2199 Child 2).
 *
 * Each entry grandfathers an existing hardcoded model-version string that
 * lives outside `packages/nexus-agents/src/config/`. After companion epic
 * #2200 closure (2026-04-25), the four remaining entries are documented
 * **architectural decisions**, not pending technical debt:
 *
 *   - tiktoken library identifiers (token-counter-types.ts) — permanent;
 *     they map to encoding names, not API model versions
 *   - OpenAI direct-API constants (openai-types.ts) — permanent; the
 *     CLI-routing canonical registry doesn't fit OpenAI direct API,
 *     and adding 'openai' to CLI_NAMES would force exhaustive switches
 *   - Gemini 1.5 / 2.0 legacy constants (gemini-types.ts) — pending
 *     a public-API deprecation cycle (breaking change)
 *   - Codex fallback display/cost data (codex-adapter-helpers.ts) —
 *     pending o3/o4 inclusion in the canonical registry
 *
 * **Adding a new entry** requires either: a `trackingIssue` referencing
 * an open ticket (technical debt with a migration plan), OR a clear
 * architectural-decision rationale in the `reason` field (permanent
 * exception). Reviewers: reject PRs that add entries without one of those.
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
 * Post-#2200 allowlist (2026-04-25). Day-1 had 9 entries; epic #2200
 * migrated 5 (Claude CLI adapter, Gemini current models, Claude SDK
 * helpers, setup-custom-api defaults, auto-adapter env-var fallback) and
 * documented 4 as permanent architectural decisions.
 *
 * Reducing this list further requires either:
 *   - Gemini: a deprecation cycle for the public 1.5/2.0 constants
 *   - Codex: o3/o4 added to the canonical model registry upstream
 *   - OpenAI / tiktoken: schema redesign (see file header)
 */
export const ALLOWLIST: readonly AllowlistEntry[] = [
  {
    file: 'packages/nexus-agents/src/adapters/gemini-types.ts',
    reason:
      'Legacy Gemini 1.5 / 2.0 string constants (PRO_1_5, FLASH_1_5, FLASH_2_0). Google deprecated these generations upstream in 2025. Constants persist as a public re-export surface — full removal requires a deprecation cycle. Pending separate epic.',
    trackingIssue: 2200,
  },
  {
    file: 'packages/nexus-agents/src/adapters/openai-types.ts',
    reason:
      'Permanent architectural exception. OpenAI direct-API uses HTTPS, not a CLI binary; the canonical registry CLI_NAMES enum (claude/gemini/codex/opencode) does not include "openai" by design. Adding it would force exhaustive-switch updates across 255 cliName references and misrepresent OpenAI as a CLI. See file header for full rationale (#2200 Child 3).',
    trackingIssue: 2200,
  },
  {
    file: 'packages/nexus-agents/src/cli-adapters/adapters/codex-adapter-helpers.ts',
    reason:
      'Codex / o3 / o4 fallback display + cost data. These models are not yet canonical (registry tracks codex-5.x family). Collapse into registry once Anthropic/OpenAI publishes o3/o4 specs and they land in model-capabilities.ts.',
    trackingIssue: 2200,
  },
  {
    file: 'packages/nexus-agents/src/context/token-counter-types.ts',
    reason:
      'Permanent legitimate exception. These are tiktoken library identifiers (NOT nexus-agents model IDs) — they map to BPE encoding names like "o200k_base", not API model versions. Confirmed legitimate during #2200 Child 4 review.',
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
