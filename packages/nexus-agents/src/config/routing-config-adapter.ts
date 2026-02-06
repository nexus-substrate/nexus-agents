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

/** Non-nullable routing config for internal use. */
type DefinedRoutingConfig = NonNullable<RoutingConfig>;

/** Default routing config with proper typing. */
const ADAPTER_DEFAULTS: DefinedRoutingConfig = {
  stages: {
    budgetFilter: true,
    zeroRouter: true,
    preferenceRouting: false,
    topsisRanking: true,
    linucbSelection: true,
    latencyTracking: true,
    routingMemory: false,
    // Issue #755: New replacement stages (disabled by default for backward compatibility)
    confidenceCascade: false,
    capabilityMatch: false,
    qualityConstraint: false,
  },
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
  'enableCapacityBalancing',
] as const;

type StageFlagKey = (typeof STAGE_FLAG_KEYS)[number];
type StageFlagsResult = Pick<CompositeRouterConfig, StageFlagKey>;

/**
 * Resolves stage flags with defaults using a data-driven approach.
 */
function resolveStageFlags(stagesConfig: Partial<CompositeRouterConfig>): StageFlagsResult {
  const result = {} as StageFlagsResult;
  for (const key of STAGE_FLAG_KEYS) {
    result[key] = stagesConfig[key] ?? DEFAULT_COMPOSITE_CONFIG[key];
  }
  return result;
}

/**
 * Builds the base CompositeRouterConfig from YAML config and defaults.
 */
function buildBaseConfig(
  config: DefinedRoutingConfig,
  stagesConfig: Partial<CompositeRouterConfig>
): CompositeRouterConfig {
  const stageFlags = resolveStageFlags(stagesConfig);

  return {
    ...stageFlags,
    billingMode: DEFAULT_COMPOSITE_CONFIG.billingMode,
    latencyScoreWeight: config.latencyScoreWeight,
    budgetConstraints: config.budget,
    linucbAlpha: config.linucb?.alpha ?? DEFAULT_COMPOSITE_CONFIG.linucbAlpha,
    maxDecisionTimeMs:
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
