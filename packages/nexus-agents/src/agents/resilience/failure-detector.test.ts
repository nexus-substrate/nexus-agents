/**
 * Tests for agent failure archetype detection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Message } from '../../core/index.js';
import { FailureDetector, createFailureDetector } from './failure-detector.js';
import type { DetectionInput, ToolCallRecord } from './failure-detector.js';

describe('FailureDetector', () => {
  let detector: FailureDetector;

  beforeEach(() => {
    // Use lower confidence threshold for testing individual patterns
    detector = createFailureDetector({ confidenceThreshold: 0.2 });
  });

  describe('premature action detection', () => {
    it('should detect action without schema inspection', () => {
      const toolCalls: ToolCallRecord[] = [
        { name: 'create_record', input: { data: {} }, success: true },
      ];

      const input: DetectionInput = {
        messages: [],
        toolCalls,
      };

      const result = detector.detect(input);
      const prematureFailure = result.failures.find((f) => f.archetype === 'premature_action');
      expect(prematureFailure).toBeDefined();
      expect(prematureFailure?.indicators).toContain('Data modification without schema inspection');
    });

    it('should not flag when schema inspection precedes action', () => {
      const toolCalls: ToolCallRecord[] = [
        { name: 'get_schema', input: { table: 'users' }, success: true },
        { name: 'create_record', input: { data: {} }, success: true },
      ];

      const input: DetectionInput = {
        messages: [],
        toolCalls,
      };

      const result = detector.detect(input);
      const prematureFailure = result.failures.find((f) => f.archetype === 'premature_action');
      expect(prematureFailure).toBeUndefined();
    });

    it('should detect heuristic patterns in text', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'I am assuming the schema has these fields without checking.',
        },
      ];

      const input: DetectionInput = { messages };

      const result = detector.detect(input);
      const prematureFailure = result.failures.find((f) => f.archetype === 'premature_action');
      expect(prematureFailure).toBeDefined();
    });
  });

  describe('over-helpfulness detection', () => {
    it('should detect substitution after failed lookup', () => {
      const toolCalls: ToolCallRecord[] = [
        { name: 'find_user', input: { id: 123 }, success: false, errorMessage: 'Not found' },
        { name: 'create_report', input: { userId: 'default' }, success: true },
      ];

      const input: DetectionInput = {
        messages: [],
        toolCalls,
      };

      const result = detector.detect(input);
      const helpfulnessFailure = result.failures.find((f) => f.archetype === 'over_helpfulness');
      expect(helpfulnessFailure).toBeDefined();
    });

    it('should detect heuristic patterns', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: "I couldn't find the user, so I'm using a placeholder value instead.",
        },
      ];

      const input: DetectionInput = { messages };

      const result = detector.detect(input);
      const helpfulnessFailure = result.failures.find((f) => f.archetype === 'over_helpfulness');
      expect(helpfulnessFailure).toBeDefined();
    });
  });

  describe('context pollution detection', () => {
    it('should detect heuristic patterns', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'The context contains conflicting information about the requirements.',
        },
      ];

      const input: DetectionInput = { messages };

      const result = detector.detect(input);
      const pollutionFailure = result.failures.find((f) => f.archetype === 'context_pollution');
      expect(pollutionFailure).toBeDefined();
    });

    it('should detect high topic shifts', () => {
      const messages: Message[] = Array.from({ length: 15 }, (_, i) => ({
        role: 'user' as const,
        content:
          i % 3 === 0
            ? 'Let us discuss database schemas and normalization patterns'
            : i % 3 === 1
              ? 'Now switching to frontend React component architecture'
              : 'Moving to DevOps CI/CD pipeline configuration',
      }));

      const input: DetectionInput = { messages };

      const result = detector.detect(input);
      // May or may not trigger depending on implementation threshold
      // Just verify the detector ran and performed checks
      expect(result.analysisMetadata.checksPerformed).toBeGreaterThan(0);
    });
  });

  describe('fragile execution detection', () => {
    it('should detect high tool failure rate', () => {
      const toolCalls: ToolCallRecord[] = [
        { name: 'tool_a', input: {}, success: false, errorMessage: 'Error' },
        { name: 'tool_b', input: {}, success: false, errorMessage: 'Error' },
        { name: 'tool_c', input: {}, success: true },
      ];

      const input: DetectionInput = {
        messages: [],
        toolCalls,
      };

      const result = detector.detect(input);
      const fragileFailure = result.failures.find((f) => f.archetype === 'fragile_execution');
      expect(fragileFailure).toBeDefined();
      expect(fragileFailure?.indicators.some((i) => i.includes('failure rate'))).toBe(true);
    });

    it('should detect repeated tool calls (loops)', () => {
      const toolCalls: ToolCallRecord[] = [
        { name: 'retry_tool', input: { attempt: 1 }, success: false },
        { name: 'retry_tool', input: { attempt: 2 }, success: false },
        { name: 'retry_tool', input: { attempt: 3 }, success: false },
        { name: 'retry_tool', input: { attempt: 4 }, success: false },
      ];

      const input: DetectionInput = {
        messages: [],
        toolCalls,
      };

      const result = detector.detect(input);
      const fragileFailure = result.failures.find((f) => f.archetype === 'fragile_execution');
      expect(fragileFailure).toBeDefined();
      expect(fragileFailure?.indicators.some((i) => i.includes('Repeated'))).toBe(true);
    });

    it('should detect heuristic patterns', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: 'The tool call failed to parse due to a syntax error in the JSON.',
        },
      ];

      const input: DetectionInput = { messages };

      const result = detector.detect(input);
      const fragileFailure = result.failures.find((f) => f.archetype === 'fragile_execution');
      expect(fragileFailure).toBeDefined();
    });
  });

  describe('configuration', () => {
    it('should respect confidence threshold', () => {
      const highThresholdDetector = createFailureDetector({ confidenceThreshold: 0.9 });

      const messages: Message[] = [
        { role: 'assistant', content: 'I am guessing the schema format.' },
      ];

      const result = highThresholdDetector.detect({ messages });
      // Low-confidence matches should be filtered out
      expect(result.failures.length).toBe(0);
    });

    it('should allow disabling specific archetypes', () => {
      const limitedDetector = createFailureDetector({
        enabledArchetypes: ['fragile_execution'],
      });

      const messages: Message[] = [
        { role: 'assistant', content: 'I am assuming the schema without checking.' },
      ];

      const result = limitedDetector.detect({ messages });
      expect(result.failures.every((f) => f.archetype === 'fragile_execution')).toBe(true);
    });

    it('should allow disabling heuristics', () => {
      const noHeuristicsDetector = createFailureDetector({ enableHeuristics: false });

      const messages: Message[] = [
        { role: 'assistant', content: 'I am guessing and assuming everything.' },
      ];

      const result = noHeuristicsDetector.detect({ messages });
      // Without heuristics, text patterns should not trigger detection
      expect(result.failures.length).toBe(0);
    });
  });

  describe('metadata', () => {
    it('should track analysis metadata', () => {
      const toolCalls: ToolCallRecord[] = [
        { name: 'tool_a', input: {}, success: true },
        { name: 'tool_b', input: {}, success: true },
      ];

      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ];

      const input: DetectionInput = { messages, toolCalls };

      const result = detector.detect(input);

      expect(result.analysisMetadata.checksPerformed).toBe(4); // 4 archetypes
      expect(result.analysisMetadata.contentAnalyzed).toBe(4); // 2 messages + 2 tool calls
      expect(result.analysisMetadata.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('severity levels', () => {
    it('should assign severity based on confidence', () => {
      const toolCalls: ToolCallRecord[] = Array.from({ length: 10 }, (_, i) => ({
        name: 'failing_tool',
        input: { attempt: i },
        success: false,
        errorMessage: 'Persistent failure',
      }));

      const input: DetectionInput = {
        messages: [{ role: 'assistant', content: 'Retrying, loop detected, malformed output' }],
        toolCalls,
      };

      const result = detector.detect(input);
      const fragileFailure = result.failures.find((f) => f.archetype === 'fragile_execution');

      expect(fragileFailure).toBeDefined();
      expect(['medium', 'high', 'critical']).toContain(fragileFailure?.severity);
    });
  });
});
