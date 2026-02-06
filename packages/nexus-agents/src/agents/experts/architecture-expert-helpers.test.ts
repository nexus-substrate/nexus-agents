/**
 * nexus-agents/agents - ArchitectureExpert Helpers Tests
 */

import { describe, it, expect } from 'vitest';
import type { Task } from '../../core/index.js';
import type { ArchitecturePattern } from './expert-types.js';
import {
  ARCHITECTURE_PATTERNS,
  COMPONENT_PATTERNS,
  identifyHeuristicPatterns,
  identifyHeuristicComponents,
  generateHeuristicADRs,
  inferAnalysisType,
  generateHeuristicRecommendations,
  detectArchitectureWarnings,
  parseArchitectureResult,
} from './architecture-expert-helpers.js';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createTask(id: string, description: string) {
  return { id, description, context: {} } satisfies Task;
}

describe('ARCHITECTURE_PATTERNS', () => {
  it('should have valid structure and key patterns', () => {
    expect(ARCHITECTURE_PATTERNS.length).toBeGreaterThan(0);
    const ms = ARCHITECTURE_PATTERNS.find((p) => p.name === 'Microservices');
    expect(ms?.category).toBe('Architectural');
    expect(ms?.pros.length).toBeGreaterThan(0);
  });
});

describe('COMPONENT_PATTERNS', () => {
  it('should have valid structure and key components', () => {
    expect(COMPONENT_PATTERNS.length).toBeGreaterThan(0);
    const api = COMPONENT_PATTERNS.find((c) => c.name === 'API Layer');
    expect(api?.type).toBe('Service');
  });
});

describe('identifyHeuristicPatterns', () => {
  it('should identify patterns and limit to 5', () => {
    const p1 = identifyHeuristicPatterns('Build a microservice architecture');
    expect(p1.some((p) => p.name === 'Microservices')).toBe(true);

    const p2 = identifyHeuristicPatterns('microservice event layer domain repository');
    expect(p2.length).toBeLessThanOrEqual(5);
  });

  it('should return empty for unmatched and be case insensitive', () => {
    expect(identifyHeuristicPatterns('hello world')).toEqual([]);
    const p = identifyHeuristicPatterns('MICROSERVICE');
    expect(p.some((x) => x.name === 'Microservices')).toBe(true);
  });

  it('should set applicability 0.7 and include tradeoffs', () => {
    const patterns = identifyHeuristicPatterns('event-driven architecture');
    expect(patterns[0]?.applicability).toBe(0.7);
    expect(patterns[0]?.tradeoffs.pros).toBeInstanceOf(Array);
  });
});

describe('identifyHeuristicComponents', () => {
  it('should identify components with empty dependencies', () => {
    const c = identifyHeuristicComponents('API database auth');
    expect(c.some((x) => x.name === 'API Layer')).toBe(true);
    expect(c.every((x) => x.dependencies.length === 0)).toBe(true);
  });

  it('should return empty for unmatched and be case insensitive', () => {
    expect(identifyHeuristicComponents('xyz')).toEqual([]);
    const c = identifyHeuristicComponents('BUILD REST API');
    expect(c.some((x) => x.name === 'API Layer')).toBe(true);
  });
});

describe('generateHeuristicADRs', () => {
  it('should generate ADR with task context and consequences', () => {
    const task = createTask('task-123', 'Test');
    const patterns: ArchitecturePattern[] = [
      {
        name: 'Microservices',
        category: 'Architectural',
        applicability: 0.8,
        tradeoffs: { pros: ['Pro1'], cons: ['Con1'] },
      },
    ];
    const adrs = generateHeuristicADRs(task, patterns);
    expect(adrs).toHaveLength(1);
    expect(adrs[0]?.id).toBe('ADR-001');
    expect(adrs[0]?.context).toContain('task-123');
    expect(adrs[0]?.consequences).toContain('Pro: Pro1');
  });

  it('should return empty for no patterns or undefined first pattern', () => {
    expect(generateHeuristicADRs(createTask('t', 'x'), [])).toEqual([]);
  });
});

describe('inferAnalysisType', () => {
  it('should infer correct analysis type', () => {
    expect(inferAnalysisType('which pattern')).toBe('pattern_selection');
    expect(inferAnalysisType('review the architecture')).toBe('review');
    expect(inferAnalysisType('build system')).toBe('design');
    expect(inferAnalysisType('PATTERN')).toBe('pattern_selection');
  });
});

describe('generateHeuristicRecommendations', () => {
  it('should return type-specific recommendations', () => {
    const design = generateHeuristicRecommendations('design');
    expect(design).toContain('Document architecture decisions');
    expect(design).toContain('Create C4 diagrams');

    const review = generateHeuristicRecommendations('review');
    expect(review).toContain('Identify technical debt');

    const pattern = generateHeuristicRecommendations('pattern_selection');
    expect(pattern).toContain('Prototype before committing');
  });
});

describe('detectArchitectureWarnings', () => {
  it('should detect various architecture warnings', () => {
    expect(detectArchitectureWarnings('simple')).toEqual([]);
    expect(detectArchitectureWarnings('monolith microservice')[0]).toContain('Migration');
    expect(detectArchitectureWarnings('legacy system')[0]).toContain('Legacy');
    expect(detectArchitectureWarnings('real-time')[0]).toContain('Real-time');
    expect(detectArchitectureWarnings('scale million')[0]).toContain('scale');
  });

  it('should be case insensitive and detect multiple warnings', () => {
    const w = detectArchitectureWarnings('LEGACY REAL-TIME SCALE');
    expect(w.length).toBeGreaterThanOrEqual(2);
  });
});

describe('parseArchitectureResult', () => {
  it('should parse valid JSON with all fields', () => {
    const json = JSON.stringify({ content: 'test', analysisType: 'design', confidence: 0.9 });
    const r = parseArchitectureResult(json, 'review');
    expect(r.content).toBe('test');
    expect(r.analysisType).toBe('design');
    expect(r.confidence).toBe(0.9);
  });

  it('should extract JSON from markdown code blocks', () => {
    const md = '```json\n{"content": "x", "analysisType": "review", "confidence": 0.8}\n```';
    const r = parseArchitectureResult(md, 'design');
    expect(r.content).toBe('x');
    expect(r.analysisType).toBe('review');
  });

  it('should use defaults for missing fields', () => {
    const r1 = parseArchitectureResult('{}', 'design');
    expect(r1.content).toBe('Architecture analysis completed');
    expect(r1.confidence).toBe(0.7);

    const r2 = parseArchitectureResult(JSON.stringify({ content: 'x' }), 'review');
    expect(r2.analysisType).toBe('review');
  });

  it('should include optional fields when present', () => {
    const data = {
      content: 'x',
      analysisType: 'design',
      confidence: 0.8,
      patterns: [
        { name: 'T', category: 'C', applicability: 0.5, tradeoffs: { pros: [], cons: [] } },
      ],
      decisions: [
        { id: 'A', title: 'T', context: 'C', decision: 'D', consequences: [], status: 'proposed' },
      ],
      components: [{ name: 'N', type: 'M', responsibilities: [], dependencies: [] }],
      recommendations: ['R1'],
      warnings: ['W1'],
    };
    const r = parseArchitectureResult(JSON.stringify(data), 'design');
    expect(r.patterns?.length).toBe(1);
    expect(r.decisions?.length).toBe(1);
    expect(r.components?.length).toBe(1);
    expect(r.recommendations).toEqual(['R1']);
    expect(r.warnings).toEqual(['W1']);
  });

  it('should fallback on parse error and handle empty input', () => {
    const r1 = parseArchitectureResult('invalid', 'review');
    expect(r1.content).toBe('invalid');
    expect(r1.confidence).toBe(0.5);

    const r2 = parseArchitectureResult('', 'design');
    expect(r2.analysisType).toBe('design');
  });
});
