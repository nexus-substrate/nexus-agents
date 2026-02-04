/**
 * Research Knowledge Modules
 *
 * Domain knowledge for enriching research expert agent prompts.
 * Contains methodology patterns, source evaluation criteria,
 * arXiv category mappings, and research best practices.
 *
 * @module agents/experts/knowledge/research
 * (Source: Research System Enhancement - Phase 2)
 */

import type { KnowledgeModule } from '../types.js';

/**
 * Research methodology module.
 */
export const RESEARCH_METHODOLOGY_MODULE: KnowledgeModule = {
  id: 'research-methodology',
  domain: 'research',
  title: 'Research Methodology Standards',
  tags: ['methodology', 'literature-review', 'evaluation'],
  sections: [
    {
      title: 'Literature Review Process',
      content:
        'SYSTEMATIC APPROACH: Define search scope → Query databases → Filter by relevance → ' +
        'Extract techniques → Assess quality → Catalog findings.\n' +
        'SOURCES: arXiv (cs.AI, cs.MA, cs.CL), ACL Anthology, NeurIPS, ICML, ICLR proceedings.\n' +
        'FILTERS: Recency (prefer last 2 years), citation count, venue quality, reproducibility.',
      priority: 10,
    },
    {
      title: 'Technique Extraction',
      content:
        'IDENTIFY: Core algorithm/approach from abstract and methodology sections.\n' +
        'EVALUATE: Compare against existing registry techniques for overlap (Jaccard > 0.3).\n' +
        'CATALOG: Name, description, source papers, topic, tags, complexity, dependencies.\n' +
        'PRIORITIZE: Impact on system × implementation complexity × alignment with roadmap.',
      priority: 9,
    },
    {
      title: 'Source Quality Assessment',
      content:
        'TIER 1: Top-venue published papers (NeurIPS, ICML, ICLR, ACL) — high confidence.\n' +
        'TIER 2: Well-cited arXiv preprints (>50 citations) — moderate confidence.\n' +
        'TIER 3: Recent arXiv preprints with reproduction code — moderate confidence.\n' +
        'TIER 4: Blog posts, GitHub repos without papers — low confidence, needs validation.',
      priority: 8,
    },
  ],
};

/**
 * arXiv categories relevant to multi-agent orchestration.
 */
export const ARXIV_CATEGORIES_MODULE: KnowledgeModule = {
  id: 'research-arxiv-categories',
  domain: 'research',
  title: 'arXiv Category Mappings',
  tags: ['arxiv', 'categories', 'search'],
  sections: [
    {
      title: 'Primary Categories',
      content:
        'cs.AI — Artificial Intelligence: Multi-agent systems, reasoning, planning.\n' +
        'cs.MA — Multi-Agent Systems: Coordination, negotiation, consensus.\n' +
        'cs.CL — Computation and Language: LLM capabilities, prompting, tool use.\n' +
        'cs.LG — Machine Learning: Training methods, optimization, evaluation.\n' +
        'cs.SE — Software Engineering: Code generation, testing, development tools.',
      priority: 7,
    },
    {
      title: 'Search Query Patterns',
      content:
        'ORCHESTRATION: "multi-agent orchestration" OR "agent coordination" OR "task delegation"\n' +
        'CONSENSUS: "multi-agent voting" OR "collective decision" OR "ensemble methods"\n' +
        'LLM AGENTS: "LLM agent" OR "language model tool use" OR "ReAct" OR "chain of thought"\n' +
        'EVALUATION: "agent benchmark" OR "multi-agent evaluation" OR "LLM evaluation"',
      priority: 6,
    },
  ],
};

/**
 * GitHub evaluation patterns for research repos.
 */
export const GITHUB_EVALUATION_MODULE: KnowledgeModule = {
  id: 'research-github-evaluation',
  domain: 'research',
  title: 'GitHub Repository Evaluation',
  tags: ['github', 'evaluation', 'open-source'],
  sections: [
    {
      title: 'Repository Quality Signals',
      content:
        'HIGH QUALITY: >1000 stars, active development (commits in last 30 days), ' +
        'comprehensive documentation, test coverage, CI/CD pipeline.\n' +
        'MODERATE: 100-1000 stars, periodic updates, basic documentation.\n' +
        'LOW: <100 stars, no recent activity, minimal documentation.\n' +
        'EVALUATE: License compatibility, dependency health, community engagement.',
      priority: 5,
    },
  ],
};

/**
 * All research domain knowledge modules.
 */
export const RESEARCH_KNOWLEDGE_MODULES: readonly KnowledgeModule[] = [
  RESEARCH_METHODOLOGY_MODULE,
  ARXIV_CATEGORIES_MODULE,
  GITHUB_EVALUATION_MODULE,
];

/**
 * Build a formatted knowledge prompt for research expert prompt injection.
 *
 * @returns Formatted string with research domain knowledge
 */
export function getResearchKnowledgePrompt(): string {
  const sections = RESEARCH_KNOWLEDGE_MODULES.flatMap((module) => module.sections)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 6);

  const formatted = sections
    .map((section) => `### ${section.title}\n${section.content}`)
    .join('\n\n');

  return `## Research Domain Knowledge\n\n${formatted}`;
}
