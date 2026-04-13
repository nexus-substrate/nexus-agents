/**
 * Tests for skill-matcher.ts
 * @module agents/experts/skill-matcher.test
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { loadSkills, matchSkills, formatSkillsForPrompt } from './skill-matcher.js';

// Skills are at repo root, not package root
const SKILLS_DIR = resolve(import.meta.dirname ?? '.', '../../../../../skills');

describe('loadSkills', () => {
  it('loads skills from skills/', async () => {
    const skills = await loadSkills(SKILLS_DIR);
    expect(skills.length).toBeGreaterThan(5);
  });

  it('parses frontmatter correctly', async () => {
    const skills = await loadSkills(SKILLS_DIR);
    const bugFix = skills.find((s) => s.name === 'bug-fix');
    expect(bugFix).toBeDefined();
    expect(bugFix!.description).toContain('bug');
  });

  it('returns empty for nonexistent directory', async () => {
    const skills = await loadSkills('/nonexistent/path');
    expect(skills).toHaveLength(0);
  });
});

describe('matchSkills', () => {
  it('matches security skills to security expert', async () => {
    const skills = await loadSkills(SKILLS_DIR);
    const matches = matchSkills(skills, 'security_expert');
    // Should find security-scanning skill
    const names = matches.map((m) => m.skill.name);
    expect(names.some((n) => n.includes('security'))).toBe(true);
  });

  it('matches code skills to code expert', async () => {
    const skills = await loadSkills(SKILLS_DIR);
    const matches = matchSkills(skills, 'code_expert');
    expect(matches.length).toBeGreaterThan(0);
  });

  it('caps at MAX_SKILLS (3)', async () => {
    const skills = await loadSkills(SKILLS_DIR);
    const matches = matchSkills(skills, 'code_expert');
    expect(matches.length).toBeLessThanOrEqual(3);
  });

  it('sorts by score descending', async () => {
    const skills = await loadSkills(SKILLS_DIR);
    const matches = matchSkills(skills, 'code_expert');
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i - 1]!.score).toBeGreaterThanOrEqual(matches[i]!.score);
    }
  });

  it('returns empty for unknown role', async () => {
    const skills = await loadSkills(SKILLS_DIR);
    const matches = matchSkills(skills, 'unknown_role');
    expect(matches).toHaveLength(0);
  });
});

describe('formatSkillsForPrompt', () => {
  it('returns empty for no matches', () => {
    expect(formatSkillsForPrompt([])).toBe('');
  });

  it('formats matched skills as prompt section', async () => {
    const skills = await loadSkills(SKILLS_DIR);
    const matches = matchSkills(skills, 'security_expert');
    const prompt = formatSkillsForPrompt(matches);
    if (matches.length > 0) {
      expect(prompt).toContain('Relevant Skills');
    }
  });
});
