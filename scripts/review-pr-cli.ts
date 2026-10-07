/**
 * How `pnpm review` spawns each CLI seat and reads its output (#4389).
 *
 * Split from review-pr.ts so the invocation and the agy verdict are testable
 * without running the review.
 *
 * @module scripts/review-pr-cli
 */

// Evaluate the package graph from its entry point first. The deep modules
// below sit on import cycles (cli-error-envelope -> ... -> cli-binary-on-path
// -> cli-error-envelope) that only initialise in the right order when entered
// through the package index; entered directly, `pnpm review` died with a TDZ
// ReferenceError before printing anything.
import '../packages/nexus-agents/src/index.js';
import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { GEMINI_CLI_COMMAND } from '../packages/nexus-agents/src/cli-adapters/cli-error-envelope.js';
import { AgyResponseParser } from '../packages/nexus-agents/src/cli-adapters/parsers/agy-parser.js';
import {
  DEFAULT_GEMINI_CLI_MODEL,
  agyPrintTimeoutArgs,
} from '../packages/nexus-agents/src/cli-adapters/adapters/agy-invocation.js';
import {
  estimateTaskComplexity,
  getTimeoutForTask,
} from '../packages/nexus-agents/src/cli-adapters/cli-timeout-profiles.js';
import { toAgyModelSlug } from '../packages/nexus-agents/src/config/agy-model-map.js';

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

/** Re-exported so review-pr.ts never enters the package graph below its index. */
export { GEMINI_CLI_COMMAND };

/**
 * Collect a child's output and settle once, on its single 'close' event, with
 * the exit code. A second 'close' listener attached after awaiting this would
 * never fire — which is how every review used to hang. A spawn failure
 * rejects. A stdin write error (EPIPE when the CLI exits without reading its
 * prompt) is recorded in stderr rather than crashing the script; the exit code
 * still decides the outcome.
 */
export function collectOutput(
  child: ChildProcessWithoutNullStreams
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    child.stdin.on('error', (error: Error) => {
      stderr += `[stdin] ${error.message}\n`;
    });
    child.on('error', reject);
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
    // Same model and print-mode wait the gemini adapter passes: without
    // --model agy may serve a non-Gemini model under a "gemini" label, and
    // without --print-timeout a stalled turn never ends (#6277).
    const budgetMs = getTimeoutForTask('gemini', estimateTaskComplexity(prompt));
    return {
      cmd: config.cmd,
      args: [
        ...config.args,
        '--model',
        toAgyModelSlug(DEFAULT_GEMINI_CLI_MODEL),
        ...agyPrintTimeoutArgs(budgetMs),
        '--add-dir',
        process.cwd(),
      ],
      stdin: prompt,
    };
  }

  // codex
  return { cmd: config.cmd, args: [...config.args, prompt] };
}

/**
 * The review text from a seat's stdout. agy exits 0 even when the run failed,
 * so its verdict is the envelope's `status` field: anything but a SUCCESS
 * envelope throws rather than being posted as a review. So does a SUCCESS
 * envelope with an empty response — agy's stall mode (#6277) — which would
 * otherwise be posted as "No issues found" and labelled cli-reviewed.
 */
export function extractReviewText(model: string, stdout: string): string {
  if (model !== 'gemini') return stdout;
  const response = agyParser.extractResponse(stdout);
  if (response !== null) {
    if (response.trim() === '') {
      throw new Error(
        `${GEMINI_CLI_COMMAND} review failed: SUCCESS envelope with an empty response`
      );
    }
    return response;
  }
  const detail = agyParser.extractErrorMessage(stdout) ?? 'output was not an agy JSON envelope';
  throw new Error(`${GEMINI_CLI_COMMAND} review failed: ${detail}`);
}

/** Spawn one review seat with its prompt piped to stdin when the CLI reads it there. */
export function spawnCLI(model: string, prompt: string): ChildProcessWithoutNullStreams {
  const { cmd, args, stdin } = buildCLIInvocation(model, prompt);
  const child = spawn(cmd, [...args], { stdio: ['pipe', 'pipe', 'pipe'] });
  if (stdin !== undefined) child.stdin.write(stdin);
  child.stdin.end();
  return child;
}

/**
 * Run one review seat to completion and return its review text. `spawnSeat`
 * is injectable so the settle path is tested against real children.
 */
export async function runCLIReview(
  model: string,
  prompt: string,
  spawnSeat: (model: string, prompt: string) => ChildProcessWithoutNullStreams = spawnCLI
): Promise<string> {
  const { stdout, stderr, code } = await collectOutput(spawnSeat(model, prompt));
  if (code !== 0) {
    throw new Error(`${model} exited with code ${String(code)}: ${stderr}`);
  }
  return extractReviewText(model, stdout);
}
