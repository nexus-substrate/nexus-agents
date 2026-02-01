/**
 * nexus-agents/cli/hooks/handlers - Post-Tool Handler
 *
 * Handles PostToolUse hook events by tracking metrics
 * via OrchestrationObserver integration.
 *
 * @module cli/hooks/handlers/post-tool
 * (Source: Issue #414 - Hook handlers for tool lifecycle)
 */

import type { PostToolUseInput, HookResult } from '../hook-types.js';
import { exitSuccess, postToolContext } from '../hook-output.js';
import { SQLiteSessionStorage } from '../../session-storage.js';
import { TaskStatus } from '../../session-storage-types.js';
import { createLogger, getErrorMessage } from '../../../core/index.js';
import {
  getDbPathFromEnv,
  isFeatureDisabled,
  HookEnvVars,
  safeString,
  safeNumber,
} from './handler-utils.js';

const logger = createLogger({ component: 'PostToolHandler' });

/**
 * Configuration for post-tool handler.
 */
export interface PostToolHandlerConfig {
  /** Path to SQLite database for session storage */
  dbPath?: string | undefined;
  /** Enable metrics tracking */
  trackMetrics?: boolean | undefined;
  /** Trigger file formatting after certain tools */
  formatOnWrite?: boolean | undefined;
  /** Tools that should trigger formatting */
  formatTriggerTools?: readonly string[] | undefined;
  /** Provide additional context back to Claude */
  provideContext?: boolean | undefined;
}

/** Default tools that trigger formatting consideration. */
const DEFAULT_FORMAT_TRIGGERS: readonly string[] = ['Edit', 'Write', 'NotebookEdit'];

/** Formatter suggestions by file extension */
const FORMATTERS: Readonly<Record<string, string>> = {
  ts: 'Consider running: pnpm prettier --write',
  tsx: 'Consider running: pnpm prettier --write',
  js: 'Consider running: pnpm prettier --write',
  jsx: 'Consider running: pnpm prettier --write',
  json: 'Consider running: pnpm prettier --write',
  py: 'Consider running: black or ruff format',
  go: 'Consider running: gofmt',
  rs: 'Consider running: rustfmt',
};

/**
 * Handles PostToolUse hook event.
 */
export function handlePostTool(
  input: PostToolUseInput,
  config?: PostToolHandlerConfig
): Promise<HookResult> {
  // Track metrics asynchronously if enabled
  if (shouldTrackMetrics(config)) {
    void trackToolMetrics(input, config.dbPath);
  }

  // Build and return context if applicable
  const formatContext = buildFormatContext(input, config);
  if (config?.provideContext === true && formatContext !== null) {
    return Promise.resolve(postToolContext(formatContext));
  }

  return Promise.resolve(
    exitSuccess(`Tool ${input.tool_name} completed (id: ${input.tool_use_id})`)
  );
}

/** Type guard: checks if metrics tracking is enabled. */
function shouldTrackMetrics(config?: PostToolHandlerConfig): config is PostToolHandlerConfig {
  return config?.trackMetrics === true && !isFeatureDisabled(HookEnvVars.NEXUS_DISABLE_METRICS);
}

/**
 * Builds formatting context if applicable.
 */
function buildFormatContext(
  input: PostToolUseInput,
  config?: PostToolHandlerConfig
): string | null {
  if (config?.formatOnWrite !== true) return null;

  const formatTriggers = config.formatTriggerTools ?? DEFAULT_FORMAT_TRIGGERS;
  if (!formatTriggers.includes(input.tool_name)) return null;

  const filePath = extractFilePath(input.tool_input);
  if (filePath === null) return null;

  return suggestFormatting(filePath);
}

/**
 * Tracks tool execution metrics in session storage.
 */
async function trackToolMetrics(input: PostToolUseInput, dbPath?: string): Promise<void> {
  const effectiveDbPath = dbPath ?? getDbPathFromEnv();

  try {
    const storage = new SQLiteSessionStorage({ dbPath: effectiveDbPath });
    const initResult = await storage.initialize();

    if (!initResult.ok) {
      logger.debug('Metrics tracking unavailable', { error: initResult.error.message });
      return;
    }

    await recordToolTask(storage, input);
    storage.close();
  } catch (error) {
    logger.debug('Failed to track metrics', { error: getErrorMessage(error) });
  }
}

/**
 * Records a tool execution as a task in the active session.
 */
async function recordToolTask(
  storage: SQLiteSessionStorage,
  input: PostToolUseInput
): Promise<void> {
  const sessionsResult = await storage.listSessions(1);
  if (!sessionsResult.ok) return;

  const activeSession = sessionsResult.value[0];
  if (activeSession === undefined) return;

  const metrics = extractToolMetrics(input);
  const taskDescription = `${input.tool_name}: ${summarizeToolInput(input.tool_input)}`;

  const taskResult = await storage.addTask(activeSession.id, taskDescription);
  if (!taskResult.ok) return;

  await storage.updateTask(taskResult.value.id, {
    result: summarizeToolResponse(input.tool_response),
    status: TaskStatus.COMPLETED,
    durationMs: metrics.durationMs,
    tokensUsed: metrics.tokensUsed,
  });

  logger.debug('Tool metrics tracked', {
    toolUseId: input.tool_use_id,
    sessionId: activeSession.id,
    taskId: taskResult.value.id,
  });
}

/** Extracts metrics from tool input/response. */
function extractToolMetrics(input: PostToolUseInput): { durationMs: number; tokensUsed: number } {
  const response = input.tool_response;
  return {
    durationMs: safeNumber(response.durationMs ?? response.duration_ms, 0),
    tokensUsed: safeNumber(response.tokensUsed ?? response.tokens_used, 0),
  };
}

/** Creates a summary of tool input for logging. */
function summarizeToolInput(toolInput: Record<string, unknown>): string {
  const command = toolInput.command;
  if (command !== undefined) {
    const cmdStr = safeString(command);
    return cmdStr.length > 50 ? `${cmdStr.substring(0, 50)}...` : cmdStr;
  }

  const filePath = toolInput.file_path ?? toolInput.path;
  if (filePath !== undefined) return safeString(filePath);

  const pattern = toolInput.pattern;
  if (pattern !== undefined) return safeString(pattern);

  const keys = Object.keys(toolInput);
  return keys.length > 0 ? keys.join(', ') : '(no input)';
}

/** Creates a summary of tool response for logging. */
function summarizeToolResponse(toolResponse: Record<string, unknown>): string {
  const error = toolResponse.error ?? toolResponse.stderr;
  if (error !== undefined && error !== '') {
    return `Error: ${safeString(error).substring(0, 100)}`;
  }

  const stdout = toolResponse.stdout ?? toolResponse.output ?? toolResponse.content;
  if (stdout !== undefined) {
    const out = safeString(stdout);
    return out.length > 100 ? `${out.substring(0, 100)}...` : out;
  }

  return 'completed';
}

/** Extracts file path from tool input. */
function extractFilePath(toolInput: Record<string, unknown>): string | null {
  const filePath = toolInput.file_path ?? toolInput.path ?? toolInput.notebook_path;
  return filePath !== undefined ? safeString(filePath) : null;
}

/** Suggests formatting based on file extension. */
function suggestFormatting(filePath: string): string | null {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const formatter = FORMATTERS[ext];
  if (formatter === undefined) return null;
  return `[nexus-agents] File modified: ${filePath}\n${formatter}`;
}

export default handlePostTool;
