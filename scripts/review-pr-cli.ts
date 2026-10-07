/**
 * How `pnpm review` spawns each CLI seat and reads its output (#4389).
 *
 * Split from review-pr.ts so the invocation and the agy verdict are testable
 * without running the review.
 *
 * @module scripts/review-pr-cli
 */

import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { GEMINI_CLI_COMMAND } from '../packages/nexus-agents/src/cli-adapters/cli-error-envelope.js';
import { AgyResponseParser } from '../packages/nexus-agents/src/cli-adapters/parsers/agy-parser.js';

/**
 * The `gemini` seat keeps its routing name but spawns the adapter's binary,
 * `agy` (#4346, #4389): the standalone gemini CLI is EOL and exits 55 on every
 * invocation. The binary comes from the same authority the adapter reads.
 */
export const MODEL_COMMANDS: Record<string, { cmd: string; args: string[] }> = {
  claude: { cmd: 'claude', args: ['-p', '--output-format', 'text'] },
  gemini: { cmd: GEMINI_CLI_COMMAND, args: ['--output-format', 'json'] },
  codex: { cmd: 'codex', args: ['exec'] },
};

const agyParser = new AgyResponseParser();

/**
 * Collect a child's output and settle once, on its single 'close' event, with
 * the exit code. A second 'close' listener attached after awaiting this would
 * never fire — which is how every review used to hang.
 */
export function collectOutput(
  child: ChildProcessWithoutNullStreams
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    child.on('close', (code: number | null) => {
      resolve({ stdout, stderr, code });
    });
  });
}

/** How to spawn one review seat: executable, argv, and the prompt on stdin when piped. */
export interface CLIInvocation {
  readonly cmd: string;
  readonly args: readonly string[];
  readonly stdin?: string;
}

/**
 * Build the spawn arguments for `model`. Prompts that can reach 100k chars go
 * on stdin, never argv. Claude and agy both read stdin in print mode; agy also
 * gets `--add-dir` because its workspace defaults to its stored project, not
 * the cwd (#6254).
 */
export function buildCLIInvocation(model: string, prompt: string): CLIInvocation {
  const config = MODEL_COMMANDS[model];
  if (config === undefined) {
    throw new Error(`Unknown model: ${model}`);
  }

  if (model === 'claude') {
    // Avoid shell interpolation entirely — pipe prompt via stdin instead of
    // building a shell-escaped echo command. The prior `replace(/"/g, '\\"')`
    // didn't escape backslashes (CodeQL js/incomplete-sanitization).
    return { cmd: config.cmd, args: config.args, stdin: prompt };
  }

  if (model === 'gemini') {
    return { cmd: config.cmd, args: [...config.args, '--add-dir', process.cwd()], stdin: prompt };
  }

  // codex
  return { cmd: config.cmd, args: [...config.args, prompt] };
}

/**
 * The review text from a seat's stdout. agy exits 0 even when the run failed,
 * so its verdict is the envelope's `status` field: anything but a SUCCESS
 * envelope throws rather than being posted as a review.
 */
export function extractReviewText(model: string, stdout: string): string {
  if (model !== 'gemini') return stdout;
  const response = agyParser.extractResponse(stdout);
  if (response !== null) return response;
  const detail = agyParser.extractErrorMessage(stdout) ?? 'output was not an agy JSON envelope';
  throw new Error(`${GEMINI_CLI_COMMAND} review failed: ${detail}`);
}
