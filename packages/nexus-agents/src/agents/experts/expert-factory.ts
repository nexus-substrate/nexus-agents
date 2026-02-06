/**
 * nexus-agents/agents - Expert Factory
 *
 * Factory for creating expert agents from configuration.
 * Supports both built-in expert types and custom configurations.
 */

import type { Result, IModelAdapter, AgentCapability } from '../../core/index.js';
import { ok, err, AgentError, formatZodError } from '../../core/index.js';
import type { ICTMConfig } from '../ictm/ictm-types.js';
import { ictmToExpertConfig } from '../ictm/ictm-factory.js';
import { SimpleAgent } from '../simple-agent.js';
import type { BaseAgentOptions } from '../base-agent.js';
import type { ContextPrunerAgentConfig } from '../base-agent-pruning-init.js';
import {
  type ExpertConfig,
  type BuiltInExpertType,
  type ModelPreference,
  ExpertConfigSchema,
  BuiltInExpertTypeSchema,
  BUILT_IN_EXPERTS,
} from './expert-config.js';

/**
 * Error specific to factory operations.
 */
export class FactoryError extends AgentError {
  constructor(message: string, options?: { cause?: Error; context?: Record<string, unknown> }) {
    super(message, options);
    this.name = 'FactoryError';
  }
}

/**
 * Options for creating an expert.
 * (Source: Issue #476 - Wire context pruning to ExpertFactory)
 */
export interface CreateExpertOptions {
  /** Model adapter to use */
  adapter?: IModelAdapter;
  /** Override model preferences from config */
  modelOverrides?: Partial<ModelPreference>;
  /** Additional capabilities to add */
  additionalCapabilities?: AgentCapability[];
  /**
   * Context pruning configuration (Issue #476).
   * Enables automatic memory management for long-running conversations.
   * Since Issue #479, context pruning is enabled by default.
   */
  contextPruning?: ContextPrunerAgentConfig;
}

/**
 * Expert agent extending SimpleAgent with configuration-based setup.
 */
export class Expert extends SimpleAgent {
  readonly expertConfig: ExpertConfig;

  constructor(options: BaseAgentOptions, config: ExpertConfig) {
    super(options);
    this.expertConfig = config;
  }

  /**
   * Get the expert's name.
   */
  get name(): string {
    return this.expertConfig.name;
  }

  /**
   * Get the expert's metadata.
   */
  get metadata(): Record<string, unknown> | undefined {
    return this.expertConfig.metadata;
  }
}

// buildValidationError removed - use formatZodError from core/index.js instead

/**
 * Default values for model preferences.
 */
const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Merge capabilities from config and options.
 */
function mergeCapabilities(
  configCaps: AgentCapability[],
  additionalCaps?: AgentCapability[]
): AgentCapability[] {
  if (additionalCaps === undefined) {
    return configCaps;
  }
  return [...configCaps, ...additionalCaps];
}

/**
 * Resolve temperature from overrides, config, or default.
 */
function resolveTemperature(
  overrides?: Partial<ModelPreference>,
  configPreference?: ModelPreference
): number {
  return overrides?.temperature ?? configPreference?.temperature ?? DEFAULT_TEMPERATURE;
}

/**
 * Resolve maxTokens from overrides, config, or default.
 */
function resolveMaxTokens(
  overrides?: Partial<ModelPreference>,
  configPreference?: ModelPreference
): number {
  return overrides?.maxTokens ?? configPreference?.maxTokens ?? DEFAULT_MAX_TOKENS;
}

/**
 * Build agent options from validated config.
 * (Source: Issue #476 - Wire context pruning to ExpertFactory)
 */
function buildAgentOptions(
  validConfig: ExpertConfig,
  options?: CreateExpertOptions
): BaseAgentOptions {
  const capabilities = mergeCapabilities(validConfig.capabilities, options?.additionalCapabilities);

  const baseOptions: BaseAgentOptions = {
    id: validConfig.id,
    role: validConfig.role,
    capabilities: capabilities as readonly AgentCapability[],
    systemPrompt: validConfig.systemPrompt,
    temperature: resolveTemperature(options?.modelOverrides, validConfig.modelPreference),
    maxTokens: resolveMaxTokens(options?.modelOverrides, validConfig.modelPreference),
  };

  if (options?.adapter !== undefined) {
    baseOptions.adapter = options.adapter;
  }

  // Pass through context pruning configuration (Issue #476)
  if (options?.contextPruning !== undefined) {
    baseOptions.contextPruning = options.contextPruning;
  }

  return baseOptions;
}

/**
 * Copy a built-in config to avoid mutation.
 */
function copyBuiltInConfig(type: BuiltInExpertType): ExpertConfig {
  const builtInConfig = BUILT_IN_EXPERTS[type];
  const config: ExpertConfig = {
    ...builtInConfig,
    capabilities: [...builtInConfig.capabilities],
  };
  if (builtInConfig.modelPreference !== undefined) {
    config.modelPreference = { ...builtInConfig.modelPreference };
  }
  return config;
}

/**
 * Create an expert agent from a configuration object.
 *
 * @param config - Expert configuration
 * @param options - Creation options including adapter
 * @returns Result with Expert or FactoryError
 *
 * @example
 * ```typescript
 * const config: ExpertConfig = {
 *   id: 'my-expert',
 *   name: 'My Expert',
 *   role: 'code_expert',
 *   capabilities: ['task_execution'],
 *   systemPrompt: 'You are a code review expert.',
 * };
 * const result = createExpert(config, { adapter: myAdapter });
 * if (result.ok) {
 *   const expert = result.value;
 * }
 * ```
 */
export function createExpert(
  config: ExpertConfig,
  options?: CreateExpertOptions
): Result<Expert, FactoryError> {
  const validationResult = ExpertConfigSchema.safeParse(config);

  if (!validationResult.success) {
    return err(
      new FactoryError(`Invalid expert configuration: ${formatZodError(validationResult.error)}`, {
        context: { configId: config.id, validationErrors: validationResult.error.issues },
      })
    );
  }

  const validConfig = validationResult.data as ExpertConfig;
  const agentOptions = buildAgentOptions(validConfig, options);

  try {
    const expert = new Expert(agentOptions, validConfig);
    return ok(expert);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const errorOptions: { cause?: Error; context: Record<string, unknown> } = {
      context: { configId: validConfig.id },
    };
    if (error instanceof Error) {
      errorOptions.cause = error;
    }
    return err(new FactoryError(`Failed to create expert: ${message}`, errorOptions));
  }
}

/**
 * Create a built-in expert by type.
 *
 * Built-in types include: 'code', 'architecture', 'security',
 * 'documentation', and 'testing'.
 *
 * @param type - Built-in expert type
 * @param options - Creation options including adapter
 * @returns Result with Expert or FactoryError
 *
 * @example
 * ```typescript
 * const result = createBuiltInExpert('security', { adapter: myAdapter });
 * if (result.ok) {
 *   const securityExpert = result.value;
 * }
 * ```
 */
export function createBuiltInExpert(
  type: BuiltInExpertType,
  options?: CreateExpertOptions
): Result<Expert, FactoryError> {
  const typeValidation = BuiltInExpertTypeSchema.safeParse(type);

  if (!typeValidation.success) {
    const typeStr = typeof type === 'string' ? type : 'unknown';
    return err(
      new FactoryError(`Invalid built-in expert type: ${typeStr}`, {
        context: {
          providedType: type,
          validTypes: ['code', 'architecture', 'security', 'documentation', 'testing'],
        },
      })
    );
  }

  const config = copyBuiltInConfig(type);
  return createExpert(config, options);
}

/**
 * Create multiple experts from configurations.
 *
 * @param configs - Array of expert configurations
 * @param options - Creation options applied to all experts
 * @returns Result with array of Experts or first FactoryError
 */
export function createManyExperts(
  configs: ExpertConfig[],
  options?: CreateExpertOptions
): Result<Expert[], FactoryError> {
  const experts: Expert[] = [];

  for (const config of configs) {
    const result = createExpert(config, options);
    if (!result.ok) {
      return result as Result<never, FactoryError>;
    }
    experts.push(result.value);
  }

  return ok(experts);
}

/**
 * Create all built-in experts.
 *
 * @param options - Creation options applied to all experts
 * @returns Result with array of all built-in Experts
 */
export function createAllBuiltInExperts(
  options?: CreateExpertOptions
): Result<Expert[], FactoryError> {
  const types: BuiltInExpertType[] = [
    'code',
    'architecture',
    'security',
    'documentation',
    'testing',
  ];

  const experts: Expert[] = [];

  for (const type of types) {
    const result = createBuiltInExpert(type, options);
    if (!result.ok) {
      return result as Result<never, FactoryError>;
    }
    experts.push(result.value);
  }

  return ok(experts);
}

/**
 * Validate a configuration without creating an expert.
 *
 * @param config - Configuration to validate
 * @returns Result with validated config or FactoryError
 */
export function validateExpertConfigStrict(config: unknown): Result<ExpertConfig, FactoryError> {
  const result = ExpertConfigSchema.safeParse(config);

  if (!result.success) {
    return err(
      new FactoryError(`Invalid expert configuration: ${formatZodError(result.error)}`, {
        context: { validationErrors: result.error.issues },
      })
    );
  }

  return ok(result.data as ExpertConfig);
}

/**
 * Get the configuration for a built-in expert type.
 *
 * @param type - Built-in expert type
 * @returns Result with config or FactoryError if type invalid
 */
export function getBuiltInExpertConfig(
  type: BuiltInExpertType
): Result<ExpertConfig, FactoryError> {
  const typeValidation = BuiltInExpertTypeSchema.safeParse(type);

  if (!typeValidation.success) {
    const typeStr = typeof type === 'string' ? type : 'unknown';
    return err(
      new FactoryError(`Invalid built-in expert type: ${typeStr}`, {
        context: {
          providedType: type,
          validTypes: ['code', 'architecture', 'security', 'documentation', 'testing'],
        },
      })
    );
  }

  return ok(copyBuiltInConfig(type));
}

/**
 * Create an expert agent from an ICTM configuration (Issue #756).
 *
 * Bridges the ICTM pattern to the existing expert factory by converting
 * the ICTM config to an ExpertConfig and delegating to createExpert().
 *
 * @param ictm - ICTM configuration with instructions, context, tools, model
 * @param subtaskId - Subtask identifier used for naming
 * @param options - Creation options including adapter
 * @returns Result with Expert or FactoryError
 */
export function createFromICTM(
  ictm: ICTMConfig,
  subtaskId: string,
  options?: CreateExpertOptions
): Result<Expert, FactoryError> {
  const expertConfig = ictmToExpertConfig(ictm, subtaskId);
  return createExpert(expertConfig, options);
}

/**
 * Factory namespace for creating expert agents.
 * Provides static methods for backward compatibility.
 */
export const ExpertFactory = {
  create: createExpert,
  createBuiltIn: createBuiltInExpert,
  createMany: createManyExperts,
  createAllBuiltIn: createAllBuiltInExperts,
  validate: validateExpertConfigStrict,
  getBuiltInConfig: getBuiltInExpertConfig,
  createFromICTM,
} as const;
