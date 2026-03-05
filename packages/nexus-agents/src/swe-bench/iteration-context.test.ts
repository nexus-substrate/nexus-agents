/**
 * Tests for cross-iteration context (Issue #1417).
 */

import { describe, it, expect } from 'vitest';
import {
  createEmptyContext,
  extractFilesFromResponse,
  extractHypothesis,
  extractApproach,
  updateContext,
  formatContextForPrompt,
} from './iteration-context.js';

describe('createEmptyContext', () => {
  it('returns correct empty shape', () => {
    const ctx = createEmptyContext();
    expect(ctx.filesExplored).toEqual([]);
    expect(ctx.rootCauseHypothesis).toBeNull();
    expect(ctx.approachHistory).toEqual([]);
  });
});

describe('extractFilesFromResponse', () => {
  it('finds paths in backticks', () => {
    const response =
      'I read `src/core/utils.ts` and `src/config/model.ts` to understand the issue.';
    const files = extractFilesFromResponse(response);
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.path)).toContain('src/core/utils.ts');
    expect(files.map((f) => f.path)).toContain('src/config/model.ts');
  });

  it('finds paths after reading keyword', () => {
    const response = 'reading src/helpers/format.ts showed the formatting logic';
    const files = extractFilesFromResponse(response);
    expect(files.some((f) => f.path === 'src/helpers/format.ts')).toBe(true);
  });

  it('finds standalone src/ paths', () => {
    const response = 'The relevant file is src/utils/parser.py in the repository.';
    const files = extractFilesFromResponse(response);
    expect(files.some((f) => f.path === 'src/utils/parser.py')).toBe(true);
  });

  it('deduplicates paths', () => {
    const response = 'I read `src/core/utils.ts` and then read `src/core/utils.ts` again.';
    const files = extractFilesFromResponse(response);
    const utilsPaths = files.filter((f) => f.path === 'src/core/utils.ts');
    expect(utilsPaths).toHaveLength(1);
  });

  it('returns empty for no paths', () => {
    const response = 'This is a plain text response with no file references.';
    const files = extractFilesFromResponse(response);
    expect(files).toEqual([]);
  });

  it('assigns high relevance for fix-related context', () => {
    const response = 'The root cause bug is in `src/core/parser.ts` which needs a fix.';
    const files = extractFilesFromResponse(response);
    const parser = files.find((f) => f.path === 'src/core/parser.ts');
    expect(parser?.relevance).toBe('high');
  });

  it('assigns medium relevance for related context', () => {
    const response = 'The file `src/config/defaults.ts` is relevant to the problem.';
    const files = extractFilesFromResponse(response);
    const defaults = files.find((f) => f.path === 'src/config/defaults.ts');
    expect(defaults?.relevance).toBe('medium');
  });
});

describe('extractHypothesis', () => {
  it('finds "the root cause is..." sentences', () => {
    const response =
      'After analysis, the root cause is a missing null check in the parser function.';
    const hypothesis = extractHypothesis(response);
    expect(hypothesis).toBe('a missing null check in the parser function');
  });

  it('finds "the issue is..." sentences', () => {
    const response =
      'Looking at the code, the issue is incorrect handling of edge cases in the validator.';
    const hypothesis = extractHypothesis(response);
    expect(hypothesis).toContain('incorrect handling');
  });

  it('finds "this happens because" sentences', () => {
    const response =
      'this happens because the default config is not applied before validation runs.';
    const hypothesis = extractHypothesis(response);
    expect(hypothesis).toContain('the default config');
  });

  it('returns null when no hypothesis', () => {
    const response = 'Here is the patch to fix the issue:\n```diff\n...\n```';
    const hypothesis = extractHypothesis(response);
    expect(hypothesis).toBeNull();
  });

  it('truncates to 200 chars', () => {
    const longCause = 'a'.repeat(250);
    const response = `the root cause is ${longCause}.`;
    const hypothesis = extractHypothesis(response);
    expect(hypothesis).not.toBeNull();
    expect(hypothesis?.length ?? 0).toBeLessThanOrEqual(200);
  });
});

describe('extractApproach', () => {
  it('returns no_patch when hadPatch is false', () => {
    const record = extractApproach('Some response text from the agent', 1, false, false);
    expect(record.outcome).toBe('no_patch');
    expect(record.iteration).toBe(1);
    expect(record.errorSummary).toBeDefined();
  });

  it('returns patch_rejected when patch did not apply', () => {
    const record = extractApproach('I generated a patch', 2, true, false);
    expect(record.outcome).toBe('patch_rejected');
    expect(record.errorSummary).toContain('patch_rejected');
  });

  it('returns success when patch applied', () => {
    const record = extractApproach('Applied the fix successfully', 3, true, true);
    expect(record.outcome).toBe('success');
    expect(record.errorSummary).toBeUndefined();
  });

  it('summarizes approach from response text', () => {
    const response =
      'After careful analysis of the codebase and the error trace, I modified the parser.';
    const record = extractApproach(response, 1, true, true);
    expect(record.approach.length).toBeGreaterThan(0);
    expect(record.approach.length).toBeLessThanOrEqual(120);
  });
});

describe('updateContext', () => {
  it('merges files without duplicates', () => {
    const prev = createEmptyContext();
    const ctx1 = updateContext(prev, 'I read `src/core/utils.ts` for the fix.', 1, false, false);
    const ctx2 = updateContext(
      ctx1,
      'I read `src/core/utils.ts` and `src/core/parser.ts`.',
      2,
      true,
      false
    );
    const paths = ctx2.filesExplored.map((f) => f.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain('src/core/utils.ts');
    expect(paths).toContain('src/core/parser.ts');
  });

  it('limits approach history to 5', () => {
    let ctx = createEmptyContext();
    for (let i = 1; i <= 7; i++) {
      ctx = updateContext(
        ctx,
        `Attempt ${i.toString()} with some long enough text to summarize.`,
        i,
        true,
        false
      );
    }
    expect(ctx.approachHistory).toHaveLength(5);
    expect(ctx.approachHistory[0].iteration).toBe(3);
    expect(ctx.approachHistory[4].iteration).toBe(7);
  });

  it('updates hypothesis with latest', () => {
    let ctx = createEmptyContext();
    ctx = updateContext(
      ctx,
      'the root cause is a missing import statement in the module.',
      1,
      false,
      false
    );
    expect(ctx.rootCauseHypothesis).toContain('missing import');
    ctx = updateContext(
      ctx,
      'the issue is actually a type mismatch in the conversion function.',
      2,
      true,
      false
    );
    expect(ctx.rootCauseHypothesis).toContain('type mismatch');
  });

  it('preserves previous hypothesis when new response has none', () => {
    let ctx = createEmptyContext();
    ctx = updateContext(
      ctx,
      'the root cause is a missing null check in the parser.',
      1,
      false,
      false
    );
    ctx = updateContext(ctx, 'Here is my patch:\n```diff\n...\n```', 2, true, true);
    expect(ctx.rootCauseHypothesis).toContain('missing null check');
  });
});

describe('formatContextForPrompt', () => {
  it('includes files, hypothesis, and approaches', () => {
    let ctx = createEmptyContext();
    ctx = updateContext(
      ctx,
      'the root cause is a missing null check. I read `src/core/parser.ts` for the fix.',
      1,
      false,
      false
    );
    const formatted = formatContextForPrompt(ctx);
    expect(formatted).toContain('Root cause hypothesis');
    expect(formatted).toContain('src/core/parser.ts');
    expect(formatted).toContain('Previous approaches');
  });

  it('respects maxChars limit', () => {
    let ctx = createEmptyContext();
    for (let i = 1; i <= 5; i++) {
      ctx = updateContext(
        ctx,
        `the root cause is a very complex issue. Reading src/module${i.toString()}/handler.ts showed important details.`,
        i,
        true,
        false
      );
    }
    const formatted = formatContextForPrompt(ctx, 100);
    expect(formatted.length).toBeLessThanOrEqual(100);
    expect(formatted.endsWith('...')).toBe(true);
  });

  it('returns empty string for empty context', () => {
    const ctx = createEmptyContext();
    const formatted = formatContextForPrompt(ctx);
    expect(formatted).toBe('');
  });

  it('handles response with only code blocks', () => {
    const response = '```python\ndef fix():\n    return True\n```';
    const files = extractFilesFromResponse(response);
    expect(files).toEqual([]);
    const ctx = updateContext(createEmptyContext(), response, 1, true, true);
    expect(ctx.approachHistory).toHaveLength(1);
    expect(ctx.approachHistory[0].approach).toBe('Unstructured response');
  });
});
