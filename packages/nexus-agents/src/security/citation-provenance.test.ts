/**
 * A `repoFile` citation built from the PR's own changed-file list must say
 * whether the path existed before the change (#5796, panel option D).
 *
 * `postReviewToGitHub` cited `pr.files[].filename` — the author's list,
 * including files the PR ADDS — and `hasRepoFileRef` treats any `repoFile`
 * citation as repo evidence. So a PR that adds `docs/policy.md` produced a
 * corroboration record attributing repo provenance to a path invented in that
 * same PR: the mislabel class #4667 fixed for issue bodies, on the PR path.
 *
 * The panel chose to mark the citations rather than tighten the floor, so
 * `satisfied` is unchanged by design and these tests pin BOTH halves — the new
 * marker, and the fact that it does not gate anything. #5796 tracks the floor.
 */
import { describe, it, expect } from 'vitest';

import { validateCorroboration } from './corroboration-validator.js';
import { buildReviewCitations } from '../dogfooding/pr-review-citations.js';
import type { PRFileChange } from '../dogfooding/pr-review-types.js';
import type { AgentAction } from './action-schema.js';

function file(filename: string, status: PRFileChange['status']): PRFileChange {
  return { filename, status, additions: 1, deletions: 0 };
}

function draftReply(sources: ReturnType<typeof buildReviewCitations>): AgentAction {
  return {
    type: 'DraftReply',
    body: 'A review comment long enough to satisfy the schema minimum.',
    requiresApproval: true,
    sources,
  };
}

describe('buildReviewCitations records base-ref provenance', () => {
  it('marks an added file as absent from the base ref', () => {
    const [citation] = buildReviewCitations([file('docs/policy.md', 'added')]);
    expect(citation?.type).toBe('repoFile');
    expect(citation?.type === 'repoFile' && citation.existsOnBaseRef).toBe(false);
  });

  it('marks a modified file as present on the base ref', () => {
    // The pair that makes the assertion above mean something: if every status
    // were marked false, the marker would carry no information.
    const [citation] = buildReviewCitations([file('src/index.ts', 'modified')]);
    expect(citation?.type === 'repoFile' && citation.existsOnBaseRef).toBe(true);
  });

  it.each([
    ['copied', false],
    ['renamed', false],
    ['unknown', false],
    ['removed', true],
    ['changed', true],
    ['unchanged', true],
  ] as const)('classifies status %s as existsOnBaseRef=%s', (status, expected) => {
    // `renamed` names the NEW path, which is not on the base ref; `unknown`
    // means the provider did not say, and fails closed.
    const [citation] = buildReviewCitations([file('f.ts', status)]);
    expect(citation?.type === 'repoFile' && citation.existsOnBaseRef).toBe(expected);
  });

  it('still caps the citation list at the schema maximum', () => {
    const many = Array.from({ length: 30 }, (_, i) => file(`f${String(i)}.ts`, 'modified'));
    expect(buildReviewCitations(many)).toHaveLength(20);
  });
});

describe('the corroboration record names author-supplied evidence', () => {
  it('reports clearedOnlyByUnverifiedSources when every path is added by the PR', () => {
    const sources = buildReviewCitations([file('a.ts', 'added'), file('b.ts', 'added')]);
    const result = validateCorroboration(draftReply(sources));

    expect(result.clearedOnlyByUnverifiedSources).toBe(true);
    // The floor is deliberately unchanged: option D marks the citation, it does
    // not refuse the action. #5796 tracks tightening the bar itself.
    expect(result.satisfied).toBe(true);
  });

  it('does not report it when one cited path exists on the base ref', () => {
    const sources = buildReviewCitations([file('a.ts', 'added'), file('b.ts', 'modified')]);
    const result = validateCorroboration(draftReply(sources));

    expect(result.clearedOnlyByUnverifiedSources).toBe(false);
    expect(result.satisfied).toBe(true);
  });

  it('does not report it when the producer never checked', () => {
    // An unmarked citation is "not checked", not "unverified". Reporting a
    // legacy citation as author-supplied would be the same overstatement in the
    // opposite direction.
    const result = validateCorroboration(draftReply([{ type: 'repoFile', path: 'a.ts' }]));

    expect(result.clearedOnlyByUnverifiedSources).toBe(false);
  });

  it('does not report it for an action with no repoFile citations', () => {
    // The empty case, named: no repo citations means nothing to characterise,
    // not "everything is unverified" — `[].every()` would say true.
    const result = validateCorroboration({
      type: 'SummarizeIssue',
      summary: 'A summary long enough for the schema.',
      sources: [{ type: 'policyDoc', path: '.rules/untrusted-input.md', section: 'Trust tiers' }],
    });

    expect(result.satisfied).toBe(true);
    expect(result.clearedOnlyByUnverifiedSources).toBe(false);
  });
});
