/**
 * nexus-agents/config - Routing Config Adapter
 *
 * Converts RoutingConfig from YAML schema to CompositeRouterConfigWithPreference
 * that the runtime routing system expects.
 *
 * @module config/routing-config-adapter
 * (Source: Issue #475 - Add routing configuration section to nexus-agents.yaml)
 */

import type {
  CompositeRouterConfig,
  CompositeRouterConfigWithPreference,
} from '../cli-adapters/composite-router-types.js';
import { createLogger } from '../core/index.js';
import { DEFAULT_COMPOSITE_CONFIG } from '../cli-adapters/composite-router-types.js';
import type { TopsisConfig as RuntimeTopsisConfig } from '../cli-adapters/topsis-types.js';
import { DEFAULT_TOPSIS_CONFIG, DEFAULT_TOPSIS_CRITERIA } from '../cli-adapters/topsis-types.js';
import type { ZeroRouterConfig as RuntimeZeroRouterConfig } from '../cli-adapters/zero-router-types.js';
import { DEFAULT_ZERO_ROUTER_CONFIG } from '../cli-adapters/zero-router-types.js';
import type { LatencyTrackerConfig as RuntimeLatencyConfig } from '../cli-adapters/latency-tracker-types.js';
import type { RoutingMemoryConfig as RuntimeMemoryConfig } from '../context/routing-memory.js';
import type {
  RoutingConfig,
  TopsisConfig as YamlTopsisConfig,
  ZeroRouterConfig as YamlZeroRouterConfig,
  LatencyTrackerConfig as YamlLatencyTrackerConfig,
  RoutingMemoryConfig as YamlRoutingMemoryConfig,
} from './schemas-routing.js';
import { isPersistenceEnabled } from './learning-persistence.js';

/** Non-nullable routing config for internal use. */
type DefinedRoutingConfig = NonNullable<RoutingConfig>;

/** Default routing config with proper typing.
 * Note: `stages` is intentionally omitted so that persistence-aware flags
 * (routingMemory, strategyDistillation, preferenceRouting) resolve dynamically
 * via `resolveStageFlags()` instead of being hardcoded to false. (#1353)
 */
const ADAPTER_DEFAULTS: DefinedRoutingConfig = {
  latencyScoreWeight: 0.2,
};

/**
 * Converts YAML TopsisConfig to runtime TopsisConfig.
 */
function adaptTopsisConfig(yaml: YamlTopsisConfig | undefined): Partial<RuntimeTopsisConfig> {
  if (yaml === undefined) return {};

  const result: Partial<RuntimeTopsisConfig> = {
    criteria: yaml.criteria ?? DEFAULT_TOPSIS_CRITERIA,
    minQualityThreshold: yaml.minQualityThreshold,
    verbose: yaml.verbose,
  };

  if (yaml.maxLatencyMs !== undefined) {
    (result as { maxLatencyMs?: number }).maxLatencyMs = yaml.maxLatencyMs;
  }
  if (yaml.maxCostPerRequest !== undefined) {
    (result as { maxCostPerRequest?: number }).maxCostPerRequest = yaml.maxCostPerRequest;
  }

  return result;
}

/**
 * Converts YAML ZeroRouterConfig to runtime ZeroRouterConfig.
 */
function adaptZeroRouterConfig(
  yaml: YamlZeroRouterConfig | undefined
): Partial<RuntimeZeroRouterConfig> {
  if (yaml === undefined) return {};

  return {
    thresholds: yaml.thresholds ?? DEFAULT_ZERO_ROUTER_CONFIG.thresholds,
    weights: yaml.weights ?? DEFAULT_ZERO_ROUTER_CONFIG.weights,
    difficultyToTier: yaml.difficultyToTier ?? DEFAULT_ZERO_ROUTER_CONFIG.difficultyToTier,
    tierToClis: yaml.tierToClis ?? DEFAULT_ZERO_ROUTER_CONFIG.tierToClis,
    enableCalibration: yaml.enableCalibration,
    maxCalibrationOutcomes: yaml.maxCalibrationOutcomes,
    minCalibrationOutcomes: yaml.minCalibrationOutcomes,
    verbose: yaml.verbose,
  };
}

/**
 * Converts YAML LatencyTrackerConfig to runtime LatencyTrackerConfig.
 */
function adaptLatencyTrackerConfig(
  yaml: YamlLatencyTrackerConfig | undefined
): Partial<RuntimeLatencyConfig> {
  if (yaml === undefined) return {};

  return {
    windowSize: yaml.windowSize,
    decayFactor: yaml.decayFactor,
    maxSampleAgeMs: yaml.maxSampleAgeMs,
    percentiles: yaml.percentiles,
  };
}

/**
 * Converts YAML RoutingMemoryConfig to runtime RoutingMemoryConfig.
 */
function adaptRoutingMemoryConfig(
  yaml: YamlRoutingMemoryConfig | undefined
): Partial<RuntimeMemoryConfig> {
  if (yaml === undefined) return {};

  return {
    minObservations: yaml.minObservations,
    confidenceThreshold: yaml.confidenceThreshold,
    successRateThreshold: yaml.successRateThreshold,
    actionCacheMaxAgeMs: yaml.actionCacheMaxAgeMs,
  };
}

/**
 * Converts YAML stages config to CompositeRouterConfig flags.
 */
function adaptStagesConfig(
  yaml: DefinedRoutingConfig['stages'] | undefined
): Partial<CompositeRouterConfig> {
  if (yaml === undefined) return {};

  return {
    enableBudgetFilter: yaml.budgetFilter,
    enableZeroRouter: yaml.zeroRouter,
    enablePreferenceRouting: yaml.preferenceRouting,
    enableTopsisRanking: yaml.topsisRanking,
    enableLinUCBSelection: yaml.linucbSelection,
    enableLatencyTracking: yaml.latencyTracking,
    enableRoutingMemory: yaml.routingMemory,
    // Issue #755: New replacement stages
    enableConfidenceCascade: yaml.confidenceCascade,
    enableCapabilityMatch: yaml.capabilityMatch,
    enableQualityConstraint: yaml.qualityConstraint,
    // Issue #998: Resource strategy
    enableResourceStrategy: yaml.resourceStrategy,
    // Issue #999: Strategy distillation
    enableStrategyDistillation: yaml.strategyDistillation,
  };
}

/** Stage flag keys that need to be resolved with defaults. */
const STAGE_FLAG_KEYS = [
  'enableBudgetFilter',
  'enableZeroRouter',
  'enablePreferenceRouting',
  'enableTopsisRanking',
  'enableLinUCBSelection',
  'enableLatencyTracking',
  'enableRoutingMemory',
  'enableConfidenceCascade',
  'enableCapabilityMatch',
  'enableQualityConstraint',
  'enableResourceStrategy',
  'enableStrategyDistillation',
  'enableKnnRouting',
  'enableCapacityBalancing',
] as const;

type StageFlagKey = (typeof STAGE_FLAG_KEYS)[number];
type StageFlagsResult = Pick<CompositeRouterConfig, StageFlagKey>;

/**
 * Stage flags that default to `true` when learning persistence is enabled.
 * These features consume data already recorded by OutcomeStore and add
 * no new data collection surface. (#1347, #1353)
 */
const PERSISTENCE_AWARE_FLAGS: ReadonlySet<StageFlagKey> = new Set([
  'enableRoutingMemory',
  'enableStrategyDistillation',
  'enablePreferenceRouting',
]);

/**
 * Resolves stage flags with defaults using a data-driven approach.
 * routingMemory and strategyDistillation default to true when persistence is on.
 */
function resolveStageFlags(stagesConfig: Partial<CompositeRouterConfig>): StageFlagsResult {
  const persistenceOn = isPersistenceEnabled();
  const result = {} as StageFlagsResult;
  for (const key of STAGE_FLAG_KEYS) {
    const explicit = stagesConfig[key];
    if (explicit !== undefined) {
      result[key] = explicit;
    } else if (PERSISTENCE_AWARE_FLAGS.has(key) && persistenceOn) {
      result[key] = true;
    } else {
      result[key] = DEFAULT_COMPOSITE_CONFIG[key];
    }
  }
  return result;
}

/**
 * Resolves the composite router's billing mode from `NEXUS_BILLING_MODE`
 * (#4196). Only the explicit value 'api' enables cost-aware routing
 * (difficulty-conditional TOPSIS weights + per-task-class cost ceilings);
 * anything else falls back to the 'plan' default, where those features are
 * annotated no-ops.
 */
function resolveBillingModeFromEnv(): CompositeRouterConfig['billingMode'] {
  return process.env['NEXUS_BILLING_MODE'] === 'api' ? 'api' : DEFAULT_COMPOSITE_CONFIG.billingMode;
}

/**
 * Builds the base CompositeRouterConfig from YAML config and defaults.
 */
/**
 * `adaptRoutingConfig` runs once per router construction, which can be many
 * times in a process; the operator only needs telling once. A module-level
 * latch rather than an exported reset hook — tests reset it with
 * `vi.resetModules()` + a fresh dynamic import, so this module adds no export
 * whose only consumer is a test.
 */
const logger = createLogger({ component: 'routing-config-adapter' });

let warnedMaxDecisionTime = false;

/**
 * Tells an operator who set `routing.linucb.maxDecisionTimeMs` that it does
 * nothing (#5918).
 *
 * The field is declared in three places, validated, and copied into the
 * runtime config — and NOTHING on the routing path compares anything to it.
 * `capacity-stage.ts` had to build its own probe race for exactly this reason.
 * An operator who sets it to protect an interactive path has not bounded
 * anything, and the JSDoc was the entire basis for believing otherwise.
 *
 * Deleting it is a published-API break (it is in `NexusConfigSchema` and the
 * exported `CompositeRouterConfig`), so it is queued for the next major
 * (#5963) and this is the deprecation cycle. The warning reads the PARSED
 * value while the declaration still exists — after removal, Zod's `$strip`
 * would discard the key before any code could see it, and detecting it would
 * need a raw-key scan built solely for that purpose.
 */
/* eslint-disable @typescript-eslint/no-deprecated -- warning about the
   deprecated field requires reading it; that is the point of this function. */
function warnIfMaxDecisionTimeSet(config: DefinedRoutingConfig): void {
  if (config.linucb?.maxDecisionTimeMs === undefined) return;
  if (warnedMaxDecisionTime) return;
  warnedMaxDecisionTime = true;
  logger.warn(
    'routing.linucb.maxDecisionTimeMs is deprecated and has no effect — routing has never enforced it. ' +
      'It is scheduled for removal in the next major (#5963). For a real bound on a single stage, see capacity-stage probeTimeoutMs.',
    { maxDecisionTimeMs: config.linucb.maxDecisionTimeMs }
  );
}
/* eslint-enable @typescript-eslint/no-deprecated */

function buildBaseConfig(
  config: DefinedRoutingConfig,
  stagesConfig: Partial<CompositeRouterConfig>
): CompositeRouterConfig {
  const stageFlags = resolveStageFlags(stagesConfig);
  warnIfMaxDecisionTimeSet(config);

  return {
    ...stageFlags,
    billingMode: resolveBillingModeFromEnv(),
    latencyScoreWeight: config.latencyScoreWeight,
    budgetConstraints: config.budget,
    linucbAlpha: config.linucb?.alpha ?? DEFAULT_COMPOSITE_CONFIG.linucbAlpha,
    // Kept populated for the deprecation cycle (#5918); goes with the field in #5963.
    maxDecisionTimeMs:
      // eslint-disable-next-line @typescript-eslint/no-deprecated
      config.linucb?.maxDecisionTimeMs ?? DEFAULT_COMPOSITE_CONFIG.maxDecisionTimeMs,
    preferenceMinDataPoints:
      config.preference?.minDataPoints ?? DEFAULT_COMPOSITE_CONFIG.preferenceMinDataPoints,
  };
}

/**
 * Converts RoutingConfig from YAML schema to CompositeRouterConfigWithPreference.
 *
 * @param yamlConfig - Routing config from nexus-agents.yaml
 * @returns Runtime config for CompositeRouter
 */
export function adaptRoutingConfig(
  yamlConfig?: RoutingConfig
): CompositeRouterConfigWithPreference {
  const config: DefinedRoutingConfig = yamlConfig ?? ADAPTER_DEFAULTS;
  const stagesConfig = adaptStagesConfig(config.stages);
  const baseConfig = buildBaseConfig(config, stagesConfig);

  return {
    ...baseConfig,
    zeroRouterConfig: adaptZeroRouterConfig(config.zeroRouter),
    latencyTrackerConfig: adaptLatencyTrackerConfig(config.latencyTracker),
    routingMemoryConfig: adaptRoutingMemoryConfig(config.routingMemory),
    // #5785: the fourth stage config. It was absent here while the adapter for
    // it (`getTopsisConfigFromYaml`) sat unused, so a `routing.topsis` block
    // was validated and defaulted and then never reached the stage.
    topsisConfig: getTopsisConfigFromYaml(yamlConfig),
  };
}

/**
 * Gets TOPSIS config from YAML routing config.
 * Useful when TOPSIS is used independently of CompositeRouter.
 *
 * @param yamlConfig - Routing config from nexus-agents.yaml
 * @returns Runtime TOPSIS config
 */
export function getTopsisConfigFromYaml(yamlConfig?: RoutingConfig): RuntimeTopsisConfig {
  const config: DefinedRoutingConfig = yamlConfig ?? ADAPTER_DEFAULTS;
  const adapted = adaptTopsisConfig(config.topsis);

  const result: RuntimeTopsisConfig = {
    criteria: adapted.criteria ?? DEFAULT_TOPSIS_CONFIG.criteria,
    minQualityThreshold: adapted.minQualityThreshold ?? DEFAULT_TOPSIS_CONFIG.minQualityThreshold,
    verbose: adapted.verbose ?? DEFAULT_TOPSIS_CONFIG.verbose,
  };

  if (adapted.maxLatencyMs !== undefined) {
    (result as { maxLatencyMs?: number }).maxLatencyMs = adapted.maxLatencyMs;
  }
  if (adapted.maxCostPerRequest !== undefined) {
    (result as { maxCostPerRequest?: number }).maxCostPerRequest = adapted.maxCostPerRequest;
  }

  return result;
}
