/**
 * ML/AI Skill Pack
 *
 * Lazy-loaded ML/AI skills covering testing, model serving, and MLOps pipelines.
 * Use loadMlAiPack() to load all skills on demand.
 *
 * @module agents/skills/packs/ml-ai
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

/**
 * Lazily loads all ML/AI skills.
 * Uses dynamic import() so the pack has zero startup cost.
 *
 * @returns All ML/AI skills as CreateSkillOptions[]
 */
export async function loadMlAiPack(): Promise<readonly CreateSkillOptions[]> {
  const [testing, serving, pipeline] = await Promise.all([
    import('./ml-testing.js'),
    import('./model-serving.js'),
    import('./mlops-pipeline.js'),
  ]);

  return [
    ...testing.ML_TESTING_SKILLS,
    ...serving.MODEL_SERVING_SKILLS,
    ...pipeline.MLOPS_PIPELINE_SKILLS,
  ];
}
