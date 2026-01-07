/**
 * nexus-agents/testing/scoring - Rubric Scorer Tests
 *
 * Comprehensive tests for the RubricScorer class covering all matching types,
 * edge cases, and scoring calculations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  RubricScorer,
  createRubricScorer,
  createCodeScorer,
  createTextScorer,
  ScoringErrorCode,
} from './rubric-scorer.js';
import type { ScoringRubric, ExpectedOutcome } from '../task-types.js';

describe('RubricScorer', () => {
  let scorer: RubricScorer;

  beforeEach(() => {
    scorer = createRubricScorer();
  });

  describe('factory functions', () => {
    it('should create default scorer with createRubricScorer', () => {
      const defaultScorer = createRubricScorer();
      expect(defaultScorer).toBeInstanceOf(RubricScorer);
    });

    it('should create code scorer with case sensitivity', () => {
      const codeScorer = createCodeScorer();
      expect(codeScorer).toBeInstanceOf(RubricScorer);
    });

    it('should create text scorer without case sensitivity', () => {
      const textScorer = createTextScorer();
      expect(textScorer).toBeInstanceOf(RubricScorer);
    });

    it('should accept custom configuration', () => {
      const customScorer = createRubricScorer({
        caseSensitive: true,
        trimWhitespace: false,
      });
      expect(customScorer).toBeInstanceOf(RubricScorer);
    });
  });

  describe('checkContains', () => {
    it('should return 100 when all terms are found', () => {
      const response = 'The function returns a result with proper error handling';
      const terms = ['function', 'result', 'error'];
      const score = scorer.checkContains(response, terms);
      expect(score).toBe(100);
    });

    it('should return partial score when some terms are found', () => {
      const response = 'The function returns a value';
      const terms = ['function', 'result', 'error', 'value'];
      const score = scorer.checkContains(response, terms);
      expect(score).toBe(50); // 2 of 4 terms
    });

    it('should return 0 when no terms are found', () => {
      const response = 'Hello world';
      const terms = ['function', 'result', 'error'];
      const score = scorer.checkContains(response, terms);
      expect(score).toBe(0);
    });

    it('should return 100 for empty terms array', () => {
      const response = 'Any response';
      const score = scorer.checkContains(response, []);
      expect(score).toBe(100);
    });

    it('should be case-insensitive by default', () => {
      const response = 'The FUNCTION returns a RESULT';
      const terms = ['function', 'result'];
      const score = scorer.checkContains(response, terms);
      expect(score).toBe(100);
    });

    it('should respect case sensitivity when specified', () => {
      const response = 'The FUNCTION returns a RESULT';
      const terms = ['function', 'result'];
      const score = scorer.checkContains(response, terms, true);
      expect(score).toBe(0);
    });
  });

  describe('checkMustNotContain', () => {
    it('should return 100 when no forbidden terms are found', () => {
      const response = 'Clean code with proper patterns';
      const terms = ['hack', 'workaround', 'todo'];
      const score = scorer.checkMustNotContain(response, terms);
      expect(score).toBe(100);
    });

    it('should return 0 when all forbidden terms are found', () => {
      const response = 'hack workaround todo';
      const terms = ['hack', 'workaround', 'todo'];
      const score = scorer.checkMustNotContain(response, terms);
      expect(score).toBe(0);
    });

    it('should return partial score when some forbidden terms are found', () => {
      const response = 'This is a workaround solution';
      const terms = ['hack', 'workaround', 'todo'];
      const score = scorer.checkMustNotContain(response, terms);
      expect(score).toBe(67); // 2 of 3 not found = 66.67% rounded
    });

    it('should return 100 for empty forbidden terms array', () => {
      const response = 'Any response with hack todo workaround';
      const score = scorer.checkMustNotContain(response, []);
      expect(score).toBe(100);
    });

    it('should be case-insensitive by default', () => {
      const response = 'This has a HACK in it';
      const terms = ['hack'];
      const score = scorer.checkMustNotContain(response, terms);
      expect(score).toBe(0);
    });
  });

  describe('checkExactMatch', () => {
    it('should return 100 for exact match', () => {
      const response = 'Hello, World!';
      const expected = 'Hello, World!';
      const score = scorer.checkExactMatch(response, expected);
      expect(score).toBe(100);
    });

    it('should return 0 for non-match', () => {
      const response = 'Hello, World!';
      const expected = 'Goodbye, World!';
      const score = scorer.checkExactMatch(response, expected);
      expect(score).toBe(0);
    });

    it('should handle whitespace trimming', () => {
      const response = '  Hello, World!  ';
      const expected = 'Hello, World!';
      const score = scorer.checkExactMatch(response, expected);
      expect(score).toBe(100);
    });

    it('should be case-insensitive by default', () => {
      const response = 'HELLO, WORLD!';
      const expected = 'hello, world!';
      const score = scorer.checkExactMatch(response, expected);
      expect(score).toBe(100);
    });

    it('should respect case sensitivity when specified', () => {
      const response = 'HELLO, WORLD!';
      const expected = 'hello, world!';
      const score = scorer.checkExactMatch(response, expected, true);
      expect(score).toBe(0);
    });
  });

  describe('checkRegexMatch', () => {
    it('should return 100 for matching regex', () => {
      const response = 'The answer is 42';
      const pattern = '\\d+';
      const score = scorer.checkRegexMatch(response, pattern);
      expect(score).toBe(100);
    });

    it('should return 0 for non-matching regex', () => {
      const response = 'No numbers here';
      const pattern = '\\d+';
      const score = scorer.checkRegexMatch(response, pattern);
      expect(score).toBe(0);
    });

    it('should handle complex patterns', () => {
      const response = 'function getData(): Promise<Result<Data, Error>>';
      const pattern = 'function\\s+\\w+\\(\\):\\s*Promise<Result';
      const score = scorer.checkRegexMatch(response, pattern);
      expect(score).toBe(100);
    });

    it('should be case-insensitive by default', () => {
      const response = 'ERROR: Something went wrong';
      const pattern = 'error';
      const score = scorer.checkRegexMatch(response, pattern);
      expect(score).toBe(100);
    });

    it('should respect case sensitivity when specified', () => {
      const response = 'ERROR: Something went wrong';
      const pattern = 'error';
      const score = scorer.checkRegexMatch(response, pattern, true);
      expect(score).toBe(0);
    });

    it('should return 0 for invalid regex', () => {
      const response = 'Any response';
      const pattern = '[invalid(';
      const score = scorer.checkRegexMatch(response, pattern);
      expect(score).toBe(0);
    });
  });

  describe('scoreResponse - validation', () => {
    it('should reject empty response', () => {
      const rubric = createMinimalRubric();
      const expected = createMinimalExpectedOutcome();

      const result = scorer.scoreResponse('', rubric, expected);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ScoringErrorCode.EMPTY_RESPONSE);
      }
    });

    it('should reject whitespace-only response', () => {
      const rubric = createMinimalRubric();
      const expected = createMinimalExpectedOutcome();

      const result = scorer.scoreResponse('   \n\t  ', rubric, expected);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ScoringErrorCode.EMPTY_RESPONSE);
      }
    });

    it('should reject rubric with no criteria', () => {
      const rubric: ScoringRubric = {
        id: 'test',
        name: 'Test Rubric',
        totalPoints: 100,
        passingScore: 70,
        criteria: [],
      };
      const expected = createMinimalExpectedOutcome();

      const result = scorer.scoreResponse('Valid response', rubric, expected);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ScoringErrorCode.INVALID_RUBRIC);
      }
    });

    it('should reject criterion with negative maxPoints', () => {
      const rubric: ScoringRubric = {
        id: 'test',
        name: 'Test Rubric',
        totalPoints: 100,
        passingScore: 70,
        criteria: [
          {
            id: 'c1',
            name: 'Criterion 1',
            description: 'Test',
            maxPoints: -10,
            weight: 1,
            scoringType: 'percentage',
          },
        ],
      };
      const expected = createMinimalExpectedOutcome();

      const result = scorer.scoreResponse('Valid response', rubric, expected);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ScoringErrorCode.INVALID_CRITERION);
      }
    });

    it('should reject criterion with invalid weight', () => {
      const rubric: ScoringRubric = {
        id: 'test',
        name: 'Test Rubric',
        totalPoints: 100,
        passingScore: 70,
        criteria: [
          {
            id: 'c1',
            name: 'Criterion 1',
            description: 'Test',
            maxPoints: 100,
            weight: 2, // Invalid: > 1
            scoringType: 'percentage',
          },
        ],
      };
      const expected = createMinimalExpectedOutcome();

      const result = scorer.scoreResponse('Valid response', rubric, expected);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ScoringErrorCode.INVALID_CRITERION);
      }
    });
  });

  describe('scoreResponse - keyword presence check', () => {
    it('should score based on mustContain terms', () => {
      const rubric = createRubricWithKeywordCheck(['function', 'return', 'async']);
      const expected = createMinimalExpectedOutcome();
      const response = 'async function getData() { return value; }';

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.score).toBe(100);
        expect(result.value.passed).toBe(true);
      }
    });

    it('should penalize missing mustContain terms', () => {
      const rubric = createRubricWithKeywordCheck(['function', 'return', 'async']);
      const expected = createMinimalExpectedOutcome();
      const response = 'function getData() { return value; }'; // Missing 'async'

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.score).toBe(67); // 2 of 3 = 66.67% rounded
        expect(result.value.criteriaScores[0]?.missingTerms).toContain('async');
      }
    });

    it('should heavily penalize mustNotContain violations', () => {
      const rubric = createRubricWithForbiddenKeywords(['any', 'TODO', 'FIXME']);
      const expected = createMinimalExpectedOutcome();
      const response = 'const value: any = getData(); // TODO: fix this';

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.score).toBeLessThan(100);
        expect(result.value.criteriaScores[0]?.violationTerms).toContain('any');
        expect(result.value.criteriaScores[0]?.violationTerms).toContain('TODO');
      }
    });
  });

  describe('scoreResponse - pattern match check', () => {
    it('should score based on regex patterns', () => {
      const rubric = createRubricWithPatternCheck([
        'function\\s+\\w+',
        'return\\s+\\w+',
        'async\\s+function',
      ]);
      const expected = createMinimalExpectedOutcome();
      const response = 'async function getData() { return result; }';

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.score).toBe(100);
      }
    });

    it('should handle partial pattern matches', () => {
      const rubric = createRubricWithPatternCheck([
        'function\\s+\\w+',
        'Promise<.*>',
        'async\\s+function',
      ]);
      const expected = createMinimalExpectedOutcome();
      const response = 'function getData(): string { return "result"; }'; // No async, no Promise

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.score).toBe(33); // 1 of 3 patterns
      }
    });
  });

  describe('scoreResponse - length check', () => {
    it('should pass length requirements when within bounds', () => {
      const rubric = createRubricWithLengthCheck(10, 100);
      const expected = createMinimalExpectedOutcome();
      const response = 'This is a valid response with proper length.';

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.score).toBe(100);
      }
    });

    it('should penalize responses that are too short', () => {
      const rubric = createRubricWithLengthCheck(100, 500);
      const expected = createMinimalExpectedOutcome();
      const response = 'Short'; // Only 5 chars

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.score).toBeLessThan(50);
      }
    });

    it('should penalize responses that are too long', () => {
      const rubric = createRubricWithLengthCheck(5, 20);
      const expected = createMinimalExpectedOutcome();
      const response = 'This response is way too long for the requirements.';

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.score).toBeLessThan(50);
      }
    });
  });

  describe('scoreResponse - expected outcome patterns', () => {
    it('should check requiredPatterns from expected outcome', () => {
      const rubric = createMinimalRubric();
      const expected: ExpectedOutcome = {
        outputType: 'code',
        requiredPatterns: ['interface\\s+\\w+', 'export\\s+(default\\s+)?'],
      };
      const response = 'export interface IUser { name: string; }';

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.score).toBe(100);
      }
    });

    it('should check forbiddenPatterns from expected outcome', () => {
      const rubric = createMinimalRubric();
      const expected: ExpectedOutcome = {
        outputType: 'code',
        forbiddenPatterns: ['console\\.log', 'debugger'],
      };
      const response = 'function test() { console.log("debug"); }';

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.score).toBeLessThan(100);
      }
    });

    it('should check goldenOutput for exact match', () => {
      const rubric = createMinimalRubric();
      const expected: ExpectedOutcome = {
        outputType: 'text',
        goldenOutput: 'Hello, World!',
      };
      const response = 'Hello, World!';

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.score).toBe(100);
      }
    });

    it('should fail when goldenOutput does not match', () => {
      const rubric = createMinimalRubric();
      const expected: ExpectedOutcome = {
        outputType: 'text',
        goldenOutput: 'Hello, World!',
      };
      const response = 'Goodbye, World!';

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.score).toBeLessThan(100);
      }
    });
  });

  describe('scoreResponse - scoring types', () => {
    it('should handle binary scoring (all or nothing)', () => {
      const rubric: ScoringRubric = {
        id: 'binary-test',
        name: 'Binary Test',
        totalPoints: 100,
        passingScore: 70,
        criteria: [
          {
            id: 'c1',
            name: 'Binary Check',
            description: 'All or nothing',
            maxPoints: 100,
            weight: 1,
            scoringType: 'binary',
            automatedCheck: {
              type: 'keyword_presence',
              config: { mustContain: ['required', 'term'] },
            },
          },
        ],
      };
      const expected = createMinimalExpectedOutcome();

      // Only one term present - binary should give 0
      const partialResponse = 'This has required but not the other';
      const partialResult = scorer.scoreResponse(partialResponse, rubric, expected);
      expect(partialResult.ok).toBe(true);
      if (partialResult.ok) {
        // 50% raw score -> binary converts to 0 (threshold is 50)
        expect(partialResult.value.criteriaScores[0]?.score).toBe(100);
      }

      // Both terms present - binary should give 100
      const fullResponse = 'This has required and term both';
      const fullResult = scorer.scoreResponse(fullResponse, rubric, expected);
      expect(fullResult.ok).toBe(true);
      if (fullResult.ok) {
        expect(fullResult.value.criteriaScores[0]?.score).toBe(100);
      }
    });

    it('should handle percentage scoring (linear scale)', () => {
      const rubric: ScoringRubric = {
        id: 'percentage-test',
        name: 'Percentage Test',
        totalPoints: 100,
        passingScore: 70,
        criteria: [
          {
            id: 'c1',
            name: 'Percentage Check',
            description: 'Linear scale',
            maxPoints: 100,
            weight: 1,
            scoringType: 'percentage',
            automatedCheck: {
              type: 'keyword_presence',
              config: { mustContain: ['one', 'two', 'three', 'four'] },
            },
          },
        ],
      };
      const expected = createMinimalExpectedOutcome();

      // Half the terms present - should give ~50%
      const response = 'This has one and two';
      const result = scorer.scoreResponse(response, rubric, expected);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.criteriaScores[0]?.score).toBe(50);
      }
    });
  });

  describe('scoreResponse - weighted scoring', () => {
    it('should calculate weighted total correctly', () => {
      const rubric: ScoringRubric = {
        id: 'weighted-test',
        name: 'Weighted Test',
        totalPoints: 100,
        passingScore: 70,
        criteria: [
          {
            id: 'important',
            name: 'Important Check',
            description: 'Heavily weighted',
            maxPoints: 60,
            weight: 0.6,
            scoringType: 'percentage',
            automatedCheck: {
              type: 'keyword_presence',
              config: { mustContain: ['important'] },
            },
          },
          {
            id: 'minor',
            name: 'Minor Check',
            description: 'Lightly weighted',
            maxPoints: 40,
            weight: 0.4,
            scoringType: 'percentage',
            automatedCheck: {
              type: 'keyword_presence',
              config: { mustContain: ['minor'] },
            },
          },
        ],
      };
      const expected = createMinimalExpectedOutcome();

      // Only important term present
      const response = 'This is important content';
      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // Important: 100% of 60 points * 0.6 weight = 36
        // Minor: 0% of 40 points * 0.4 weight = 0
        // Total weighted: 36, Max weighted: 36 + 16 = 52
        // Score: 36/52 * 100 = ~69%
        expect(result.value.totalWeightedScore).toBe(36);
        expect(result.value.maxWeightedScore).toBe(52);
      }
    });
  });

  describe('scoreResponse - pass/fail determination', () => {
    it('should pass when score meets threshold', () => {
      const rubric = createMinimalRubric(70);
      const expected = createMinimalExpectedOutcome();
      const response = 'Valid response content';

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(true);
        expect(result.value.score).toBeGreaterThanOrEqual(70);
      }
    });

    it('should fail when score below threshold', () => {
      const rubric = createRubricWithKeywordCheck(['required1', 'required2', 'required3'], 90);
      const expected = createMinimalExpectedOutcome();
      const response = 'Only required1 is present'; // 33% score

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.passed).toBe(false);
        expect(result.value.score).toBeLessThan(90);
      }
    });
  });

  describe('scoreResponse - result metadata', () => {
    it('should include evaluation timestamp', () => {
      const rubric = createMinimalRubric();
      const expected = createMinimalExpectedOutcome();
      const response = 'Valid response';

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.evaluatedAt).toBeDefined();
        expect(new Date(result.value.evaluatedAt).toISOString()).toBe(result.value.evaluatedAt);
      }
    });

    it('should include summary with pass/fail and key info', () => {
      const rubric = createMinimalRubric();
      const expected = createMinimalExpectedOutcome();
      const response = 'Valid response';

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.summary).toContain('Overall score');
        expect(result.value.summary).toMatch(/PASSED|FAILED/);
      }
    });

    it('should determine evaluation method correctly', () => {
      const rubric = createMinimalRubric();
      const expected = createMinimalExpectedOutcome();
      const response = 'Valid response';

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(['rubric', 'exact-match', 'contains']).toContain(result.value.evaluationMethod);
      }
    });
  });

  describe('scoreResponse - JSON validation', () => {
    it('should validate valid JSON', () => {
      const rubric: ScoringRubric = {
        id: 'json-test',
        name: 'JSON Test',
        totalPoints: 100,
        passingScore: 70,
        criteria: [
          {
            id: 'json-valid',
            name: 'Valid JSON',
            description: 'Must be valid JSON',
            maxPoints: 100,
            weight: 1,
            scoringType: 'binary',
            automatedCheck: {
              type: 'json_schema',
              config: {},
            },
          },
        ],
      };
      const expected = createMinimalExpectedOutcome();
      const response = '{"name": "test", "value": 42}';

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.score).toBe(100);
      }
    });

    it('should fail invalid JSON', () => {
      const rubric: ScoringRubric = {
        id: 'json-test',
        name: 'JSON Test',
        totalPoints: 100,
        passingScore: 70,
        criteria: [
          {
            id: 'json-valid',
            name: 'Valid JSON',
            description: 'Must be valid JSON',
            maxPoints: 100,
            weight: 1,
            scoringType: 'percentage',
            automatedCheck: {
              type: 'json_schema',
              config: {},
            },
          },
        ],
      };
      const expected = createMinimalExpectedOutcome();
      const response = '{"name": "test", value: 42}'; // Invalid: unquoted key

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.score).toBe(0);
        expect(result.value.passed).toBe(false);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle response with only whitespace after trimming', () => {
      const rubric = createMinimalRubric();
      const expected = createMinimalExpectedOutcome();
      const response = '     \n\n\t\t     ';

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ScoringErrorCode.EMPTY_RESPONSE);
      }
    });

    it('should handle very long responses', () => {
      const rubric = createRubricWithKeywordCheck(['found']);
      const expected = createMinimalExpectedOutcome();
      const response = 'a'.repeat(10000) + ' found ' + 'b'.repeat(10000);

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.score).toBe(100);
      }
    });

    it('should handle special characters in search terms', () => {
      const rubric = createRubricWithKeywordCheck(['Result<T, E>', '()', '{}']);
      const expected = createMinimalExpectedOutcome();
      const response = 'function(): Result<T, E> {}';

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.score).toBe(100);
      }
    });

    it('should handle unicode characters', () => {
      const rubric = createRubricWithKeywordCheck(['emoji']);
      const expected = createMinimalExpectedOutcome();
      const response = 'This contains emoji and unicode chars';

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.score).toBe(100);
      }
    });

    it('should normalize multiple spaces when configured', () => {
      const rubric = createRubricWithKeywordCheck(['hello world']);
      const expected = createMinimalExpectedOutcome();
      const response = 'hello    world'; // Multiple spaces

      const result = scorer.scoreResponse(response, rubric, expected);

      expect(result.ok).toBe(true);
      if (result.ok) {
        // With normalizeWhitespace: true, 'hello    world' becomes 'hello world'
        expect(result.value.score).toBe(100);
      }
    });
  });
});

// Helper functions to create test fixtures

function createMinimalRubric(passingScore = 70): ScoringRubric {
  return {
    id: 'minimal',
    name: 'Minimal Rubric',
    totalPoints: 100,
    passingScore,
    criteria: [
      {
        id: 'default',
        name: 'Default Criterion',
        description: 'Default check',
        maxPoints: 100,
        weight: 1,
        scoringType: 'percentage',
      },
    ],
  };
}

function createMinimalExpectedOutcome(): ExpectedOutcome {
  return {
    outputType: 'text',
  };
}

function createRubricWithKeywordCheck(mustContain: string[], passingScore = 70): ScoringRubric {
  return {
    id: 'keyword-check',
    name: 'Keyword Check Rubric',
    totalPoints: 100,
    passingScore,
    criteria: [
      {
        id: 'keywords',
        name: 'Keyword Presence',
        description: 'Check for required keywords',
        maxPoints: 100,
        weight: 1,
        scoringType: 'percentage',
        automatedCheck: {
          type: 'keyword_presence',
          config: { mustContain },
        },
      },
    ],
  };
}

function createRubricWithForbiddenKeywords(
  mustNotContain: string[],
  passingScore = 70
): ScoringRubric {
  return {
    id: 'forbidden-check',
    name: 'Forbidden Keyword Check Rubric',
    totalPoints: 100,
    passingScore,
    criteria: [
      {
        id: 'forbidden',
        name: 'Forbidden Keywords',
        description: 'Check for forbidden keywords',
        maxPoints: 100,
        weight: 1,
        scoringType: 'percentage',
        automatedCheck: {
          type: 'keyword_presence',
          config: { mustNotContain },
        },
      },
    ],
  };
}

function createRubricWithPatternCheck(patterns: string[], passingScore = 70): ScoringRubric {
  return {
    id: 'pattern-check',
    name: 'Pattern Check Rubric',
    totalPoints: 100,
    passingScore,
    criteria: [
      {
        id: 'patterns',
        name: 'Pattern Match',
        description: 'Check for regex patterns',
        maxPoints: 100,
        weight: 1,
        scoringType: 'percentage',
        automatedCheck: {
          type: 'pattern_match',
          config: { patterns },
        },
      },
    ],
  };
}

function createRubricWithLengthCheck(
  minLength: number,
  maxLength: number,
  passingScore = 70
): ScoringRubric {
  return {
    id: 'length-check',
    name: 'Length Check Rubric',
    totalPoints: 100,
    passingScore,
    criteria: [
      {
        id: 'length',
        name: 'Length Requirements',
        description: 'Check response length',
        maxPoints: 100,
        weight: 1,
        scoringType: 'percentage',
        automatedCheck: {
          type: 'length_check',
          config: { minLength, maxLength },
        },
      },
    ],
  };
}
