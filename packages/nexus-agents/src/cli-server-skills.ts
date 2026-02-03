/**
 * nexus-agents CLI Server Skill Library Initialization
 *
 * Wires skill library configuration from nexus-agents.yaml to the skill library.
 * Creates and manages a global skill library instance at server startup.
 *
 * @module cli-server-skills
 * (Source: Issue #491 - Wire SkillLibrary to orchestration)
 */

import type { ILogger } from './core/index.js';
import { createSkillLibrary, type SkillLibrary } from './agents/skills/skill-library.js';
import type { SkillLibraryConfig } from './config/index.js';
import { registerStandardsSkills } from './agents/skills/bootstrap/index.js';
import { loadAllExternalPacks } from './agents/skills/external-pack-loader.js';

/**
 * Global skill library instance.
 * Initialized at server startup if enabled in config.
 */
let globalSkillLibrary: SkillLibrary | undefined;

/**
 * Options for skill library initialization.
 */
export interface InitializeSkillsOptions {
  /** Skill library configuration from nexus-agents.yaml */
  skillsConfig?: SkillLibraryConfig | undefined;
  /** Logger instance */
  logger: ILogger;
}

/**
 * Result of skill library initialization.
 */
export interface SkillsInitResult {
  /** Whether the skill library was initialized */
  initialized: boolean;
  /** Reason if not initialized */
  reason?: string | undefined;
  /** The skill library instance (if initialized) */
  library?: SkillLibrary | undefined;
}

/**
 * Converts config schema to library config format.
 * The library expects a slightly different shape than the config schema.
 */
function adaptConfigToLibrary(
  config: SkillLibraryConfig
): Parameters<typeof createSkillLibrary>[0] {
  return {
    maxSkills: config.maxSkills,
    minSuccessRateForRetention: config.minSuccessRateForRetention,
    executionsBeforeEvaluation: config.executionsBeforeEvaluation,
    enablePruning: config.enablePruning,
    trackExecutionHistory: config.trackExecutionHistory,
    maxHistoryPerSkill: config.maxHistoryPerSkill,
  };
}

/**
 * Initializes the global skill library.
 *
 * Creates a skill library instance based on the configuration from nexus-agents.yaml.
 * The library is only created if enabled in config (default: true).
 * Loads external skill packs if configured (Issue #654).
 *
 * @param options - Initialization options
 * @returns Skill library initialization result
 */
export async function initializeSkillLibrary(
  options: InitializeSkillsOptions
): Promise<SkillsInitResult> {
  const { skillsConfig, logger } = options;

  // Check if already initialized
  if (globalSkillLibrary !== undefined) {
    logger.debug('Skill library already initialized');
    return { initialized: true, library: globalSkillLibrary };
  }

  // Check if disabled in config
  if (skillsConfig?.enabled === false) {
    logger.info('Skill library disabled by configuration');
    return { initialized: false, reason: 'disabled in config' };
  }

  // Create the skill library with config
  const libraryConfig = skillsConfig !== undefined ? adaptConfigToLibrary(skillsConfig) : undefined;
  globalSkillLibrary = createSkillLibrary(libraryConfig, logger);

  // Register built-in standards skills
  registerStandardsSkills(globalSkillLibrary, logger);

  // Load external skill packs if configured (Issue #654)
  await loadExternalSkillPacks(skillsConfig, globalSkillLibrary, logger);

  logger.info('Skill library initialized', {
    maxSkills: globalSkillLibrary.getConfig().maxSkills,
    enablePruning: globalSkillLibrary.getConfig().enablePruning,
    trackHistory: globalSkillLibrary.getConfig().trackExecutionHistory,
  });

  return { initialized: true, library: globalSkillLibrary };
}

/**
 * Loads external skill packs from config and adds them to the library.
 */
async function loadExternalSkillPacks(
  skillsConfig: SkillLibraryConfig | undefined,
  library: SkillLibrary,
  logger: ILogger
): Promise<void> {
  const externalPacks = skillsConfig?.externalPacks;
  if (!externalPacks || externalPacks.length === 0) {
    return;
  }

  logger.info('Loading external skill packs', { count: externalPacks.length });
  const { loaded, errors } = await loadAllExternalPacks(externalPacks, logger);

  for (const packResult of loaded) {
    for (const skill of packResult.skills) {
      library.addSkill(skill);
    }
  }

  if (errors.length > 0) {
    logger.warn('Some external packs failed to load', {
      failedCount: errors.length,
      failedPacks: errors.map((e) => e.packName),
    });
  }
}

/**
 * Gets the global skill library instance.
 *
 * @returns The skill library if initialized, undefined otherwise
 */
export function getSkillLibrary(): SkillLibrary | undefined {
  return globalSkillLibrary;
}

/**
 * Resets the global skill library.
 * Used primarily for testing.
 */
export function resetSkillLibrary(): void {
  globalSkillLibrary = undefined;
}
