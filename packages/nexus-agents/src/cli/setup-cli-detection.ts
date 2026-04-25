/**
 * Shared CLI binary detection helpers (#2155, child of #2151).
 *
 * Consolidates the near-identical detection logic that previously lived in
 * `setup-codex.ts`, `setup-gemini.ts`, and `setup-opencode.ts`. Each setup
 * file now delegates to `detectCliBinary(name)` instead of carrying its
 * own copy of the platform-aware locator + version-extraction logic.
 *
 * The per-CLI `ConfigResult` interfaces remain separate because they
 * legitimately differ (Codex writes via MCP, Gemini and OpenCode write to
 * config files with paths).
 *
 * @module cli/setup-cli-detection
 */

import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';

import { classifyExecError, type DetectionError } from './cli-detection-error.js';

/** Generic CLI detection result. Consumed by every `setup-*.ts` detector. */
export interface CliDetectionInfo {
  readonly installed: boolean;
  readonly version: string | undefined;
  /**
   * Classification of why detection failed. Set when `installed` is `false`
   * OR when the binary was located but `--version` failed (#2152).
   */
  readonly detectionError?: DetectionError;
}

/** Returns the platform-appropriate command for locating an executable. */
export function getCliLocatorCommand(): 'where' | 'which' {
  return platform() === 'win32' ? 'where' : 'which';
}

/**
 * Extracts a semver triple (`X.Y.Z`) from CLI `--version` output.
 *
 * Pure helper — exported for direct unit testing. Returns the matched
 * version string or undefined when no semver-shaped substring is present.
 */
export function extractSemver(output: string): string | undefined {
  const match = /(\d+\.\d+\.\d+)/.exec(output);
  return match?.[1];
}

/**
 * Detects whether a CLI binary is installed and reports its version.
 *
 * Two-phase detection:
 *   1. Locate via `which` / `where` — fast PATH check (3s timeout).
 *   2. If located, run `<name> --version` and extract semver (5s timeout).
 *
 * Both phases trap `execFileSync` exceptions and return a `CliDetectionInfo`
 * with a classified `detectionError`. Callers never see exceptions from
 * this function.
 */
export function detectCliBinary(name: string): CliDetectionInfo {
  try {
    execFileSync(getCliLocatorCommand(), [name], { timeout: 3000, stdio: 'pipe' });
  } catch (err: unknown) {
    return { installed: false, version: undefined, detectionError: classifyExecError(err) };
  }

  try {
    const output = execFileSync(name, ['--version'], {
      timeout: 5000,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    return { installed: true, version: extractSemver(output) };
  } catch (err: unknown) {
    return { installed: true, version: undefined, detectionError: classifyExecError(err) };
  }
}
