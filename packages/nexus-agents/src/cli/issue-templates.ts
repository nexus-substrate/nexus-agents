/**
 * nexus-agents issue templates
 *
 * Template definitions and validation logic for GitHub issues.
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

// ============================================================================
// Template Definitions
// ============================================================================

/**
 * Template for feature issues (feat:).
 */
export const FEAT_TEMPLATE: IssueTemplate = {
  type: 'feat',
  displayName: 'Feature Request',
  sections: [
    {
      name: 'Description',
      pattern: /^##?\s*(?:description|overview|summary)/im,
      required: true,
      description: 'Clear description of the feature and its purpose',
    },
    {
      name: 'Acceptance Criteria',
      pattern: /^##?\s*(?:acceptance\s*criteria|requirements|definition\s*of\s*done)/im,
      required: true,
      description: 'Checkboxes defining when the feature is complete',
    },
    {
      name: 'Estimated Effort',
      pattern: /^##?\s*(?:estimated?\s*effort|effort|time\s*estimate|estimation)/im,
      required: false,
      description: 'Time estimate for implementation',
    },
    {
      name: 'Implementation',
      pattern: /^##?\s*(?:implementation|approach|technical\s*approach|design)/im,
      required: false,
      description: 'Technical approach for implementing the feature',
    },
  ],
  example: `## Description

Brief description of the feature.

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Estimated Effort

~4-6 hours`,
};

/**
 * Template for bug issues (bug:, fix:).
 */
export const BUG_TEMPLATE: IssueTemplate = {
  type: 'bug',
  displayName: 'Bug Report',
  sections: [
    {
      name: 'Bug Description',
      pattern: /^##?\s*(?:bug\s*description|description|problem|issue)/im,
      required: true,
      description: 'Clear description of the bug',
    },
    {
      name: 'Steps to Reproduce',
      pattern: /^##?\s*(?:steps?\s*to\s*reproduce|reproduction|how\s*to\s*reproduce)/im,
      required: true,
      description: 'Steps to reproduce the issue',
    },
    {
      name: 'Expected Behavior',
      pattern: /^##?\s*(?:expected\s*behavior|expected|what\s*should\s*happen)/im,
      required: true,
      description: 'What should happen instead',
    },
    {
      name: 'Actual Behavior',
      pattern: /^##?\s*(?:actual\s*behavior|actual|what\s*happens)/im,
      required: false,
      description: 'What actually happens',
    },
    {
      name: 'Environment',
      pattern: /^##?\s*(?:environment|system\s*info|version)/im,
      required: false,
      description: 'Environment details (OS, Node version, etc.)',
    },
  ],
  example: `## Bug Description

Description of the bug.

## Steps to Reproduce

1. Step 1
2. Step 2

## Expected Behavior

What should happen.

## Actual Behavior

What happens instead.`,
};

/**
 * Template for task issues (task:, chore:).
 */
export const TASK_TEMPLATE: IssueTemplate = {
  type: 'task',
  displayName: 'Task',
  sections: [
    {
      name: 'Description',
      pattern: /^##?\s*(?:description|overview|summary|task)/im,
      required: true,
      description: 'Description of the task',
    },
    {
      name: 'Parent Issue',
      pattern: /^##?\s*(?:parent\s*issue|epic|part\s*of|related\s*to)/im,
      required: false,
      description: 'Parent epic or related issue',
    },
    {
      name: 'Files to Modify',
      pattern: /^##?\s*(?:files?\s*to\s*modify|files?|affected\s*files?)/im,
      required: false,
      description: 'List of files that will be modified',
    },
    {
      name: 'Checklist',
      pattern: /^##?\s*(?:checklist|tasks?|todo|steps)/im,
      required: false,
      description: 'Checklist of subtasks',
    },
  ],
  example: `## Description

Description of the task.

## Parent Issue

Part of Epic #123

## Files to Modify

- \`src/file1.ts\`
- \`src/file2.ts\`

## Checklist

- [ ] Task 1
- [ ] Task 2`,
};

/**
 * Template for refactor issues (refactor:).
 */
export const REFACTOR_TEMPLATE: IssueTemplate = {
  type: 'refactor',
  displayName: 'Refactoring',
  sections: [
    {
      name: 'Current State',
      pattern: /^##?\s*(?:current\s*state|before|problem|motivation)/im,
      required: true,
      description: 'Description of the current state',
    },
    {
      name: 'Target State',
      pattern: /^##?\s*(?:target\s*state|after|goal|proposed)/im,
      required: true,
      description: 'Description of the desired state after refactoring',
    },
    {
      name: 'Migration Plan',
      pattern: /^##?\s*(?:migration\s*plan|approach|steps|plan)/im,
      required: false,
      description: 'Plan for the refactoring',
    },
  ],
  example: `## Current State

Description of current implementation.

## Target State

Description of desired implementation.

## Migration Plan

1. Step 1
2. Step 2`,
};

/**
 * Template for documentation issues (docs:).
 */
export const DOCS_TEMPLATE: IssueTemplate = {
  type: 'docs',
  displayName: 'Documentation',
  sections: [
    {
      name: 'Description',
      pattern: /^##?\s*(?:description|overview|summary)/im,
      required: true,
      description: 'Description of the documentation change',
    },
    {
      name: 'Affected Files',
      pattern: /^##?\s*(?:affected\s*files?|files?|documents?)/im,
      required: false,
      description: 'List of files to update',
    },
  ],
  example: `## Description

Description of documentation update.

## Affected Files

- \`README.md\`
- \`docs/guide.md\``,
};

/**
 * Fallback template for unknown issue types.
 */
export const UNKNOWN_TEMPLATE: IssueTemplate = {
  type: 'unknown',
  displayName: 'Unknown',
  sections: [
    {
      name: 'Description',
      pattern: /^##?\s*(?:description|overview|summary)/im,
      required: false,
      description: 'Description of the issue',
    },
  ],
};

/**
 * All available templates indexed by type.
 */
export const TEMPLATES: Record<IssueType, IssueTemplate> = {
  feat: FEAT_TEMPLATE,
  bug: BUG_TEMPLATE,
  task: TASK_TEMPLATE,
  refactor: REFACTOR_TEMPLATE,
  docs: DOCS_TEMPLATE,
  unknown: UNKNOWN_TEMPLATE,
};

// ============================================================================
// Type Detection
// ============================================================================

/**
 * Patterns for detecting issue type from title.
 */
const TYPE_PATTERNS: ReadonlyArray<{ type: IssueType; pattern: RegExp }> = [
  { type: 'feat', pattern: /^(?:feat|feature|enhancement)[\s:(]/i },
  { type: 'bug', pattern: /^(?:bug|fix)[\s:(]/i },
  { type: 'task', pattern: /^(?:task|chore)[\s:(]/i },
  { type: 'refactor', pattern: /^(?:refactor|refactoring)[\s:(]/i },
  { type: 'docs', pattern: /^(?:docs|documentation)[\s:(]/i },
];

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
