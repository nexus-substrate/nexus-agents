/**
 * Tests for ast-rule-runner (#4249 child C — polyglot Python/Go QA/security
 * ast-grep rules).
 *
 * Red/Green per rule against `ast-rules/fixtures/{sample.py,sample.go}`:
 * every documented POSITIVE line produces a finding with the right ruleId +
 * line number, and every documented NEGATIVE (near-miss) produces none —
 * mirroring the #4243 lesson that a rule which "sort of" matches over-fires
 * on lookalikes. Also covers: fail-closed rule loading, the once-only
 * dynamic-language registration guard, the path-traversal guard, and the
 * cap/overflow discipline (excess findings counted, never silently dropped).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ensurePolyglotLangs,
  loadRules,
  collectAstQaFindings,
  runAstQaRules,
  getBuiltInAstRulesPath,
  DEFAULT_AST_QA_LIMIT,
  type AstRuleFinding,
} from './ast-rule-runner.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const RULES_DIR = join(HERE, 'ast-rules');
const FIXTURES_DIR = join(HERE, 'ast-rules', 'fixtures');

function findingsFor(ruleId: string, findings: AstRuleFinding[]): AstRuleFinding[] {
  return findings.filter((f) => f.ruleId === ruleId);
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
  });
});
