/**
 * Tests for Architecture Expert Helpers
 * @module agents/experts/architecture-expert-helpers.test
 */

import { describe, it, expect } from 'vitest';
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

// ============================================================================
// Constants
// ============================================================================

describe('ARCHITECTURE_PATTERNS', () => {
  it('contains at least 5 patterns', () => {
    expect(ARCHITECTURE_PATTERNS.length).toBeGreaterThanOrEqual(5);
  });

  it('each pattern has required fields', () => {
    for (const p of ARCHITECTURE_PATTERNS) {
      expect(p.name).toBeDefined();
      expect(p.category).toBeDefined();
      expect(p.pros.length).toBeGreaterThan(0);
      expect(p.cons.length).toBeGreaterThan(0);
    }
  });
});

describe('COMPONENT_PATTERNS', () => {
  it('contains at least 4 patterns', () => {
    expect(COMPONENT_PATTERNS.length).toBeGreaterThanOrEqual(4);
  });
});

// ============================================================================
// identifyHeuristicPatterns
// ============================================================================

describe('identifyHeuristicPatterns', () => {
  it('identifies microservices pattern', () => {
    const patterns = identifyHeuristicPatterns('build a microservice architecture');
    expect(patterns.some((p) => p.name === 'Microservices')).toBe(true);
  });

  it('identifies event-driven pattern', () => {
    const patterns = identifyHeuristicPatterns('use event-driven design with pub/sub');
    expect(patterns.some((p) => p.name === 'Event-Driven')).toBe(true);
  });

  it('identifies layered architecture', () => {
    const patterns = identifyHeuristicPatterns('implement MVC with presentation layer');
    expect(patterns.some((p) => p.name === 'Layered Architecture')).toBe(true);
  });

  it('returns empty for unmatched description', () => {
    expect(identifyHeuristicPatterns('hello world')).toEqual([]);
  });

  it('limits to 5 patterns', () => {
    // Use description that matches many patterns
    const patterns = identifyHeuristicPatterns(
      'microservice event layer domain repository factory singleton distributed'
    );
    expect(patterns.length).toBeLessThanOrEqual(5);
  });

  it('sets applicability to 0.7', () => {
    const patterns = identifyHeuristicPatterns('microservice architecture');
    expect(patterns[0]!.applicability).toBe(0.7);
  });
});

// ============================================================================
// identifyHeuristicComponents
// ============================================================================

describe('identifyHeuristicComponents', () => {
  it('identifies API layer', () => {
    const components = identifyHeuristicComponents('REST API endpoint');
    expect(components.some((c) => c.name === 'API Layer')).toBe(true);
  });

  it('identifies security module', () => {
    const components = identifyHeuristicComponents('auth and security');
    expect(components.some((c) => c.name === 'Security Module')).toBe(true);
  });

  it('returns empty for unmatched', () => {
    expect(identifyHeuristicComponents('xyz')).toEqual([]);
  });

  it('sets empty dependencies', () => {
    const components = identifyHeuristicComponents('database storage');
    expect(components[0]!.dependencies).toEqual([]);
  });
});

// ============================================================================
// generateHeuristicADRs
// ============================================================================

describe('generateHeuristicADRs', () => {
  it('returns empty for no patterns', () => {
    const task = { id: 't1', description: 'test' } as never;
    expect(generateHeuristicADRs(task, [])).toEqual([]);
  });

  it('generates ADR for primary pattern', () => {
    const task = { id: 't1', description: 'test' } as never;
    const patterns = identifyHeuristicPatterns('microservice distributed system');
    const adrs = generateHeuristicADRs(task, patterns);
    expect(adrs).toHaveLength(1);
    expect(adrs[0]!.id).toBe('ADR-001');
    expect(adrs[0]!.title).toContain('Microservices');
    expect(adrs[0]!.status).toBe('proposed');
  });

  it('includes pros and cons in consequences', () => {
    const task = { id: 't1', description: 'test' } as never;
    const patterns = identifyHeuristicPatterns('microservice');
    const adrs = generateHeuristicADRs(task, patterns);
    expect(adrs[0]!.consequences.some((c) => c.startsWith('Pro:'))).toBe(true);
    expect(adrs[0]!.consequences.some((c) => c.startsWith('Con:'))).toBe(true);
  });
});

// ============================================================================
// inferAnalysisType
// ============================================================================

describe('inferAnalysisType', () => {
  it('infers pattern_selection', () => {
    expect(inferAnalysisType('which approach should we use')).toBe('pattern_selection');
  });

  it('infers review', () => {
    expect(inferAnalysisType('review the current architecture')).toBe('review');
  });

  it('infers design by default', () => {
    expect(inferAnalysisType('build a new system')).toBe('design');
  });

  it('detects assess as review', () => {
    expect(inferAnalysisType('assess the scalability')).toBe('review');
  });
});

// ============================================================================
// generateHeuristicRecommendations
// ============================================================================

describe('generateHeuristicRecommendations', () => {
  it('includes base recommendations', () => {
    const recs = generateHeuristicRecommendations('design');
    expect(recs).toContain('Document architecture decisions');
    expect(recs).toContain('Review with stakeholders');
  });

  it('adds design-specific recommendations', () => {
    const recs = generateHeuristicRecommendations('design');
    expect(recs).toContain('Create C4 diagrams');
  });

  it('adds review-specific recommendations', () => {
    const recs = generateHeuristicRecommendations('review');
    expect(recs).toContain('Identify technical debt');
  });

  it('adds pattern-selection-specific recommendations', () => {
    const recs = generateHeuristicRecommendations('pattern_selection');
    expect(recs).toContain('Prototype before committing');
  });
});

// ============================================================================
// detectArchitectureWarnings
// ============================================================================

describe('detectArchitectureWarnings', () => {
  it('warns about monolith to microservice migration', () => {
    const warnings = detectArchitectureWarnings('migrate monolith to microservice');
    expect(warnings.some((w) => w.includes('Migration'))).toBe(true);
  });

  it('warns about legacy systems', () => {
    const warnings = detectArchitectureWarnings('integrate with legacy system');
    expect(warnings.some((w) => w.includes('Legacy'))).toBe(true);
  });

  it('warns about real-time requirements', () => {
    const warnings = detectArchitectureWarnings('real-time data processing');
    expect(warnings.some((w) => w.includes('Real-time'))).toBe(true);
  });

  it('warns about scale requirements', () => {
    const warnings = detectArchitectureWarnings('handle million requests');
    expect(warnings.some((w) => w.includes('scale'))).toBe(true);
  });

  it('returns empty for simple description', () => {
    expect(detectArchitectureWarnings('simple web app')).toEqual([]);
  });
});

// ============================================================================
// parseArchitectureResult
// ============================================================================

describe('parseArchitectureResult', () => {
  it('parses valid JSON', () => {
    const json = JSON.stringify({ content: 'test', analysisType: 'design', confidence: 0.9 });
    const result = parseArchitectureResult(json, 'review');
    expect(result.content).toBe('test');
    expect(result.analysisType).toBe('design');
    expect(result.confidence).toBe(0.9);
  });

  it('extracts JSON from markdown code blocks', () => {
    const text = '```json\n{"content": "parsed", "confidence": 0.8}\n```';
    const result = parseArchitectureResult(text, 'design');
    expect(result.content).toBe('parsed');
  });

  it('falls back to raw text on parse failure', () => {
    const result = parseArchitectureResult('not json', 'review');
    expect(result.content).toBe('not json');
    expect(result.analysisType).toBe('review');
    expect(result.confidence).toBe(0.5);
  });

  it('uses defaults for missing fields', () => {
    const result = parseArchitectureResult('{}', 'design');
    expect(result.content).toBe('Architecture analysis completed');
    expect(result.analysisType).toBe('design');
    expect(result.confidence).toBe(0.7);
  });
});
