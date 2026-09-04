/**
 * nexus-agents/dogfooding - Issue Triage Helpers Tests
 *
 * Unit tests for issue classification, label extraction, and formatting.
 *
 * @module dogfooding/issue-triage-helpers.test
 * (Source: Issue #828)
 */

import { describe, it, expect } from 'vitest';
import {
  categorizeIssue,
  extractLabelsFromBody,
  formatTriageComment,
} from './issue-triage-helpers.js';
import type { IssueTriageResult } from './issue-triage-types.js';

describe('categorizeIssue', () => {
  it('should classify a bug report', () => {
    const [category, confidence] = categorizeIssue(
      'App crashes on startup',
      'I get an error when I open the app. It fails immediately.'
    );
    expect(category).toBe('bug');
    expect(confidence).toBeGreaterThan(0);
  });

  it('should classify a feature request', () => {
    const [category] = categorizeIssue(
      'Feature request: add dark mode',
      'Please implement support for dark theme enhancement'
    );
    expect(category).toBe('feature');
  });

  it('should classify a question', () => {
    const [category] = categorizeIssue(
      'How to configure X?',
      'I need help understanding how to explain the setup'
    );
    expect(category).toBe('question');
  });

  it('should classify a docs issue', () => {
    const [category] = categorizeIssue(
      'Typo in documentation',
      'The readme has a typo in the example guide section'
    );
    expect(category).toBe('documentation');
  });

  it('should classify a security issue', () => {
    const [category] = categorizeIssue(
      'XSS vulnerability found',
      'There is an injection vulnerability in the login form'
    );
    expect(category).toBe('security');
  });

  it('should classify a performance issue', () => {
    const [category] = categorizeIssue(
      'Page loads slowly',
      'The latency is very high, possible memory leak causing timeout'
    );
    expect(category).toBe('performance');
  });

  it('should return low confidence for empty input', () => {
    const [, confidence] = categorizeIssue('', '');
    expect(confidence).toBe(0.1);
  });

  it('should handle mixed signals', () => {
    const [category, confidence] = categorizeIssue(
      'Bug with slow performance',
      'This error causes a timeout'
    );
    expect(['bug', 'performance']).toContain(category);
    expect(confidence).toBeGreaterThan(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  it('should be case-insensitive', () => {
    const [category] = categorizeIssue('BUG REPORT', 'CRASH AND ERROR');
    expect(category).toBe('bug');
  });
});

describe('extractLabelsFromBody', () => {
  it('should extract bug label', () => {
    const labels = extractLabelsFromBody('Bug report', 'Found a bug in the system');
    expect(labels).toContain('bug');
  });

  it('should extract enhancement label from feature request', () => {
    const labels = extractLabelsFromBody('Feature request', 'This is an enhancement proposal');
    expect(labels).toContain('enhancement');
  });

  it('should extract security label', () => {
    const labels = extractLabelsFromBody('Security issue', 'Security vulnerability');
    expect(labels).toContain('security');
  });

  it('should extract multiple labels', () => {
    const labels = extractLabelsFromBody(
      'Bug with performance issue',
      'performance regression in the code'
    );
    expect(labels.length).toBeGreaterThanOrEqual(2);
  });

  it('should return at most 5 labels', () => {
    const labels = extractLabelsFromBody(
      'Bug feature request enhancement documentation security performance',
      'help wanted good first issue breaking change regression'
    );
    expect(labels.length).toBeLessThanOrEqual(5);
  });

  it('should not return duplicates', () => {
    const labels = extractLabelsFromBody('enhancement enhancement', 'enhancement enhancement');
    const unique = new Set(labels);
    expect(labels.length).toBe(unique.size);
  });

  it('should return empty for unmatched content', () => {
    const labels = extractLabelsFromBody('Hello world', 'Just a random issue');
    expect(labels).toEqual([]);
  });
});

describe('formatTriageComment', () => {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  function createResult(overrides: Partial<IssueTriageResult> = {}) {
    const base: IssueTriageResult = {
      issueNumber: 42,
      repository: 'owner/repo',
      proposedActions: [],
      trustAssessment: {
        trustTier: '2',
        userRole: 'collaborator',
        isAllowlisted: false,
        auditSink: 'none',
        suspiciousSignals: [],
        isSuspicious: false,
      },
      category: 'bug',
      categoryConfidence: 0.85,
      totalDurationMs: 150,
      timestamp: '2026-02-07T12:00:00Z',
    };
    return { ...base, ...overrides };
  }

  it('should format a basic triage result', () => {
    const result = createResult();
    const comment = formatTriageComment(result);

    expect(comment).toContain('Bug Report');
    expect(comment).toContain('85% confidence');
    expect(comment).toContain('Trust Tier');
    expect(comment).toContain('150ms');
  });

  it('should include reputation score when present', () => {
    const result = createResult({
      trustAssessment: {
        trustTier: '3',
        userRole: 'unknown',
        isAllowlisted: false,
        auditSink: 'none',
        reputationScore: 35,
        suspiciousSignals: ['new_account'],
        isSuspicious: true,
      },
    });
    const comment = formatTriageComment(result);

    expect(comment).toContain('35/100');
    expect(comment).toContain('Suspicious signals');
    expect(comment).toContain('new_account');
  });

  it('should format proposed actions', () => {
    const result = createResult({
      proposedActions: [
        {
          type: 'ClassifyIssue',
          description: 'Classified as bug report',
          policyApproved: true,
          corroborated: true,
          details: {},
        },
        {
          type: 'ProposeLabels',
          description: 'Suggest labels: bug',
          policyApproved: true,
          corroborated: false,
          details: {},
        },
      ],
    });
    const comment = formatTriageComment(result);

    expect(comment).toContain('Proposed Actions');
    expect(comment).toContain('ClassifyIssue');
    expect(comment).toContain(':white_check_mark:');
    expect(comment).toContain(':yellow_circle:');
  });

  it('should show blocked action status', () => {
    const result = createResult({
      proposedActions: [
        {
          type: 'DraftReply',
          description: 'Blocked by policy',
          policyApproved: false,
          corroborated: false,
          details: {},
        },
      ],
    });
    const comment = formatTriageComment(result);
    expect(comment).toContain(':no_entry:');
  });
});
