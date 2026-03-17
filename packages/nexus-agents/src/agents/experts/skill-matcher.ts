/**
 * Skill relevance matching for expert prompt injection.
 *
 * Reads .claude/skills/ Markdown files, scores them against
 * expert roles using keyword matching, and returns the top-K
 * most relevant skills for injection into expert prompts.
 *
 * Read-only: never writes to the skills directory.
 *
 * @module agents/experts/skill-matcher
 */

import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

/** A parsed skill with its metadata and content. */
export interface ParsedSkill {
  name: string;
  description: string;
  content: string;
  filePath: string;
}

/** A skill match with relevance score. */
export interface SkillMatch {
  skill: ParsedSkill;
  score: number;
}

/** Maximum skills to inject per expert prompt. */
const MAX_SKILLS = 3;

/** Maximum content length per skill to prevent context bloat. */
const MAX_SKILL_CONTENT = 1500;

/** Keywords that map expert roles to skill relevance. */
const ROLE_KEYWORDS: Record<string, readonly string[]> = {
  code_expert: ['implement', 'code', 'feature', 'build', 'create', 'refactor'],
  architecture_expert: ['architecture', 'design', 'system', 'review', 'infrastructure'],
  security_expert: ['security', 'scan', 'vulnerability', 'audit', 'hardening'],
  documentation_expert: ['documentation', 'docs', 'doc sync', 'management'],
  testing_expert: ['test', 'bug', 'fix', 'debug', 'coverage'],
  devops_expert: ['infrastructure', 'deploy', 'ci', 'pipeline', 'server'],
  research_expert: ['research', 'investigate', 'evaluate', 'vote'],
  pm_expert: ['requirements', 'feature', 'plan', 'sprint', 'release'],
  ux_expert: ['design', 'ui', 'ux', 'landing page'],
  infrastructure_expert: ['infrastructure', 'server', 'bare metal', 'idrac'],
};

/** Parse YAML frontmatter from a Markdown skill file. */
function parseFrontmatter(content: string): { name: string; description: string; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(content);
  if (match === null) return { name: '', description: '', body: content };

  const yaml = match[1] ?? '';
  const body = match[2] ?? '';

  const nameMatch = /^name:\s*(.+)$/m.exec(yaml);
  const descMatch = /^description:\s*\|?\s*\n?([\s\S]*?)(?=\n\w|\n---|\Z)/m.exec(yaml);

  return {
    name: nameMatch?.[1]?.trim() ?? '',
    description: descMatch?.[1]?.trim() ?? '',
    body: body.trim(),
  };
}

/** Score a skill against a role using keyword overlap. */
function scoreSkill(skill: ParsedSkill, role: string): number {
  const keywords = ROLE_KEYWORDS[role];
  if (keywords === undefined) return 0;

  const searchable = `${skill.name} ${skill.description}`.toLowerCase();
  let score = 0;

  for (const keyword of keywords) {
    if (searchable.includes(keyword)) {
      score += 5;
    }
  }

  return score;
}

/**
 * Load all skills from the .claude/skills/ directory.
 * Returns empty array if directory doesn't exist.
 */
export async function loadSkills(skillsDir?: string): Promise<ParsedSkill[]> {
  const dir = skillsDir ?? resolve(process.cwd(), '.claude/skills');
  const skills: ParsedSkill[] = [];

  try {
    const files = await readdir(dir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const filePath = join(dir, file);
      const raw = await readFile(filePath, 'utf-8');
      const { name, description, body } = parseFrontmatter(raw);
      if (name.length > 0) {
        skills.push({ name, description, content: body, filePath });
      }
    }
  } catch {
    // Directory doesn't exist or not readable — return empty
  }

  return skills;
}

/**
 * Match skills to an expert role by keyword relevance.
 * Returns the top-K most relevant skills, sorted by score.
 */
export function matchSkills(skills: ParsedSkill[], role: string): SkillMatch[] {
  const scored = skills
    .map((skill) => ({ skill, score: scoreSkill(skill, role) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, MAX_SKILLS);
}

/**
 * Format matched skills as a prompt section for injection.
 * Returns empty string if no matches — safe to always call.
 */
export function formatSkillsForPrompt(matches: SkillMatch[]): string {
  if (matches.length === 0) return '';

  const sections = matches.map((m) => {
    const truncated =
      m.skill.content.length > MAX_SKILL_CONTENT
        ? m.skill.content.slice(0, MAX_SKILL_CONTENT) + '\n...(truncated)'
        : m.skill.content;
    return `### ${m.skill.name}\n${truncated}`;
  });

  return ['', '## Relevant Skills', '', ...sections].join('\n');
}
