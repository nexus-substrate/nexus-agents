/**
 * REFINE Phase Tests - Helper Functions
 *
 * Tests for findPersonaRole, buildRefinementTask, and extraction helpers.
 *
 * @module workflows/self-development/phases/refine.test
 */

import { describe, it, expect } from 'vitest';
import { findPersonaRole, buildRefinementTask } from './refine.js';
import type { PlanOutput, ImplementationPlan } from '../types.js';
import type {
  TrinityResult,
  WorkerOutput,
  VerifierOutput,
  ThinkerOutput,
} from '../../../agents/collaboration/trinity-types.js';

// Re-implement internal functions for testing (they are not exported)
function extractIssuesFromContribution(contribution: string): string[] {
  const issues: string[] = [];
  const lines = contribution.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('issue') || lower.includes('problem') || lower.includes('concern')) {
      const cleaned = line.replace(/^[-*#\d.]+\s*/, '').trim();
      if (cleaned.length > 10) issues.push(cleaned);
    }
  }
  return issues.slice(0, 5);
}

function extractSuggestionsFromContribution(contribution: string): string[] {
  const suggestions: string[] = [];
  const lines = contribution.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('suggest') || lower.includes('recommend') || lower.includes('should')) {
      const cleaned = line.replace(/^[-*#\d.]+\s*/, '').trim();
      if (cleaned.length > 10) suggestions.push(cleaned);
    }
  }
  return suggestions.slice(0, 5);
}

// Helper to create a mock plan
function createMockPlan(): PlanOutput {
  const plan: ImplementationPlan = {
    problemAnalysis: 'Test problem analysis',
    successCriteria: ['Test passes', 'Coverage > 80%'],
    files: [{ path: 'src/test.ts', action: 'create', description: 'Test file' }],
    interfaces: ['ITestInterface'],
    dependencies: [],
    testPlan: 'Unit and integration tests',
  };

  const thinkerOutput: ThinkerOutput = {
    problemAnalysis: 'Thinking output',
    approach: 'Approach description',
    considerations: ['consideration 1'],
    successCriteria: ['criterion 1'],
  };

  const workerOutput: WorkerOutput = {
    implementation: 'Worker output',
    stepsCompleted: ['step 1'],
    deviations: [],
    questions: [],
  };

  const verifierOutput: VerifierOutput = {
    verdict: 'pass',
    correctnessCheck: 'Correct',
    qualityCheck: 'Good quality',
    issuesFound: [],
    recommendations: [],
  };

  const trinityResult: TrinityResult = {
    success: true,
    thinkerOutput,
    workerOutput,
    verifierOutput,
    finalOutput: 'Final implementation plan output',
    iterations: 1,
    totalDurationMs: 1000,
    history: [],
    stopReason: 'verified',
  };

  return {
    trinityResult,
    plan,
    iterations: 1,
    verified: true,
    durationMs: 1000,
  };
}

describe('refine phase - helper functions', () => {
  describe('findPersonaRole', () => {
    it('returns correct role for architect persona', () => {
      expect(findPersonaRole('architect')).toBe('Software Architect');
    });

    it('returns correct role for security persona', () => {
      expect(findPersonaRole('security')).toBe('Security Engineer');
    });

    it('returns correct role for tester persona', () => {
      expect(findPersonaRole('tester')).toBe('QA Engineer');
    });

    it('returns correct role for devex persona', () => {
      expect(findPersonaRole('devex')).toBe('Developer Experience');
    });

    it('returns correct role for maintainer persona', () => {
      expect(findPersonaRole('maintainer')).toBe('Maintainer');
    });

    it('returns fallback role for unknown persona', () => {
      expect(findPersonaRole('unknown-persona')).toBe('reviewer');
    });

    it('returns fallback role for empty string', () => {
      expect(findPersonaRole('')).toBe('reviewer');
    });
  });

  describe('extractIssuesFromContribution', () => {
    it('extracts lines containing "issue"', () => {
      const contribution = `
        This is a test.
        There is an issue with the implementation here.
        Another line.
      `;
      const issues = extractIssuesFromContribution(contribution);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain('issue');
    });

    it('extracts lines containing "problem"', () => {
      const contribution = `
        The problem is that validation is missing.
        Everything else looks good.
      `;
      const issues = extractIssuesFromContribution(contribution);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain('problem');
    });

    it('extracts lines containing "concern"', () => {
      const contribution = `
        My main concern is with the error handling approach.
        The rest is fine.
      `;
      const issues = extractIssuesFromContribution(contribution);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain('concern');
    });

    it('cleans markdown bullet prefixes at line start', () => {
      const contribution = [
        '- issue needs attention in this area.',
        '* problem found in the code here.',
        '1. concern about the performance now.',
      ].join('\n');
      const issues = extractIssuesFromContribution(contribution);
      expect(issues).toHaveLength(3);
      expect(issues[0]).toBe('issue needs attention in this area.');
      expect(issues[1]).toBe('problem found in the code here.');
      expect(issues[2]).toBe('concern about the performance now.');
    });

    it('filters out short issues (< 10 chars)', () => {
      const contribution = `
        issue x
        The problem is significant enough to warrant attention.
      `;
      const issues = extractIssuesFromContribution(contribution);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain('problem');
    });

    it('limits to 5 issues', () => {
      const contribution = `
        issue number one is important
        problem number two is critical
        concern number three needs review
        issue number four is blocking
        problem number five is high priority
        concern number six would be extra
        issue number seven is overflow
      `;
      const issues = extractIssuesFromContribution(contribution);
      expect(issues).toHaveLength(5);
    });

    it('returns empty array when no issues found', () => {
      const contribution = 'Everything looks great. Nothing to fix here.';
      const issues = extractIssuesFromContribution(contribution);
      expect(issues).toHaveLength(0);
    });

    it('handles empty string', () => {
      expect(extractIssuesFromContribution('')).toHaveLength(0);
    });

    it('is case insensitive', () => {
      const contribution = `
        ISSUE: This is uppercase.
        Problem: This has capitals.
        ConCeRn: Mixed case here.
      `;
      const issues = extractIssuesFromContribution(contribution);
      expect(issues).toHaveLength(3);
    });
  });

  describe('extractSuggestionsFromContribution', () => {
    it('extracts lines containing "suggest"', () => {
      const contribution = `
        I suggest using dependency injection here.
        Other comments.
      `;
      const suggestions = extractSuggestionsFromContribution(contribution);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]).toContain('suggest');
    });

    it('extracts lines containing "recommend"', () => {
      const contribution = `
        I recommend adding error handling here.
        The rest is good.
      `;
      const suggestions = extractSuggestionsFromContribution(contribution);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]).toContain('recommend');
    });

    it('extracts lines containing "should"', () => {
      const contribution = `
        You should add input validation here.
        Everything else works.
      `;
      const suggestions = extractSuggestionsFromContribution(contribution);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]).toContain('should');
    });

    it('cleans markdown bullet prefixes at line start', () => {
      const contribution = [
        '- I suggest refactoring this section here.',
        '* You should add tests for this module.',
        '1. This recommendation is very important.',
      ].join('\n');
      const suggestions = extractSuggestionsFromContribution(contribution);
      expect(suggestions).toHaveLength(3);
      expect(suggestions[0]).toBe('I suggest refactoring this section here.');
      expect(suggestions[1]).toBe('You should add tests for this module.');
      expect(suggestions[2]).toBe('This recommendation is very important.');
    });

    it('filters out short suggestions (< 10 chars)', () => {
      const contribution = `
        should x
        I recommend implementing proper validation checks.
      `;
      const suggestions = extractSuggestionsFromContribution(contribution);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]).toContain('recommend');
    });

    it('limits to 5 suggestions', () => {
      const contribution = `
        suggest adding logging functionality
        recommend using types throughout
        should validate all inputs
        suggest caching results here
        recommend error boundaries now
        should test edge cases too
        suggest improving performance
      `;
      const suggestions = extractSuggestionsFromContribution(contribution);
      expect(suggestions).toHaveLength(5);
    });

    it('returns empty array when no suggestions found', () => {
      const contribution = 'Everything looks fine. No changes needed.';
      expect(extractSuggestionsFromContribution(contribution)).toHaveLength(0);
    });

    it('handles empty string', () => {
      expect(extractSuggestionsFromContribution('')).toHaveLength(0);
    });

    it('is case insensitive', () => {
      const contribution = `
        SUGGEST: This is uppercase suggestion.
        Recommend: This has capital letter.
        SHOULD: Check this one as well.
      `;
      const suggestions = extractSuggestionsFromContribution(contribution);
      expect(suggestions).toHaveLength(3);
    });
  });

  describe('buildRefinementTask', () => {
    it('builds task with correct structure', () => {
      const plan = createMockPlan();
      const task = buildRefinementTask(plan);

      expect(task.id).toMatch(/^refine-\d+$/);
      expect(task.description).toContain('Critique and refine');
      expect(task.description).toContain(plan.trinityResult.finalOutput);
    });

    it('includes plan metadata in context', () => {
      const plan = createMockPlan();
      const task = buildRefinementTask(plan);

      expect(task.context?.metadata).toBeDefined();
      const metadata = task.context?.metadata as {
        plan: ImplementationPlan;
        successCriteria: string[];
      };
      expect(metadata.plan).toBe(plan.plan);
      expect(metadata.successCriteria).toEqual(plan.plan.successCriteria);
    });

    it('sets appropriate constraints', () => {
      const plan = createMockPlan();
      const task = buildRefinementTask(plan);

      expect(task.constraints).toEqual({
        maxTokens: 3000,
        maxDuration: 180000,
      });
    });
  });
});
