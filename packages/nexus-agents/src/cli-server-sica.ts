/**
 * nexus-agents CLI Server SICA Initialization
 *
 * Wires SICA (Self-Improving Coding Agent) configuration from nexus-agents.yaml.
 * Provides factory functions for wrapping agents with self-improvement capabilities.
 *
 * @module cli-server-sica
 * (Source: Issue #492 - Wire SicaAgent to orchestration)
 */

import type { ILogger, IAgent } from './core/index.js';
import { createSicaAgent, SicaAgent } from './agents/self-improving/sica-agent.js';
import type { SicaConfig as ConfigSicaConfig } from './config/index.js';

/**
 * Global SICA configuration and state.
 * Used to determine if agents should be wrapped with SICA.
 */
let globalSicaConfig: ConfigSicaConfig | undefined;
let sicaEnabled = false;

/**
 * Options for SICA initialization.
 */
export interface InitializeSicaOptions {
  /** SICA configuration from nexus-agents.yaml */
  sicaConfig?: ConfigSicaConfig | undefined;
  /** Logger instance */
  logger: ILogger;
}

/**
 * Result of SICA initialization.
 */
export interface SicaInitResult {
  /** Whether SICA wrapping is enabled */
  enabled: boolean;
  /** Reason if not enabled */
  reason?: string | undefined;
  /** The SICA configuration (if enabled) */
  config?: ConfigSicaConfig | undefined;
}

/**
 * Converts config schema to SICA agent config format.
 */
function adaptConfigToSica(
  config: ConfigSicaConfig
): Parameters<typeof createSicaAgent>[0]['sicaConfig'] {
  return {
    minExecutionsForImprovement: config.minExecutionsForImprovement,
    improvementThreshold: config.improvementThreshold,
    maxActiveVersions: config.maxActiveVersions,
    autoSelectBest: config.autoSelectBest,
    improvementCooldownMs: config.improvementCooldownMs,
    enableObservability: config.enableObservability,
  };
}

/**
 * Initializes global SICA configuration.
 *
 * This does NOT create SICA agents immediately. Instead, it sets up
 * the configuration so that `wrapAgentWithSica` can use it later.
 *
 * @param options - Initialization options
 * @returns SICA initialization result
 */
export function initializeSica(options: InitializeSicaOptions): SicaInitResult {
  const { sicaConfig, logger } = options;

  // Check if disabled in config (default is false)
  if (sicaConfig?.enabled !== true) {
    sicaEnabled = false;
    globalSicaConfig = undefined;
    logger.info('SICA self-improvement disabled by configuration');
    return {
      enabled: false,
      reason: sicaConfig?.enabled === false ? 'disabled in config' : 'not enabled (opt-in feature)',
    };
  }

  // Store config for later use
  sicaEnabled = true;
  globalSicaConfig = sicaConfig;

  logger.info('SICA self-improvement enabled', {
    improvementThreshold: sicaConfig.improvementThreshold,
    maxActiveVersions: sicaConfig.maxActiveVersions,
    cooldownMs: sicaConfig.improvementCooldownMs,
  });

  return {
    enabled: true,
    config: sicaConfig,
  };
}

/**
 * Checks if SICA wrapping is enabled.
 *
 * @returns True if SICA is enabled in configuration
 */
export function isSicaEnabled(): boolean {
  return sicaEnabled;
}

/**
 * Gets the current SICA configuration.
 *
 * @returns The SICA config if enabled, undefined otherwise
 */
export function getSicaConfig(): ConfigSicaConfig | undefined {
  return globalSicaConfig;
}

/**
 * Wraps an agent with SICA self-improvement capabilities.
 *
 * If SICA is not enabled, returns undefined and the caller should use the
 * original agent directly.
 *
 * @param baseAgent - The agent to wrap (e.g., TechLead)
 * @param systemPrompt - Initial system prompt for the agent
 * @param logger - Logger instance
 * @returns SicaAgent wrapper if enabled, undefined otherwise
 */
export function wrapAgentWithSica(
  baseAgent: IAgent,
  systemPrompt: string,
  logger: ILogger
): SicaAgent | undefined {
  if (!sicaEnabled || globalSicaConfig === undefined) {
    return undefined;
  }

  const sicaConfig = adaptConfigToSica(globalSicaConfig);

  const sicaAgent = createSicaAgent({
    baseAgent,
    initialConfig: {
      systemPrompt,
      temperature: 0.7,
      maxTokens: 4000,
      parameters: {},
    },
    ...(sicaConfig !== undefined && { sicaConfig }),
    logger,
  });

  logger.debug('Wrapped agent with SICA', {
    baseAgentId: baseAgent.id,
    sicaEnabled: true,
  });

  return sicaAgent;
}

/**
 * Resets SICA configuration.
 * Used primarily for testing.
 */
export function resetSica(): void {
  sicaEnabled = false;
  globalSicaConfig = undefined;
}
