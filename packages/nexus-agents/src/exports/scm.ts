// The `@module` tag below is deliberately un-slashed, and the `(Source: …)`
// attribution deliberately sits out here in a line comment rather than inside
// the doc block. Both are load-bearing:
//
//   * This file is a TypeDoc entry point, and `outputFileStrategy: "modules"`
//     derives the output path from the module NAME. `@module exports/scm`
//     would publish this page at `/api/exports/scm` instead of `/api/scm`.
//     A 7-voter panel on #4523 resolved that published doc URLs are a stable
//     interface and must not move, so `scm` is the correct name here.
//   * The tag read `exports/scm` for two years and never took effect, because
//     the `(Source: …)` line used to follow it inside the same doc block and
//     TypeDoc folds trailing prose into a tag's content. The flat page was an
//     accident of that bug. Moving the attribution out here makes the tag
//     effective and the flat output intentional, with no change to the
//     rendered page.
//
// The repo-wide `@module X` + `(Source: #N)` house style is harmless in
// `scripts/`, which TypeDoc never reads. In `src/exports/` it silences the
// tag. `scripts/check-typedoc-layout.ts` pins the resulting layout.
//
// (Source: Issue #1136 — Centralized SCM Provider Module; layout per #4523)
/**
 * SCM (Source Control Management) exports — Centralized SCM provider module.
 * Replaces dual-path GitHub clients with unified IScmProvider interface.
 *
 * @module scm
 */
export {
  // Core types
  type ScmPlatform,
  type TokenStrategy,
  type ScmToken,
  type TokenResolverConfig,
  type ScmIssue,
  type ScmPullRequest,
  type ScmComment,
  type CreatePROptions,
  type MergePROptions,
  type PRStatus as ScmPRStatus, // Renamed for disambiguation across the SCM surface
  type IssueFilters,
  type IScmProvider,
  // Extended entity types (trait support)
  type ScmFileChange,
  type ScmPullRequestDetail,
  type ScmIssueDetail,
  type ScmCommentDetail,
  type ScmReviewDecision,
  type ScmUserMetadata,
  // Trait interfaces (ISP)
  type IScmReviewer,
  type IScmUserInfo,
  // Convenience composite types
  type ReviewCapableProvider,
  type FullCapableProvider,
  // Error class
  ScmError,
} from '../scm/types.js';

// Token resolution
export { resolveToken, hasToken, getTokenEnvVars } from '../scm/token-resolver.js';

// Provider implementations
export { GitHubProvider } from '../scm/github-provider.js';

// Trait implementations
export {
  GitHubReviewer,
  GitHubUserInfo,
  createFullGitHubProvider,
} from '../scm/github-provider-traits.js';

// Factory
export {
  createScmProvider,
  createGitHubProvider,
  type CreateScmProviderConfig,
} from '../scm/factory.js';
