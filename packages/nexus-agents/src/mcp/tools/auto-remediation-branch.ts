/**
 * Auto-remediation branch convention (#3540 inc.2d / #3614).
 *
 * Condition 3 of the auto-invoke gate. When the enforce path (#3618) opens a
 * remediation PR, its branch must be recognizable so CI can run it SECRET-LESS —
 * a bot-authored branch triggering secret-bearing workflows would re-introduce
 * the third Rule-of-Two leg (secrets) through CI (#3613 covers the in-process
 * legs; this covers the CI leg).
 *
 * This module is the single source of truth for the branch prefix. The enforce
 * path (#3618) names branches via {@link autoRemediationBranchName}; CI workflows
 * gate secret-bearing jobs with the SAME literal prefix (see
 * `.github/workflows/*.yml` — kept in sync with `AUTO_REMEDIATION_BRANCH_PREFIX`,
 * since GitHub Actions `if:` expressions can't import TypeScript).
 *
 * @module mcp/tools/auto-remediation-branch
 */

/** Canonical prefix for branches the auto-remediation enforce path creates. */
export const AUTO_REMEDIATION_BRANCH_PREFIX = 'auto-remediation/';

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
