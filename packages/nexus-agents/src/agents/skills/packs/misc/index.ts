/**
 * Miscellaneous Skill Pack
 *
 * Lazy-loaded skills covering data orchestration, data quality,
 * Vue.js patterns, and accessibility (WCAG 2.1).
 * Use loadMiscPack() to load all skills on demand.
 *
 * @module agents/skills/packs/misc
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

/**
 * Lazily loads all miscellaneous skills.
 * Uses dynamic import() so the pack has zero startup cost.
 *
 * @returns All miscellaneous skills as CreateSkillOptions[]
 */
export async function loadMiscPack(): Promise<readonly CreateSkillOptions[]> {
  const [dataOrch, dataQuality, vue, a11y] = await Promise.all([
    import('./data-orchestration.js'),
    import('./data-quality.js'),
    import('./vue-patterns.js'),
    import('./accessibility.js'),
  ]);

  return [
    ...dataOrch.DATA_ORCHESTRATION_SKILLS,
    ...dataQuality.DATA_QUALITY_SKILLS,
    ...vue.VUE_SKILLS,
    ...a11y.ACCESSIBILITY_SKILLS,
  ];
}
