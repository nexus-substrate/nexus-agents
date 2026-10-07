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
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

import {
  buildCLIInvocation,
  collectOutput,
  extractReviewText,
  runCLIReview,
} from './review-pr-cli.js';
import { GEMINI_CLI_COMMAND } from '../packages/nexus-agents/src/cli-adapters/cli-error-envelope.js';
import {
  DEFAULT_GEMINI_CLI_MODEL,
  agyPrintTimeoutArgs,
} from '../packages/nexus-agents/src/cli-adapters/adapters/agy-invocation.js';
import { toAgyModelSlug } from '../packages/nexus-agents/src/config/agy-model-map.js';
import {
  estimateTaskComplexity,
  getTimeoutForTask,
} from '../packages/nexus-agents/src/cli-adapters/cli-timeout-profiles.js';

/** A real child running `script` under this Node binary — no agent CLI is spawned. */
function nodeChild(script: string): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, ['-e', script], { stdio: ['pipe', 'pipe', 'pipe'] });
}

function flagValue(args: readonly string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

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

  it('pins the same agy model slug the production adapter uses by default', () => {
    const inv = buildCLIInvocation('gemini', 'p');
    expect(flagValue(inv.args, '--model')).toBe(toAgyModelSlug(DEFAULT_GEMINI_CLI_MODEL));
  });

  it("bounds agy's print-mode wait with the adapter's own timeout helper", () => {
    const prompt = 'review this diff';
    const inv = buildCLIInvocation('gemini', prompt);
    const budget = getTimeoutForTask('gemini', estimateTaskComplexity(prompt));
    const [, expected] = agyPrintTimeoutArgs(budget);
    expect(expected).toMatch(/^\d+s$/);
    expect(flagValue(inv.args, '--print-timeout')).toBe(expected);
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

  it('throws on an empty SUCCESS envelope (agy stall mode, #6277)', () => {
    const out = JSON.stringify({ status: 'SUCCESS', response: '' });
    expect(() => extractReviewText('gemini', out)).toThrow(/empty/);
    const ws = JSON.stringify({ status: 'SUCCESS', response: '  \n ' });
    expect(() => extractReviewText('gemini', ws)).toThrow(/empty/);
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

describe('collectOutput — child and stdin errors', () => {
  it('survives EPIPE when the child exits without reading its stdin', async () => {
    const child = nodeChild('process.exit(0)');
    child.stdin.write('x'.repeat(8 * 1024 * 1024));
    child.stdin.end();
    await expect(collectOutput(child)).resolves.toMatchObject({ code: 0 });
  });

  it('rejects when the child cannot be spawned at all', async () => {
    const child = spawn('/nonexistent/review-pr-cli-binary', [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    await expect(collectOutput(child)).rejects.toThrow(/ENOENT/);
  }, 5_000);
});

describe('runCLIReview — settles on real children (hang regression)', () => {
  it('resolves the output of a child that exits 0', async () => {
    const review = runCLIReview('claude', 'p', () =>
      nodeChild('process.stdout.write("DECISION: APPROVE")')
    );
    await expect(review).resolves.toBe('DECISION: APPROVE');
  }, 5_000);

  it('rejects with stderr for a child that exits 1', async () => {
    const review = runCLIReview('claude', 'p', () =>
      nodeChild('process.stderr.write("boom"); process.exit(1)')
    );
    await expect(review).rejects.toThrow(/exited with code 1: boom/);
  }, 5_000);

  it('rejects an agy seat that exits 0 with an empty SUCCESS envelope', async () => {
    const env = JSON.stringify({ status: 'SUCCESS', response: '' });
    const review = runCLIReview('gemini', 'p', () =>
      nodeChild(`process.stdout.write(${JSON.stringify(env)})`)
    );
    await expect(review).rejects.toThrow(/empty/);
  }, 5_000);
});

describe('pnpm review loads as a script', () => {
  // vitest resolves the package's import cycles in a different order than a
  // plain `tsx` entry does; importing cli-error-envelope.ts first made the
  // real script die with a TDZ ReferenceError before printing anything.
  it('reaches its usage text instead of crashing at module load', () => {
    const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/review-pr.ts'], {
      encoding: 'utf-8',
      timeout: 60_000,
    });
    expect(run.stderr).not.toMatch(/ReferenceError|before initialization/);
    expect(run.stdout).toContain('Usage: pnpm review');
    expect(run.status).toBe(1);
  }, 90_000);
});
