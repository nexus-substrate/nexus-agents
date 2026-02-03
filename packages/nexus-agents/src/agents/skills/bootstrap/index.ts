/**
 * Standards-based skill bootstrap module.
 *
 * Registers all built-in skills from absorbed standards into the SkillLibrary.
 * Called during server initialization to populate the library with 17 skills
 * across security, testing, coding, architecture, and documentation domains.
 *
 * @module agents/skills/bootstrap
 * (Epic #643 Phase 2 - Standards Absorption)
 */

import type { SkillLibrary } from '../skill-library.js';
import type { ILogger } from '../../../core/index.js';
import { SECURITY_SKILLS } from './security-standards.js';
import { TESTING_SKILLS } from './testing-standards.js';
import { CODING_SKILLS } from './coding-standards.js';
import { ARCHITECTURE_SKILLS } from './architecture-standards.js';

/**
 * All built-in standards skills, grouped by domain.
 */
const ALL_STANDARDS_SKILLS = [
  ...SECURITY_SKILLS,
  ...TESTING_SKILLS,
  ...CODING_SKILLS,
  ...ARCHITECTURE_SKILLS,
] as const;

/**
 * Registers all standards-based skills into the given SkillLibrary.
 *
 * @param library - The SkillLibrary to populate
 * @param logger - Logger for registration progress
 * @returns The number of skills successfully registered
 */
export function registerStandardsSkills(library: SkillLibrary, logger: ILogger): number {
  let registered = 0;

  for (const skillDef of ALL_STANDARDS_SKILLS) {
    try {
      library.addSkill(skillDef);
      registered++;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Failed to register skill "${skillDef.name}": ${message}`);
    }
  }

  logger.info(
    `Registered ${String(registered)}/${String(ALL_STANDARDS_SKILLS.length)} standards skills`,
    {
      domains: {
        security: SECURITY_SKILLS.length,
        testing: TESTING_SKILLS.length,
        coding: CODING_SKILLS.length,
        architecture: ARCHITECTURE_SKILLS.length,
      },
    }
  );

  return registered;
}

export { SECURITY_SKILLS } from './security-standards.js';
export { TESTING_SKILLS } from './testing-standards.js';
export { CODING_SKILLS } from './coding-standards.js';
export { ARCHITECTURE_SKILLS } from './architecture-standards.js';
