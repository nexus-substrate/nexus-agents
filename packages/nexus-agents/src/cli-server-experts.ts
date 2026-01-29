/**
 * nexus-agents CLI Server Expert Initialization
 *
 * Wires expert configuration from nexus-agents.yaml to the expert system.
 * Creates built-in and custom experts at server startup.
 *
 * @module cli-server-experts
 * (Source: Issue #486 - Wire experts config to expert system)
 */

import {
  ExpertFactory,
  getExpertRegistry,
  type ExpertConfig,
  type CreateExpertOptions,
} from './agents/index.js';
import type { ILogger, IModelAdapter, AgentRole, AgentCapability } from './core/index.js';
import type { ExpertConfig as ConfigExpertConfig, CustomExpertDefinition } from './config/index.js';

/**
 * Options for expert initialization.
 */
export interface InitializeExpertsOptions {
  /** Expert configuration from nexus-agents.yaml */
  expertConfig?: ConfigExpertConfig | undefined;
  /** Logger instance */
  logger: ILogger;
  /** Optional model adapter for expert execution */
  modelAdapter?: IModelAdapter | undefined;
}

/**
 * Result of expert initialization.
 */
export interface ExpertInitResult {
  /** Number of built-in experts registered */
  builtInCount: number;
  /** Number of custom experts registered */
  customCount: number;
  /** Total experts registered */
  totalCount: number;
  /** IDs of registered experts */
  registeredIds: string[];
}

/**
 * Valid agent capabilities that can be mapped from config.
 */
const VALID_CAPABILITIES: readonly string[] = [
  'task_execution',
  'delegation',
  'collaboration',
  'tool_use',
  'code_generation',
  'code_review',
  'research',
];

/**
 * Maps expert domain to agent role.
 */
function domainToRole(domain: string): AgentRole {
  const domainRoles: Record<string, AgentRole> = {
    code: 'code_expert',
    security: 'security_expert',
    architecture: 'architecture_expert',
    documentation: 'documentation_expert',
    testing: 'testing_expert',
    general: 'custom',
  };
  return domainRoles[domain] ?? 'custom';
}

/**
 * Maps capability strings to AgentCapability, filtering invalid ones.
 */
function mapCapabilities(capabilities: string[]): AgentCapability[] {
  return capabilities.filter((cap) => VALID_CAPABILITIES.includes(cap)) as AgentCapability[];
}

/**
 * Generates a human-readable name from expert ID.
 */
function idToName(id: string): string {
  return id
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Converts a CustomExpertDefinition from config to ExpertConfig for factory.
 */
function convertCustomExpert(id: string, def: CustomExpertDefinition): ExpertConfig {
  const mappedCapabilities = mapCapabilities(def.capabilities);
  // Ensure at least task_execution capability
  const capabilities =
    mappedCapabilities.length > 0 ? mappedCapabilities : (['task_execution'] as AgentCapability[]);

  return {
    id,
    name: def.description ?? idToName(id),
    role: domainToRole(def.domain),
    systemPrompt: def.systemPrompt,
    capabilities,
    modelPreference: {
      temperature: def.temperature,
    },
    metadata: {
      tier: def.tier,
      domain: def.domain,
      secondaryDomains: def.secondaryDomains,
      weight: def.weight,
      available: def.available,
      tools: def.tools,
      source: 'config',
    },
  };
}

/**
 * Creates built-in experts if enabled.
 */
function createBuiltInExperts(
  logger: ILogger,
  options?: CreateExpertOptions
): { count: number; ids: string[] } {
  const result = ExpertFactory.createAllBuiltIn(options);
  if (!result.ok) {
    logger.warn('Failed to create built-in experts', { error: result.error.message });
    return { count: 0, ids: [] };
  }

  const registry = getExpertRegistry();
  const registerResult = registry.registerMany(result.value, { replace: true });
  if (!registerResult.ok) {
    logger.warn('Failed to register built-in experts', { error: registerResult.error.message });
    return { count: 0, ids: [] };
  }

  const ids = result.value.map((e) => e.id);
  logger.info('Registered built-in experts', { count: result.value.length, ids });
  return { count: result.value.length, ids };
}

/**
 * Creates custom experts from configuration.
 */
function createCustomExperts(
  customDefs: Record<string, CustomExpertDefinition>,
  logger: ILogger,
  options?: CreateExpertOptions
): { count: number; ids: string[] } {
  const registry = getExpertRegistry();
  const ids: string[] = [];

  for (const [id, def] of Object.entries(customDefs)) {
    if (!def.available) {
      logger.debug('Skipping unavailable custom expert', { id });
      continue;
    }

    const config = convertCustomExpert(id, def);
    const result = ExpertFactory.create(config, options);

    if (!result.ok) {
      logger.warn('Failed to create custom expert', { id, error: result.error.message });
      continue;
    }

    const registerResult = registry.register(result.value, { replace: true });
    if (!registerResult.ok) {
      logger.warn('Failed to register custom expert', { id, error: registerResult.error.message });
      continue;
    }

    ids.push(id);
  }

  if (ids.length > 0) {
    logger.info('Registered custom experts', { count: ids.length, ids });
  }

  return { count: ids.length, ids };
}

/**
 * Initializes experts from configuration.
 *
 * Creates and registers both built-in and custom experts based on the
 * experts configuration in nexus-agents.yaml.
 *
 * @param options - Initialization options
 * @returns Expert initialization result
 */
export function initializeExperts(options: InitializeExpertsOptions): ExpertInitResult {
  const { expertConfig, logger, modelAdapter } = options;

  const createOptions: CreateExpertOptions = {};
  if (modelAdapter !== undefined) {
    createOptions.adapter = modelAdapter;
  }

  let builtInCount = 0;
  let customCount = 0;
  const registeredIds: string[] = [];

  // Create built-in experts if enabled (default: true)
  const shouldCreateBuiltIn = expertConfig?.builtin !== false;
  if (shouldCreateBuiltIn) {
    const builtInResult = createBuiltInExperts(logger, createOptions);
    builtInCount = builtInResult.count;
    registeredIds.push(...builtInResult.ids);
  } else {
    logger.info('Built-in experts disabled by configuration');
  }

  // Create custom experts if defined
  if (expertConfig?.custom !== undefined && Object.keys(expertConfig.custom).length > 0) {
    const customResult = createCustomExperts(expertConfig.custom, logger, createOptions);
    customCount = customResult.count;
    registeredIds.push(...customResult.ids);
  }

  const totalCount = builtInCount + customCount;
  logger.info('Expert initialization complete', {
    builtInCount,
    customCount,
    totalCount,
    registeredIds,
  });

  return {
    builtInCount,
    customCount,
    totalCount,
    registeredIds,
  };
}
