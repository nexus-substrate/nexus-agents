/**
 * Tests for ast-rule-runner (#4249 child C — polyglot Python/Go QA/security
 * ast-grep rules).
 *
 * Red/Green per rule against `ast-rules/fixtures/{sample.py,sample.go}`:
 * every documented POSITIVE line produces a finding with the right ruleId +
 * line number, and every documented NEGATIVE (near-miss) produces none —
 * mirroring the #4243 lesson that a rule which "sort of" matches over-fires
 * on lookalikes. Also covers: fail-closed rule loading, the once-only
 * dynamic-language registration guard, the path-traversal guard, the
 * cap/overflow discipline (excess findings counted, never silently dropped),
 * and — the #4277 fail-open coverage gaps — that a truncated FILE scan is
 * surfaced (not silently partial) and that an unreadable / non-directory
 * scan root fails LOUD rather than returning an empty "clean" result.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ensurePolyglotLangs,
  loadRules,
  collectAstQaFindings,
  runAstQaRules,
  getBuiltInAstRulesPath,
  DEFAULT_AST_QA_LIMIT,
  MAX_AST_QA_LIMIT,
  MAX_FILES_SCANNED,
  type AstRuleFinding,
} from './ast-rule-runner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES_DIR = join(HERE, 'ast-rules');
const FIXTURES_DIR = join(HERE, 'ast-rules', 'fixtures');

function findingsFor(ruleId: string, findings: AstRuleFinding[]): AstRuleFinding[] {
  return findings.filter((f) => f.ruleId === ruleId);
}

/** Capture everything written to stderr (where the runner's warn logger goes by
 * default) so a warn can be asserted deterministically. Always `restore()`. */
function captureStderr(): { calls: string[]; restore: () => void } {
  const original = process.stderr.write.bind(process.stderr);
  const calls: string[] = [];
  process.stderr.write = (chunk: string | Uint8Array): boolean => {
    calls.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  };
  return {
    calls,
    restore: () => {
      process.stderr.write = original;
    },
  };
}

describe('ast-rule-runner (#4249 child C)', () => {
  describe('built-in rules dir resolution', () => {
    it('resolves to the checked-in ast-rules directory in dev', () => {
      expect(getBuiltInAstRulesPath()).toBe(RULES_DIR);
    });
  });

  describe('per-rule red/green against fixtures', () => {
    it('dangerous-eval-python: matches eval()/exec() positives, not evaluate()/executor() negatives', async () => {
      const findings = await runAstQaRules({ rulesDir: RULES_DIR, targetDir: FIXTURES_DIR });
      const hits = findingsFor('dangerous-eval-python', findings);
      const lines = hits.filter((h) => h.file.endsWith('sample.py')).map((h) => h.line);

      expect(lines).toContain(11); // eval(user_input)
      expect(lines).toContain(15); // exec(payload)
      expect(hits.every((h) => h.severity === 'error')).toBe(true);

      // Negatives: evaluate(x) at L31 and executor(y) at L35 must NOT match.
      expect(lines).not.toContain(31);
      expect(lines).not.toContain(35);
    });

    it('shell-injection-python: matches os.system()/shell=True positives, not the no-shell negative', async () => {
      const findings = await runAstQaRules({ rulesDir: RULES_DIR, targetDir: FIXTURES_DIR });
      const hits = findingsFor('shell-injection-python', findings);
      const lines = hits.filter((h) => h.file.endsWith('sample.py')).map((h) => h.line);

      expect(lines).toContain(21); // os.system(cmd)
      expect(lines).toContain(27); // subprocess.run(cmd, shell=True)

      // Negative: subprocess.run(cmd) (no shell=True) at L41 must NOT match.
      expect(lines).not.toContain(41);
    });

    it('command-exec-go: matches exec.Command() positive, not the local-helper/aliased negatives', async () => {
      const findings = await runAstQaRules({ rulesDir: RULES_DIR, targetDir: FIXTURES_DIR });
      const hits = findingsFor('command-exec-go', findings);
      const lines = hits.map((h) => h.line);

      expect(lines).toContain(13); // exec.Command("sh", "-c", input)
      expect(hits.every((h) => h.severity === 'warning')).toBe(true);

      // Negatives: local `Command(x)` helper (L18-19), bare call (L24), and
      // the `myexec.Command(...)` near-miss (L32) must NOT match.
      expect(lines).not.toContain(19);
      expect(lines).not.toContain(24);
      expect(lines).not.toContain(32);
    });
  });

  describe('loader fail-closed', () => {
    let scratchDir: string;

    afterEach(() => {
      if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
    });

    it('throws on malformed YAML — no partial run', async () => {
      scratchDir = mkdtempSync(join(process.cwd(), '.ast-qa-loader-test-'));
      writeFileSync(
        join(scratchDir, 'good.yml'),
        'id: ok\nlanguage: python\nseverity: error\nmessage: fine\nrule:\n  pattern: x\n'
      );
      writeFileSync(
        join(scratchDir, 'bad.yml'),
        'id: [unterminated\n  - this is not valid yaml: [[['
      );

      await expect(loadRules(scratchDir)).rejects.toThrow();
    });

    it('throws on an unknown `language` value — no partial run', async () => {
      scratchDir = mkdtempSync(join(process.cwd(), '.ast-qa-loader-test-'));
      writeFileSync(
        join(scratchDir, 'unknown-lang.yml'),
        'id: bad-lang\nlanguage: rust\nseverity: error\nmessage: nope\nrule:\n  pattern: x\n'
      );

      await expect(loadRules(scratchDir)).rejects.toThrow();
    });

    it('a single bad file fails the whole load even alongside valid ones', async () => {
      scratchDir = mkdtempSync(join(process.cwd(), '.ast-qa-loader-test-'));
      writeFileSync(
        join(scratchDir, 'a-good.yml'),
        'id: ok\nlanguage: python\nseverity: error\nmessage: fine\nrule:\n  pattern: x\n'
      );
      writeFileSync(
        join(scratchDir, 'z-bad.yml'),
        'severity: error\nmessage: missing id and language\n'
      );

      await expect(loadRules(scratchDir)).rejects.toThrow();
    });
  });

  describe('idempotent dynamic-language registration', () => {
    it('calling ensurePolyglotLangs twice in one process does not throw', () => {
      expect(() => {
        ensurePolyglotLangs();
        ensurePolyglotLangs();
      }).not.toThrow();
    });
  });

  describe('path-traversal guard', () => {
    it('rejects a targetDir outside the cwd subtree', async () => {
      await expect(runAstQaRules({ rulesDir: RULES_DIR, targetDir: '../..' })).rejects.toThrow(
        /Path traversal denied/
      );
    });
  });

  describe('cap/overflow discipline', () => {
    let scratchDir: string;

    afterEach(() => {
      if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
    });

    it('caps findings at `limit` and reports the true total — never silently drops', async () => {
      scratchDir = mkdtempSync(join(process.cwd(), '.ast-qa-overflow-test-'));
      const rulesSubdir = join(scratchDir, 'rules');
      mkdirSync(rulesSubdir);
      writeFileSync(
        join(rulesSubdir, 'eval.yml'),
        'id: dangerous-eval-python\nlanguage: python\nseverity: error\nmessage: msg\nrule:\n  pattern: eval($CODE)\n'
      );
      const many = Array.from({ length: 12 }, (_, i) => `eval(x${String(i)})`).join('\n');
      writeFileSync(join(scratchDir, 'many.py'), many);

      const result = await collectAstQaFindings({
        rulesDir: rulesSubdir,
        targetDir: scratchDir,
        limit: 5,
      });

      expect(result.total).toBe(12);
      expect(result.findings.length).toBe(5);
      expect(result.limit).toBe(5);
      // Findings cap was hit but the FILE cap was not — scan is still complete.
      expect(result.filesTruncated).toBe(false);
      expect(result.filesSkipped).toBe(0);
      expect(result.filesScanned).toBe(1);

      // The convenience wrapper returns only the capped array — same cap.
      const capped = await runAstQaRules({
        rulesDir: rulesSubdir,
        targetDir: scratchDir,
        limit: 5,
      });
      expect(capped.length).toBe(5);
    });

    it('defaults to DEFAULT_AST_QA_LIMIT when no limit is given', async () => {
      const findings = await runAstQaRules({ rulesDir: RULES_DIR, targetDir: FIXTURES_DIR });
      expect(findings.length).toBeLessThanOrEqual(DEFAULT_AST_QA_LIMIT);
    });

    it('clamps a non-positive limit up to 1 (never reports total>0 with zero findings)', async () => {
      scratchDir = mkdtempSync(join(process.cwd(), '.ast-qa-overflow-test-'));
      const rulesSubdir = join(scratchDir, 'rules');
      mkdirSync(rulesSubdir);
      writeFileSync(
        join(rulesSubdir, 'eval.yml'),
        'id: dangerous-eval-python\nlanguage: python\nseverity: error\nmessage: msg\nrule:\n  pattern: eval($CODE)\n'
      );
      writeFileSync(join(scratchDir, 'x.py'), 'eval(a)\neval(b)\n');

      const result = await collectAstQaFindings({
        rulesDir: rulesSubdir,
        targetDir: scratchDir,
        limit: 0,
      });
      // With a floor of 1, a positive total is always accompanied by >=1 finding.
      expect(result.total).toBe(2);
      expect(result.limit).toBe(1);
      expect(result.findings.length).toBe(1);
    });

    it('clamps a limit above MAX_AST_QA_LIMIT down to the ceiling', async () => {
      const result = await collectAstQaFindings({
        rulesDir: RULES_DIR,
        targetDir: FIXTURES_DIR,
        limit: MAX_AST_QA_LIMIT + 1000,
      });
      expect(result.limit).toBe(MAX_AST_QA_LIMIT);
    });
  });

  // ==========================================================================
  // #4277 fail-open coverage gaps
  // ==========================================================================

  describe('file-cap truncation is SURFACED (not silently partial) — #4277 gap 1', () => {
    let scratchDir: string;

    afterEach(() => {
      if (scratchDir) rmSync(scratchDir, { recursive: true, force: true });
    });

    it('reports filesTruncated/filesSkipped AND warns when discovered files exceed MAX_FILES_SCANNED', async () => {
      scratchDir = mkdtempSync(join(process.cwd(), '.ast-qa-filecap-test-'));
      const rulesSubdir = join(scratchDir, 'rules');
      const srcSubdir = join(scratchDir, 'src');
      mkdirSync(rulesSubdir);
      mkdirSync(srcSubdir);
      writeFileSync(
        join(rulesSubdir, 'eval.yml'),
        'id: dangerous-eval-python\nlanguage: python\nseverity: error\nmessage: msg\nrule:\n  pattern: eval($CODE)\n'
      );
      // One more polyglot file than the cap allows → exactly one must be dropped.
      const fileCount = MAX_FILES_SCANNED + 1;
      for (let i = 0; i < fileCount; i += 1) {
        writeFileSync(join(srcSubdir, `f${String(i)}.py`), '');
      }

      const spy = captureStderr();
      let result;
      try {
        result = await collectAstQaFindings({ rulesDir: rulesSubdir, targetDir: scratchDir });
      } finally {
        spy.restore();
      }

      // The gap: this used to be `.slice(0, MAX)` with NO signal. Now surfaced:
      expect(result.filesTruncated).toBe(true);
      expect(result.filesSkipped).toBe(1);
      expect(result.filesScanned).toBe(MAX_FILES_SCANNED);
      // ...and a warn is emitted so a log-only consumer also sees the partiality.
      const warned = spy.calls.join('');
      expect(warned).toContain('file cap');
      expect(warned).toMatch(/PARTIAL/);
    });
  });

  describe('unreadable / non-directory scan root fails LOUD — #4277 gap 2', () => {
    it('throws when targetDir is a FILE, not a directory (no empty "clean" result)', async () => {
      // A lone .py file within cwd: passes the traversal guard, then must be
      // rejected by the is-directory check rather than yielding {findings:[]}.
      const filePath = join('src', 'security', 'ast-rules', 'fixtures', 'sample.py');
      await expect(runAstQaRules({ rulesDir: RULES_DIR, targetDir: filePath })).rejects.toThrow(
        /must be a directory/
      );
    });

    it('throws when targetDir does not exist (no empty "clean" result)', async () => {
      await expect(
        runAstQaRules({ rulesDir: RULES_DIR, targetDir: 'no-such-dir-xyz-4277' })
      ).rejects.toThrow(/cannot read targetDir/);
    });

    it('WARNS (does not silently swallow) when a SUBDIRECTORY is unreadable mid-walk', async () => {
      // chmod is a no-op for root; skip there rather than assert a false negative.
      if (typeof process.getuid === 'function' && process.getuid() === 0) return;

      const scratchDir = mkdtempSync(join(process.cwd(), '.ast-qa-subdir-test-'));
      const badSub = join(scratchDir, 'locked');
      mkdirSync(badSub);
      writeFileSync(join(badSub, 'hidden.py'), 'eval(secret)\n');
      chmodSync(badSub, 0o000);

      const spy = captureStderr();
      let result;
      try {
        // Root itself is readable (stat + readdir succeed); the LOCKED subdir's
        // readdir fails and must produce a per-dir warn, not a silent skip.
        result = await collectAstQaFindings({ rulesDir: RULES_DIR, targetDir: scratchDir });
      } finally {
        spy.restore();
        chmodSync(badSub, 0o755); // re-open so rm can clean up
      }

      expect(spy.calls.join('')).toContain('skipped unreadable directory');
      // The hidden eval was NOT scanned, but the partiality was surfaced above.
      expect(result.findings).toEqual([]);
      rmSync(scratchDir, { recursive: true, force: true });
    });
  });
});
