/**
 * Tests for the #4140 large-diff budget packer (pure module).
 *
 * @module mcp/tools/pr-review-diff-budget.test
 */

import { describe, it, expect } from 'vitest';
import {
  SENSITIVE_PATH_PATTERNS,
  hasFileBoundaries,
  looksLikeUnifiedDiff,
  securityFirstPack,
  splitByFile,
  type DiffFile,
} from './pr-review-diff-budget.js';

/** Build a normal file diff segment with `bodyLines` added lines. */
function fileDiff(path: string, bodyLines: number): string {
  const lines = Array.from({ length: bodyLines }, (_, i) => `+line ${String(i)}`).join('\n');
  return (
    `diff --git a/${path} b/${path}\n` +
    `index 0000000..1111111 100644\n` +
    `--- a/${path}\n` +
    `+++ b/${path}\n` +
    `@@ -0,0 +1,${String(bodyLines)} @@\n` +
    `${lines}\n`
  );
}

function totalBytes(files: readonly DiffFile[]): number {
  return files.reduce((n, f) => n + f.bytes, 0);
}

describe('pr-review-diff-budget', () => {
  describe('splitByFile', () => {
    it('splits a multi-file diff into one segment per file, round-trip lossless', () => {
      const diff = fileDiff('src/a.ts', 3) + fileDiff('src/b.ts', 2) + fileDiff('src/c.ts', 4);
      const files = splitByFile(diff);
      expect(files).toHaveLength(3);
      expect(files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
      // Fragment safety: concatenating the segments in order reproduces the input
      // byte-for-byte — no file was corrupted, split mid-hunk, or dropped.
      expect(files.map((f) => f.text).join('')).toBe(diff);
      for (const f of files) expect(f.text.startsWith('diff --git ')).toBe(true);
    });

    it('extracts the destination path from a rename-only entry', () => {
      const diff =
        'diff --git a/old-name.ts b/new-name.ts\n' +
        'similarity index 100%\n' +
        'rename from old-name.ts\n' +
        'rename to new-name.ts\n';
      const files = splitByFile(diff);
      expect(files).toHaveLength(1);
      expect(files[0]?.path).toBe('new-name.ts');
      expect(files[0]?.text).toBe(diff);
    });

    it('keeps a Binary files differ entry whole', () => {
      const diff =
        'diff --git a/logo.png b/logo.png\n' +
        'index 1111111..2222222 100644\n' +
        'Binary files a/logo.png and b/logo.png differ\n';
      const files = splitByFile(diff);
      expect(files).toHaveLength(1);
      expect(files[0]?.path).toBe('logo.png');
      expect(files[0]?.text).toContain('Binary files');
    });

    it('preserves "\\ No newline at end of file" markers within a file segment', () => {
      const diff =
        'diff --git a/c.ts b/c.ts\n' +
        '--- a/c.ts\n' +
        '+++ b/c.ts\n' +
        '@@ -1 +1 @@\n' +
        '-a\n' +
        '\\ No newline at end of file\n' +
        '+b\n' +
        '\\ No newline at end of file\n';
      const files = splitByFile(diff);
      expect(files).toHaveLength(1);
      expect(files[0]?.text).toContain('\\ No newline at end of file');
      expect(files[0]?.text).toBe(diff);
    });

    it('mixed multi-file diff (normal + rename + binary + no-newline) round-trips whole', () => {
      const diff =
        fileDiff('src/normal.ts', 3) +
        'diff --git a/old.ts b/renamed.ts\nsimilarity index 100%\nrename from old.ts\nrename to renamed.ts\n' +
        'diff --git a/pic.png b/pic.png\nindex 111..222 100644\nBinary files a/pic.png and b/pic.png differ\n' +
        'diff --git a/tail.ts b/tail.ts\n--- a/tail.ts\n+++ b/tail.ts\n@@ -1 +1 @@\n-x\n\\ No newline at end of file\n+y\n';
      const files = splitByFile(diff);
      expect(files).toHaveLength(4);
      expect(files.map((f) => f.path)).toEqual([
        'src/normal.ts',
        'renamed.ts',
        'pic.png',
        'tail.ts',
      ]);
      expect(files.map((f) => f.text).join('')).toBe(diff);
    });

    it('handles content before the first header as a (preamble) segment', () => {
      const diff = 'commit abc\nAuthor: x\n\n' + fileDiff('a.ts', 2);
      const files = splitByFile(diff);
      expect(files).toHaveLength(2);
      expect(files[0]?.path).toBe('(preamble)');
      expect(files.map((f) => f.text).join('')).toBe(diff);
    });

    it('returns a single (unstructured) segment for a diff with no file header', () => {
      const files = splitByFile('some non-diff text\nwith lines\n');
      expect(files).toHaveLength(1);
      expect(files[0]?.path).toBe('(unstructured)');
    });

    it('returns [] for empty input', () => {
      expect(splitByFile('')).toEqual([]);
    });
  });

  describe('securityFirstPack', () => {
    it('reviews a sensitive-path file even when it is LAST in the diff (security-first)', () => {
      // auth file is the LAST file in original order; it must survive a tight budget.
      const diff =
        fileDiff('src/util.ts', 4) + fileDiff('README.md', 4) + fileDiff('src/auth-handler.ts', 4);
      const files = splitByFile(diff);
      const budget = totalBytes(files) - 1; // forces at least one drop
      const res = securityFirstPack(files, budget);

      expect(res.reviewedFiles).toContain('src/auth-handler.ts');
      expect(res.partial).toBe(true);
      expect(res.totalFiles).toBe(3);
      expect(res.droppedFiles.length).toBeGreaterThan(0);
      // packed contains the sensitive file's content.
      expect(res.packed).toContain('src/auth-handler.ts');
    });

    it('handles a real >50000-char diff with the sensitive file near the END', () => {
      // Two large filler files then a sensitive file — total > 50000, budget 50000.
      const filler = fileDiff('src/big-a.ts', 3000);
      const filler2 = fileDiff('src/big-b.ts', 3000);
      const sensitive = fileDiff('src/security-token.ts', 400);
      const diff = filler + filler2 + sensitive;
      expect(diff.length).toBeGreaterThan(50_000);

      const res = securityFirstPack(splitByFile(diff), 50_000);
      // Security-first ordering pulls the sensitive file ahead of the fillers, so it
      // is reviewed while a lower-priority filler is dropped.
      expect(res.reviewedFiles).toContain('src/security-token.ts');
      expect(res.partial).toBe(true);
      expect(res.reviewedFiles.length + res.droppedFiles.length).toBe(res.totalFiles);
    });

    it('non-partial when everything fits (partial:false, no drops)', () => {
      const diff = fileDiff('a.ts', 2) + fileDiff('b.ts', 2);
      const files = splitByFile(diff);
      const res = securityFirstPack(files, totalBytes(files));
      expect(res.partial).toBe(false);
      expect(res.droppedFiles).toEqual([]);
      expect(res.reviewedFiles).toEqual(['a.ts', 'b.ts']);
    });

    it('a single file larger than budget is included TRUNCATED and listed as partially-seen', () => {
      const diff = fileDiff('src/huge.ts', 500);
      const files = splitByFile(diff);
      const budget = 200; // far below the single file's size
      const res = securityFirstPack(files, budget);

      expect(res.reviewedFiles).toEqual(['src/huge.ts']);
      expect(res.droppedFiles).toContain('src/huge.ts'); // honest: partially seen
      expect(res.partial).toBe(true);
      expect(res.packed).toContain('TRUNCATED');
      expect(Buffer.byteLength(res.packed, 'utf-8')).toBeLessThanOrEqual(budget);
    });

    it('stable ordering: two sensitive files keep original relative order', () => {
      const diff =
        fileDiff('src/authz.ts', 2) + fileDiff('src/plain.ts', 2) + fileDiff('src/crypto.ts', 2);
      const files = splitByFile(diff);
      const res = securityFirstPack(files, totalBytes(files));
      // Both sensitive files come first, in their original relative order.
      expect(res.reviewedFiles).toEqual(['src/authz.ts', 'src/crypto.ts', 'src/plain.ts']);
    });

    it('SENSITIVE_PATH_PATTERNS is a documented substring list (no scored weights)', () => {
      expect(SENSITIVE_PATH_PATTERNS).toContain('auth');
      expect(SENSITIVE_PATH_PATTERNS).toContain('.env');
      expect(SENSITIVE_PATH_PATTERNS.every((p) => typeof p === 'string')).toBe(true);
    });
  });
});

// ============================================================================
// looksLikeUnifiedDiff (#4451)
// ============================================================================

describe('looksLikeUnifiedDiff', () => {
  it('accepts a git-style diff', () => {
    expect(looksLikeUnifiedDiff('diff --git a/x.ts b/x.ts\n+line\n')).toBe(true);
  });

  it('accepts a unified diff with no `diff --git` header', () => {
    // Output of `diff -u`, `svn diff`, or a plain patch file. The tool's own
    // fixture at pr-review-tool.test.ts:374 is this shape, so a
    // `diff --git`-only check would reject a legitimate diff.
    expect(looksLikeUnifiedDiff('--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-old\n+new')).toBe(true);
  });

  it('accepts a bare hunk header', () => {
    expect(looksLikeUnifiedDiff('@@ -1,3 +1,4 @@\n context\n+added\n')).toBe(true);
  });

  it('rejects prose', () => {
    // The actual #4451 payload shape: a English-language summary of a change,
    // which produced a `verified: true` governance record.
    const prose =
      'This PR deletes packages/nexus-agents/src/context/work-balancer.ts (388 lines), ' +
      'removes the barrel exports, and updates two test mocks. Verified: tsc clean.';
    expect(looksLikeUnifiedDiff(prose)).toBe(false);
  });

  it('rejects filler with no diff structure', () => {
    expect(looksLikeUnifiedDiff('a'.repeat(50_001))).toBe(false);
  });

  it('rejects the empty string', () => {
    expect(looksLikeUnifiedDiff('')).toBe(false);
  });

  it('rejects prose containing a lone dashed rule or section header', () => {
    // A bare `^--- ` is too weak on its own — changelogs and notes use dashed
    // rules routinely, and accepting them reopens the hole this gate closes.
    // A real unified diff always pairs `---` with `+++`.
    expect(looksLikeUnifiedDiff('Summary\n--- Section header ---\nWe deleted the balancer.')).toBe(
      false
    );
    expect(looksLikeUnifiedDiff('--- Release notes ---\nfixed a bug')).toBe(false);
    expect(looksLikeUnifiedDiff('Notes:\n+++ added thoughts\nnothing else')).toBe(false);
  });

  it('accepts the ---/+++ pair with no hunk header', () => {
    expect(looksLikeUnifiedDiff('--- a/foo.ts\n+++ b/foo.ts\n')).toBe(true);
  });

  it('accepts real git shapes that carry no hunk header', () => {
    // rename-only, binary, and mode-only diffs have no @@ hunk at all.
    expect(
      looksLikeUnifiedDiff(
        'diff --git a/o b/n\nsimilarity index 100%\nrename from o\nrename to n\n'
      )
    ).toBe(true);
    expect(
      looksLikeUnifiedDiff('diff --git a/i.png b/i.png\nBinary files a/i.png and b/i.png differ\n')
    ).toBe(true);
    expect(looksLikeUnifiedDiff('diff --git a/s b/s\nold mode 100644\nnew mode 100755\n')).toBe(
      true
    );
  });

  it('accepts CRLF line endings', () => {
    expect(looksLikeUnifiedDiff('diff --git a/x b/x\r\n@@ -1 +1 @@\r\n-a\r\n+b\r\n')).toBe(true);
  });

  it('accepts a hunk header carrying trailing context', () => {
    expect(looksLikeUnifiedDiff('@@ -1,3 +1,4 @@ function foo()\n ctx\n+add\n')).toBe(true);
  });

  it('rejects prose wearing a hunk header as a hat', () => {
    // A hunk header alone proves nothing: prepend one line to a paragraph and
    // the gate would otherwise pass, reproducing #4451 end to end. A real hunk
    // is always backed by +/- body lines.
    expect(looksLikeUnifiedDiff('@@ -1 +1 @@\nThis PR deletes work-balancer.ts (388 lines).')).toBe(
      false
    );
  });

  it('requires the marker at the start of a line, not merely present', () => {
    // Prose that merely mentions the tokens must not pass.
    expect(looksLikeUnifiedDiff('I ran diff --git and saw @@ markers in the output.')).toBe(false);
  });
});

describe('hasFileBoundaries (#4459)', () => {
  it('is true for a git diff whose segments are real files', () => {
    expect(hasFileBoundaries(fileDiff('src/a.ts', 2) + fileDiff('src/b.ts', 2))).toBe(true);
  });

  it('is true when a preamble precedes the first file header', () => {
    expect(hasFileBoundaries('From 1234 Mon Sep 17\n\n' + fileDiff('src/a.ts', 1))).toBe(true);
  });

  /**
   * The one genuinely non-derivable signal (#4459). `looksLikeUnifiedDiff`
   * deliberately ACCEPTS plain `diff -u` output, which carries no `diff --git`
   * headers — so a record can be bound to a real diff that `splitByFile` cannot
   * attribute to files. The consumer needs to know that.
   */
  it('is false for plain `diff -u` output that passes the unified-diff gate', () => {
    const plain = '--- a/x.ts\n+++ b/x.ts\n@@ -1 +1 @@\n-a\n+b\n';
    expect(looksLikeUnifiedDiff(plain)).toBe(true);
    expect(hasFileBoundaries(plain)).toBe(false);
  });

  it('is false for an empty diff', () => {
    expect(hasFileBoundaries('')).toBe(false);
  });

  it('agrees with the real split result, not a re-derivation', () => {
    const diff = fileDiff('src/a.ts', 1);
    expect(hasFileBoundaries(diff)).toBe(
      splitByFile(diff).every((f) => f.path !== '(unstructured)')
    );
  });
});
