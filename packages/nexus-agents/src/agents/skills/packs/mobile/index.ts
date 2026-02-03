/**
 * Mobile Skill Pack
 *
 * Lazy-loaded mobile skills covering Android, iOS, and React Native patterns.
 * Use loadMobilePack() to load all skills on demand.
 *
 * @module agents/skills/packs/mobile
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

/**
 * Lazily loads all mobile skills.
 * Uses dynamic import() so the pack has zero startup cost.
 *
 * @returns All mobile skills as CreateSkillOptions[]
 */
export async function loadMobilePack(): Promise<readonly CreateSkillOptions[]> {
  const [android, ios, rn] = await Promise.all([
    import('./android-patterns.js'),
    import('./ios-patterns.js'),
    import('./react-native-patterns.js'),
  ]);

  return [...android.ANDROID_SKILLS, ...ios.IOS_SKILLS, ...rn.REACT_NATIVE_SKILLS];
}
