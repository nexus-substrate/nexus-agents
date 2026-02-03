/**
 * Compliance Skill Pack
 *
 * Lazy-loaded compliance skills covering NIST 800-53, GDPR, HIPAA, and PCI-DSS.
 * Use loadCompliancePack() to load all skills on demand.
 *
 * @module agents/skills/packs/compliance
 * (Epic #643 Phase 4)
 */

import type { CreateSkillOptions } from '../../skill-types.js';

/**
 * Lazily loads all compliance skills.
 * Uses dynamic import() so the pack has zero startup cost.
 *
 * @returns All compliance skills as CreateSkillOptions[]
 */
export async function loadCompliancePack(): Promise<readonly CreateSkillOptions[]> {
  const [nist, gdpr, hipaa, pci] = await Promise.all([
    import('./nist-controls.js'),
    import('./gdpr-checklist.js'),
    import('./hipaa-checklist.js'),
    import('./pci-dss-checklist.js'),
  ]);

  return [
    ...nist.NIST_CONTROLS_SKILLS,
    ...gdpr.GDPR_SKILLS,
    ...hipaa.HIPAA_SKILLS,
    ...pci.PCI_DSS_SKILLS,
  ];
}
