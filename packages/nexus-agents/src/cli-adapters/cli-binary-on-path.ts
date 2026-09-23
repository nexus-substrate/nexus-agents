/**
 * Synchronous "is this CLI's executable on PATH" check (#6604).
 *
 * `createAllAdapters` builds the router arm set synchronously and never
 * probes, so a slot's arm was a subprocess adapter whether or not its binary
 * existed; the missing binary surfaced only as a NOT_FOUND on execute. In
 * gateway mode a slot with no binary is served by a gateway model of its
 * family instead, so the factory needs to know whether the binary exists.
 * This is a PATH lookup only — it does not check authentication, which is
 * still what a real call (and the circuit breaker) decides.
 *
 * @module cli-adapters/cli-binary-on-path
 */

import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { GEMINI_CLI_COMMAND } from './cli-error-envelope.js';
import type { CliName } from './types.js';

/** The executable each CLI slot spawns (the gemini arm runs `agy`, #4346). */
const CLI_BINARY: Readonly<Record<CliName, string>> = {
  claude: 'claude',
  codex: 'codex',
  gemini: GEMINI_CLI_COMMAND,
  opencode: 'opencode',
};

function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether `cli`'s executable is found on `env.PATH`. On Windows each
 * `PATHEXT` extension is tried too. An unset or empty PATH finds nothing.
 */
export function isCliBinaryOnPath(cli: CliName, env: NodeJS.ProcessEnv = process.env): boolean {
  const dirs = (env['PATH'] ?? '').split(delimiter).filter((d) => d !== '');
  const exts =
    process.platform === 'win32' ? ['', ...(env['PATHEXT'] ?? '.EXE;.CMD;.BAT').split(';')] : [''];
  const binary = CLI_BINARY[cli];
  return dirs.some((dir) => exts.some((ext) => isExecutableFile(join(dir, binary + ext))));
}
