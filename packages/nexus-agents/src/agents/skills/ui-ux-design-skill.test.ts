/**
 * Tests for UI/UX Design Skill File (Epic #946)
 *
 * Validates the ui-ux-design.md skill file has correct YAML
 * frontmatter, required sections, and non-colliding trigger keywords.
 *
 * @module agents/skills/ui-ux-design-skill.test
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ============================================================================
// Helpers
// ============================================================================

const SKILLS_DIR = resolve(import.meta.dirname, '../../../../../skills');

/** Parse simple YAML key-value pairs from a string */

function parseYamlLines(yaml: string): Record<string, string> {
  const result: Record<string, string> = {};
  let currentKey = '';
  let currentValue = '';

  for (const line of yaml.split('\n')) {
    const keyMatch = /^(\w[\w-]*):(.*)/.exec(line);
    if (keyMatch && !line.startsWith('  ')) {
      if (currentKey) result[currentKey] = currentValue.trim();
      currentKey = keyMatch[1] ?? '';
      currentValue = keyMatch[2] ?? '';
    } else if (currentKey) {
      currentValue += ' ' + line.trim();
    }
  }
  if (currentKey) result[currentKey] = currentValue.trim();
  return result;
}

/** Parse YAML frontmatter from a skill markdown file */
function parseSkillFrontmatter(filePath: string): Record<string, string> {
  const content = readFileSync(filePath, 'utf-8');
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!match) return {};
  return parseYamlLines(match[1] ?? '');
}

// ============================================================================
// Skill File — YAML Frontmatter
// ============================================================================

describe('ui-ux-design skill YAML frontmatter', () => {
  const skillPath = join(SKILLS_DIR, 'ui-ux-design', 'SKILL.md');
  const meta = parseSkillFrontmatter(skillPath);

  it('has a name field', () => {
    expect(meta['name']).toBe('ui-ux-design');
  });

  it('has a description field', () => {
    expect(meta['description']).toBeTruthy();
    expect(meta['description']!.length).toBeGreaterThan(20);
  });

  it('has allowed-tools field', () => {
    expect(meta['allowed-tools']).toBeTruthy();
    expect(meta['allowed-tools']).toContain('Read');
    expect(meta['allowed-tools']).toContain('Grep');
  });

  it('has context field set to fork', () => {
    expect(meta['context']).toBe('fork');
  });
});

// ============================================================================
// Skill File — Required Content Sections
// ============================================================================

describe('ui-ux-design skill content sections', () => {
  const skillPath = join(SKILLS_DIR, 'ui-ux-design', 'SKILL.md');
  const content = readFileSync(skillPath, 'utf-8');

  it('has Design Workflow section', () => {
    expect(content).toContain('## Design Workflow');
  });

  it('has all 4 workflow steps', () => {
    expect(content).toContain('### Step 1: Analyze Requirements');
    expect(content).toContain('### Step 2: Generate Design Tokens');
    expect(content).toContain('### Step 3: Apply Industry Reasoning');
    expect(content).toContain('### Step 4: Generate Implementation');
  });

  it('has Pre-Delivery Checklist section', () => {
    expect(content).toContain('## Pre-Delivery Checklist');
  });

  it('has Security in Generated Code section', () => {
    expect(content).toContain('## Security in Generated Code');
    expect(content).toContain('innerHTML');
    expect(content).toContain('XSS');
    expect(content).toContain('CSP');
  });

  it('has Design Tokens section', () => {
    expect(content).toContain('## Design Tokens');
    expect(content).toContain('### Colors (OKLCH)');
  });

  it('has Color System section', () => {
    expect(content).toContain('## Color System: OKLCH');
  });

  it('has Material Design 3 Rules section', () => {
    expect(content).toContain('## Material Design 3 Rules');
  });

  it('covers industry-specific reasoning', () => {
    expect(content).toContain('SaaS');
    expect(content).toContain('Healthcare');
    expect(content).toContain('Fintech');
    expect(content).toContain('E-commerce');
  });

  it('covers stack-specific guidance', () => {
    expect(content).toContain('Astro');
    expect(content).toContain('Svelte');
    expect(content).toContain('Tailwind');
  });
});

// ============================================================================
// Skill File — Trigger Keyword Uniqueness
// ============================================================================

describe('ui-ux-design skill trigger keyword uniqueness', () => {
  it('does not collide with other skill trigger keywords', () => {
    const skillFiles = readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.md'));
    const otherDescriptions: string[] = [];

    for (const file of skillFiles) {
      if (file === 'ui-ux-design.md') continue;
      const meta = parseSkillFrontmatter(join(SKILLS_DIR, file));
      const desc = meta['description'];
      if (desc !== undefined && desc !== '') {
        otherDescriptions.push(desc);
      }
    }

    // Our unique trigger keywords
    const uniqueKeywords = [
      'design system',
      'color palette',
      'typography',
      'landing page design',
      'style guide',
      'component design',
    ];

    for (const keyword of uniqueKeywords) {
      for (const desc of otherDescriptions) {
        expect(
          desc.toLowerCase(),
          `Keyword "${keyword}" should not appear in other skill descriptions`
        ).not.toContain(keyword);
      }
    }
  });
});
