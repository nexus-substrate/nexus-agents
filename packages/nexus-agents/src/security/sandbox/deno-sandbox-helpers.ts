/**
 * nexus-agents/security/sandbox - Deno Sandbox Helper Functions
 *
 * Pure helper functions for Deno-based sandbox execution (#1898).
 * Maps the existing SandboxPolicy to Deno's `--allow-*` permission flags
 * and provides availability detection.
 *
 * Deno's permission model is process-level (not OS-level like Docker
 * containers). It's a fallback for environments without Docker, not a
 * replacement — see SandboxMode docs in sandbox-types.ts for the
 * tradeoffs.
 *
 * @module security/sandbox/deno-sandbox-helpers
 * (Source: Issue #1898 — WASM/Deno fallback for users without Docker)
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { CLI_SUBPROCESS_TIMEOUTS } from '../../config/timeouts.js';
import { createLogger } from '../../core/logger.js';

import type { SandboxPolicy } from './sandbox-types.js';

const logger = createLogger({ component: 'deno-sandbox-helpers' });

const execFileAsync = promisify(execFile);

/** Deno availability check result (cached). */
let denoAvailableCache: boolean | null = null;

/**
 * Check whether Deno is available on the host. Cached after the first call.
 */
export async function isDenoAvailable(): Promise<boolean> {
  if (denoAvailableCache !== null) {
    return denoAvailableCache;
  }

  try {
    await execFileAsync('deno', ['--version'], {
      timeout: CLI_SUBPROCESS_TIMEOUTS.dockerCheckMs,
    });
    denoAvailableCache = true;
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.debug('Deno not available', { error: msg });
    denoAvailableCache = false;
    return false;
  }
}

/** Reset Deno availability cache (for testing). */
export function resetDenoCache(): void {
  denoAvailableCache = null;
}

/**
 * Translate a SandboxPolicy's capability + path-rules + allowed-commands
 * into the corresponding Deno `--allow-*` flag set.
 *
 * Mapping:
 *   - `process_spawn` → `--allow-run=cmd1,cmd2,...` from policy.allowedCommands
 *   - `network`       → `--allow-net` (no host filter — Phase 1 keeps it
 *                       coarse; per-host filtering is Phase 2)
 *   - `filesystem_read`  → `--allow-read=path1,path2,...` from path rules
 *   - `filesystem_write` → `--allow-write=path1,path2,...` from path rules
 *   - `env_access`    → `--allow-env=VAR1,VAR2,...` from allowedEnvVars
 *
 * Capabilities NOT in the policy produce no flag — Deno defaults to deny.
 *
 * Returns an array of CLI args ready to be passed to `deno run`.
 */
export function policyToDenoFlags(policy: SandboxPolicy): string[] {
  const caps = new Set(policy.capabilities);
  const flags: string[] = [];
  const runFlag = buildAllowRunFlag(caps, policy);
  if (runFlag !== undefined) flags.push(runFlag);
  if (caps.has('network')) flags.push('--allow-net');
  const readFlag = buildPathFlag(caps, policy, 'read');
  if (readFlag !== undefined) flags.push(readFlag);
  const writeFlag = buildPathFlag(caps, policy, 'write');
  if (writeFlag !== undefined) flags.push(writeFlag);
  const envFlag = buildAllowEnvFlag(caps, policy);
  if (envFlag !== undefined) flags.push(envFlag);
  return flags;
}

function buildAllowRunFlag(caps: ReadonlySet<string>, policy: SandboxPolicy): string | undefined {
  if (!caps.has('process_spawn')) return undefined;
  if (policy.allowedCommands.length === 0) {
    logger.warn(
      'process_spawn capability requested but allowedCommands is empty — Deno --allow-run NOT added (would be a wildcard)'
    );
    return undefined;
  }
  return `--allow-run=${policy.allowedCommands.join(',')}`;
}

function buildPathFlag(
  caps: ReadonlySet<string>,
  policy: SandboxPolicy,
  level: 'read' | 'write'
): string | undefined {
  const cap = level === 'read' ? 'filesystem_read' : 'filesystem_write';
  if (!caps.has(cap)) return undefined;
  const paths = collectAccessPaths(policy, level);
  if (paths.length === 0) {
    logger.warn(`${cap} capability requested but no path rules — Deno --allow-${level} NOT added`);
    return undefined;
  }
  return `--allow-${level}=${paths.join(',')}`;
}

function buildAllowEnvFlag(caps: ReadonlySet<string>, policy: SandboxPolicy): string | undefined {
  if (!caps.has('env_access')) return undefined;
  if (policy.allowedEnvVars.length === 0) {
    logger.warn(
      'env_access capability requested but allowedEnvVars is empty — Deno --allow-env NOT added'
    );
    return undefined;
  }
  return `--allow-env=${policy.allowedEnvVars.join(',')}`;
}

/**
 * Pull the path-strings out of a policy's pathRules whose access matches
 * the requested level. `'read'` includes `'write'` rules (write implies
 * read in Deno).
 */
function collectAccessPaths(policy: SandboxPolicy, level: 'read' | 'write'): string[] {
  const paths: string[] = [];
  for (const rule of policy.pathRules) {
    if (rule.access === 'none') continue;
    if (level === 'write' && rule.access !== 'write') continue;
    // Read level: any non-'none' rule grants read (write implies read).
    paths.push(rule.path);
  }
  return paths;
}
