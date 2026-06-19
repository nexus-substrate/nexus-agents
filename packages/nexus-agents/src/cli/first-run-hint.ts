/**
 * Proactive first-run setup hint (#3208, broadening #1261).
 *
 * Shows a minimal, non-blocking pointer to `nexus-agents setup` the FIRST
 * time the operator runs ANY command — not just the server mode. Previously
 * the hint only fired inside `handleServerCommand`, so the (common) CLI-tooling
 * user who runs verification/inspection commands never saw it.
 *
 * Design constraints (all enforced here, see each guard):
 * - **Scope:** fires for any command EXCEPT `version` / `help` / `setup`. The
 *   CLI resolves `--version`/`-v` → `version` and `--help`/`-h` → `help`
 *   (see `determineCommand` in `cli.ts`), so gating on the resolved command
 *   name covers the flag forms too. `setup` is skipped so the hint never nags
 *   during the very thing it points to.
 * - **Marker-gated:** a marker file at `~/.nexus-agents/.first-run-done`
 *   (resolved via `nexusSharedPath`, the cross-repo / per-user data root)
 *   records that the hint has been shown. Present → silent forever after.
 * - **Non-interactive-safe:** only emits when stderr is a TTY (the existing
 *   convention — `process.stderr.isTTY`). A first run in CI / a piped context
 *   shows nothing AND does not create the marker, so the operator's first
 *   *interactive* run still gets the hint rather than having it silently
 *   consumed by a log-only run.
 * - **Non-polluting:** writes to stderr only, 2 lines, so piped/scripted
 *   stdout (incl. JSON) is never touched.
 * - **Best-effort marker write:** if the marker can't be written (read-only
 *   FS, perms), the hint still shows that once and nothing crashes or blocks.
 *
 * @module cli/first-run-hint
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { nexusSharedPath } from '../config/nexus-data-dir.js';

/**
 * Commands that must never trigger the hint, even on a genuine first run:
 * `version`/`help` (the user is just asking for info — and the resolved
 * command name covers `--version`/`-v`/`--help`/`-h`), and `setup` itself
 * (the hint points there; nagging during it would be absurd).
 */
const HINT_SUPPRESSED_COMMANDS: ReadonlySet<string> = new Set(['version', 'help', 'setup']);

/** Absolute path to the first-run marker file. Per-user / cross-repo. */
export function firstRunMarkerPath(): string {
  return nexusSharedPath('.first-run-done');
}

/**
 * Shows the proactive first-run hint exactly once, then records that it was
 * shown. No-op (and no marker write) when stderr isn't a TTY, when the marker
 * already exists, or when the command is in {@link HINT_SUPPRESSED_COMMANDS}.
 *
 * Purely additive: never throws, never blocks, never touches stdout, and
 * never affects the command's exit code or ordering. Call it before dispatch.
 *
 * @param command - The resolved CLI command name (e.g. `'verify'`, `'doctor'`).
 */
export function maybeShowFirstRunHint(command: string): void {
  if (HINT_SUPPRESSED_COMMANDS.has(command)) return;
  // Non-interactive (CI, pipes, redirected stderr): stay silent and do NOT
  // mark, so the first *interactive* run still gets the hint. `isTTY` is
  // `undefined` (falsy) on non-TTY streams, so the truthiness check is enough.
  if (!process.stderr.isTTY) return;

  const marker = firstRunMarkerPath();
  // Best-effort existence probe — a stat failure here just falls through to
  // showing the hint, which is the safe (additive) direction.
  try {
    if (existsSync(marker)) return;
  } catch {
    // Treat an unreadable marker location as "not yet shown".
  }

  process.stderr.write(
    '\x1b[36mnexus-agents\x1b[0m: First time? Run \x1b[1mnexus-agents setup\x1b[0m to configure.\n' +
      '  (This one-time hint is now dismissed.)\n'
  );

  // Best-effort marker creation. A read-only FS / perms failure must not crash
  // or block the command — the hint was already shown, which is the contract.
  try {
    mkdirSync(dirname(marker), { recursive: true });
    writeFileSync(marker, `${new Date().toISOString()}\n`, { flag: 'w' });
  } catch {
    // Intentionally swallowed — see the best-effort contract in the docstring.
  }
}
