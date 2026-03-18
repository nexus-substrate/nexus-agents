/**
 * Research Index Helpers
 *
 * Helper functions for the research index generator script.
 * Extracted from update-research-index.ts to meet structure limits.
 *
 * (Source: Issue #632 - Research Index Automation)
 */

/* eslint-disable no-console */

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parse } from 'yaml';

// ============================================================================
// Types
// ============================================================================

export interface PaperEntry {
  title: string;
  url: string;
  topics: string[];
  publication_date?: string;
  reviewed_date?: string;
  summary?: string;
  techniques_extracted?: string[];
  related_issues?: number[];
  quality_score?: number;
  evidence_tier?: 'high' | 'medium' | 'low';
  venue_tier?: number;
  citation_count?: number;
}

export interface TechniqueEntry {
  name: string;
  description?: string;
  topic: string;
  status: string;
  priority?: string | null;
  metrics?: Record<string, string>;
  implementation_issue?: number | null;
  source_papers?: string[];
  tags?: string[];
}

export interface PapersRegistry {
  schema_version: string;
  papers: Record<string, PaperEntry>;
}

export interface TechniquesRegistry {
  schema_version: string;
  techniques: Record<string, TechniqueEntry>;
}

export interface TopicStats {
  topic: string;
  papers: number;
  techniques: number;
}

// ============================================================================
// Topic Metadata
// ============================================================================

export const TOPIC_META: Record<string, { display: string; description: string }> = {
  consensus: { display: 'Consensus', description: 'Multi-agent decision protocols and voting' },
  routing: { display: 'Routing', description: 'Cost-efficient model routing and selection' },
  memory: { display: 'Memory', description: 'Context, long-term memory, and compression' },
  'code-generation': {
    display: 'Code Generation',
    description: 'Code generation, repair, and self-improvement',
  },
  'cli-tools': { display: 'CLI Tools', description: 'External CLI integration and protocols' },
  orchestration: {
    display: 'Orchestration',
    description: 'Multi-agent coordination and workflows',
  },
  security: { display: 'Security', description: 'Security analysis, prompt injection defense' },
  evaluation: {
    display: 'Evaluation',
    description: 'Benchmarks, metrics, and testing methodologies',
  },
  safety: { display: 'Safety', description: 'AI safety, alignment, and reward hacking' },
  planning: {
    display: 'Planning',
    description: 'Task planning, decomposition, and reasoning chains',
  },
  'tool-use': { display: 'Tool Use', description: 'Tool augmentation, function calling, and MCP' },
  reasoning: {
    display: 'Reasoning',
    description: 'Reasoning, self-reflection, and search strategies',
  },
};

export const ALL_TOPICS = Object.keys(TOPIC_META);

// ============================================================================
// Checksum Utilities
// ============================================================================

export function computeChecksum(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export function extractExistingChecksums(
  content: string
): { papers: string; techniques: string } | null {
  const papersMatch = content.match(/papers: sha256:([a-f0-9]+)/);
  const techniquesMatch = content.match(/techniques: sha256:([a-f0-9]+)/);
  const papersHash = papersMatch?.[1];
  const techniquesHash = techniquesMatch?.[1];

  if (
    papersHash === undefined ||
    papersHash === '' ||
    techniquesHash === undefined ||
    techniquesHash === ''
  ) {
    return null;
  }

  return { papers: papersHash, techniques: techniquesHash };
}

// ============================================================================
// Registry Loading
// ============================================================================

export function loadPapers(path: string): { registry: PapersRegistry; checksum: string } {
  const content = readFileSync(path, 'utf-8');
  const parsed = parse(content) as PapersRegistry;
  return { registry: parsed, checksum: computeChecksum(content) };
}

export function loadTechniques(path: string): { registry: TechniquesRegistry; checksum: string } {
  const content = readFileSync(path, 'utf-8');
  const parsed = parse(content) as TechniquesRegistry;
  return { registry: parsed, checksum: computeChecksum(content) };
}

// ============================================================================
// Date Utility
// ============================================================================

export function getETDate(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

// ============================================================================
// Check Mode
// ============================================================================

export function checkFreshness(
  indexPath: string,
  papersPath: string,
  techniquesPath: string
): boolean {
  if (!existsSync(indexPath)) {
    console.log('Research index does not exist. Run without --check to generate.');
    return false;
  }

  const indexContent = readFileSync(indexPath, 'utf-8');
  const existing = extractExistingChecksums(indexContent);

  if (existing === null) {
    console.log('Research index missing checksums in frontmatter. Needs regeneration.');
    return false;
  }

  const papersContent = readFileSync(papersPath, 'utf-8');
  const techniquesContent = readFileSync(techniquesPath, 'utf-8');
  const currentPapers = computeChecksum(papersContent);
  const currentTechniques = computeChecksum(techniquesContent);

  if (existing.papers !== currentPapers) {
    console.log('Research index is out of date: papers.yaml has changed.');
    console.log('Run: npx tsx scripts/update-research-index.ts');
    return false;
  }

  if (existing.techniques !== currentTechniques) {
    console.log('Research index is out of date: techniques.yaml has changed.');
    console.log('Run: npx tsx scripts/update-research-index.ts');
    return false;
  }

  console.log('Research index is up to date.');
  return true;
}

// ============================================================================
// Validate Mode
// ============================================================================

function validateTechniqueRefs(
  techniques: Record<string, TechniqueEntry>,
  papers: Record<string, PaperEntry>
): string[] {
  const errors: string[] = [];
  for (const [techId, technique] of Object.entries(techniques)) {
    if (technique.source_papers !== undefined) {
      for (const paperId of technique.source_papers) {
        if (papers[paperId] === undefined) {
          errors.push(`Technique "${techId}" references non-existent paper "${paperId}"`);
        }
      }
    }
  }
  return errors;
}

function validatePaperRefs(
  papers: Record<string, PaperEntry>,
  techniques: Record<string, TechniqueEntry>
): string[] {
  const warnings: string[] = [];
  for (const [paperId, paper] of Object.entries(papers)) {
    if (paper.techniques_extracted !== undefined) {
      for (const techId of paper.techniques_extracted) {
        if (techniques[techId] === undefined) {
          warnings.push(`Paper "${paperId}" references non-existent technique "${techId}"`);
        }
      }
    }
  }
  for (const [techId, technique] of Object.entries(techniques)) {
    if (technique.source_papers === undefined || technique.source_papers.length === 0) {
      warnings.push(`Technique "${techId}" has no source papers`);
    }
  }
  return warnings;
}

export function validateRegistry(papersPath: string, techniquesPath: string): boolean {
  const { registry: papers } = loadPapers(papersPath);
  const { registry: techniques } = loadTechniques(techniquesPath);

  const errors = validateTechniqueRefs(techniques.techniques, papers.papers);
  const warnings = validatePaperRefs(papers.papers, techniques.techniques);
  const valid = errors.length === 0;

  if (errors.length > 0) {
    console.log('Errors:');
    for (const error of errors) {
      console.log(`  - ${error}`);
    }
  }
  if (warnings.length > 0) {
    console.log('Warnings:');
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
  }

  console.log('');
  console.log(`Papers: ${String(Object.keys(papers.papers).length)}`);
  console.log(`Techniques: ${String(Object.keys(techniques.techniques).length)}`);
  console.log(`Errors: ${String(errors.length)}`);
  console.log(`Warnings: ${String(warnings.length)}`);
  console.log(valid ? '\nRegistry validation passed.' : '\nRegistry validation failed.');
  return valid;
}

// ============================================================================
// Topic Stats
// ============================================================================

export function computeTopicStats(
  papers: Record<string, PaperEntry>,
  techniques: Record<string, TechniqueEntry>
): TopicStats[] {
  return ALL_TOPICS.map((topic) => ({
    topic,
    papers: Object.values(papers).filter((p) => p.topics.includes(topic)).length,
    techniques: Object.values(techniques).filter((t) => t.topic === topic).length,
  }));
}
