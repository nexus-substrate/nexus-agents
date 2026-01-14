/**
 * nexus-agents issue templates
 *
 * Template validation logic for GitHub issues.
 * Template definitions extracted to issue-template-definitions.ts
 *
 * (Source: Issue #229, Epic #225)
 */

import type {
  IssueType,
  IssueTemplate,
  RequiredSection,
  IssueValidationResult,
  SectionValidationResult,
} from './issue-template-types.js';

import { TEMPLATES, TYPE_PATTERNS } from './issue-template-definitions.js';

// Re-export templates for backward compatibility
export {
  TEMPLATES,
  TYPE_PATTERNS,
  FEAT_TEMPLATE,
  BUG_TEMPLATE,
  TASK_TEMPLATE,
  REFACTOR_TEMPLATE,
  DOCS_TEMPLATE,
  UNKNOWN_TEMPLATE,
} from './issue-template-definitions.js';

// Re-export types for backward compatibility
export type {
  IssueType,
  IssueTemplate,
  RequiredSection,
  IssueValidationResult,
  SectionValidationResult,
} from './issue-template-types.js';

// ============================================================================
// Type Detection
// ============================================================================

/**
 * Detect issue type from title.
 */
export function detectIssueType(title: string): IssueType {
  const trimmedTitle = title.trim();
  for (const { type, pattern } of TYPE_PATTERNS) {
    if (pattern.test(trimmedTitle)) {
      return type;
    }
  }
  return 'unknown';
}

/**
 * Get template for an issue type.
 */
export function getTemplate(type: IssueType): IssueTemplate {
  return TEMPLATES[type];
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Extract section content from issue body.
 */
export function extractSectionContent(body: string, section: RequiredSection): string | undefined {
  const match = section.pattern.exec(body);
  if (!match) {
    return undefined;
  }

  // Find next section header or end of body
  const startIndex = match.index + match[0].length;
  const remainingBody = body.slice(startIndex);

  // Look for next section header (## or #)
  const nextSectionMatch = /^##?\s+\S/m.exec(remainingBody);
  const endIndex = nextSectionMatch ? nextSectionMatch.index : remainingBody.length;

  return remainingBody.slice(0, endIndex).trim();
}

/**
 * Validate a single section.
 */
export function validateSection(body: string, section: RequiredSection): SectionValidationResult {
  const content = extractSectionContent(body, section);
  const found = content !== undefined && content.length > 0;

  // Return separate objects to satisfy exactOptionalPropertyTypes
  if (found) {
    return {
      section: section.name,
      found: true,
      required: section.required,
      content,
    };
  }

  return {
    section: section.name,
    found: false,
    required: section.required,
  };
}

/**
 * Validate an issue body against a template.
 */
export function validateIssueBody(
  title: string,
  body: string,
  explicitType?: IssueType
): IssueValidationResult {
  const issueType = explicitType ?? detectIssueType(title);
  const template = getTemplate(issueType);

  const sections = template.sections.map((section) => validateSection(body, section));

  const missingRequired = sections.filter((s) => s.required && !s.found).map((s) => s.section);

  const suggestions: string[] = [];

  // Add suggestions for missing required sections
  for (const missing of missingRequired) {
    const section = template.sections.find((s) => s.name === missing);
    if (section) {
      suggestions.push(`Add "${missing}" section: ${section.description}`);
    }
  }

  // Suggest template if unknown type
  if (issueType === 'unknown') {
    suggestions.push(
      'Consider using a prefix like "feat:", "bug:", "task:", "refactor:", or "docs:" in the title'
    );
  }

  return {
    valid: missingRequired.length === 0,
    issueType,
    template,
    sections,
    missingRequired,
    suggestions,
  };
}

// ============================================================================
// Template Generation
// ============================================================================

/**
 * Generate a template body for an issue type.
 */
export function generateTemplateBody(type: IssueType): string {
  const template = getTemplate(type);

  if (template.example !== undefined && template.example !== '') {
    return template.example;
  }

  const lines: string[] = [];
  for (const section of template.sections) {
    lines.push(`## ${section.name}`);
    lines.push('');
    lines.push(`<!-- ${section.description} -->`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format validation result as text.
 */
export function formatValidationResult(result: IssueValidationResult): string {
  const lines: string[] = [];
  const status = result.valid ? '✓ VALID' : '✗ INVALID';

  lines.push(`Issue Type: ${result.template.displayName}`);
  lines.push(`Status: ${status}`);
  lines.push('');
  lines.push('Sections:');

  for (const section of result.sections) {
    const icon = section.found ? '✓' : section.required ? '✗' : '○';
    const reqLabel = section.required ? '(required)' : '(optional)';
    lines.push(`  ${icon} ${section.section} ${reqLabel}`);
  }

  if (result.suggestions.length > 0) {
    lines.push('');
    lines.push('Suggestions:');
    for (const suggestion of result.suggestions) {
      lines.push(`  - ${suggestion}`);
    }
  }

  return lines.join('\n');
}
