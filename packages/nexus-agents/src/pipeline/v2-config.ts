/**
 * V2 Pipeline Configuration — Umbrella mode flags (Issue #925, Phase F)
 *
 * Centralizes all V2 pipeline feature flags into a single config module.
 * Individual flags (`NEXUS_V2_DELEGATE`, `NEXUS_V2_ORCHESTRATE`, `NEXUS_V2_POLICY_MODE`)
 * can override the umbrella `NEXUS_V2_MODE` flag.
 *
 * @module pipeline/v2-config
 */

// ============================================================================
// Types
// ============================================================================

/** V2 umbrella mode. */
export type V2Mode = 'off' | 'partial' | 'full';

/** Resolved V2 configuration. */
export interface V2Config {
  /** Overall V2 mode. */
  readonly mode: V2Mode;
  /** Whether delegate_to_model uses V2 pipeline. */
  readonly delegateEnabled: boolean;
  /** Whether orchestrate uses V2 pipeline. */
  readonly orchestrateEnabled: boolean;
  /** Policy enforcement mode. */
  readonly policyMode: 'off' | 'warn' | 'block';
  /** Whether AOrchestra dynamic agent planning is enabled (Issue #935). */
  readonly aorchestraEnabled: boolean;
  /** Whether AOrchestra worker dispatch is enabled (Issue #1321). */
  readonly dispatchEnabled: boolean;
}

// ============================================================================
// Resolution
// ============================================================================

/** Reads the umbrella NEXUS_V2_MODE flag. */
function readV2Mode(): V2Mode {
  const env = process.env['NEXUS_V2_MODE'];
  if (env === 'off' || env === 'partial') return env;
  return 'full';
}

/** Resolves a boolean feature flag with umbrella fallback. */
function resolveFlag(envKey: string, umbrellaDefault: boolean): boolean {
  const env = process.env[envKey];
  if (env === 'true') return true;
  if (env === 'false') return false;
  return umbrellaDefault;
}

/** Resolves policy mode with umbrella fallback. */
function resolvePolicyMode(umbrella: V2Mode): 'off' | 'warn' | 'block' {
  const env = process.env['NEXUS_V2_POLICY_MODE'];
  if (env === 'off' || env === 'warn' || env === 'block') return env;
  if (umbrella === 'off') return 'off';
  if (umbrella === 'partial') return 'warn';
  return 'block';
}

/**
 * Resolves the full V2 configuration from environment variables.
 *
 * Priority: individual flag > umbrella flag > defaults.
 *
 * | NEXUS_V2_MODE | delegate | orchestrate | policy |
 * |---------------|----------|-------------|--------|
 * | full (default)| true     | true        | block  |
 * | partial       | true     | false       | warn   |
 * | off           | false    | false       | off    |
 */
export function resolveV2Config(): V2Config {
  const mode = readV2Mode();
  const umbrellaDelegate = mode !== 'off';
  const umbrellaOrchestrate = mode === 'full';

  return {
    mode,
    delegateEnabled: resolveFlag('NEXUS_V2_DELEGATE', umbrellaDelegate),
    orchestrateEnabled: resolveFlag('NEXUS_V2_ORCHESTRATE', umbrellaOrchestrate),
    policyMode: resolvePolicyMode(mode),
    aorchestraEnabled: resolveFlag('NEXUS_AORCHESTRA', true),
    dispatchEnabled: resolveFlag('NEXUS_AORCHESTRA_DISPATCH', true),
  };
}
