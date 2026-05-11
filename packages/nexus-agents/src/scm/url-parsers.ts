/**
 * nexus-agents/scm - URL parsers
 *
 * Pure parsers for GitHub PR and issue URLs. Lifted from
 * `dogfooding/github-client.ts` as part of the #2553 consolidation —
 * URL parsing has no transport-layer dependency, so it belongs in the
 * canonical SCM module alongside the rest of the GitHub surface.
 *
 * @module scm/url-parsers
 */

import type { Result } from '../core/index.js';
import { ok, err } from '../core/index.js';

/**
 * Parses a PR URL into owner, repo, and number. Accepts:
 *
 * - `https://github.com/owner/repo/pull/123`
 * - `https://www.github.com/owner/repo/pull/123`
 * - `owner/repo#123`
 * - `owner/repo/pull/123`
 */
export function parsePRUrl(url: string): Result<
  {
    owner: string;
    repo: string;
    prNumber: number;
  },
  Error
> {
  const httpPattern = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;
  const shortPattern = /^([^/]+)\/([^/#]+)(?:#|\/pull\/)(\d+)$/;

  const match = httpPattern.exec(url) ?? shortPattern.exec(url);

  if (match === null) {
    return err(new Error(`Invalid PR URL format: ${url}`));
  }

  const owner = match[1];
  const repo = match[2];
  const numberStr = match[3];

  if (owner === undefined || repo === undefined || numberStr === undefined) {
    return err(new Error(`Invalid PR URL format: ${url}`));
  }

  const prNumber = parseInt(numberStr, 10);

  if (isNaN(prNumber)) {
    return err(new Error(`Invalid PR URL format: ${url}`));
  }

  return ok({ owner, repo, prNumber });
}

/**
 * Parses an issue URL into owner, repo, and number. Accepts:
 *
 * - `https://github.com/owner/repo/issues/123`
 * - `owner/repo#123`
 */
export function parseIssueUrl(url: string): Result<
  {
    owner: string;
    repo: string;
    issueNumber: number;
  },
  Error
> {
  const httpPattern = /github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/;
  const shortPattern = /^([^/]+)\/([^/#]+)#(\d+)$/;

  const match = httpPattern.exec(url) ?? shortPattern.exec(url);

  if (match === null) {
    return err(new Error(`Invalid issue URL format: ${url}`));
  }

  const owner = match[1];
  const repo = match[2];
  const numberStr = match[3];

  if (owner === undefined || repo === undefined || numberStr === undefined) {
    return err(new Error(`Invalid issue URL format: ${url}`));
  }

  const issueNumber = parseInt(numberStr, 10);

  if (isNaN(issueNumber)) {
    return err(new Error(`Invalid issue URL format: ${url}`));
  }

  return ok({ owner, repo, issueNumber });
}
