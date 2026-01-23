/**
 * nexus-agents/research - Schema Tests
 *
 * Tests for research registry Zod schemas.
 *
 * @see Issue #367 - Deterministic RESEARCH_INDEX.md generation
 */

import { describe, it, expect } from 'vitest';
import {
  ResearchTopicSchema,
  TechniqueStatusSchema,
  TechniquePrioritySchema,
  DecisionHistoryEntrySchema,
  ResearchPaperSchema,
  ResearchTechniqueSchema,
  IntegrationFileSchema,
  PapersRegistrySchema,
  TechniquesRegistrySchema,
  getPrimaryTopic,
  getIntegrationFilePath,
  isIntegrationFileRequired,
  RESEARCH_TOPICS,
  TOPIC_DESCRIPTIONS,
} from './research-schemas.js';

// ============================================================================
// Enum Schema Tests
// ============================================================================

describe('ResearchTopicSchema', () => {
  it('should accept valid topics', () => {
    const validTopics = [
      'consensus',
      'routing',
      'memory',
      'code-generation',
      'cli-tools',
      'orchestration',
      'security',
    ];

    for (const topic of validTopics) {
      const result = ResearchTopicSchema.safeParse(topic);
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid topics', () => {
    const result = ResearchTopicSchema.safeParse('invalid-topic');
    expect(result.success).toBe(false);
  });

  it('should have all topics in RESEARCH_TOPICS constant', () => {
    expect(RESEARCH_TOPICS).toHaveLength(7);
    expect(RESEARCH_TOPICS).toContain('security');
  });

  it('should have descriptions for all topics', () => {
    for (const topic of RESEARCH_TOPICS) {
      expect(TOPIC_DESCRIPTIONS[topic]).toBeDefined();
      expect(TOPIC_DESCRIPTIONS[topic].length).toBeGreaterThan(0);
    }
  });
});

describe('TechniqueStatusSchema', () => {
  it('should accept valid statuses', () => {
    const validStatuses = ['implemented', 'planned', 'in-progress', 'not-started', 'rejected'];

    for (const status of validStatuses) {
      const result = TechniqueStatusSchema.safeParse(status);
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid status', () => {
    const result = TechniqueStatusSchema.safeParse('unknown');
    expect(result.success).toBe(false);
  });
});

describe('TechniquePrioritySchema', () => {
  it('should accept valid priorities', () => {
    for (const priority of ['P1', 'P2', 'P3', 'P4']) {
      const result = TechniquePrioritySchema.safeParse(priority);
      expect(result.success).toBe(true);
    }
  });

  it('should accept null', () => {
    const result = TechniquePrioritySchema.safeParse(null);
    expect(result.success).toBe(true);
  });

  it('should reject invalid priority', () => {
    const result = TechniquePrioritySchema.safeParse('P5');
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Decision History Tests
// ============================================================================

describe('DecisionHistoryEntrySchema', () => {
  it('should accept valid entry', () => {
    const entry = {
      date: '2026-01-18',
      decision: 'Implemented',
      rationale: 'High priority and fits architecture',
    };
    const result = DecisionHistoryEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });

  it('should reject invalid date format', () => {
    const entry = {
      date: '01-18-2026',
      decision: 'Implemented',
      rationale: 'Test',
    };
    const result = DecisionHistoryEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });

  it('should reject empty decision', () => {
    const entry = {
      date: '2026-01-18',
      decision: '',
      rationale: 'Test',
    };
    const result = DecisionHistoryEntrySchema.safeParse(entry);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Paper Schema Tests
// ============================================================================

describe('ResearchPaperSchema', () => {
  it('should accept minimal paper', () => {
    const paper = {
      title: 'Test Paper',
    };
    const result = ResearchPaperSchema.safeParse(paper);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.topics).toEqual([]);
      expect(result.data.tags).toEqual([]);
    }
  });

  it('should accept complete paper', () => {
    const paper = {
      title: 'Multi-Agent Consensus Survey',
      authors: ['Author A', 'Author B'],
      source: 'arxiv',
      arxiv_id: '2501.06322',
      url: 'https://arxiv.org/abs/2501.06322',
      publication_date: '2025-01',
      venue: null,
      topics: ['consensus', 'orchestration'],
      tags: ['multi-agent', 'survey'],
      reviewed_date: '2026-01-15',
      reviewed_in: 'notes.md',
      summary: 'A comprehensive survey on multi-agent systems.',
      key_findings: ['Finding 1', 'Finding 2'],
      relevance: 'high',
      techniques_extracted: ['aegean-consensus'],
      related_issues: [119, 125],
      implementation_status: 'planned',
    };
    const result = ResearchPaperSchema.safeParse(paper);
    expect(result.success).toBe(true);
  });

  it('should reject invalid implementation status', () => {
    const paper = {
      title: 'Test',
      implementation_status: 'invalid',
    };
    const result = ResearchPaperSchema.safeParse(paper);
    expect(result.success).toBe(false);
  });

  it('should reject invalid topic', () => {
    const paper = {
      title: 'Test',
      topics: ['invalid-topic'],
    };
    const result = ResearchPaperSchema.safeParse(paper);
    expect(result.success).toBe(false);
  });

  it('should reject negative issue numbers', () => {
    const paper = {
      title: 'Test',
      related_issues: [-1],
    };
    const result = ResearchPaperSchema.safeParse(paper);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Technique Schema Tests
// ============================================================================

describe('ResearchTechniqueSchema', () => {
  it('should accept minimal technique', () => {
    const technique = {
      name: 'Test Technique',
      description: 'A test technique',
      topic: 'consensus',
      status: 'not-started',
    };
    const result = ResearchTechniqueSchema.safeParse(technique);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.priority).toBeNull();
      expect(result.data.source_papers).toEqual([]);
    }
  });

  it('should accept complete technique', () => {
    const technique = {
      name: 'Aegean Consensus Protocol',
      description: 'Formal consensus protocol for stochastic reasoning',
      source_papers: ['arxiv-2512.20184'],
      topic: 'consensus',
      tags: ['formal', 'consensus', 'protocol'],
      metrics: {
        latency_reduction: '1.2x-20x',
        token_reduction: '4.4x',
      },
      status: 'implemented',
      priority: 'P1',
      complexity: 'high',
      integration_files: ['src/consensus/aegean.ts'],
      implementation_issue: 119,
      related_prs: [120, 121],
      notes: 'Core consensus implementation',
      dependencies: [],
      decision_history: [
        {
          date: '2026-01-10',
          decision: 'Implemented',
          rationale: 'High impact on orchestration quality',
        },
      ],
    };
    const result = ResearchTechniqueSchema.safeParse(technique);
    expect(result.success).toBe(true);
  });

  it('should reject invalid topic', () => {
    const technique = {
      name: 'Test',
      description: 'Test',
      topic: 'invalid',
      status: 'planned',
    };
    const result = ResearchTechniqueSchema.safeParse(technique);
    expect(result.success).toBe(false);
  });

  it('should reject invalid status', () => {
    const technique = {
      name: 'Test',
      description: 'Test',
      topic: 'routing',
      status: 'unknown',
    };
    const result = ResearchTechniqueSchema.safeParse(technique);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Integration File Schema Tests
// ============================================================================

describe('IntegrationFileSchema', () => {
  it('should accept string path', () => {
    const result = IntegrationFileSchema.safeParse('src/test.ts');
    expect(result.success).toBe(true);
  });

  it('should accept object with path', () => {
    const file = {
      path: 'src/test.ts',
      type: 'primary',
      required: true,
    };
    const result = IntegrationFileSchema.safeParse(file);
    expect(result.success).toBe(true);
  });

  it('should accept object with just path (required defaults to true)', () => {
    const file = {
      path: 'src/test.ts',
    };
    const result = IntegrationFileSchema.safeParse(file);
    expect(result.success).toBe(true);
    if (result.success) {
      // When parsed, should have required defaulted to true
      expect(
        typeof result.data === 'object' && 'required' in result.data
          ? result.data.required
          : undefined
      ).toBe(true);
    }
  });
});

// ============================================================================
// Registry Schema Tests
// ============================================================================

describe('PapersRegistrySchema', () => {
  it('should accept valid registry', () => {
    const registry = {
      schema_version: '1.1',
      papers: {
        'arxiv-2501.06322': {
          title: 'Test Paper',
          topics: ['consensus'],
        },
      },
    };
    const result = PapersRegistrySchema.safeParse(registry);
    expect(result.success).toBe(true);
  });

  it('should require schema_version', () => {
    const registry = {
      papers: {},
    };
    const result = PapersRegistrySchema.safeParse(registry);
    expect(result.success).toBe(false);
  });
});

describe('TechniquesRegistrySchema', () => {
  it('should accept valid registry', () => {
    const registry = {
      schema_version: '1.1',
      techniques: {
        'aegean-consensus': {
          name: 'Aegean Consensus',
          description: 'Test',
          topic: 'consensus',
          status: 'implemented',
        },
      },
    };
    const result = TechniquesRegistrySchema.safeParse(registry);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('getPrimaryTopic', () => {
  it('should return first topic', () => {
    const paper = {
      title: 'Test',
      topics: ['consensus', 'routing'],
    };
    const parsed = ResearchPaperSchema.parse(paper);
    expect(getPrimaryTopic(parsed)).toBe('consensus');
  });

  it('should return undefined for empty topics', () => {
    const paper = {
      title: 'Test',
      topics: [],
    };
    const parsed = ResearchPaperSchema.parse(paper);
    expect(getPrimaryTopic(parsed)).toBeUndefined();
  });
});

describe('getIntegrationFilePath', () => {
  it('should handle string input', () => {
    expect(getIntegrationFilePath('src/test.ts')).toBe('src/test.ts');
  });

  it('should handle object input', () => {
    expect(getIntegrationFilePath({ path: 'src/test.ts', type: 'primary', required: true })).toBe(
      'src/test.ts'
    );
  });
});

describe('isIntegrationFileRequired', () => {
  it('should return true for string input', () => {
    expect(isIntegrationFileRequired('src/test.ts')).toBe(true);
  });

  it('should return specified required value', () => {
    expect(isIntegrationFileRequired({ path: 'src/test.ts', required: false })).toBe(false);
    expect(isIntegrationFileRequired({ path: 'src/test.ts', required: true })).toBe(true);
  });

  it('should return true for parsed object with default', () => {
    // Simulate a parsed object (Zod would add required: true as default)
    const parsed = IntegrationFileSchema.parse({ path: 'src/test.ts' });
    expect(isIntegrationFileRequired(parsed)).toBe(true);
  });
});
