/**
 * nexus-agents/agents - DocumentationExpert Helpers
 *
 * Helper functions for the DocumentationExpert agent including
 * section generation and heuristic analysis utilities.
 */

import type { DocumentationResult, DocumentationSection } from './expert-types.js';

// ============================================================================
// Section Generation
// ============================================================================

/**
 * Generates README sections.
 */
export function generateReadmeSections(): DocumentationSection[] {
  return [
    { title: 'Overview', content: 'Brief description of the project and its purpose.' },
    { title: 'Installation', content: '```bash\nnpm install package-name\n```' },
    { title: 'Usage', content: 'Basic usage examples and quick start guide.' },
    { title: 'Configuration', content: 'Configuration options and environment variables.' },
    { title: 'API Reference', content: 'Link to detailed API documentation.' },
    { title: 'Contributing', content: 'Guidelines for contributing to the project.' },
    { title: 'License', content: 'Project license information.' },
  ];
}

/**
 * Generates API documentation sections.
 */
export function generateApiSections(): DocumentationSection[] {
  return [
    { title: 'API Overview', content: 'Overview of the API and its capabilities.' },
    {
      title: 'Functions',
      content: 'Detailed function documentation with parameters and return types.',
    },
    { title: 'Types', content: 'Type definitions and interfaces.' },
    { title: 'Examples', content: 'Usage examples for common scenarios.' },
  ];
}

/**
 * Generates guide sections.
 */
export function generateGuideSections(): DocumentationSection[] {
  return [
    { title: 'Introduction', content: 'What you will learn in this guide.' },
    { title: 'Prerequisites', content: 'Required knowledge and setup.' },
    { title: 'Step 1: Getting Started', content: 'First steps to begin.' },
    { title: 'Step 2: Implementation', content: 'Core implementation steps.' },
    { title: 'Step 3: Testing', content: 'How to verify your work.' },
    { title: 'Next Steps', content: 'Where to go from here.' },
  ];
}

/**
 * Generates reference sections.
 */
export function generateReferenceSections(): DocumentationSection[] {
  return [
    { title: 'Overview', content: 'Technical overview of the component.' },
    { title: 'Architecture', content: 'Architectural design and patterns.' },
    { title: 'API Reference', content: 'Complete API reference.' },
    { title: 'Configuration', content: 'All configuration options.' },
    { title: 'Troubleshooting', content: 'Common issues and solutions.' },
  ];
}

/**
 * Generates heuristic documentation sections based on type.
 */
export function generateHeuristicSections(
  docType: DocumentationResult['documentationType']
): DocumentationSection[] {
  switch (docType) {
    case 'readme':
      return generateReadmeSections();
    case 'api':
      return generateApiSections();
    case 'guide':
      return generateGuideSections();
    case 'reference':
      return generateReferenceSections();
    default:
      return generateReferenceSections();
  }
}

// ============================================================================
// Heuristic Analysis Helpers
// ============================================================================

/**
 * Generates recommendations based on documentation type.
 */
export function generateHeuristicRecommendations(
  docType: DocumentationResult['documentationType']
): string[] {
  const base = ['Keep documentation up-to-date with code changes', 'Include practical examples'];

  switch (docType) {
    case 'readme':
      return [
        ...base,
        'Add installation and quick start guide',
        'Include badges for build status and coverage',
        'Link to detailed documentation',
      ];
    case 'api':
      return [
        ...base,
        'Document all public interfaces',
        'Include parameter descriptions and types',
        'Add return type documentation',
      ];
    case 'guide':
      return [
        ...base,
        'Structure as step-by-step instructions',
        'Include prerequisites section',
        'Add troubleshooting tips',
      ];
    case 'reference':
      return [
        ...base,
        'Be comprehensive but scannable',
        'Use consistent formatting',
        'Cross-reference related topics',
      ];
    default:
      return base;
  }
}

/**
 * Detects documentation warnings from description.
 */
export function detectDocumentationWarnings(description: string): string[] {
  const warnings: string[] = [];
  const desc = description.toLowerCase();

  if (desc.includes('internal') || desc.includes('private')) {
    warnings.push('Document internal APIs carefully - they may change');
  }
  if (desc.includes('deprecated')) {
    warnings.push('Mark deprecated features clearly with migration paths');
  }
  if (desc.includes('beta') || desc.includes('experimental')) {
    warnings.push('Flag experimental features with stability warnings');
  }
  if (desc.includes('security')) {
    warnings.push('Security-related docs need careful review');
  }

  return warnings;
}

/**
 * Infers documentation type from task description.
 */
export function inferDocumentationType(
  description: string
): DocumentationResult['documentationType'] {
  const desc = description.toLowerCase();

  if (desc.includes('api') || desc.includes('endpoint') || desc.includes('function doc')) {
    return 'api';
  }
  if (desc.includes('readme') || desc.includes('project doc')) {
    return 'readme';
  }
  if (desc.includes('guide') || desc.includes('tutorial') || desc.includes('how to')) {
    return 'guide';
  }
  return 'reference';
}

// ============================================================================
// Content Generation
// ============================================================================

interface ContentGenerationOptions {
  includeBadges?: boolean | undefined;
  generateTOC?: boolean | undefined;
}

/**
 * Generates heuristic content for documentation.
 */
export function generateHeuristicContent(
  docType: DocumentationResult['documentationType'],
  sections: DocumentationSection[],
  options: ContentGenerationOptions
): string {
  const parts: string[] = [];

  // Add badges for README if enabled
  if (docType === 'readme' && options.includeBadges === true) {
    parts.push('![Build Status](https://img.shields.io/badge/build-passing-green)');
    parts.push('![Coverage](https://img.shields.io/badge/coverage-80%25-green)');
    parts.push('');
  }

  // Add TOC if enabled
  if (options.generateTOC === true) {
    parts.push('## Table of Contents\n');
    for (const section of sections) {
      const anchor = section.title.toLowerCase().replace(/\s+/g, '-');
      parts.push(`- [${section.title}](#${anchor})`);
    }
    parts.push('');
  }

  // Add note about heuristic generation
  parts.push(
    '> Note: This is a template. Model adapter required for detailed content generation.\n'
  );

  // Add sections
  for (const section of sections) {
    parts.push(`## ${section.title}\n`);
    parts.push(section.content);
    parts.push('');
  }

  return parts.join('\n');
}
