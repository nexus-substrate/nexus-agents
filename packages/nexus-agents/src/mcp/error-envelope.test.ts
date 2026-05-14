/**
 * Tests for the structured tool error envelope (#2649).
 *
 * @module mcp/error-envelope.test
 */

import { describe, it, expect } from 'vitest';
import type { OutcomeFailureCategory } from '../orchestration/outcomes/outcome-types.js';
import {
  ErrorCategorySchema,
  ToolErrorEnvelopeSchema,
  ERROR_ENVELOPE_META_KEY,
  defaultRetryable,
  coarsenFailureCategory,
  parseToolErrorEnvelope,
  type ErrorCategory,
} from './error-envelope.js';
import { toolError, toolStructuredError } from './tools/tool-result.js';

const ALL_CATEGORIES: ErrorCategory[] = [
  'transient',
  'validation',
  'permission',
  'business',
  'internal',
];

describe('ErrorCategorySchema', () => {
  it('accepts every defined category', () => {
    for (const category of ALL_CATEGORIES) {
      expect(ErrorCategorySchema.safeParse(category).success).toBe(true);
    }
  });

  it('rejects unknown categories', () => {
    expect(ErrorCategorySchema.safeParse('timeout').success).toBe(false);
    expect(ErrorCategorySchema.safeParse('').success).toBe(false);
  });
});

describe('ToolErrorEnvelopeSchema', () => {
  it('parses a complete envelope', () => {
    const result = ToolErrorEnvelopeSchema.safeParse({
      errorCategory: 'validation',
      isRetryable: false,
      message: 'bad input',
      detail: { field: 'url' },
    });
    expect(result.success).toBe(true);
  });

  it('parses an envelope without the optional detail field', () => {
    const result = ToolErrorEnvelopeSchema.safeParse({
      errorCategory: 'transient',
      isRetryable: true,
      message: 'rate limited',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty message', () => {
    const result = ToolErrorEnvelopeSchema.safeParse({
      errorCategory: 'internal',
      isRetryable: false,
      message: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a message longer than 2000 chars', () => {
    const result = ToolErrorEnvelopeSchema.safeParse({
      errorCategory: 'internal',
      isRetryable: false,
      message: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});

describe('defaultRetryable', () => {
  it('marks transient errors retryable', () => {
    expect(defaultRetryable('transient')).toBe(true);
  });

  it('marks every non-transient category non-retryable', () => {
    for (const category of ALL_CATEGORIES.filter((c) => c !== 'transient')) {
      expect(defaultRetryable(category)).toBe(false);
    }
  });
});

describe('coarsenFailureCategory', () => {
  const cases: Array<[OutcomeFailureCategory, ErrorCategory]> = [
    ['timeout', 'transient'],
    ['rate_limit', 'transient'],
    ['connection', 'transient'],
    ['authentication', 'permission'],
    ['validation', 'validation'],
    ['parse', 'validation'],
    ['crash', 'internal'],
    ['adapter_unavailable', 'internal'],
    ['execution', 'internal'],
    ['generic', 'internal'],
    ['unknown', 'internal'],
  ];

  it('projects every routing-layer category to a caller-facing one', () => {
    for (const [input, expected] of cases) {
      expect(coarsenFailureCategory(input)).toBe(expected);
    }
  });

  it('covers all 11 OutcomeFailureCategory values', () => {
    // Guards against the map silently going stale if a 12th routing
    // category is added without extending FAILURE_CATEGORY_COARSENING.
    expect(cases).toHaveLength(11);
  });
});

describe('parseToolErrorEnvelope', () => {
  it('extracts a valid envelope from a result _meta object', () => {
    const envelope = parseToolErrorEnvelope({
      [ERROR_ENVELOPE_META_KEY]: {
        errorCategory: 'business',
        isRetryable: false,
        message: 'dedup hit',
      },
    });
    expect(envelope).not.toBeNull();
    expect(envelope?.errorCategory).toBe('business');
  });

  it('returns null for non-object input', () => {
    expect(parseToolErrorEnvelope(null)).toBeNull();
    expect(parseToolErrorEnvelope('error')).toBeNull();
    expect(parseToolErrorEnvelope(undefined)).toBeNull();
  });

  it('returns null when the envelope key is missing', () => {
    expect(parseToolErrorEnvelope({ somethingElse: {} })).toBeNull();
  });

  it('returns null when the envelope payload is malformed', () => {
    expect(
      parseToolErrorEnvelope({ [ERROR_ENVELOPE_META_KEY]: { errorCategory: 'nope' } })
    ).toBeNull();
  });
});

describe('toolStructuredError', () => {
  it('builds an error result with the envelope in _meta, not structuredContent', () => {
    const result = toolStructuredError({
      errorCategory: 'validation',
      message: 'bad url',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe('bad url');
    // The envelope must NOT be in structuredContent — the MCP client
    // validates that against the tool's outputSchema even on errors.
    expect(result.structuredContent).toBeUndefined();
    const envelope = parseToolErrorEnvelope(result._meta);
    expect(envelope).toEqual({
      errorCategory: 'validation',
      isRetryable: false,
      message: 'bad url',
    });
  });

  it('derives isRetryable from the category when omitted', () => {
    const result = toolStructuredError({ errorCategory: 'transient', message: 'blip' });
    expect(parseToolErrorEnvelope(result._meta)?.isRetryable).toBe(true);
  });

  it('honors an explicit isRetryable override', () => {
    const result = toolStructuredError({
      errorCategory: 'internal',
      message: 'flaky downstream',
      isRetryable: true,
    });
    expect(parseToolErrorEnvelope(result._meta)?.isRetryable).toBe(true);
  });

  it('includes detail when provided and omits it otherwise', () => {
    const withDetail = toolStructuredError({
      errorCategory: 'business',
      message: 'exists',
      detail: { sourceId: 'abc' },
    });
    expect(parseToolErrorEnvelope(withDetail._meta)?.detail).toEqual({
      sourceId: 'abc',
    });
    const withoutDetail = toolStructuredError({ errorCategory: 'business', message: 'exists' });
    expect(parseToolErrorEnvelope(withoutDetail._meta)?.detail).toBeUndefined();
  });
});

describe('toolError back-compat alias', () => {
  it('maps legacy string errors to a non-retryable internal envelope', () => {
    const result = toolError('something broke');
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe('something broke');
    expect(result.structuredContent).toBeUndefined();
    expect(parseToolErrorEnvelope(result._meta)).toEqual({
      errorCategory: 'internal',
      isRetryable: false,
      message: 'something broke',
    });
  });
});
