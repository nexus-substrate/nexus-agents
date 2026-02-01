/**
 * nexus-agents/cli/hooks - Hook Router
 *
 * Parses stdin JSON and routes to appropriate handlers.
 *
 * @module cli/hooks/hook-router
 * (Source: Issue #411, #412 - Claude CLI Hook Integration)
 */

import {
  HookInputSchema,
  type HookInput,
  type HookResult,
  type SessionStartInput,
  type SessionEndInput,
  type PreToolUseInput,
  type PostToolUseInput,
  type StopInput,
  type SubagentStopInput,
  type UserPromptSubmitInput,
} from './hook-types.js';
import { exitError, exitSuccess } from './hook-output.js';
import { formatZodError } from '../../core/index.js';

// ============================================================================
// Handler Types
// ============================================================================

export interface HookHandlers {
  sessionStart?: (input: SessionStartInput) => Promise<HookResult>;
  sessionEnd?: (input: SessionEndInput) => Promise<HookResult>;
  preTool?: (input: PreToolUseInput) => Promise<HookResult>;
  postTool?: (input: PostToolUseInput) => Promise<HookResult>;
  stop?: (input: StopInput) => Promise<HookResult>;
  subagentStop?: (input: SubagentStopInput) => Promise<HookResult>;
  userPromptSubmit?: (input: UserPromptSubmitInput) => Promise<HookResult>;
}

// ============================================================================
// Stdin Reader
// ============================================================================

/**
 * Reads all data from stdin.
 */
export async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';

    process.stdin.setEncoding('utf8');

    process.stdin.on('readable', () => {
      let chunk: string | null;
      while ((chunk = process.stdin.read() as string | null) !== null) {
        data += chunk;
      }
    });

    process.stdin.on('end', () => {
      resolve(data);
    });

    process.stdin.on('error', (err) => {
      reject(err);
    });

    // Handle case where stdin is empty or not provided
    if (process.stdin.isTTY) {
      resolve('');
    }
  });
}

/**
 * Reads and parses stdin as JSON, with timeout.
 */
export async function readStdinWithTimeout(timeoutMs: number = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Stdin read timeout after ${String(timeoutMs)}ms`));
    }, timeoutMs);

    readStdin()
      .then((data) => {
        clearTimeout(timeout);
        resolve(data);
      })
      .catch((err: unknown) => {
        clearTimeout(timeout);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

// ============================================================================
// Input Parser
// ============================================================================

/**
 * Parses and validates hook input from stdin.
 */
export function parseHookInput(rawInput: string): HookResult | HookInput {
  if (!rawInput.trim()) {
    return exitError('No input received on stdin');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawInput);
  } catch {
    return exitError(`Invalid JSON input: ${rawInput.substring(0, 100)}`);
  }

  const result = HookInputSchema.safeParse(parsed);
  if (!result.success) {
    return exitError(`Invalid hook input: ${formatZodError(result.error)}`);
  }

  return result.data;
}

// ============================================================================
// Router
// ============================================================================

/** Maps hook event names to handler keys */
const EVENT_TO_HANDLER: Readonly<Record<string, keyof HookHandlers | undefined>> = {
  SessionStart: 'sessionStart',
  SessionEnd: 'sessionEnd',
  PreToolUse: 'preTool',
  PostToolUse: 'postTool',
  Stop: 'stop',
  SubagentStop: 'subagentStop',
  UserPromptSubmit: 'userPromptSubmit',
};

/**
 * Routes hook input to the appropriate handler.
 */
export async function routeHook(input: HookInput, handlers: HookHandlers): Promise<HookResult> {
  const handlerKey = EVENT_TO_HANDLER[input.hook_event_name];

  if (handlerKey === undefined) {
    // Event type not mapped (e.g., Notification, Setup)
    return exitSuccess();
  }

  const handler = handlers[handlerKey];
  if (handler === undefined) {
    // No handler registered for this event
    return exitSuccess();
  }

  // TypeScript needs help here due to discriminated union
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  return handler(input as any);
}

/**
 * Main entry point for hook processing.
 * Reads stdin, parses input, and routes to handlers.
 */
export async function processHook(handlers: HookHandlers): Promise<HookResult> {
  try {
    const rawInput = await readStdinWithTimeout();
    const parseResult = parseHookInput(rawInput);

    // Check if parse failed (returns HookResult with error)
    if ('exitCode' in parseResult) {
      return parseResult;
    }

    return await routeHook(parseResult, handlers);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return exitError(`Hook processing error: ${message}`);
  }
}

// ============================================================================
// CLI Argument Parser
// ============================================================================

export interface HookCliOptions {
  command: string;
  tool?: string;
  validate?: boolean;
  loadContext?: boolean;
  trackMetrics?: boolean;
  format?: boolean;
  checkTasks?: boolean;
  generateSummary?: boolean;
  exportMetrics?: boolean;
  source?: string;
  reason?: string;
}

/** Boolean flags that don't require a value */
const BOOLEAN_FLAGS: ReadonlyMap<string, keyof HookCliOptions> = new Map([
  ['--validate', 'validate'],
  ['--load-context', 'loadContext'],
  ['--track-metrics', 'trackMetrics'],
  ['--format', 'format'],
  ['--check-tasks', 'checkTasks'],
  ['--generate-summary', 'generateSummary'],
  ['--export-metrics', 'exportMetrics'],
]);

/** Value flags that require a following argument */
const VALUE_FLAGS: ReadonlyMap<string, keyof HookCliOptions> = new Map([
  ['--tool', 'tool'],
  ['--source', 'source'],
  ['--reason', 'reason'],
]);

/**
 * Parses hook CLI arguments.
 * Example: nexus-agents hooks pre-tool --tool Bash --validate
 */
export function parseHookArgs(args: string[]): HookCliOptions {
  const options: HookCliOptions = {
    command: args[0] ?? '',
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;

    // Check boolean flags
    const booleanKey = BOOLEAN_FLAGS.get(arg);
    if (booleanKey !== undefined) {
      setBooleanOption(options, booleanKey);
      continue;
    }

    // Check value flags
    const valueKey = VALUE_FLAGS.get(arg);
    const nextArg = args[i + 1];
    if (valueKey !== undefined && nextArg !== undefined && nextArg.length > 0) {
      setStringOption(options, valueKey, nextArg);
      i++;
    }
  }

  return options;
}

/** Sets a boolean option on HookCliOptions. */
function setBooleanOption(options: HookCliOptions, key: keyof HookCliOptions): void {
  switch (key) {
    case 'validate':
      options.validate = true;
      break;
    case 'loadContext':
      options.loadContext = true;
      break;
    case 'trackMetrics':
      options.trackMetrics = true;
      break;
    case 'format':
      options.format = true;
      break;
    case 'checkTasks':
      options.checkTasks = true;
      break;
    case 'generateSummary':
      options.generateSummary = true;
      break;
    case 'exportMetrics':
      options.exportMetrics = true;
      break;
  }
}

/** Sets a string option on HookCliOptions. */
function setStringOption(options: HookCliOptions, key: keyof HookCliOptions, value: string): void {
  switch (key) {
    case 'tool':
      options.tool = value;
      break;
    case 'source':
      options.source = value;
      break;
    case 'reason':
      options.reason = value;
      break;
  }
}
