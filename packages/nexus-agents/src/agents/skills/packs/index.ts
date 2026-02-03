/**
 * Skill Pack Registry
 *
 * Central registry for optional, lazy-loaded skill packs. Maps pack names
 * and product types to their respective loader functions.
 *
 * Each pack is loaded via dynamic import() so unused packs incur
 * zero startup cost.
 *
 * @module agents/skills/packs
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../skill-types.js';

/**
 * Available skill pack names.
 */
export type SkillPackName = 'compliance' | 'ml-ai' | 'mobile' | 'cloud' | 'misc';

/**
 * Product type to skill pack mapping.
 * Maps product types from the product matrix to relevant packs.
 */
const PRODUCT_PACK_MAP: Readonly<Record<string, readonly SkillPackName[]>> = {
  'ml-service': ['ml-ai'],
  mobile: ['mobile'],
  'infra-module': ['cloud'],
  'data-pipeline': ['ml-ai', 'misc'],
  'frontend-web': ['misc'],
  api: ['compliance'],
  'web-service': ['compliance', 'cloud'],
  cli: ['misc'],
} as const;

/**
 * Loads a skill pack by name using dynamic import.
 * Returns an empty array for unknown pack names.
 *
 * @param packName - Name of the skill pack to load
 * @returns Skills from the requested pack
 */
export async function loadSkillPack(
  packName: SkillPackName
): Promise<readonly CreateSkillOptions[]> {
  switch (packName) {
    case 'compliance': {
      const mod = await import('./compliance/index.js');
      return mod.loadCompliancePack();
    }
    case 'ml-ai': {
      const mod = await import('./ml-ai/index.js');
      return mod.loadMlAiPack();
    }
    case 'mobile': {
      const mod = await import('./mobile/index.js');
      return mod.loadMobilePack();
    }
    case 'cloud': {
      const mod = await import('./cloud/index.js');
      return mod.loadCloudPack();
    }
    case 'misc': {
      const mod = await import('./misc/index.js');
      return mod.loadMiscPack();
    }
    default:
      return [];
  }
}

/**
 * Loads all skill packs relevant to a product type.
 * Uses the product-to-pack mapping to determine which packs to load.
 * Returns an empty array for unmapped product types.
 *
 * @param productType - Product type identifier (e.g., 'ml-service', 'mobile')
 * @returns Combined skills from all relevant packs
 */
export async function loadPacksForProduct(
  productType: string
): Promise<readonly CreateSkillOptions[]> {
  const packNames = PRODUCT_PACK_MAP[productType];
  if (!packNames || packNames.length === 0) {
    return [];
  }

  const results = await Promise.all(packNames.map(loadSkillPack));
  return results.flat();
}

/**
 * Returns the list of available pack names.
 */
export function getAvailablePackNames(): readonly SkillPackName[] {
  return ['compliance', 'ml-ai', 'mobile', 'cloud', 'misc'] as const;
}

/**
 * Returns the pack names associated with a product type.
 * Returns an empty array for unmapped product types.
 *
 * @param productType - Product type to look up
 */
export function getPacksForProductType(productType: string): readonly SkillPackName[] {
  return PRODUCT_PACK_MAP[productType] ?? [];
}
