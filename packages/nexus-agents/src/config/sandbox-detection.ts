/**
 * Sandbox detection (#2501, child 1 of epic #2500).
 *
 * nexus-agents needs to know whether it's running inside a host-provided
 * sandbox (Docker Desktop Sandbox + OpenCode, Codex sandbox, locked-down
 * CI runner) so it can adjust behaviour:
 *
 *   - default `NEXUS_DATA_DIR` to the multi-repo root rather than `~/...`
 *   - skip CLI subprocess detection (binaries aren't there)
 *   - fail-fast when the gateway is unreachable instead of degrading
 *   - suppress diagnostics that don't apply
 *
 * The signal is **explicit**: the image author (Dockerfile, devcontainer,
 * harness wrapper) sets `NEXUS_SANDBOX=<flavor>`. The flavor string is
 * for diagnostics + per-flavor branching (`docker-opencode`, `codex`,
 * `claude-code`, `ci-restricted`, …); presence is the on/off signal.
 *
 * A heuristic check runs alongside for verification — if `NEXUS_SANDBOX`
 * claims `docker-opencode` but `/.dockerenv` is missing, that's a
 * misconfiguration worth surfacing to the operator.
 *
 * @module config/sandbox-detection
 */

import { existsSync, readFileSync } from 'node:fs';

/**
 * Heuristic detection result. Independent from the explicit
 * `NEXUS_SANDBOX` env var; produced by inspecting filesystem markers.
 */
export type SandboxHeuristic = 'docker' | 'podman' | 'unknown' | null;

export interface SandboxInfo {
  /**
   * True iff `NEXUS_SANDBOX` is set + non-empty. The explicit signal
   * the rest of the codebase keys off — never `true` by heuristic alone.
   */
  readonly active: boolean;
  /**
   * Operator-supplied flavor string, e.g. `docker-opencode`. Undefined
   * when `active === false` or the env var is empty.
   */
  readonly flavor: string | undefined;
  /**
   * Multi-repo root the user mounted. From `NEXUS_SANDBOX_ROOT`. Undefined
   * when unset; consumers that need a default substitute `/`.
   */
  readonly root: string | undefined;
  /**
   * Independent heuristic match — `null` when we couldn't run the check,
   * `'unknown'` when ran but no marker matched. Used by `doctor` to flag
   * mismatches between the explicit signal and the runtime environment.
   */
  readonly heuristicMatch: SandboxHeuristic;
}

/**
 * Detect whether nexus-agents is running inside a host-provided sandbox.
 * Pure read of env + filesystem; no caching (cheap enough to recompute,
 * and tests routinely mutate process.env).
 */
export function detectSandbox(): SandboxInfo {
  const flavorRaw = process.env['NEXUS_SANDBOX']?.trim();
  const flavor = flavorRaw !== undefined && flavorRaw !== '' ? flavorRaw : undefined;
  const active = flavor !== undefined;

  const rootRaw = process.env['NEXUS_SANDBOX_ROOT']?.trim();
  const root = rootRaw !== undefined && rootRaw !== '' ? rootRaw : undefined;

  return {
    active,
    flavor,
    root,
    heuristicMatch: detectContainerHeuristic(),
  };
}

/**
 * Look for filesystem markers indicating a container runtime. Used as a
 * cross-check against the explicit `NEXUS_SANDBOX` signal.
 *
 * Order of checks:
 *   1. `/.dockerenv` (Docker)
 *   2. `/run/.containerenv` (Podman)
 *   3. `/proc/1/cgroup` containing `docker` or `containerd` strings
 *
 * Returns `null` when none of the checks could run (non-Linux host with
 * no `/proc`, sandbox blocks `existsSync`, etc.) — distinct from
 * `'unknown'` (checks ran, no marker matched) so the doctor message can
 * differentiate "we couldn't tell" from "we checked, no container".
 */
function detectContainerHeuristic(): SandboxHeuristic {
  try {
    if (existsSync('/.dockerenv')) return 'docker';
    if (existsSync('/run/.containerenv')) return 'podman';
    if (existsSync('/proc/1/cgroup')) {
      const cgroup = readFileSync('/proc/1/cgroup', 'utf8');
      if (/\bdocker\b/.test(cgroup)) return 'docker';
      if (/\bcontainerd\b/.test(cgroup)) return 'docker';
    }
    return 'unknown';
  } catch {
    return null;
  }
}
