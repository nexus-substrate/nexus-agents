/**
 * nexus-agents/core - Step Notification Bootstrap
 *
 * One-shot bootstrap that wires the step event bus to:
 * 1. The JSON logger (always on — preserves source-of-truth invariant).
 * 2. The stderr ConsoleRenderer (on by default for CLI, off for MCP stdio
 *    server mode to avoid corrupting JSON-RPC frames; env override
 *    `NEXUS_CONSOLE=0|1`).
 *
 * Call from CLI / server entrypoints exactly once at startup.
 *
 * @module core/step-notifications
 */

import { startStepLoggerBridge } from './step-logger-bridge.js';
import { startConsoleRenderer } from './console-renderer.js';

export interface BootstrapOptions {
  /**
   * What kind of runtime we're in. CLI gets the renderer by default; MCP
   * stdio server does NOT (stdout is reserved for JSON-RPC, and the MCP
   * notifier already surfaces progress through the MCP channel).
   */
  readonly mode: 'cli' | 'mcp-stdio' | 'mcp-http';
}

export interface NotificationHandles {
  dispose(): void;
}

/**
 * Decide whether the stderr renderer should be enabled.
 *
 * Precedence:
 *   NEXUS_CONSOLE=0     → always off
 *   NEXUS_CONSOLE=1     → always on
 *   else: on for cli, off for mcp-stdio, on for mcp-http
 */
export function shouldEnableConsoleRenderer(mode: BootstrapOptions['mode']): boolean {
  const env = process.env['NEXUS_CONSOLE'];
  if (env === '0' || env === 'false' || env === 'off') return false;
  if (env === '1' || env === 'true' || env === 'on') return true;
  return mode !== 'mcp-stdio';
}

/**
 * Process-global handle. Bootstrap is idempotent — repeat calls return the
 * existing handle so CLI dispatchers (and tests exercising them) don't stack
 * up duplicate listeners on the step bus.
 */
let active: NotificationHandles | undefined;

/**
 * Wire up both subscribers. Returns a single disposer that tears down
 * both (useful for tests). Safe to call multiple times.
 */
export function bootstrapStepNotifications(opts: BootstrapOptions): NotificationHandles {
  if (active !== undefined) return active;
  const bridge = startStepLoggerBridge();
  const renderer = shouldEnableConsoleRenderer(opts.mode) ? startConsoleRenderer() : undefined;
  active = {
    dispose(): void {
      bridge.dispose();
      renderer?.dispose();
      active = undefined;
    },
  };
  return active;
}
