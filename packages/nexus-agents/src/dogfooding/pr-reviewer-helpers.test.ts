/**
 * nexus-agents/dogfooding - PR Reviewer Helpers Tests
 *
 * Unit tests for PR review helper functions.
 *
 * @module dogfooding/pr-reviewer-helpers.test
 */

import { describe, it, expect, vi } from 'vitest';
import {
  parseSeverity,
  parseCategory,
  extractSummary,
  extractStringField,
  parseFindings,
  determineApproval,
  determineDecision,
  calculateConsensus,
  countBySeverity,
  countByCategory,
  sumFindings,
  generateSummary,
  formatReviewComment,
  createFailedReview,
} from './pr-reviewer-helpers.js';
import type {
  PRMetadata,
  PRReviewResult,
  ExpertReviewResult,
  ReviewFinding,
  ReviewSeverity,
} from './pr-review-types.js';

// Mock randomUUID for predictable test results
vi.mock('node:crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-1234'),
}));

describe('Parsing Helpers', () => {
  describe('parseSeverity', () => {
    it('should parse valid severities', () => {
      expect(parseSeverity('critical')).toBe('critical');
      expect(parseSeverity('high')).toBe('high');
      expect(parseSeverity('medium')).toBe('medium');
      expect(parseSeverity('low')).toBe('low');
      expect(parseSeverity('info')).toBe('info');
    });

    it('should be case-insensitive', () => {
      expect(parseSeverity('CRITICAL')).toBe('critical');
      expect(parseSeverity('High')).toBe('high');
      expect(parseSeverity('MEDIUM')).toBe('medium');
    });

    it('should default to medium for invalid values', () => {
      expect(parseSeverity('invalid')).toBe('medium');
      expect(parseSeverity('')).toBe('medium');
      expect(parseSeverity(null)).toBe('medium');
      expect(parseSeverity(undefined)).toBe('medium');
      expect(parseSeverity(123)).toBe('medium');
      expect(parseSeverity({})).toBe('medium');
    });
  });

  describe('parseCategory', () => {
    it('should parse valid categories', () => {
      expect(parseCategory('security')).toBe('security');
      expect(parseCategory('performance')).toBe('performance');
      expect(parseCategory('code_quality')).toBe('code_quality');
      expect(parseCategory('testing')).toBe('testing');
      expect(parseCategory('documentation')).toBe('documentation');
      expect(parseCategory('architecture')).toBe('architecture');
    });

    it('should be case-insensitive', () => {
      expect(parseCategory('SECURITY')).toBe('security');
      expect(parseCategory('Performance')).toBe('performance');
    });

    it('should default to code_quality for invalid values', () => {
      expect(parseCategory('invalid')).toBe('code_quality');
      expect(parseCategory('')).toBe('code_quality');
      expect(parseCategory(null)).toBe('code_quality');
      expect(parseCategory(undefined)).toBe('code_quality');
      expect(parseCategory(42)).toBe('code_quality');
    });
  });

  describe('extractSummary', () => {
    it('should extract from summary field', () => {
      expect(extractSummary({ summary: 'Review summary' })).toBe('Review summary');
    });

    it('should fall back to content field', () => {
      expect(extractSummary({ content: 'Content summary' })).toBe('Content summary');
    });

    it('should fall back to message field', () => {
      expect(extractSummary({ message: 'Message summary' })).toBe('Message summary');
    });

    it('should prefer summary over content over message', () => {
      expect(extractSummary({ summary: 'Summary', content: 'Content', message: 'Message' })).toBe(
        'Summary'
      );
      expect(extractSummary({ content: 'Content', message: 'Message' })).toBe('Content');
    });

    it('should return default when no valid field exists', () => {
      expect(extractSummary({})).toBe('Review completed');
      expect(extractSummary({ other: 'value' })).toBe('Review completed');
    });

    it('should handle non-string values', () => {
      expect(extractSummary({ summary: 123 })).toBe('Review completed');
      expect(extractSummary({ summary: null })).toBe('Review completed');
      expect(extractSummary({ summary: {} })).toBe('Review completed');
    });
  });

  describe('extractStringField', () => {
    it('should extract first matching string field', () => {
      const record = { title: 'Title', name: 'Name', other: 123 };

      expect(extractStringField(record, 'title', 'name')).toBe('Title');
      expect(extractStringField(record, 'name', 'title')).toBe('Name');
      expect(extractStringField(record, 'missing', 'title')).toBe('Title');
    });

    it('should return undefined when no string field found', () => {
      const record = { num: 123, obj: {} };

      expect(extractStringField(record, 'title', 'name')).toBeUndefined();
      expect(extractStringField(record, 'num')).toBeUndefined();
    });

    it('should handle empty key list', () => {
      expect(extractStringField({ title: 'Test' })).toBeUndefined();
    });
  });
});

describe('Finding Parsing', () => {
  describe('parseFindings', () => {
    it('should parse findings from findings array', () => {
      const output = {
        findings: [
          {
            title: 'SQL Injection',
            description: 'User input not sanitized',
            severity: 'critical',
            category: 'security',
            file: 'db.ts',
            line: 42,
          },
        ],
      };

      const findings = parseFindings(output, 'security-expert', 'info');

      expect(findings).toHaveLength(1);
      expect(findings[0]?.title).toBe('SQL Injection');
      expect(findings[0]?.severity).toBe('critical');
      expect(findings[0]?.category).toBe('security');
      expect(findings[0]?.file).toBe('db.ts');
      expect(findings[0]?.line).toBe(42);
      expect(findings[0]?.expertId).toBe('security-expert');
    });

    it('should parse findings from vulnerabilities array', () => {
      const output = {
        vulnerabilities: [
          {
            title: 'XSS Vulnerability',
            description: 'Unescaped output',
            severity: 'high',
            category: 'security',
          },
        ],
      };

      const findings = parseFindings(output, 'expert', 'info');

      expect(findings).toHaveLength(1);
      expect(findings[0]?.title).toBe('XSS Vulnerability');
    });

    it('should parse findings from issues array', () => {
      const output = {
        issues: [
          {
            name: 'Missing Tests',
            message: 'No unit tests for module',
            severity: 'medium',
            category: 'testing',
          },
        ],
      };

      const findings = parseFindings(output, 'expert', 'info');

      expect(findings).toHaveLength(1);
      expect(findings[0]?.title).toBe('Missing Tests');
      expect(findings[0]?.description).toBe('No unit tests for module');
    });

    it('should filter by minimum severity', () => {
      const output = {
        findings: [
          { title: 'Critical', severity: 'critical', description: 'A' },
          { title: 'High', severity: 'high', description: 'B' },
          { title: 'Medium', severity: 'medium', description: 'C' },
          { title: 'Low', severity: 'low', description: 'D' },
          { title: 'Info', severity: 'info', description: 'E' },
        ],
      };

      expect(parseFindings(output, 'expert', 'critical')).toHaveLength(1);
      expect(parseFindings(output, 'expert', 'high')).toHaveLength(2);
      expect(parseFindings(output, 'expert', 'medium')).toHaveLength(3);
      expect(parseFindings(output, 'expert', 'low')).toHaveLength(4);
      expect(parseFindings(output, 'expert', 'info')).toHaveLength(5);
    });

    it('should skip invalid items', () => {
      const output = {
        findings: [
          null,
          undefined,
          'string',
          123,
          { title: 'Valid', description: 'Desc', severity: 'high' },
        ],
      };

      const findings = parseFindings(output, 'expert', 'info');

      expect(findings).toHaveLength(1);
      expect(findings[0]?.title).toBe('Valid');
    });

    it('should use default values for missing fields', () => {
      const output = {
        findings: [
          { severity: 'high' }, // Missing title and description
        ],
      };

      const findings = parseFindings(output, 'expert', 'info');

      expect(findings).toHaveLength(1);
      expect(findings[0]?.title).toBe('Finding');
      expect(findings[0]?.description).toBe('');
    });

    it('should include suggestion and confidence if present', () => {
      const output = {
        findings: [
          {
            title: 'Issue',
            description: 'Desc',
            severity: 'medium',
            suggestion: 'Fix it this way',
            confidence: 0.95,
          },
        ],
      };

      const findings = parseFindings(output, 'expert', 'info');

      expect(findings[0]?.suggestion).toBe('Fix it this way');
      expect(findings[0]?.confidence).toBe(0.95);
    });

    it('should use default confidence when not provided', () => {
      const output = {
        findings: [{ title: 'Issue', description: 'Desc', severity: 'low' }],
      };

      const findings = parseFindings(output, 'expert', 'info');

      expect(findings[0]?.confidence).toBe(0.7);
    });

    it('should handle empty findings arrays', () => {
      expect(parseFindings({ findings: [] }, 'expert', 'info')).toEqual([]);
      expect(parseFindings({}, 'expert', 'info')).toEqual([]);
    });

    it('should handle non-array sources', () => {
      const output = {
        findings: 'not an array',
        issues: null,
      };

      expect(parseFindings(output, 'expert', 'info')).toEqual([]);
    });
  });
});

describe('Decision Helpers', () => {
  describe('determineApproval', () => {
    it('should approve when no blocking findings', () => {
      const findings: ReviewFinding[] = [
        createMockFinding({ severity: 'medium' }),
        createMockFinding({ severity: 'low' }),
        createMockFinding({ severity: 'info' }),
      ];

      expect(determineApproval(findings)).toBe(true);
    });

    it('should not approve when critical findings exist', () => {
      const findings: ReviewFinding[] = [
        createMockFinding({ severity: 'critical' }),
        createMockFinding({ severity: 'low' }),
      ];

      expect(determineApproval(findings)).toBe(false);
    });

    it('should not approve when high findings exist', () => {
      const findings: ReviewFinding[] = [createMockFinding({ severity: 'high' })];

      expect(determineApproval(findings)).toBe(false);
    });

    it('should approve with empty findings', () => {
      expect(determineApproval([])).toBe(true);
    });
  });

  describe('determineDecision', () => {
    it('should request changes on critical findings', () => {
      const findings: ReviewFinding[] = [createMockFinding({ severity: 'critical' })];
      const reviews: ExpertReviewResult[] = [createMockExpertReview({ approved: false })];

      expect(determineDecision(reviews, findings)).toBe('request_changes');
    });

    it('should request changes on high findings when not all approved', () => {
      const findings: ReviewFinding[] = [createMockFinding({ severity: 'high' })];
      const reviews: ExpertReviewResult[] = [
        createMockExpertReview({ approved: true }),
        createMockExpertReview({ approved: false }),
      ];

      expect(determineDecision(reviews, findings)).toBe('request_changes');
    });

    it('should comment when high findings exist but all approved', () => {
      const findings: ReviewFinding[] = [createMockFinding({ severity: 'high' })];
      const reviews: ExpertReviewResult[] = [
        createMockExpertReview({ approved: true }),
        createMockExpertReview({ approved: true }),
      ];

      // High findings with all approved results in comment (not request_changes)
      // because the logic is: high && !allApproved => request_changes
      expect(determineDecision(reviews, findings)).toBe('comment');
    });

    it('should comment when medium/low findings exist', () => {
      const findings: ReviewFinding[] = [createMockFinding({ severity: 'medium' })];
      const reviews: ExpertReviewResult[] = [createMockExpertReview({ approved: true })];

      expect(determineDecision(reviews, findings)).toBe('comment');
    });

    it('should approve when no findings', () => {
      const reviews: ExpertReviewResult[] = [
        createMockExpertReview({ approved: true }),
        createMockExpertReview({ approved: true }),
      ];

      expect(determineDecision(reviews, [])).toBe('approve');
    });
  });

  describe('calculateConsensus', () => {
    it('should return 1 for empty reviews', () => {
      expect(calculateConsensus([])).toBe(1);
    });

    it('should return 1 for all approved', () => {
      const reviews: ExpertReviewResult[] = [
        createMockExpertReview({ approved: true }),
        createMockExpertReview({ approved: true }),
        createMockExpertReview({ approved: true }),
      ];

      expect(calculateConsensus(reviews)).toBe(1);
    });

    it('should return 0 for all rejected', () => {
      const reviews: ExpertReviewResult[] = [
        createMockExpertReview({ approved: false }),
        createMockExpertReview({ approved: false }),
      ];

      expect(calculateConsensus(reviews)).toBe(0);
    });

    it('should return correct ratio for mixed reviews', () => {
      const reviews: ExpertReviewResult[] = [
        createMockExpertReview({ approved: true }),
        createMockExpertReview({ approved: true }),
        createMockExpertReview({ approved: false }),
        createMockExpertReview({ approved: false }),
      ];

      expect(calculateConsensus(reviews)).toBe(0.5);
    });

    it('should handle single review', () => {
      expect(calculateConsensus([createMockExpertReview({ approved: true })])).toBe(1);
      expect(calculateConsensus([createMockExpertReview({ approved: false })])).toBe(0);
    });
  });
});

describe('Counting Helpers', () => {
  describe('countBySeverity', () => {
    it('should count findings by severity', () => {
      const findings: ReviewFinding[] = [
        createMockFinding({ severity: 'critical' }),
        createMockFinding({ severity: 'critical' }),
        createMockFinding({ severity: 'high' }),
        createMockFinding({ severity: 'medium' }),
        createMockFinding({ severity: 'medium' }),
        createMockFinding({ severity: 'medium' }),
        createMockFinding({ severity: 'low' }),
        createMockFinding({ severity: 'info' }),
      ];

      const counts = countBySeverity(findings);

      expect(counts.critical).toBe(2);
      expect(counts.high).toBe(1);
      expect(counts.medium).toBe(3);
      expect(counts.low).toBe(1);
      expect(counts.info).toBe(1);
    });

    it('should return zeros for empty findings', () => {
      const counts = countBySeverity([]);

      expect(counts.critical).toBe(0);
      expect(counts.high).toBe(0);
      expect(counts.medium).toBe(0);
      expect(counts.low).toBe(0);
      expect(counts.info).toBe(0);
    });
  });

  describe('countByCategory', () => {
    it('should count findings by category', () => {
      const findings: ReviewFinding[] = [
        createMockFinding({ category: 'security' }),
        createMockFinding({ category: 'security' }),
        createMockFinding({ category: 'performance' }),
        createMockFinding({ category: 'code_quality' }),
        createMockFinding({ category: 'testing' }),
        createMockFinding({ category: 'documentation' }),
        createMockFinding({ category: 'architecture' }),
      ];

      const counts = countByCategory(findings);

      expect(counts.security).toBe(2);
      expect(counts.performance).toBe(1);
      expect(counts.code_quality).toBe(1);
      expect(counts.testing).toBe(1);
      expect(counts.documentation).toBe(1);
      expect(counts.architecture).toBe(1);
    });

    it('should return zeros for empty findings', () => {
      const counts = countByCategory([]);

      expect(counts.security).toBe(0);
      expect(counts.performance).toBe(0);
      expect(counts.code_quality).toBe(0);
    });
  });

  describe('sumFindings', () => {
    it('should sum all severity counts', () => {
      const counts: Record<ReviewSeverity, number> = {
        critical: 1,
        high: 2,
        medium: 3,
        low: 4,
        info: 5,
      };

      expect(sumFindings(counts)).toBe(15);
    });

    it('should return 0 for all zeros', () => {
      const counts: Record<ReviewSeverity, number> = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        info: 0,
      };

      expect(sumFindings(counts)).toBe(0);
    });
  });
});

describe('Summary Generation', () => {
  describe('generateSummary', () => {
    it('should generate formatted summary', () => {
      const pr = createMockPRMetadata({ number: 123, title: 'Add feature' });
      const reviews: ExpertReviewResult[] = [
        createMockExpertReview({ expertType: 'security', summary: 'Looks secure' }),
        createMockExpertReview({ expertType: 'code_quality', summary: 'Clean code' }),
      ];

      const summary = generateSummary(pr, reviews, 'approve');

      expect(summary).toContain('PR #123');
      expect(summary).toContain('Add feature');
      expect(summary).toContain('approve');
      expect(summary).toContain('Security');
      expect(summary).toContain('Looks secure');
      expect(summary).toContain('Code Quality');
      expect(summary).toContain('Clean code');
    });

    it('should handle empty reviews', () => {
      const pr = createMockPRMetadata();

      const summary = generateSummary(pr, [], 'comment');

      expect(summary).toContain('PR #');
      expect(summary).toContain('comment');
      expect(summary).toContain('Experts consulted:** 0');
    });
  });
});

describe('GitHub Comment Formatting', () => {
  describe('formatReviewComment', () => {
    it('should format approval result', () => {
      const result = createMockPRReviewResult({
        decision: 'approve',
        summary: 'All looks good!',
      });

      const comment = formatReviewComment(result);

      expect(comment).toContain(':white_check_mark:');
      expect(comment).toContain('APPROVE');
      expect(comment).toContain('All looks good!');
      expect(comment).toContain('nexus-agents');
    });

    it('should format request_changes result', () => {
      const result = createMockPRReviewResult({
        decision: 'request_changes',
        summary: 'Issues found',
      });

      const comment = formatReviewComment(result);

      expect(comment).toContain(':x:');
      expect(comment).toContain('REQUEST CHANGES');
    });

    it('should format comment result', () => {
      const result = createMockPRReviewResult({ decision: 'comment' });

      const comment = formatReviewComment(result);

      expect(comment).toContain(':speech_balloon:');
      expect(comment).toContain('COMMENT');
    });

    it('should include findings section when findings exist', () => {
      const result = createMockPRReviewResult({
        expertReviews: [
          createMockExpertReview({
            findings: [
              createMockFinding({
                title: 'SQL Injection',
                description: 'User input not sanitized',
                severity: 'critical',
                file: 'db.ts',
                line: 42,
                suggestion: 'Use parameterized queries',
              }),
            ],
          }),
        ],
      });

      const comment = formatReviewComment(result);

      expect(comment).toContain('### Findings');
      expect(comment).toContain('SQL Injection');
      expect(comment).toContain('User input not sanitized');
      expect(comment).toContain(':rotating_light:'); // critical emoji
      expect(comment).toContain('db.ts:42');
      expect(comment).toContain('Use parameterized queries');
    });

    it('should show "No issues found" when no findings', () => {
      const result = createMockPRReviewResult({
        expertReviews: [createMockExpertReview({ findings: [] })],
      });

      const comment = formatReviewComment(result);

      expect(comment).toContain('No issues found');
    });

    it('should include statistics section', () => {
      const result = createMockPRReviewResult({
        expertCount: 3,
        consensusScore: 0.75,
        totalDurationMs: 1500,
        findingsBySeverity: {
          critical: 1,
          high: 2,
          medium: 0,
          low: 0,
          info: 0,
        },
      });

      const comment = formatReviewComment(result);

      expect(comment).toContain('Review Statistics');
      expect(comment).toContain('Experts: 3');
      expect(comment).toContain('Consensus: 75%');
      expect(comment).toContain('Duration: 1500ms');
      expect(comment).toContain(':rotating_light: 1 critical');
      expect(comment).toContain(':warning: 2 high');
    });

    it('should sort findings by severity (highest first)', () => {
      const result = createMockPRReviewResult({
        expertReviews: [
          createMockExpertReview({
            findings: [
              createMockFinding({ title: 'Low issue', severity: 'low' }),
              createMockFinding({ title: 'Critical issue', severity: 'critical' }),
              createMockFinding({ title: 'Medium issue', severity: 'medium' }),
            ],
          }),
        ],
      });

      const comment = formatReviewComment(result);

      const criticalIndex = comment.indexOf('Critical issue');
      const mediumIndex = comment.indexOf('Medium issue');
      const lowIndex = comment.indexOf('Low issue');

      expect(criticalIndex).toBeLessThan(mediumIndex);
      expect(mediumIndex).toBeLessThan(lowIndex);
    });
  });
});

describe('Failed Review Factory', () => {
  describe('createFailedReview', () => {
    it('should create failed review with default approved=true', () => {
      const review = createFailedReview('security-expert', 'security', 100, 'Timeout');

      expect(review.expertId).toBe('security-expert');
      expect(review.expertType).toBe('security');
      expect(review.approved).toBe(true); // Don't block on failures
      expect(review.summary).toContain('Timeout');
      expect(review.findings).toEqual([]);
      expect(review.durationMs).toBe(100);
      expect(review.confidence).toBe(0);
    });

    it('should include error message in summary', () => {
      const review = createFailedReview('code-expert', 'code_quality', 500, 'Model unavailable');

      expect(review.summary).toBe('Review failed: Model unavailable');
    });
  });
});

// =============================================================================
// Test Helpers
// =============================================================================

function createMockFinding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    id: 'finding-1',
    category: 'code_quality',
    severity: 'medium',
    title: 'Test Finding',
    description: 'Test description',
    expertId: 'test-expert',
    confidence: 0.8,
    ...overrides,
  };
}

function createMockExpertReview(overrides: Partial<ExpertReviewResult> = {}): ExpertReviewResult {
  return {
    expertId: 'test-expert',
    expertType: 'code_quality',
    approved: true,
    summary: 'Test review summary',
    findings: [],
    durationMs: 100,
    confidence: 0.8,
    ...overrides,
  };
}

function createMockPRMetadata(overrides: Partial<PRMetadata> = {}): PRMetadata {
  return {
    number: 1,
    title: 'Test PR',
    body: 'Test body',
    author: 'testuser',
    authorAssociation: 'CONTRIBUTOR',
    base: 'main',
    head: 'feature',
    headSha: 'abc123',
    owner: 'owner',
    repo: 'repo',
    url: 'https://github.com/owner/repo/pull/1',
    draft: false,
    labels: [],
    files: [],
    additions: 10,
    deletions: 5,
    ...overrides,
  };
}

function createMockPRReviewResult(overrides: Partial<PRReviewResult> = {}): PRReviewResult {
  return {
    postOutcome: { status: 'posted' },
    filesReviewed: 7,
    prNumber: 1,
    repository: 'owner/repo',
    decision: 'approve',
    summary: 'Test summary',
    expertReviews: [],
    findingsBySeverity: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    },
    findingsByCategory: {
      security: 0,
      performance: 0,
      code_quality: 0,
      testing: 0,
      documentation: 0,
      architecture: 0,
    },
    totalDurationMs: 1000,
    expertCount: 3,
    consensusScore: 1,
    debateRounds: 1,
    timestamp: '2026-01-24T12:00:00Z',
    trustAssessment: {
      trustTier: '3',
      userRole: 'unknown',
      isAllowlisted: false,
      suspiciousSignals: [],
      isSuspicious: false,
    },
    ...overrides,
  };
}
