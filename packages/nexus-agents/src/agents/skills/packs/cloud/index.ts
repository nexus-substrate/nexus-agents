/**
 * Cloud Skill Pack
 *
 * Lazy-loaded cloud skills covering serverless, service mesh, AWS, and Kubernetes.
 * Use loadCloudPack() to load all skills on demand.
 *
 * @module agents/skills/packs/cloud
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

/**
 * Lazily loads all cloud skills.
 * Uses dynamic import() so the pack has zero startup cost.
 *
 * @returns All cloud skills as CreateSkillOptions[]
 */
export async function loadCloudPack(): Promise<readonly CreateSkillOptions[]> {
  const [serverless, mesh, aws, k8s] = await Promise.all([
    import('./serverless-patterns.js'),
    import('./service-mesh-patterns.js'),
    import('./aws-advanced.js'),
    import('./kubernetes-advanced.js'),
  ]);

  return [
    ...serverless.SERVERLESS_SKILLS,
    ...mesh.SERVICE_MESH_SKILLS,
    ...aws.AWS_ADVANCED_SKILLS,
    ...k8s.KUBERNETES_ADVANCED_SKILLS,
  ];
}
