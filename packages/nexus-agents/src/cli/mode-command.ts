/**
 * nexus-agents/cli - Mode Command
 *
 * Exposes the otherwise-internal mode detection (server vs orchestrator) for
 * inspection and debugging. Prints the detected mode, the signals that fed the
 * decision (each signal + observed value), and a one-line reasoning — useful
 * when a CI/container run lands in an unexpected mode.
 *
 * @module cli/mode-command
 * (Source: Issue #3214 — expose mode detection for inspection/debugging)
 */

import type { ParsedCliArgs } from '../cli-types.js';
import { EXIT_CODES } from '../cli-types.js';
import {
  detectMode,
  describeSignals,
  formatModeInspection,
  isValidServerMode,
  type ServerMode,
} from './mode-detector.js';

/** Writes a line to stdout (single sink keeps output testable/consistent). */
function write(line: string): void {
  process.stdout.write(`${line}\n`);
}

/**
 * Resolves the explicit-mode override from `--mode`.
 *
 * The `--mode` flag defaults to `'server'` in PARSE_ARGS_CONFIG and doubles as
 * the server-launch flag, so a bare `nexus-agents mode` must NOT be treated as
 * an explicit override — that would always report `server`. Only treat it as
 * explicit when the user passed a non-default, valid value.
 *
 * @param raw - The raw `--mode` flag value
 * @returns The explicit mode, or undefined to let auto-detection run
 */
function resolveExplicitMode(raw: ServerMode | undefined): ServerMode | undefined {
  // `--mode` defaults to 'server'; a bare invocation must not be read as an
  // explicit override. parseArgs hands back a string at runtime, so re-validate
  // defensively rather than trusting the declared type.
  if (raw === undefined || raw === 'server') return undefined;
  return isValidServerMode(raw) ? raw : undefined;
}

/**
 * Handles `nexus-agents mode` — print the detected invocation mode and why.
 *
 * Flags:
 * - `--mode=<m>` reports what an explicit `--mode` override would resolve to.
 * - `--format=json` emits a machine-readable object instead of the report.
 *
 * @param args - Parsed CLI arguments
 */
export function handleModeCommand(args: ParsedCliArgs): void {
  const explicitMode = resolveExplicitMode(args.options.mode);
  const result = detectMode(explicitMode !== undefined ? { explicitMode } : {});

  if (args.options.format === 'json') {
    write(
      JSON.stringify(
        {
          mode: result.mode,
          source: result.source,
          reason: result.reason,
          detectionTimeMs: result.detectionTimeMs,
          signals: describeSignals(result.signals),
        },
        null,
        2
      )
    );
  } else {
    write(formatModeInspection(result));
  }

  process.exit(EXIT_CODES.SUCCESS);
}
