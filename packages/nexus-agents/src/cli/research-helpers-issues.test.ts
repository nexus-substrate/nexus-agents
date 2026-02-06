/**
 * Tests for Research Helpers - Issue Formatting
 *
 * @module cli/research-helpers-issues.test
 */

import { describe, it, expect } from 'vitest';
import { formatResearchIssueBody } from './research-helpers-issues.js';
import type { ResearchFinding, VoteResultSummary } from './research-helpers-issues.js';

// ============================================================================
// Helpers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeFinding(overrides: Partial<ResearchFinding> = {}) {
  return {
    title: 'Test Paper',
    source: 'arXiv',
    url: 'https://arxiv.org/abs/2401.12345',
    description: 'A test paper about agents.',
    relevance: 'high',
    ...overrides,
  } satisfies ResearchFinding;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeVoteResult(overrides: Partial<VoteResultSummary> = {}) {
  return {
    decision: 'approved',
    approvalPercentage: 83,
    strategy: 'supermajority',
    ...overrides,
  } satisfies VoteResultSummary;
}

// ============================================================================
// formatResearchIssueBody
// ============================================================================

describe('formatResearchIssueBody', () => {
  it('includes Research Findings header', () => {
    const body = formatResearchIssueBody([makeFinding()]);
    expect(body).toContain('## Research Findings');
  });

  it('includes finding title as h3', () => {
    const body = formatResearchIssueBody([makeFinding({ title: 'My Paper' })]);
    expect(body).toContain('### My Paper');
  });

  it('includes source, url, relevance', () => {
    const body = formatResearchIssueBody([makeFinding()]);
    expect(body).toContain('**Source:** arXiv');
    expect(body).toContain('**URL:** https://arxiv.org/abs/2401.12345');
    expect(body).toContain('**Relevance:** high');
  });

  it('includes description', () => {
    const body = formatResearchIssueBody([makeFinding({ description: 'Novel approach' })]);
    expect(body).toContain('Novel approach');
  });

  it('includes priority when present', () => {
    const body = formatResearchIssueBody([makeFinding({ priority: 'P1' })]);
    expect(body).toContain('**Priority:** P1');
  });

  it('omits priority when not present', () => {
    const body = formatResearchIssueBody([makeFinding()]);
    expect(body).not.toContain('**Priority:**');
  });

  it('includes multiple findings', () => {
    const findings = [makeFinding({ title: 'First' }), makeFinding({ title: 'Second' })];
    const body = formatResearchIssueBody(findings);
    expect(body).toContain('### First');
    expect(body).toContain('### Second');
  });

  it('includes vote result when provided', () => {
    const body = formatResearchIssueBody([makeFinding()], makeVoteResult());
    expect(body).toContain('## Consensus Vote Result');
    expect(body).toContain('**Decision:** approved');
    expect(body).toContain('**Approval:** 83%');
    expect(body).toContain('**Strategy:** supermajority');
  });

  it('omits vote section when not provided', () => {
    const body = formatResearchIssueBody([makeFinding()]);
    expect(body).not.toContain('## Consensus Vote Result');
  });

  it('includes footer', () => {
    const body = formatResearchIssueBody([makeFinding()]);
    expect(body).toContain('Created by nexus-agents research workflow');
  });

  it('handles empty findings array', () => {
    const body = formatResearchIssueBody([]);
    expect(body).toContain('## Research Findings');
    expect(body).toContain('---');
  });
});
