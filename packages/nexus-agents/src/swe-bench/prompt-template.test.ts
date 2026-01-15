/**
 * Tests for prompt-template.ts
 * (Source: Issue #257)
 */

import { describe, it, expect } from 'vitest';
import {
  SWE_BENCH_SYSTEM_PROMPT,
  createInstancePrompt,
  createRetryPrompt,
  extractPatch,
  validatePatchFormat,
  createSummaryPrompt,
  createExplorationPrompt,
} from './prompt-template.js';
import type { SWEBenchInstance } from './types.js';

describe('prompt-template', () => {
  const testInstance: SWEBenchInstance = {
    instance_id: 'django__django-11099',
    repo: 'django/django',
    base_commit: 'abc123',
    problem_statement: 'The QuerySet filter raises an error when using F() expressions.',
    created_at: '2023-01-01',
  };

  const testInstanceWithHints: SWEBenchInstance = {
    ...testInstance,
    hints_text: 'Look at the query compiler module.',
    version: '3.0',
  };

  describe('SWE_BENCH_SYSTEM_PROMPT', () => {
    it('contains key instructions', () => {
      expect(SWE_BENCH_SYSTEM_PROMPT).toContain('expert software engineer');
      expect(SWE_BENCH_SYSTEM_PROMPT).toContain('git patch');
      expect(SWE_BENCH_SYSTEM_PROMPT).toContain('minimal');
      expect(SWE_BENCH_SYSTEM_PROMPT).toContain('```diff');
    });
  });

  describe('createInstancePrompt', () => {
    it('includes repository and instance ID', () => {
      const prompt = createInstancePrompt(testInstance);

      expect(prompt).toContain('Repository: django/django');
      expect(prompt).toContain('Issue ID: django__django-11099');
    });

    it('includes problem statement', () => {
      const prompt = createInstancePrompt(testInstance);

      expect(prompt).toContain('Problem Statement');
      expect(prompt).toContain('QuerySet filter raises an error');
    });

    it('includes hints when provided', () => {
      const prompt = createInstancePrompt(testInstanceWithHints);

      expect(prompt).toContain('Hints');
      expect(prompt).toContain('query compiler module');
    });

    it('excludes hints section when not provided', () => {
      const prompt = createInstancePrompt(testInstance);

      expect(prompt).not.toContain('Hints');
    });

    it('includes version when provided', () => {
      const prompt = createInstancePrompt(testInstanceWithHints);

      expect(prompt).toContain('Version: 3.0');
    });
  });

  describe('createRetryPrompt', () => {
    it('includes error message', () => {
      const prompt = createRetryPrompt('Patch does not apply');

      expect(prompt).toContain('Previous Attempt Failed');
      expect(prompt).toContain('Patch does not apply');
    });

    it('includes previous patch when provided', () => {
      const previousPatch = 'diff --git a/test.py b/test.py';
      const prompt = createRetryPrompt('Tests failed', previousPatch);

      expect(prompt).toContain('Previous Patch');
      expect(prompt).toContain(previousPatch);
    });

    it('excludes previous patch section when not provided', () => {
      const prompt = createRetryPrompt('Error');

      expect(prompt).not.toContain('Previous Patch');
    });

    it('includes common issues list', () => {
      const prompt = createRetryPrompt('Error');

      expect(prompt).toContain('Common issues');
      expect(prompt).toContain('apply cleanly');
    });
  });

  describe('extractPatch', () => {
    it('extracts patch from diff code block', () => {
      const response = `
Here is my fix:

\`\`\`diff
diff --git a/django/db/models/query.py b/django/db/models/query.py
--- a/django/db/models/query.py
+++ b/django/db/models/query.py
@@ -1,3 +1,4 @@
+# Fix for issue
 class QuerySet:
     pass
\`\`\`
`;

      const patch = extractPatch(response);

      expect(patch).not.toBeNull();
      expect(patch).toContain('diff --git');
      expect(patch).toContain('# Fix for issue');
    });

    it('extracts patch from code block without language', () => {
      const response = `
\`\`\`
diff --git a/test.py b/test.py
--- a/test.py
+++ b/test.py
@@ -1 +1 @@
-old
+new
\`\`\`
`;

      const patch = extractPatch(response);

      expect(patch).not.toBeNull();
      expect(patch).toContain('diff --git');
    });

    it('extracts raw diff without code fence', () => {
      const response = `
Here is the fix:

diff --git a/file.py b/file.py
--- a/file.py
+++ b/file.py
@@ -1 +1 @@
-old
+new

Let me know if you have questions.
`;

      const patch = extractPatch(response);

      expect(patch).not.toBeNull();
      expect(patch).toContain('diff --git');
    });

    it('returns null when no patch found', () => {
      const response = 'I could not find a solution.';

      const patch = extractPatch(response);

      expect(patch).toBeNull();
    });
  });

  describe('validatePatchFormat', () => {
    const validPatch = `diff --git a/test.py b/test.py
--- a/test.py
+++ b/test.py
@@ -1,3 +1,4 @@
+# New line
 existing`;

    it('accepts valid patch', () => {
      const result = validatePatchFormat(validPatch);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects empty patch', () => {
      const result = validatePatchFormat('');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Empty patch');
    });

    it('rejects patch without diff --git header', () => {
      const result = validatePatchFormat('--- a/test.py');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('diff --git');
    });

    it('rejects patch without --- header', () => {
      const patch = `diff --git a/test.py b/test.py
+++ b/test.py
@@ -1 +1 @@
-old`;

      const result = validatePatchFormat(patch);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('--- a/');
    });

    it('rejects patch without +++ header', () => {
      const patch = `diff --git a/test.py b/test.py
--- a/test.py
@@ -1 +1 @@
-old`;

      const result = validatePatchFormat(patch);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('+++ b/');
    });

    it('rejects patch without hunk header', () => {
      const patch = `diff --git a/test.py b/test.py
--- a/test.py
+++ b/test.py
-old
+new`;

      const result = validatePatchFormat(patch);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('@@');
    });
  });

  describe('createSummaryPrompt', () => {
    it('includes instance details', () => {
      const prompt = createSummaryPrompt(testInstance, 'diff --git a/test.py', 2);

      expect(prompt).toContain('Instance: django__django-11099');
      expect(prompt).toContain('Repository: django/django');
      expect(prompt).toContain('Iterations: 2');
    });

    it('includes patch in code block', () => {
      const patch = 'diff --git a/test.py b/test.py';
      const prompt = createSummaryPrompt(testInstance, patch, 1);

      expect(prompt).toContain('```diff');
      expect(prompt).toContain(patch);
      expect(prompt).toContain('```');
    });
  });

  describe('createExplorationPrompt', () => {
    it('includes repository name', () => {
      const prompt = createExplorationPrompt(testInstance);

      expect(prompt).toContain('Repository: django/django');
    });

    it('includes exploration steps', () => {
      const prompt = createExplorationPrompt(testInstance);

      expect(prompt).toContain('exploration steps');
      expect(prompt).toContain('Find files');
      expect(prompt).toContain('test files');
      expect(prompt).toContain('function/class definitions');
    });
  });
});
