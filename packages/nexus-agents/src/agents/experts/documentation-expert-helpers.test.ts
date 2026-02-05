/**
 * Tests for Documentation Expert Helpers
 * @module agents/experts/documentation-expert-helpers.test
 */

import { describe, it, expect } from 'vitest';
import {
  generateReadmeSections,
  generateApiSections,
  generateGuideSections,
  generateReferenceSections,
  generateHeuristicSections,
  generateHeuristicRecommendations,
  detectDocumentationWarnings,
  inferDocumentationType,
  generateHeuristicContent,
} from './documentation-expert-helpers.js';

// ============================================================================
// Section Generation
// ============================================================================

describe('generateReadmeSections', () => {
  it('returns expected sections', () => {
    const sections = generateReadmeSections();
    expect(sections.length).toBeGreaterThanOrEqual(5);
    expect(sections.some((s) => s.title === 'Overview')).toBe(true);
    expect(sections.some((s) => s.title === 'Installation')).toBe(true);
    expect(sections.some((s) => s.title === 'Usage')).toBe(true);
  });
});

describe('generateApiSections', () => {
  it('returns API sections', () => {
    const sections = generateApiSections();
    expect(sections.some((s) => s.title === 'API Overview')).toBe(true);
    expect(sections.some((s) => s.title === 'Functions')).toBe(true);
    expect(sections.some((s) => s.title === 'Types')).toBe(true);
  });
});

describe('generateGuideSections', () => {
  it('returns guide sections', () => {
    const sections = generateGuideSections();
    expect(sections.some((s) => s.title === 'Introduction')).toBe(true);
    expect(sections.some((s) => s.title === 'Prerequisites')).toBe(true);
    expect(sections.some((s) => s.title.includes('Step'))).toBe(true);
  });
});

describe('generateReferenceSections', () => {
  it('returns reference sections', () => {
    const sections = generateReferenceSections();
    expect(sections.some((s) => s.title === 'Architecture')).toBe(true);
    expect(sections.some((s) => s.title === 'Troubleshooting')).toBe(true);
  });
});

// ============================================================================
// generateHeuristicSections
// ============================================================================

describe('generateHeuristicSections', () => {
  it('returns readme sections for readme type', () => {
    const sections = generateHeuristicSections('readme');
    expect(sections.some((s) => s.title === 'Installation')).toBe(true);
  });

  it('returns api sections for api type', () => {
    const sections = generateHeuristicSections('api');
    expect(sections.some((s) => s.title === 'API Overview')).toBe(true);
  });

  it('returns guide sections for guide type', () => {
    const sections = generateHeuristicSections('guide');
    expect(sections.some((s) => s.title === 'Introduction')).toBe(true);
  });

  it('returns reference sections for reference type', () => {
    const sections = generateHeuristicSections('reference');
    expect(sections.some((s) => s.title === 'Architecture')).toBe(true);
  });

  it('defaults to reference for unknown type', () => {
    const sections = generateHeuristicSections('unknown' as 'reference');
    expect(sections.some((s) => s.title === 'Architecture')).toBe(true);
  });
});

// ============================================================================
// generateHeuristicRecommendations
// ============================================================================

describe('generateHeuristicRecommendations', () => {
  it('includes base recommendations for all types', () => {
    const types = ['readme', 'api', 'guide', 'reference'] as const;
    for (const t of types) {
      const recs = generateHeuristicRecommendations(t);
      expect(recs).toContain('Keep documentation up-to-date with code changes');
      expect(recs).toContain('Include practical examples');
    }
  });

  it('adds readme-specific recs', () => {
    const recs = generateHeuristicRecommendations('readme');
    expect(recs.some((r) => r.includes('installation'))).toBe(true);
  });

  it('adds api-specific recs', () => {
    const recs = generateHeuristicRecommendations('api');
    expect(recs.some((r) => r.includes('public interfaces'))).toBe(true);
  });

  it('adds guide-specific recs', () => {
    const recs = generateHeuristicRecommendations('guide');
    expect(recs.some((r) => r.includes('step-by-step'))).toBe(true);
  });

  it('adds reference-specific recs', () => {
    const recs = generateHeuristicRecommendations('reference');
    expect(recs.some((r) => r.includes('comprehensive'))).toBe(true);
  });
});

// ============================================================================
// detectDocumentationWarnings
// ============================================================================

describe('detectDocumentationWarnings', () => {
  it('warns about internal APIs', () => {
    const warnings = detectDocumentationWarnings('document internal methods');
    expect(warnings.some((w) => w.includes('internal'))).toBe(true);
  });

  it('warns about deprecated features', () => {
    const warnings = detectDocumentationWarnings('deprecated API migration');
    expect(warnings.some((w) => w.includes('deprecated'))).toBe(true);
  });

  it('warns about experimental features', () => {
    const warnings = detectDocumentationWarnings('beta feature docs');
    expect(warnings.some((w) => w.includes('experimental'))).toBe(true);
  });

  it('warns about security docs', () => {
    const warnings = detectDocumentationWarnings('security configuration guide');
    expect(warnings.some((w) => w.includes('Security'))).toBe(true);
  });

  it('returns empty for simple description', () => {
    expect(detectDocumentationWarnings('standard API documentation')).toEqual([]);
  });
});

// ============================================================================
// inferDocumentationType
// ============================================================================

describe('inferDocumentationType', () => {
  it('infers api', () => {
    expect(inferDocumentationType('document the api endpoints')).toBe('api');
  });

  it('infers readme', () => {
    expect(inferDocumentationType('create a readme for the project')).toBe('readme');
  });

  it('infers guide', () => {
    expect(inferDocumentationType('write a guide for setup')).toBe('guide');
    expect(inferDocumentationType('how to deploy the app')).toBe('guide');
  });

  it('defaults to reference', () => {
    expect(inferDocumentationType('write documentation for the system')).toBe('reference');
  });
});

// ============================================================================
// generateHeuristicContent
// ============================================================================

describe('generateHeuristicContent', () => {
  it('generates content with sections', () => {
    const sections = [{ title: 'Overview', content: 'Description' }];
    const content = generateHeuristicContent('reference', sections, {});
    expect(content).toContain('## Overview');
    expect(content).toContain('Description');
    expect(content).toContain('template');
  });

  it('adds badges for readme', () => {
    const sections = [{ title: 'Overview', content: 'Test' }];
    const content = generateHeuristicContent('readme', sections, { includeBadges: true });
    expect(content).toContain('Build Status');
    expect(content).toContain('Coverage');
  });

  it('skips badges when not readme', () => {
    const sections = [{ title: 'Overview', content: 'Test' }];
    const content = generateHeuristicContent('api', sections, { includeBadges: true });
    expect(content).not.toContain('Build Status');
  });

  it('adds table of contents', () => {
    const sections = [
      { title: 'Overview', content: 'Description' },
      { title: 'Usage', content: 'How to use' },
    ];
    const content = generateHeuristicContent('reference', sections, { generateTOC: true });
    expect(content).toContain('Table of Contents');
    expect(content).toContain('#overview');
    expect(content).toContain('#usage');
  });
});
