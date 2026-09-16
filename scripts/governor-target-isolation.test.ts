/** Cross-checkout IO regressions for the stable governor dispatcher (#6369). */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runRatificationGate } from './check-governor-ratification.js';
import { ledgerEvidenceFromEnv } from './governor-ledger-report.js';
import { readAtBase, readAtHead } from './governance-stamp-exemption.js';

describe('governor target checkout isolation', () => {
  let targetDir: string;
  beforeEach(() => {
    targetDir = mkdtempSync(join(tmpdir(), 'governor-target-'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(targetDir, { recursive: true, force: true });
  });
  const owners = (pattern: string): string =>
    `# @governor-section-start\n/${pattern} @fixture-owner\n# @governor-section-end\n`;

  it('reads the governor set from the POLICY checkout, never from the target under review', () => {
    // A PR that narrows the governor section of its own CODEOWNERS must be
    // judged by the set it is narrowing (the base gate's), so the target's
    // CODEOWNERS is ignored for policy: only the policy dir's file changes the verdict.
    const env = { CHANGED_FILES: 'fixture-only.txt' };
    const policyDir = mkdtempSync(join(tmpdir(), 'governor-policy-'));
    try {
      writeFileSync(join(targetDir, 'CODEOWNERS'), owners('fixture-only.txt')); // head says: governor
      writeFileSync(join(policyDir, 'CODEOWNERS'), owners('another.txt')); // base says: not governor
      expect(runRatificationGate(env, targetDir, policyDir)).toBe(0);
      writeFileSync(join(targetDir, 'CODEOWNERS'), owners('another.txt')); // head narrows itself out
      writeFileSync(join(policyDir, 'CODEOWNERS'), owners('fixture-only.txt')); // base says: governor
      expect(runRatificationGate(env, targetDir, policyDir)).toBe(1);
    } finally {
      rmSync(policyDir, { recursive: true, force: true });
    }
  });

  it('names an empty target ledger and changes the verdict when its bytes change', () => {
    mkdirSync(join(targetDir, 'governance'));
    const path = 'governance/vote-records.jsonl';
    const env = { PR_NUMBER: '6369', PR_HEAD_SHA: 'a'.repeat(40) };
    writeFileSync(join(targetDir, path), '');
    expect(ledgerEvidenceFromEnv(env, path, targetDir)).toMatchObject({
      kind: 'no-record',
      recordCount: 0,
    });
    writeFileSync(join(targetDir, path), '{broken json\n');
    expect(ledgerEvidenceFromEnv(env, path, targetDir).kind).toBe('ledger-invalid');
  });

  it('resolves the workflow base-ledger path against target and detects changed base bytes', () => {
    const env = {
      PR_NUMBER: '6369',
      PR_HEAD_SHA: 'a'.repeat(40),
      RATIFICATION_BASE_LEDGER_PATH: 'base.jsonl',
    };
    writeFileSync(join(targetDir, 'head.jsonl'), '');
    writeFileSync(join(targetDir, 'base.jsonl'), '');
    expect(ledgerEvidenceFromEnv(env, 'head.jsonl', targetDir).kind).toBe('no-record');
    writeFileSync(join(targetDir, 'base.jsonl'), '{}\n');
    expect(ledgerEvidenceFromEnv(env, 'head.jsonl', targetDir).kind).toBe('ledger-rewritten');
  });

  it('reads head files and base git objects from the target repository', () => {
    const git = (...args: string[]): string =>
      execFileSync('git', args, {
        cwd: targetDir,
        encoding: 'utf8',
      }).trim();
    git('init', '-q');
    writeFileSync(join(targetDir, 'AGENTS.md'), 'target base');
    git('add', 'AGENTS.md');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-qm',
      'fixture base'
    );
    const base = git('rev-parse', 'HEAD');
    expect(readAtBase(base, targetDir)('AGENTS.md')).toBe('target base');
    expect(readAtHead('AGENTS.md', targetDir)).toBe('target base');
    writeFileSync(join(targetDir, 'AGENTS.md'), 'target head');
    expect(readAtHead('AGENTS.md', targetDir)).toBe('target head');
    git('add', 'AGENTS.md');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.test',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-qm',
      'fixture head'
    );
    expect(readAtBase(git('rev-parse', 'HEAD'), targetDir)('AGENTS.md')).toBe('target head');
  });
});
