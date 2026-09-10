/**
 * nexus-agents/cli-adapters - Codex CLI Adapter Helpers
 *
 * CLI-specific helper functions for Codex subprocess adapter.
 * Model info lookups consolidated into config/model-config-helpers.ts (#886).
 */

import type { BaseAdapterOptions, CliError, CliName, TokenUsage, CliResponse } from '../types.js';
import { createCliError as sharedCreateCliError } from '../cli-error-helpers.js';
import type { ILogger } from '../../core/logger.js';
import { resolveCliModelName } from '../../config/model-config-helpers.js';

// -----------------------------------------------------------------------------
// Legacy Fallback Defaults (for non-canonical models)
// -----------------------------------------------------------------------------

/** Legacy fallback values for Codex models not in the canonical registry. */
export const CODEX_LEGACY_DEFAULTS = {
  displayNames: {
    o3: 'O3',
    'o3-mini': 'O3 Mini',
    'o4-mini': 'O4 Mini',
  } as Readonly<Record<string, string>>,
  inputCosts: {
    o3: 10.0,
    'o3-mini': 1.1,
    'o4-mini': 1.1,
  } as Readonly<Record<string, number>>,
  outputCosts: {
    o3: 40.0,
    'o3-mini': 4.4,
    'o4-mini': 4.4,
  } as Readonly<Record<string, number>>,
  contextWindow: 400_000,
  maxOutput: 100_000,
  inputCost: 1.1,
  outputCost: 4.4,
} as const;

// -----------------------------------------------------------------------------
// Sandbox backend selection (#6093)
// -----------------------------------------------------------------------------

/** Options accepted by both codex transports (subprocess and MCP). */
export interface CodexAdapterOptions extends BaseAdapterOptions {
  /**
   * Host platform the sandbox arguments are chosen for. Defaults to
   * `process.platform`; injectable so a test can exercise the Linux and
   * non-Linux branches without mocking a global (#6093).
   */
  readonly platform?: NodeJS.Platform;
}

/**
 * The `-c key=value` override that switches codex's Linux sandbox from bwrap
 * to the legacy landlock backend. Spelled exactly as `codex features list`
 * names it (`use_legacy_landlock`, flagged deprecated on codex-cli 0.153.4):
 * `-c` accepts any key, so a misspelling would be silently ignored.
 */
const CODEX_LEGACY_LANDLOCK_CONFIG = 'features.use_legacy_landlock=true';

/**
 * Extra codex argv for the host platform: `['-c', CODEX_LEGACY_LANDLOCK_CONFIG]`
 * on Linux, nothing elsewhere.
 *
 * Why (#6093, measured on codex-cli 0.153.4 / bwrap 0.9.0): on hosts with
 * `kernel.apparmor_restrict_unprivileged_userns=1` (the Ubuntu 24.04+ default)
 * every bwrap-backed sandbox mode — `read-only`, `workspace-write`, network
 * off — dies with `bwrap: loopback: Failed RTM_NEWADDR: Operation not
 * permitted` before codex reads a single file, so the two codex voter seats
 * abstained with "repository inspection failed" or voted on the proposal
 * text alone. With the legacy landlock backend reads work and writes are
 * still refused (`Permission denied`). The read scope is read-only-all-disk,
 * the same scope the read-only bwrap profile already granted, so this widens
 * nothing: a seat could always read dotfiles and echo them into its
 * reasoning. The host-level alternative is
 * `kernel.apparmor_restrict_unprivileged_userns=0` or an AppArmor profile for
 * bwrap; this flag makes the seats work without host changes.
 *
 * Shared by `CodexCliAdapter` (`codex exec`) and `CodexMcpAdapter`
 * (`codex mcp-server`) so the platform gate exists once. Both subcommands
 * accept `-c` after the subcommand name (verified with `--help`, which rejects
 * an unknown flag in that position with exit 2).
 */
export function codexPlatformSandboxArgs(
  platform: NodeJS.Platform = process.platform
): readonly string[] {
  return platform === 'linux' ? ['-c', CODEX_LEGACY_LANDLOCK_CONFIG] : [];
}

// -----------------------------------------------------------------------------
// Error Handling
// -----------------------------------------------------------------------------

/**
 * Creates a CLI error with the canonical retryable-flag logic.
 * Kept as an alias under this name for backward compatibility with callers
 * that imported `createCodexError` before the helper was consolidated in
 * `cli-error-helpers.ts` (#2181). Prefer `createCliError` from the shared
 * helper in new code.
 */
export function createCodexError(
  code: CliError['code'],
  message: string,
  cli: CliName,
  cause?: Error
): CliError {
  return sharedCreateCliError(code, message, cli, cause);
}

// -----------------------------------------------------------------------------
// Response Normalization
// -----------------------------------------------------------------------------

/** Normalizes CLI response to common format. */
export function normalizeCodexResponse(
  text: string,
  usage?: TokenUsage,
  extra?: Partial<CliResponse>
): CliResponse {
  return {
    text,
    ...(usage !== undefined && { usage }),
    ...extra,
  };
}

// Re-export from canonical source for backward compatibility
export { delay } from '../../utils/async-utils.js';

/**
 * Translate a model identifier to the slug the `codex` binary accepts (#5091).
 *
 * `task.model` arrives as the canonical registry id (`codex-5.3`), which codex
 * rejects; the registry's `cliModelName` (`gpt-5.4`) is what `-m` and the MCP
 * `model` argument want. Shared by the subprocess and MCP transports so the
 * translation exists once.
 *
 * Unknown model: passed through verbatim with a warning, the same fail-open
 * choice `claude-adapter.ts` (`MODEL_TO_CLI_ALIAS[m] ?? m`) and
 * `opencode-adapter.ts` (`resolveOpenCodeModel`) make. A caller pinning a slug
 * the registry has not caught up with (codex ships new ones between releases)
 * must still be able to run it, and codex rejects a bad `-m` with a non-zero
 * exit, so the failure stays visible — unlike agy, whose exit-0 error is why
 * `toAgyModelSlug` substitutes a default instead.
 */
export function toCodexModelSlug(model: string, logger: ILogger): string {
  const slug = resolveCliModelName('codex', model);
  if (slug === undefined) {
    logger.warn('Model is not in the model registry for codex; passing it to codex unchanged', {
      model,
    });
    return model;
  }
  return slug;
}
