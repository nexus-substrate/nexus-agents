/**
 * nexus-agents - External Skill Pack Loader
 *
 * Loads skill packs from npm packages or local file paths.
 * External packs must export a manifest conforming to ExternalPackManifest.
 *
 * @module agents/skills/external-pack-loader
 * (Source: Issue #654 - External skill packs)
 */

import { z } from 'zod';
import type { ILogger } from '../../core/index.js';
import { getErrorMessage, ok, err } from '../../core/index.js';

import type { Result } from '../../core/index.js';
import type { CreateSkillOptions } from './skill-types.js';

/**
 * Manifest that external skill packs must export.
 * The pack's main module must have a default export or named export 'manifest'.
 */
export interface ExternalPackManifest {
  /** Pack name */
  readonly name: string;
  /** Pack version (semver) */
  readonly version: string;
  /** Pack description */
  readonly description: string;
  /** Minimum nexus-agents version required */
  readonly minNexusVersion?: string;
  /** Skills provided by this pack */
  readonly skills: readonly CreateSkillOptions[];
}

/**
 * Error class for external pack loading failures.
 */
export class ExternalPackError extends Error {
  constructor(
    message: string,
    public readonly packName: string,
    public readonly source: string
  ) {
    super(message);
    this.name = 'ExternalPackError';
  }
}

/**
 * Result of loading an external pack.
 */
export interface ExternalPackLoadResult {
  /** Successfully loaded pack name */
  readonly packName: string;
  /** Number of skills loaded */
  readonly skillCount: number;
  /** Skills from the pack */
  readonly skills: readonly CreateSkillOptions[];
}

/** Configuration for an external pack source (re-exported from config). */
export interface ExternalPackSourceConfig {
  readonly name: string;
  readonly source: string;
  readonly enabled: boolean;
}

// --- Zod validation schemas for runtime boundary checking ---

const ExternalSkillParameterSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean(),
  defaultValue: z.unknown().optional(),
});

const ExternalSkillExampleSchema = z.object({
  input: z.record(z.string(), z.unknown()),
  expectedOutput: z.string().optional(),
  description: z.string().optional(),
});

const ExternalSkillSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  category: z.string().min(1),
  complexity: z.enum(['primitive', 'simple', 'moderate', 'complex', 'composite']),
  code: z.string().min(1),
  parameters: z.array(ExternalSkillParameterSchema),
  outputType: z.string().min(1),
  dependencies: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  examples: z.array(ExternalSkillExampleSchema).optional(),
});

const ManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().min(1),
  minNexusVersion: z.string().optional(),
  skills: z.array(ExternalSkillSchema),
});

/**
 * Resolves a pack source string to an importable path.
 * Local paths (starting with ./ ../ or /) are resolved to absolute paths.
 * npm package names are returned as-is.
 */
async function resolveImportPath(source: string): Promise<string> {
  if (source.startsWith('./') || source.startsWith('/') || source.startsWith('../')) {
    const pathModule = await import('node:path');
    return pathModule.resolve(process.cwd(), source);
  }
  return source;
}

/**
 * Extracts the manifest from a dynamically imported module.
 * Looks for default export, named 'manifest' export, or the module itself.
 */
function extractManifest(module: Record<string, unknown>): unknown {
  return module['default'] ?? module['manifest'] ?? module;
}

/**
 * Validates a raw manifest object against the expected schema.
 */
function validateManifest(
  raw: unknown,
  packName: string,
  source: string
): Result<z.infer<typeof ManifestSchema>, ExternalPackError> {
  const parseResult = ManifestSchema.safeParse(raw);
  if (!parseResult.success) {
    const issues = parseResult.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return err(new ExternalPackError(`Invalid pack manifest: ${issues}`, packName, source));
  }
  return ok(parseResult.data);
}

/**
 * Loads an external skill pack from a configured source.
 *
 * @param packSource - External pack configuration
 * @param logger - Logger instance for diagnostics
 * @returns Result containing loaded skills or an error
 */
export async function loadExternalPack(
  packSource: ExternalPackSourceConfig,
  logger: ILogger
): Promise<Result<ExternalPackLoadResult, ExternalPackError>> {
  const { name, source, enabled } = packSource;

  if (!enabled) {
    logger.debug('Skipping disabled external pack', { name, source });
    return ok({ packName: name, skillCount: 0, skills: [] });
  }

  logger.info('Loading external skill pack', { name, source });

  try {
    const importPath = await resolveImportPath(source);
    const module = (await import(importPath)) as Record<string, unknown>;
    const rawManifest = extractManifest(module);

    const validationResult = validateManifest(rawManifest, name, source);
    if (!validationResult.ok) {
      return validationResult;
    }

    const manifest = validationResult.value;
    logger.info('External pack loaded successfully', {
      name: manifest.name,
      version: manifest.version,
      skillCount: manifest.skills.length,
    });

    return ok({
      packName: manifest.name,
      skillCount: manifest.skills.length,
      skills: manifest.skills as unknown as readonly CreateSkillOptions[],
    });
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    return err(
      new ExternalPackError(
        `Failed to load pack "${name}" from "${source}": ${message}`,
        name,
        source
      )
    );
  }
}

/**
 * Aggregate result of loading multiple external packs.
 */
export interface ExternalPacksLoadSummary {
  /** Successfully loaded packs */
  readonly loaded: readonly ExternalPackLoadResult[];
  /** Packs that failed to load */
  readonly errors: readonly ExternalPackError[];
}

/**
 * Loads all configured external skill packs.
 *
 * @param packs - Array of external pack configurations
 * @param logger - Logger instance for diagnostics
 * @returns Summary of loaded packs and any errors
 */
export async function loadAllExternalPacks(
  packs: readonly ExternalPackSourceConfig[],
  logger: ILogger
): Promise<ExternalPacksLoadSummary> {
  const loaded: ExternalPackLoadResult[] = [];
  const errors: ExternalPackError[] = [];

  for (const pack of packs) {
    const result = await loadExternalPack(pack, logger);
    if (result.ok) {
      loaded.push(result.value);
    } else {
      errors.push(result.error);
      logger.warn('Failed to load external pack', {
        name: pack.name,
        error: result.error.message,
      });
    }
  }

  logger.info('External pack loading complete', {
    loaded: loaded.length,
    errors: errors.length,
    totalSkills: loaded.reduce((sum, r) => sum + r.skillCount, 0),
  });

  return { loaded, errors };
}
