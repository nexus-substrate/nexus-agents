/**
 * Auto-remediation branch convention (#3540 inc.2d / #3614).
 *
 * Condition 3 of the auto-invoke gate. When the enforce path (#3618) opens a
 * remediation PR, its branch must be recognizable so CI can run it SECRET-LESS —
 * a bot-authored branch triggering secret-bearing workflows would re-introduce
 * the third Rule-of-Two leg (secrets) through CI (#3613 covers the in-process
 * legs; this covers the CI leg).
 *
 * This module is the single source of truth for the bot branch prefixes CI
 * runs secret-less: {@link AUTO_REMEDIATION_BRANCH_PREFIX} (the enforce path,
 * #3618, names branches via {@link autoRemediationBranchName}) and
 * {@link CODEPR_BRANCH_PREFIX} (the code-PR push seam). CI workflows gate
 * secret-bearing jobs on EVERY prefix with the same literals (see
 * `.github/workflows/*.yml` — kept in sync by the test beside this module,
 * since GitHub Actions `if:` expressions can't import TypeScript).
 *
 * @module mcp/tools/auto-remediation-branch
 */

/** Canonical prefix for branches the auto-remediation enforce path creates. */
export const AUTO_REMEDIATION_BRANCH_PREFIX = 'auto-remediation/';

/**
 * Canonical prefix for branches the code-PR push seam creates
 * (`nexus-codepr/<runId>`). Also a bot branch: CI withholds secrets from it
 * exactly as from {@link AUTO_REMEDIATION_BRANCH_PREFIX}.
 */
export const CODEPR_BRANCH_PREFIX = 'nexus-codepr/' as const;

/** True if `ref` is an auto-remediation branch (accepts bare names or refs/heads/…). */
export function isAutoRemediationBranch(ref: string): boolean {
  const name = ref.replace(/^refs\/heads\//, '');
  return name.startsWith(AUTO_REMEDIATION_BRANCH_PREFIX);
}

/**
 * Build the remediation branch name for a source signal. Sanitizes the signalKey
 * to a git-ref-safe slug (the signalKey is internally generated, but we keep the
 * ref strictly `[a-z0-9._-]` so it can never produce option-injection or path
 * traversal in a branch name).
 */
export function autoRemediationBranchName(signalKey: string): string {
  const slug = signalKey
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  return `${AUTO_REMEDIATION_BRANCH_PREFIX}${slug || 'signal'}`;
}
