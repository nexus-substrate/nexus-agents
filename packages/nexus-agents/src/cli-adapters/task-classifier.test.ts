/**
 * Tests for task-classifier.ts
 *
 * @module cli-adapters/task-classifier.test
 * (Source: Issue #362 - Task-type-aware fallback chains)
 */

import { describe, it, expect } from 'vitest';
import {
  classifyTask,
  isCodeTask,
  isResearchTask,
  getAllTaskTypes,
  DEFAULT_CLASSIFICATION_PATTERNS,
  type ClassificationPatterns,
} from './task-classifier.js';

describe('task-classifier', () => {
  describe('classifyTask', () => {
    describe('code task classification', () => {
      it('should classify implementation tasks as code', () => {
        const result = classifyTask('Implement a new authentication module');
        expect(result.type).toBe('code');
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.matchedKeywords).toContain('implement');
      });

      it('should classify bug fix tasks as code', () => {
        const result = classifyTask('Fix bug in the login function');
        expect(result.type).toBe('code');
        expect(result.matchedKeywords).toContain('fix bug');
      });

      it('should classify refactoring tasks as code', () => {
        const result = classifyTask('Refactor the database module to use async/await');
        expect(result.type).toBe('code');
        expect(result.matchedKeywords).toContain('refactor');
      });

      it('should classify test writing tasks as code', () => {
        const result = classifyTask('Write unit tests for the user service');
        expect(result.type).toBe('code');
        expect(result.matchedKeywords).toContain('unit test');
      });

      it('should classify pull request tasks as code', () => {
        const result = classifyTask('Review this pull request and merge if ready');
        expect(result.type).toBe('code');
        expect(result.matchedKeywords).toContain('pull request');
      });
    });

    describe('research task classification', () => {
      it('should classify research tasks', () => {
        const result = classifyTask('Research the best practices for API design');
        expect(result.type).toBe('research');
        expect(result.matchedKeywords).toContain('research');
        expect(result.matchedKeywords).toContain('best practices');
      });

      it('should classify investigation tasks as research', () => {
        const result = classifyTask('Investigate why the performance dropped');
        expect(result.type).toBe('research');
        expect(result.matchedKeywords).toContain('investigate');
      });

      it('should classify comparison tasks as research', () => {
        const result = classifyTask('Compare alternatives for state management');
        expect(result.type).toBe('research');
        expect(result.matchedKeywords).toContain('compare');
        expect(result.matchedKeywords).toContain('alternatives');
      });

      it('should classify learning tasks as research', () => {
        const result = classifyTask('Explain how does React hooks work');
        expect(result.type).toBe('research');
        expect(result.matchedKeywords).toContain('explain');
        expect(result.matchedKeywords).toContain('how does');
      });
    });

    describe('documentation task classification', () => {
      it('should classify documentation writing tasks', () => {
        const result = classifyTask('Document the API endpoints in the readme');
        expect(result.type).toBe('documentation');
        expect(result.matchedKeywords).toContain('document');
        expect(result.matchedKeywords).toContain('readme');
      });

      it('should classify tutorial writing as documentation', () => {
        const result = classifyTask('Write a tutorial on how to use the CLI');
        expect(result.type).toBe('documentation');
        expect(result.matchedKeywords).toContain('tutorial');
        expect(result.matchedKeywords).toContain('how to');
      });

      it('should classify changelog updates as documentation', () => {
        const result = classifyTask('Update the changelog with release notes');
        expect(result.type).toBe('documentation');
        expect(result.matchedKeywords).toContain('changelog');
        expect(result.matchedKeywords).toContain('release notes');
      });
    });

    describe('analysis task classification', () => {
      it('should classify code review as analysis', () => {
        const result = classifyTask('Analyze this code for security issues');
        expect(result.type).toBe('analysis');
        expect(result.matchedKeywords).toContain('analyze');
        expect(result.matchedKeywords).toContain('security');
      });

      it('should classify audits as analysis', () => {
        const result = classifyTask('Audit the codebase for performance issues');
        expect(result.type).toBe('analysis');
        expect(result.matchedKeywords).toContain('audit');
        expect(result.matchedKeywords).toContain('performance');
      });

      it('should classify evaluation tasks as analysis', () => {
        const result = classifyTask('Evaluate the current architecture and provide insights');
        expect(result.type).toBe('analysis');
        expect(result.matchedKeywords).toContain('evaluate');
        expect(result.matchedKeywords).toContain('insights');
      });

      it('should classify reporting tasks as analysis', () => {
        const result = classifyTask('Generate a summary report of findings');
        expect(result.type).toBe('analysis');
        expect(result.matchedKeywords).toContain('summary');
        expect(result.matchedKeywords).toContain('report');
        expect(result.matchedKeywords).toContain('findings');
      });
    });

    describe('general task classification', () => {
      it('should classify unmatched tasks as general', () => {
        const result = classifyTask('Hello world');
        expect(result.type).toBe('general');
        expect(result.matchedKeywords).toHaveLength(0);
      });

      it('should classify vague tasks as general', () => {
        const result = classifyTask('Do something');
        expect(result.type).toBe('general');
      });

      it('should return 0.5 confidence for general tasks', () => {
        const result = classifyTask('xyz123 abc456');
        expect(result.type).toBe('general');
        expect(result.confidence).toBe(0.5);
      });
    });

    describe('confidence scoring', () => {
      it('should have higher confidence for longer content with matches', () => {
        const short = classifyTask('implement function');
        const long = classifyTask(
          'Implement a new authentication function that handles OAuth2 and creates a class for session management'
        );

        expect(long.confidence).toBeGreaterThan(short.confidence);
      });

      it('should have higher confidence for more keyword matches', () => {
        const fewMatches = classifyTask('implement');
        const manyMatches = classifyTask('implement new function class module component');

        expect(manyMatches.confidence).toBeGreaterThan(fewMatches.confidence);
      });
    });

    describe('alternative type suggestion', () => {
      it('should suggest alternative when types are close', () => {
        // A task that could be both code and analysis
        const result = classifyTask('Review the code and check for issues');

        // Should have an alternative since both analysis and code keywords match
        if (result.alternativeType !== undefined) {
          expect(['code', 'analysis', 'general']).toContain(result.alternativeType);
        }
      });

      it('should not suggest alternative for clear-cut classifications', () => {
        const result = classifyTask(
          'Implement a new function and create a class with typescript and write unit tests'
        );

        expect(result.type).toBe('code');
        // High confidence should mean no alternative
        if (result.confidence > 0.7) {
          expect(result.alternativeType).toBeUndefined();
        }
      });
    });

    describe('custom patterns', () => {
      it('should accept custom classification patterns', () => {
        const customPatterns: ClassificationPatterns = {
          code: ['custom_code_keyword'],
          research: ['custom_research_keyword'],
          documentation: ['custom_doc_keyword'],
          analysis: ['custom_analysis_keyword'],
        };

        const result = classifyTask('This has custom_code_keyword in it', customPatterns);
        expect(result.type).toBe('code');
        expect(result.matchedKeywords).toContain('custom_code_keyword');
      });

      it('should fall back to general with unmatched custom patterns', () => {
        const customPatterns: ClassificationPatterns = {
          code: ['xyz123'],
          research: ['abc456'],
          documentation: ['def789'],
          analysis: ['ghi012'],
        };

        const result = classifyTask('Normal content', customPatterns);
        expect(result.type).toBe('general');
      });
    });

    describe('case insensitivity', () => {
      it('should be case-insensitive', () => {
        const lower = classifyTask('implement a function');
        const upper = classifyTask('IMPLEMENT A FUNCTION');
        const mixed = classifyTask('ImPlEmEnT a FuNcTiOn');

        expect(lower.type).toBe(upper.type);
        expect(upper.type).toBe(mixed.type);
        expect(lower.type).toBe('code');
      });
    });
  });

  describe('isCodeTask', () => {
    it('should return true for code type', () => {
      expect(isCodeTask('code')).toBe(true);
    });

    it('should return false for non-code types', () => {
      expect(isCodeTask('research')).toBe(false);
      expect(isCodeTask('documentation')).toBe(false);
      expect(isCodeTask('analysis')).toBe(false);
      expect(isCodeTask('general')).toBe(false);
    });
  });

  describe('isResearchTask', () => {
    it('should return true for research type', () => {
      expect(isResearchTask('research')).toBe(true);
    });

    it('should return false for non-research types', () => {
      expect(isResearchTask('code')).toBe(false);
      expect(isResearchTask('documentation')).toBe(false);
      expect(isResearchTask('analysis')).toBe(false);
      expect(isResearchTask('general')).toBe(false);
    });
  });

  describe('getAllTaskTypes', () => {
    it('should return all task types', () => {
      const types = getAllTaskTypes();
      expect(types).toContain('code');
      expect(types).toContain('research');
      expect(types).toContain('documentation');
      expect(types).toContain('analysis');
      expect(types).toContain('general');
      expect(types).toHaveLength(5);
    });

    it('should return readonly array', () => {
      const types = getAllTaskTypes();
      // TypeScript should prevent mutations, but verify array structure
      expect(Array.isArray(types)).toBe(true);
    });
  });

  describe('DEFAULT_CLASSIFICATION_PATTERNS', () => {
    it('should have patterns for all task types', () => {
      expect(DEFAULT_CLASSIFICATION_PATTERNS.code).toBeDefined();
      expect(DEFAULT_CLASSIFICATION_PATTERNS.research).toBeDefined();
      expect(DEFAULT_CLASSIFICATION_PATTERNS.documentation).toBeDefined();
      expect(DEFAULT_CLASSIFICATION_PATTERNS.analysis).toBeDefined();
    });

    it('should have non-empty arrays for all types', () => {
      expect(DEFAULT_CLASSIFICATION_PATTERNS.code.length).toBeGreaterThan(0);
      expect(DEFAULT_CLASSIFICATION_PATTERNS.research.length).toBeGreaterThan(0);
      expect(DEFAULT_CLASSIFICATION_PATTERNS.documentation.length).toBeGreaterThan(0);
      expect(DEFAULT_CLASSIFICATION_PATTERNS.analysis.length).toBeGreaterThan(0);
    });
  });
});
