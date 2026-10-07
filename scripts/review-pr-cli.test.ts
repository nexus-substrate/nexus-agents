/**
 * Tests for the CLI PR-review script's gemini seat (#4389).
 *
 * The standalone `gemini` CLI is EOL (exits 55, IneligibleTierError); the
 * gemini arm is served by `agy`. The script must spawn the binary the adapter
 * authority names, and — because agy exits 0 even when the run failed — must
 * take its verdict from the JSON `status` field, never from the exit code.
 *
 * @module scripts/review-pr-cli.test
 */

import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';

import { buildCLIInvocation, collectOutput, extractReviewText } from './review-pr-cli.js';
import { GEMINI_CLI_COMMAND } from '../packages/nexus-agents/src/cli-adapters/cli-error-envelope.js';

describe('buildCLIInvocation — gemini seat runs agy (#4389)', () => {
  it('spawns the adapter-authority binary, not the retired gemini CLI', () => {
    const inv = buildCLIInvocation('gemini', 'review this');
    expect(inv.cmd).toBe(GEMINI_CLI_COMMAND);
    expect(inv.cmd).not.toBe('gemini');
  });

  it('requests the JSON envelope and pipes the prompt on stdin, not argv', () => {
    const prompt = 'x'.repeat(200_000);
    const inv = buildCLIInvocation('gemini', prompt);
    expect(inv.args).toEqual(expect.arrayContaining(['--output-format', 'json']));
    expect(inv.args).not.toContain(prompt);
    expect(inv.stdin).toBe(prompt);
  });

  it('names the workspace explicitly (agy defaults to its stored project, #6254)', () => {
    const inv = buildCLIInvocation('gemini', 'p');
    const i = inv.args.indexOf('--add-dir');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(inv.args[i + 1]).toBe(process.cwd());
  });

  it('rejects an unknown model', () => {
    expect(() => buildCLIInvocation('bard', 'p')).toThrow(/Unknown model/);
  });
});

describe('extractReviewText — agy verdict comes from status, not exit code', () => {
  it('returns the response of a SUCCESS envelope', () => {
    const out = JSON.stringify({ status: 'SUCCESS', response: 'DECISION: APPROVE\n' });
    expect(extractReviewText('gemini', out)).toBe('DECISION: APPROVE\n');
  });

  it('throws on an ERROR envelope delivered with exit code 0', () => {
    const out = JSON.stringify({ status: 'ERROR', response: '', error: 'bad model slug' });
    expect(() => extractReviewText('gemini', out)).toThrow(/bad model slug/);
  });

  it('throws on output that is not an agy envelope at all', () => {
    expect(() => extractReviewText('gemini', 'not json')).toThrow(/agy/);
  });

  it('passes text-mode CLIs through unchanged', () => {
    expect(extractReviewText('claude', 'DECISION: COMMENT')).toBe('DECISION: COMMENT');
    expect(extractReviewText('codex', 'DECISION: COMMENT')).toBe('DECISION: COMMENT');
  });
});

describe('collectOutput — settles with the exit code', () => {
  // runCLIReview used to await collectOutput (which resolves on 'close') and
  // only then attach a second 'close' listener; the event had already fired, so
  // every review hung and the script exited without posting anything.
  it('resolves stdout, stderr and the exit code from one close event', async () => {
    const child = spawn(
      process.execPath,
      ['-e', 'process.stdout.write("out"); process.stderr.write("err"); process.exit(3)'],
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );
    child.stdin.end();
    await expect(collectOutput(child)).resolves.toEqual({ stdout: 'out', stderr: 'err', code: 3 });
  });
});
