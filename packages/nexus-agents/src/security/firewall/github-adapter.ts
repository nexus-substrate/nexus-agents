/**
 * nexus-agents/security/firewall - GitHub Adapter
 *
 * ISourceAdapter implementation for GitHub issues, PRs, and comments.
 * Extracts normalized metadata from GitHub API payloads.
 *
 * @module security/firewall/github-adapter
 * (Source: Issue #826 — Reusable Hostile Input Firewall)
 */

import { z } from 'zod';

import { mapAuthorAssociation } from '../trust-classifier.js';
import type { ISourceAdapter, SourceMetadata } from './firewall-types.js';

// ============================================================================
// GitHub Input Types
// ============================================================================

/**
 * Discriminated union of GitHub input types the adapter can process.
 */
const GitHubIssueSchema = z.object({
  type: z.literal('issue'),
  username: z.string().min(1),
  authorAssociation: z.string().min(1),
  title: z.string().default(''),
  body: z.string().default(''),
});

const GitHubCommentSchema = z.object({
  type: z.literal('comment'),
  username: z.string().min(1),
  authorAssociation: z.string().min(1),
  body: z.string().default(''),
});

const GitHubPRSchema = z.object({
  type: z.literal('pull_request'),
  username: z.string().min(1),
  authorAssociation: z.string().min(1),
  title: z.string().default(''),
  body: z.string().default(''),
});

export const GitHubInputSchema = z.discriminatedUnion('type', [
  GitHubIssueSchema,
  GitHubCommentSchema,
  GitHubPRSchema,
]);
export type GitHubInput = z.infer<typeof GitHubInputSchema>;

// ============================================================================
// GitHub Adapter
// ============================================================================

/** Maps input type to source type string. */
function toSourceType(type: GitHubInput['type']): string {
  const mapping: Record<GitHubInput['type'], string> = {
    issue: 'github-issue',
    comment: 'github-comment',
    pull_request: 'github-pr',
  };
  return mapping[type];
}

/** Extracts content from a GitHub input. */
function extractContent(input: GitHubInput): string {
  if (input.type === 'comment') return input.body;
  const title = input.title;
  const body = input.body;
  return title && body ? `${title}\n\n${body}` : title || body;
}

/**
 * Creates a GitHub source adapter.
 * Validates input with Zod and maps GitHub API fields to SourceMetadata.
 */
export function createGitHubAdapter(): ISourceAdapter {
  return {
    platform: 'github',
    extractMetadata(input: unknown): SourceMetadata {
      const parsed = GitHubInputSchema.parse(input);
      const role = mapAuthorAssociation(parsed.authorAssociation);
      return {
        username: parsed.username,
        authorAssociation: role,
        content: extractContent(parsed),
        sourceType: toSourceType(parsed.type),
      };
    },
  };
}
