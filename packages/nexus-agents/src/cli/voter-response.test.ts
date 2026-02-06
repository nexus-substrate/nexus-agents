/**
 * Tests for voter response parsing utilities
 */

import { describe, it, expect } from 'vitest';
import {
  SyntheticVoteError,
  VoteResponseSchema,
  buildVotePrompt,
  extractJsonFromResponse,
  parseVoteResponse,
  type VoteResponse,
  type ParseVoteOptions,
} from './voter-response.js';
import type { VoterRole } from './vote-types.js';

// ============================================================================
// SyntheticVoteError Tests
// ============================================================================

describe('SyntheticVoteError', () => {
  it('should create error with correct message', () => {
    const error = new SyntheticVoteError('Invalid JSON', 'raw output');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SyntheticVoteError');
    expect(error.message).toContain('Invalid JSON');
    expect(error.message).toContain('allowSyntheticVote: true');
    expect(error.rawOutput).toBe('raw output');
  });

  it('should preserve rawOutput property', () => {
    const rawOutput = 'some malformed response';
    const error = new SyntheticVoteError('test reason', rawOutput);

    expect(error.rawOutput).toBe(rawOutput);
  });
});

// ============================================================================
// VoteResponseSchema Tests
// ============================================================================

describe('VoteResponseSchema', () => {
  it('should validate correct approve vote', () => {
    const valid: VoteResponse = {
      decision: 'approve',
      reasoning: 'This looks good to me',
      confidence: 0.9,
    };

    const result = VoteResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('should validate correct reject vote', () => {
    const valid: VoteResponse = {
      decision: 'reject',
      reasoning: 'This needs more work',
      confidence: 0.7,
    };

    const result = VoteResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('should validate correct abstain vote', () => {
    const valid: VoteResponse = {
      decision: 'abstain',
      reasoning: 'Not enough context to decide',
      confidence: 0.5,
    };

    const result = VoteResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('should validate vote with conditions', () => {
    const valid: VoteResponse = {
      decision: 'approve',
      reasoning: 'Good with conditions',
      confidence: 0.8,
      conditions: ['Add unit tests', 'Update documentation'],
    };

    const result = VoteResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.conditions).toEqual(['Add unit tests', 'Update documentation']);
    }
  });

  it('should reject invalid decision value', () => {
    const invalid = {
      decision: 'maybe',
      reasoning: 'Not sure about this',
      confidence: 0.5,
    };

    const result = VoteResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject reasoning too short', () => {
    const invalid = {
      decision: 'approve',
      reasoning: 'Too short',
      confidence: 0.8,
    };

    const result = VoteResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject reasoning too long', () => {
    const invalid = {
      decision: 'approve',
      reasoning: 'x'.repeat(501),
      confidence: 0.8,
    };

    const result = VoteResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject confidence below 0', () => {
    const invalid = {
      decision: 'approve',
      reasoning: 'This looks good',
      confidence: -0.1,
    };

    const result = VoteResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject confidence above 1', () => {
    const invalid = {
      decision: 'approve',
      reasoning: 'This looks good',
      confidence: 1.1,
    };

    const result = VoteResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should accept confidence exactly 0', () => {
    const valid = {
      decision: 'abstain',
      reasoning: 'Completely uncertain',
      confidence: 0,
    };

    const result = VoteResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('should accept confidence exactly 1', () => {
    const valid = {
      decision: 'approve',
      reasoning: 'Absolutely certain',
      confidence: 1,
    };

    const result = VoteResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it('should reject missing required fields', () => {
    const invalid = {
      decision: 'approve',
      confidence: 0.8,
    };

    const result = VoteResponseSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should accept empty conditions array', () => {
    const valid = {
      decision: 'approve',
      reasoning: 'Looks good with no conditions',
      confidence: 0.9,
      conditions: [],
    };

    const result = VoteResponseSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// buildVotePrompt Tests
// ============================================================================

describe('buildVotePrompt', () => {
  it('should include proposal text', () => {
    const proposal = 'Implement new feature X';
    const prompt = buildVotePrompt(proposal);

    expect(prompt).toContain(proposal);
    expect(prompt).toContain('PROPOSAL:');
  });

  it('should include decision options', () => {
    const prompt = buildVotePrompt('test');

    expect(prompt).toContain('approve');
    expect(prompt).toContain('reject');
    expect(prompt).toContain('abstain');
  });

  it('should include field descriptions', () => {
    const prompt = buildVotePrompt('test');

    expect(prompt).toContain('decision');
    expect(prompt).toContain('reasoning');
    expect(prompt).toContain('confidence');
    expect(prompt).toContain('conditions');
  });

  it('should include example response', () => {
    const prompt = buildVotePrompt('test');

    expect(prompt).toContain('Example response:');
    expect(prompt).toContain('{');
    expect(prompt).toContain('}');
  });

  it('should specify reasoning length constraints', () => {
    const prompt = buildVotePrompt('test');

    expect(prompt).toContain('10-500 characters');
  });

  it('should specify confidence range', () => {
    const prompt = buildVotePrompt('test');

    expect(prompt).toContain('0 and 1');
  });

  it('should handle empty proposal', () => {
    const prompt = buildVotePrompt('');

    expect(prompt).toContain('PROPOSAL:');
    expect(prompt.length).toBeGreaterThan(100);
  });

  it('should handle multiline proposal', () => {
    const proposal = 'Line 1\nLine 2\nLine 3';
    const prompt = buildVotePrompt(proposal);

    expect(prompt).toContain('Line 1');
    expect(prompt).toContain('Line 2');
    expect(prompt).toContain('Line 3');
  });
});

// ============================================================================
// extractJsonFromResponse Tests
// ============================================================================

describe('extractJsonFromResponse', () => {
  it('should extract JSON from markdown code block', () => {
    const text = '```json\n{"decision": "approve"}\n```';
    const result = extractJsonFromResponse(text);

    expect(result).toBe('{"decision": "approve"}');
  });

  it('should extract JSON from code block without json marker', () => {
    const text = '```\n{"decision": "approve"}\n```';
    const result = extractJsonFromResponse(text);

    expect(result).toBe('{"decision": "approve"}');
  });

  it('should extract JSON from mixed text', () => {
    const text = 'Here is my vote: {"decision": "approve"} end';
    const result = extractJsonFromResponse(text);

    expect(result).toBe('{"decision": "approve"}');
  });

  it('should prefer code block over inline JSON', () => {
    const text = 'Wrong: {"decision": "reject"}\n```json\n{"decision": "approve"}\n```';
    const result = extractJsonFromResponse(text);

    expect(result).toBe('{"decision": "approve"}');
  });

  it('should handle multiline JSON in code block', () => {
    const text = '```json\n{\n  "decision": "approve",\n  "reasoning": "test"\n}\n```';
    const result = extractJsonFromResponse(text);

    expect(result).toContain('"decision": "approve"');
    expect(result).toContain('"reasoning": "test"');
  });

  it('should handle JSON with nested objects', () => {
    const text = '{"outer": {"inner": "value"}}';
    const result = extractJsonFromResponse(text);

    expect(result).toBe('{"outer": {"inner": "value"}}');
  });

  it('should return trimmed text when no JSON found', () => {
    const text = '  just plain text  ';
    const result = extractJsonFromResponse(text);

    expect(result).toBe('just plain text');
  });

  it('should handle empty string', () => {
    const result = extractJsonFromResponse('');

    expect(result).toBe('');
  });

  it('should handle whitespace only', () => {
    const result = extractJsonFromResponse('   \n\t  ');

    expect(result).toBe('');
  });

  it('should handle case-insensitive json marker', () => {
    const text = '```JSON\n{"decision": "approve"}\n```';
    const result = extractJsonFromResponse(text);

    expect(result).toBe('{"decision": "approve"}');
  });

  it('should handle JSON with arrays', () => {
    const text = '{"conditions": ["test1", "test2"]}';
    const result = extractJsonFromResponse(text);

    expect(result).toBe('{"conditions": ["test1", "test2"]}');
  });
});

// ============================================================================
// parseVoteResponse Tests
// ============================================================================

describe('parseVoteResponse', () => {
  const role: VoterRole = 'architect';

  describe('successful parsing', () => {
    it('should parse valid JSON vote', () => {
      const output = JSON.stringify({
        decision: 'approve',
        reasoning: 'This looks good to me',
        confidence: 0.9,
      });

      const result = parseVoteResponse(output, role);

      expect(result.decision).toBe('approve');
      expect(result.reasoning).toBe('This looks good to me');
      expect(result.confidence).toBe(0.9);
      expect(result.source).toBe('parsed');
    });

    it('should parse vote with conditions', () => {
      const output = JSON.stringify({
        decision: 'approve',
        reasoning: 'Good with conditions',
        confidence: 0.8,
        conditions: ['Add tests', 'Update docs'],
      });

      const result = parseVoteResponse(output, role);

      expect(result.conditions).toEqual(['Add tests', 'Update docs']);
      expect(result.source).toBe('parsed');
    });

    it('should parse vote from markdown code block', () => {
      const output =
        '```json\n' +
        JSON.stringify({
          decision: 'reject',
          reasoning: 'Needs more work',
          confidence: 0.6,
        }) +
        '\n```';

      const result = parseVoteResponse(output, role);

      expect(result.decision).toBe('reject');
      expect(result.source).toBe('parsed');
    });

    it('should parse vote from mixed text', () => {
      const output =
        'My analysis:\n' +
        JSON.stringify({
          decision: 'abstain',
          reasoning: 'Not enough context',
          confidence: 0.5,
        }) +
        '\nThat is my vote.';

      const result = parseVoteResponse(output, role);

      expect(result.decision).toBe('abstain');
      expect(result.source).toBe('parsed');
    });
  });

  describe('error handling without allowSyntheticVote', () => {
    it('should throw SyntheticVoteError for invalid JSON', () => {
      const output = 'not valid json';

      expect(() => parseVoteResponse(output, role)).toThrow(SyntheticVoteError);
    });

    it('should throw SyntheticVoteError for validation failure', () => {
      const output = JSON.stringify({
        decision: 'maybe',
        reasoning: 'test',
        confidence: 0.5,
      });

      expect(() => parseVoteResponse(output, role)).toThrow(SyntheticVoteError);
    });

    it('should include raw output in error', () => {
      const output = 'invalid response';

      try {
        parseVoteResponse(output, role);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SyntheticVoteError);
        if (error instanceof SyntheticVoteError) {
          expect(error.rawOutput).toBe(output);
        }
      }
    });

    it('should throw for missing required fields', () => {
      const output = JSON.stringify({
        decision: 'approve',
        confidence: 0.8,
      });

      expect(() => parseVoteResponse(output, role)).toThrow(SyntheticVoteError);
    });

    it('should throw for reasoning too short', () => {
      const output = JSON.stringify({
        decision: 'approve',
        reasoning: 'short',
        confidence: 0.8,
      });

      expect(() => parseVoteResponse(output, role)).toThrow(SyntheticVoteError);
    });

    it('should throw for confidence out of range', () => {
      const output = JSON.stringify({
        decision: 'approve',
        reasoning: 'This is valid reasoning',
        confidence: 1.5,
      });

      expect(() => parseVoteResponse(output, role)).toThrow(SyntheticVoteError);
    });
  });

  describe('fallback votes with allowSyntheticVote', () => {
    const options: ParseVoteOptions = { allowSyntheticVote: true };

    it('should create fallback approve vote from keyword', () => {
      const output = 'I approve this proposal because it looks good';

      const result = parseVoteResponse(output, role, options);

      expect(result.decision).toBe('approve');
      expect(result.source).toBe('fallback');
      expect(result.confidence).toBe(0.5);
      expect(result.reasoning).toContain('[SYNTHETIC:');
    });

    it('should create fallback reject vote from keyword', () => {
      const output = 'I reject this proposal because it needs work';

      const result = parseVoteResponse(output, role, options);

      expect(result.decision).toBe('reject');
      expect(result.source).toBe('fallback');
    });

    it('should create fallback abstain for no keywords', () => {
      const output = 'This is unclear to me';

      const result = parseVoteResponse(output, role, options);

      expect(result.decision).toBe('abstain');
      expect(result.source).toBe('fallback');
    });

    it('should detect accept keyword', () => {
      const output = 'I accept this change';

      const result = parseVoteResponse(output, role, options);

      expect(result.decision).toBe('approve');
    });

    it('should detect agree keyword', () => {
      const output = 'I agree with this approach';

      const result = parseVoteResponse(output, role, options);

      expect(result.decision).toBe('approve');
    });

    it('should detect decline keyword', () => {
      const output = 'I decline to support this';

      const result = parseVoteResponse(output, role, options);

      expect(result.decision).toBe('reject');
    });

    it('should detect disagree keyword as reject', () => {
      const output = 'I disagree with this direction';

      const result = parseVoteResponse(output, role, options);

      // Reject keywords are checked first to avoid "agree" substring matching
      expect(result.decision).toBe('reject');
    });

    it('should be case insensitive', () => {
      const output = 'I APPROVE this proposal';

      const result = parseVoteResponse(output, role, options);

      expect(result.decision).toBe('approve');
    });

    it('should truncate long output in reasoning', () => {
      const output = 'approve ' + 'x'.repeat(300);

      const result = parseVoteResponse(output, role, options);

      // Reasoning format: [SYNTHETIC: reason] + output.slice(0, 200)
      // The prefix adds to the total length
      expect(result.reasoning).toContain('[SYNTHETIC:');
      expect(result.reasoning).toContain('approve');
      // Output is truncated to 200 chars, but prefix makes total longer
      const outputPart = result.reasoning.split('] ')[1];
      expect(outputPart?.length ?? 0).toBeLessThanOrEqual(200);
    });

    it('should handle invalid JSON with fallback', () => {
      const output = '{ not valid json }';

      const result = parseVoteResponse(output, role, options);

      expect(result.source).toBe('fallback');
      expect(result.confidence).toBe(0.5);
    });

    it('should handle validation error with fallback', () => {
      const output = JSON.stringify({
        decision: 'maybe',
        reasoning: 'test',
        confidence: 0.5,
      });

      const result = parseVoteResponse(output, role, options);

      expect(result.source).toBe('fallback');
    });
  });

  describe('boundary conditions', () => {
    it('should handle empty string', () => {
      expect(() => parseVoteResponse('', role)).toThrow(SyntheticVoteError);
    });

    it('should handle whitespace only', () => {
      expect(() => parseVoteResponse('   \n\t  ', role)).toThrow(SyntheticVoteError);
    });

    it('should handle reasoning at min length', () => {
      const output = JSON.stringify({
        decision: 'approve',
        reasoning: '1234567890',
        confidence: 0.8,
      });

      const result = parseVoteResponse(output, role);

      expect(result.source).toBe('parsed');
      expect(result.reasoning).toBe('1234567890');
    });

    it('should handle reasoning at max length', () => {
      const output = JSON.stringify({
        decision: 'approve',
        reasoning: 'x'.repeat(500),
        confidence: 0.8,
      });

      const result = parseVoteResponse(output, role);

      expect(result.source).toBe('parsed');
      expect(result.reasoning.length).toBe(500);
    });

    it('should handle confidence at 0', () => {
      const output = JSON.stringify({
        decision: 'abstain',
        reasoning: 'Completely uncertain',
        confidence: 0,
      });

      const result = parseVoteResponse(output, role);

      expect(result.confidence).toBe(0);
      expect(result.source).toBe('parsed');
    });

    it('should handle confidence at 1', () => {
      const output = JSON.stringify({
        decision: 'approve',
        reasoning: 'Absolutely certain',
        confidence: 1,
      });

      const result = parseVoteResponse(output, role);

      expect(result.confidence).toBe(1);
      expect(result.source).toBe('parsed');
    });
  });

  describe('different voter roles', () => {
    const roles: VoterRole[] = ['architect', 'security', 'devex', 'ai_ml', 'pm', 'catfish'];

    roles.forEach((testRole) => {
      it(`should parse vote for ${testRole} role`, () => {
        const output = JSON.stringify({
          decision: 'approve',
          reasoning: 'Valid vote response',
          confidence: 0.8,
        });

        const result = parseVoteResponse(output, testRole);

        expect(result.source).toBe('parsed');
      });
    });
  });
});
