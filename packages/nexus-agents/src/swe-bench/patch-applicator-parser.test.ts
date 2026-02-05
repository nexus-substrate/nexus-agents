/**
 * Tests for patch-applicator-parser.ts
 *
 * Covers patch format detection, hunk counting, file extraction,
 * quality checks, and full patch validation.
 */

import { describe, it, expect } from 'vitest';
import {
  detectPatchFormat,
  countPatchHunks,
  isLargeHunk,
  extractAffectedFiles,
  checkPatchQuality,
  parsePatch,
  PATCH_PATTERNS,
} from './patch-applicator-parser.js';

// ============================================================================
// Sample patches
// ============================================================================

const GIT_PATCH = `diff --git a/src/main.ts b/src/main.ts
index abc1234..def5678 100644
--- a/src/main.ts
+++ b/src/main.ts
@@ -10,3 +10,4 @@ function hello() {
   console.log('hello');
+  console.log('world');
 }`;

const UNIFIED_PATCH = `--- a/src/lib.ts
+++ b/src/lib.ts
@@ -5,2 +5,3 @@ export function add(a, b) {
   return a + b;
+  // validated
 }`;

// ============================================================================
// detectPatchFormat
// ============================================================================

describe('detectPatchFormat', () => {
  it('detects git diff format', () => {
    expect(detectPatchFormat(GIT_PATCH)).toBe('git');
  });

  it('detects unified diff format', () => {
    expect(detectPatchFormat(UNIFIED_PATCH)).toBe('unified');
  });

  it('detects context diff format when no unified header present', () => {
    // Context format with *** header but no --- line that looks unified
    const pureContext = `*** src/old.ts	2024-01-01
***************
*** 1,3 ****
  line1
! line2`;
    expect(detectPatchFormat(pureContext)).toBe('context');
  });

  it('returns unknown for unrecognized format', () => {
    expect(detectPatchFormat('just some text')).toBe('unknown');
  });

  it('returns unknown for empty string', () => {
    expect(detectPatchFormat('')).toBe('unknown');
  });
});

// ============================================================================
// countPatchHunks
// ============================================================================

describe('countPatchHunks', () => {
  it('counts single hunk', () => {
    expect(countPatchHunks(GIT_PATCH)).toBe(1);
  });

  it('counts multiple hunks', () => {
    const multiHunk = `@@ -1,5 +1,6 @@
 line1
+line2
@@ -20,3 +21,4 @@
 line20
+line21`;
    expect(countPatchHunks(multiHunk)).toBe(2);
  });

  it('returns 0 for no hunks', () => {
    expect(countPatchHunks('no hunks here')).toBe(0);
  });
});

// ============================================================================
// isLargeHunk
// ============================================================================

describe('isLargeHunk', () => {
  it('returns false for small hunks', () => {
    expect(isLargeHunk('@@ -1,10 +1,15 @@')).toBe(false);
  });

  it('returns true when old lines > 100', () => {
    expect(isLargeHunk('@@ -1,150 +1,10 @@')).toBe(true);
  });

  it('returns true when new lines > 100', () => {
    expect(isLargeHunk('@@ -1,10 +1,200 @@')).toBe(true);
  });

  it('returns false for exactly 100 lines', () => {
    expect(isLargeHunk('@@ -1,100 +1,100 @@')).toBe(false);
  });

  it('defaults to 1 line when count is omitted', () => {
    expect(isLargeHunk('@@ -1 +1 @@')).toBe(false);
  });

  it('returns false for invalid header', () => {
    expect(isLargeHunk('not a hunk header')).toBe(false);
  });
});

// ============================================================================
// extractAffectedFiles
// ============================================================================

describe('extractAffectedFiles', () => {
  it('extracts files from git diff', () => {
    const files = extractAffectedFiles(GIT_PATCH, 'git');
    expect(files).toContain('src/main.ts');
  });

  it('extracts files from unified diff', () => {
    const files = extractAffectedFiles(UNIFIED_PATCH, 'unified');
    expect(files).toContain('src/lib.ts');
  });

  it('returns empty for unknown format with no headers', () => {
    const files = extractAffectedFiles('just text', 'unknown');
    expect(files).toHaveLength(0);
  });

  it('deduplicates file paths', () => {
    const files = extractAffectedFiles(GIT_PATCH, 'git');
    const unique = new Set(files);
    expect(files.length).toBe(unique.size);
  });

  it('excludes /dev/null', () => {
    const newFile = `--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,5 @@
+new content`;
    const files = extractAffectedFiles(newFile, 'unified');
    expect(files).not.toContain('/dev/null');
  });
});

// ============================================================================
// checkPatchQuality
// ============================================================================

describe('checkPatchQuality', () => {
  it('returns empty warnings for clean patch', () => {
    const warnings = checkPatchQuality(GIT_PATCH);
    expect(warnings).toHaveLength(0);
  });

  it('warns about Windows line endings', () => {
    const warnings = checkPatchQuality('line1\r\nline2\r\n');
    expect(warnings.some((w) => w.includes('CRLF'))).toBe(true);
  });

  it('warns about missing trailing newline', () => {
    const warnings = checkPatchQuality('content\n\\ No newline at end of file');
    expect(warnings.some((w) => w.includes('trailing newline'))).toBe(true);
  });

  it('warns about large hunks', () => {
    const patch = '@@ -1,200 +1,200 @@\n+big change';
    const warnings = checkPatchQuality(patch);
    expect(warnings.some((w) => w.includes('large hunk'))).toBe(true);
  });
});

// ============================================================================
// parsePatch
// ============================================================================

describe('parsePatch', () => {
  it('validates a well-formed git patch', () => {
    const result = parsePatch(GIT_PATCH);
    expect(result.valid).toBe(true);
    expect(result.format).toBe('git');
    expect(result.hunkCount).toBe(1);
    expect(result.affectedFiles.length).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);
  });

  it('returns invalid for empty patch', () => {
    const result = parsePatch('');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Patch is empty');
  });

  it('returns invalid for whitespace-only patch', () => {
    const result = parsePatch('   \n  \n  ');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Patch is empty');
  });

  it('flags unrecognized format', () => {
    const result = parsePatch('some random text with no diff headers');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Unrecognized'))).toBe(true);
  });

  it('includes warnings in result', () => {
    const patchWithCrlf = GIT_PATCH.replace('\n', '\r\n');
    const result = parsePatch(patchWithCrlf);
    expect(result.warnings.some((w) => w.includes('CRLF'))).toBe(true);
  });

  it('warns when no affected files found', () => {
    // A patch with hunks but no file path headers
    const patch = '@@ -1,3 +1,4 @@\n line1\n+line2\n line3';
    const result = parsePatch(patch);
    expect(result.warnings.some((w) => w.includes('affected files'))).toBe(true);
  });
});

// ============================================================================
// PATCH_PATTERNS
// ============================================================================

describe('PATCH_PATTERNS', () => {
  it('has all expected pattern keys', () => {
    expect(PATCH_PATTERNS.unifiedHeader).toBeInstanceOf(RegExp);
    expect(PATCH_PATTERNS.gitHeader).toBeInstanceOf(RegExp);
    expect(PATCH_PATTERNS.contextHeader).toBeInstanceOf(RegExp);
    expect(PATCH_PATTERNS.hunkHeader).toBeInstanceOf(RegExp);
    expect(PATCH_PATTERNS.filePathUnified).toBeInstanceOf(RegExp);
    expect(PATCH_PATTERNS.filePathGit).toBeInstanceOf(RegExp);
  });
});
