/**
 * Expert Output Schemas Tests
 *
 * Tests for structured output parsing and validation.
 * TDD: these tests define the contract for expert output schemas.
 */

import { describe, it, expect } from 'vitest';
import {
  SecurityAuditOutputSchema,
  CodeReviewOutputSchema,
  ArchitectureDecisionSchema,
  EXPERT_OUTPUT_SCHEMAS,
  tryParseStructuredOutput,
} from './index.js';

describe('SecurityAuditOutputSchema', () => {
  it('accepts valid security audit output', () => {
    const valid = {
      findings: [
        {
          severity: 'high',
          title: 'SQL Injection in login endpoint',
          location: 'src/auth/login.ts:42',
          description: 'User input passed directly to SQL query',
          recommendation: 'Use parameterized queries',
          cwe: 'CWE-89',
        },
      ],
      summary: 'Found 1 high severity vulnerability',
      risk_level: 'high',
      reasoning: 'The login endpoint directly concatenates user input into SQL',
    };
    expect(SecurityAuditOutputSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const invalid = { findings: [], summary: 'ok' }; // missing reasoning
    expect(SecurityAuditOutputSchema.safeParse(invalid).success).toBe(false);
  });

  it('accepts minimal valid output', () => {
    const minimal = {
      findings: [],
      summary: 'No issues found',
      reasoning: 'Clean codebase',
    };
    expect(SecurityAuditOutputSchema.safeParse(minimal).success).toBe(true);
  });
});

describe('CodeReviewOutputSchema', () => {
  it('accepts valid code review output', () => {
    const valid = {
      items: [
        {
          category: 'bug',
          severity: 'medium',
          file: 'src/utils.ts',
          line: 15,
          description: 'Possible null dereference',
          suggestion: 'Add null check before accessing property',
        },
      ],
      summary: '1 issue found',
      overall_quality: 'good',
      reasoning: 'Generally clean code with one edge case',
    };
    expect(CodeReviewOutputSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts review with no items', () => {
    const clean = {
      items: [],
      summary: 'Code looks good',
      reasoning: 'No issues found',
    };
    expect(CodeReviewOutputSchema.safeParse(clean).success).toBe(true);
  });
});

describe('ArchitectureDecisionSchema', () => {
  it('accepts valid architecture decision', () => {
    const valid = {
      title: 'Use PostgreSQL for persistence',
      status: 'accepted',
      context: 'Need a relational database for structured data',
      decision: 'Use PostgreSQL 16',
      consequences: ['Need to manage database migrations', 'Strong ACID guarantees'],
      alternatives: [
        {
          name: 'MongoDB',
          pros: ['Flexible schema'],
          cons: ['Weaker consistency guarantees'],
        },
      ],
      reasoning: 'PostgreSQL provides the best balance of features and reliability',
    };
    expect(ArchitectureDecisionSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts minimal decision without alternatives', () => {
    const minimal = {
      title: 'Use REST over GraphQL',
      context: 'Simple CRUD API needed',
      decision: 'REST with OpenAPI spec',
      consequences: ['Simple to implement', 'Well-understood by team'],
      reasoning: 'YAGNI — GraphQL complexity not justified',
    };
    expect(ArchitectureDecisionSchema.safeParse(minimal).success).toBe(true);
  });
});

describe('EXPERT_OUTPUT_SCHEMAS', () => {
  it('has schemas for security, code, and architecture roles', () => {
    expect(EXPERT_OUTPUT_SCHEMAS.security).toBeDefined();
    expect(EXPERT_OUTPUT_SCHEMAS.code).toBeDefined();
    expect(EXPERT_OUTPUT_SCHEMAS.architecture).toBeDefined();
  });

  it('does not have schemas for all roles (graceful fallback)', () => {
    expect(EXPERT_OUTPUT_SCHEMAS.documentation).toBeUndefined();
    expect(EXPERT_OUTPUT_SCHEMAS.testing).toBeUndefined();
    expect(EXPERT_OUTPUT_SCHEMAS.devops).toBeUndefined();
  });
});

describe('tryParseStructuredOutput', () => {
  it('parses JSON wrapped in markdown code block', () => {
    const output = `Here is my analysis:

\`\`\`json
{
  "findings": [],
  "summary": "No issues",
  "reasoning": "Clean code"
}
\`\`\`

That concludes my review.`;

    const result = tryParseStructuredOutput('security', output);
    expect(result.structured).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.schemaName).toBe('security');
  });

  it('returns raw text for roles without schemas', () => {
    const result = tryParseStructuredOutput('documentation', 'Some documentation review');
    expect(result.structured).toBe(false);
    expect(result.rawText).toBe('Some documentation review');
    expect(result.schemaName).toBeUndefined();
  });

  it('returns raw text when no JSON found', () => {
    const result = tryParseStructuredOutput('security', 'Just plain text analysis');
    expect(result.structured).toBe(false);
    expect(result.rawText).toBe('Just plain text analysis');
    expect(result.schemaName).toBe('security');
  });

  it('returns parse error when JSON is invalid', () => {
    const output = '```json\n{"not": "matching schema"}\n```';
    const result = tryParseStructuredOutput('security', output);
    expect(result.structured).toBe(false);
    expect(result.parseError).toContain('Schema validation failed');
  });

  it('returns parse error for malformed JSON', () => {
    const output = '```json\n{broken json}\n```';
    const result = tryParseStructuredOutput('security', output);
    expect(result.structured).toBe(false);
    expect(result.parseError).toBe('Invalid JSON in output');
  });

  it('handles bare JSON without code blocks', () => {
    const output = `{
  "items": [{"category": "suggestion", "severity": "low", "description": "Consider renaming", "suggestion": "Use camelCase"}],
  "summary": "Minor style issues",
  "reasoning": "Code is functional but naming could improve"
}`;
    const result = tryParseStructuredOutput('code', output);
    expect(result.structured).toBe(true);
  });

  it('preserves raw text even when structured parse succeeds', () => {
    const output = '```json\n{"findings":[],"summary":"ok","reasoning":"clean"}\n```';
    const result = tryParseStructuredOutput('security', output);
    expect(result.structured).toBe(true);
    expect(result.rawText).toBe(output);
  });
});
