/**
 * nexus-agents/cli/hooks - Claude CLI Hook Integration
 *
 * Entry point for hook commands. Provides CLI integration with
 * Claude Code's hook system for session management, metrics tracking,
 * and tool validation.
 *
 * Usage:
 *   nexus-agents hooks session-start [--source startup|resume|clear|compact]
 *   nexus-agents hooks session-end [--reason clear|logout|exit] [--export-metrics]
 *   nexus-agents hooks pre-tool --tool <name> [--validate] [--load-context]
 *   nexus-agents hooks post-tool --tool <name> [--track-metrics] [--format]
 *   nexus-agents hooks stop [--check-tasks] [--generate-summary]
 *
 * @module cli/hooks
 * (Source: Issue #411 - Claude CLI Hook Integration)
 */

// Re-export types
export * from './hook-types.js';

// Re-export output helpers
export * from './hook-output.js';

// Re-export router
export * from './hook-router.js';

// Re-export handlers
export * from './handlers/index.js';

// ============================================================================
// Command Entry Point
// ============================================================================

import {
  parseHookArgs,
  processHook,
  type HookHandlers,
  type HookCliOptions,
} from './hook-router.js';
import { exitError, writeResultAndExit, type HookResult } from './hook-output.js';
import type {
  SessionStartInput,
  SessionEndInput,
  PreToolUseInput,
  PostToolUseInput,
  StopInput,
} from './hook-types.js';

// Import new handler implementations (#413-#415)
import { handleSessionStart as sessionStartHandler } from './handlers/session-start.js';
import { handleSessionEnd as sessionEndHandler } from './handlers/session-end.js';
import { handlePreTool as preToolHandler } from './handlers/pre-tool.js';
import { handlePostTool as postToolHandler } from './handlers/post-tool.js';
import { handleStop as stopHandler } from './handlers/stop.js';

// ============================================================================
// Handler Wrappers (CLI options to handler config)
// ============================================================================

/** Wraps session-start handler with CLI options */
function handleSessionStart(
  input: SessionStartInput,
  options: HookCliOptions
): Promise<HookResult> {
  return sessionStartHandler(input, {
    provideContext: options.loadContext,
  });
}

/** Wraps session-end handler with CLI options */
function handleSessionEnd(input: SessionEndInput, options: HookCliOptions): Promise<HookResult> {
  return sessionEndHandler(input, {
    exportMetrics: options.exportMetrics,
  });
}

/** Wraps pre-tool handler with CLI options */
function handlePreTool(input: PreToolUseInput, options: HookCliOptions): Promise<HookResult> {
  return preToolHandler(input, {
    validateBash: options.validate,
  });
}

/** Wraps post-tool handler with CLI options */
function handlePostTool(input: PostToolUseInput, options: HookCliOptions): Promise<HookResult> {
  return postToolHandler(input, {
    trackMetrics: options.trackMetrics,
    formatOnWrite: options.format,
  });
}

/** Wraps stop handler with CLI options */
function handleStop(input: StopInput, options: HookCliOptions): Promise<HookResult> {
  return stopHandler(input, {
    checkTasks: options.checkTasks,
    generateSummary: options.generateSummary,
  });
}

// ============================================================================
// Main Hook Command
// ============================================================================

/** Creates handlers for all hook types */
function createAllHandlers(options: HookCliOptions): HookHandlers {
  return {
    sessionStart: (input) => handleSessionStart(input, options),
    sessionEnd: (input) => handleSessionEnd(input, options),
    preTool: (input) => handlePreTool(input, options),
    postTool: (input) => handlePostTool(input, options),
    stop: (input) => handleStop(input, options),
  };
}

/** Creates handlers for a specific command */
function createCommandHandlers(command: string, options: HookCliOptions): HookHandlers | null {
  switch (command) {
    case 'session-start':
      return { sessionStart: (input) => handleSessionStart(input, options) };
    case 'session-end':
      return { sessionEnd: (input) => handleSessionEnd(input, options) };
    case 'pre-tool':
      return { preTool: (input) => handlePreTool(input, options) };
    case 'post-tool':
      return { postTool: (input) => handlePostTool(input, options) };
    case 'stop':
      return { stop: (input) => handleStop(input, options) };
    default:
      return null;
  }
}

/**
 * Main entry point for hook commands.
 * Called from CLI: nexus-agents hooks <command> [options]
 */
export async function hookCommand(args: string[]): Promise<number> {
  const options = parseHookArgs(args);

  // If no command specified, process stdin for all hook events
  if (options.command.length === 0) {
    const result = await processHook(createAllHandlers(options));
    writeResultAndExit(result);
  }

  // Handle specific commands
  const handlers = createCommandHandlers(options.command, options);
  if (handlers === null) {
    writeResultAndExit(exitError(`Unknown hook command: ${options.command}`));
  }

  const result = await processHook(handlers);
  writeResultAndExit(result);

  // writeResultAndExit calls process.exit, so we shouldn't reach here
  return 0;
}

/**
 * Print hook command help.
 */
export function printHookHelp(): void {
  const help = `
nexus-agents hooks - Claude CLI Hook Integration

USAGE:
  nexus-agents hooks <command> [options]

COMMANDS:
  session-start    Handle SessionStart hook events
  session-end      Handle SessionEnd hook events
  pre-tool         Handle PreToolUse hook events
  post-tool        Handle PostToolUse hook events
  stop             Handle Stop hook events

OPTIONS:
  --tool <name>        Tool name for pre-tool/post-tool commands
  --validate           Enable input validation (pre-tool)
  --load-context       Load session context (pre-tool)
  --track-metrics      Track execution metrics (post-tool)
  --format             Trigger file formatting (post-tool)
  --check-tasks        Check for incomplete tasks (stop)
  --generate-summary   Generate session summary (stop)
  --export-metrics     Export metrics to file (session-end)
  --source <src>       Session source: startup, resume, clear, compact
  --reason <reason>    Session end reason: clear, logout, exit

EXAMPLES:
  # Configure in ~/.claude/settings.json:
  {
    "hooks": {
      "PreToolUse": [{
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "nexus-agents hooks pre-tool --tool Bash --validate"
        }]
      }]
    }
  }

PROTOCOL:
  Hooks receive JSON input via stdin and output via exit codes:
  - Exit 0: Success (stdout shown in verbose mode)
  - Exit 2: Blocking error (stderr fed to Claude)
  - Exit 1: Non-blocking error (stderr shown in verbose mode)

For more information: https://github.com/williamzujkowski/nexus-agents
`;
  process.stdout.write(help);
}
