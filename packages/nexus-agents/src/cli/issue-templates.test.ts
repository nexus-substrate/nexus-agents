/**
 * Tests for issue templates module.
 * (Source: Issue #229, Epic #225)
 */

import { describe, it, expect } from 'vitest';
import {
  detectIssueType,
  getTemplate,
  extractSectionContent,
  validateSection,
  validateIssueBody,
  generateTemplateBody,
  formatValidationResult,
  TEMPLATES,
  FEAT_TEMPLATE,
  BUG_TEMPLATE,
  TASK_TEMPLATE,
  REFACTOR_TEMPLATE,
  DOCS_TEMPLATE,
} from './issue-templates.js';
import type { IssueType, RequiredSection } from './issue-template-types.js';

describe('issue-templates', () => {
  describe('detectIssueType', () => {
    it.each([
      ['feat: Add new feature', 'feat'],
      ['feat(scope): Add new feature', 'feat'],
      ['feature: Something new', 'feat'],
      ['enhancement: Better thing', 'feat'],
      ['bug: Fix something', 'bug'],
      ['fix: Resolve issue', 'bug'],
      ['task: Do something', 'task'],
      ['chore: Cleanup', 'task'],
      ['refactor: Improve code', 'refactor'],
      ['refactoring: Clean up', 'refactor'],
      ['docs: Update readme', 'docs'],
      ['documentation: Add guide', 'docs'],
    ])('should detect "%s" as %s', (title, expected) => {
      expect(detectIssueType(title)).toBe(expected);
    });

    it('should return unknown for unrecognized titles', () => {
      expect(detectIssueType('Add new feature')).toBe('unknown');
      expect(detectIssueType('Something random')).toBe('unknown');
      expect(detectIssueType('')).toBe('unknown');
    });

    it('should be case-insensitive', () => {
      expect(detectIssueType('FEAT: Uppercase')).toBe('feat');
      expect(detectIssueType('Bug: Mixed case')).toBe('bug');
    });
  });

  describe('getTemplate', () => {
    it.each<IssueType>(['feat', 'bug', 'task', 'refactor', 'docs', 'unknown'])(
      'should return template for %s',
      (type) => {
        const template = getTemplate(type);
        expect(template).toBeDefined();
        expect(template.type).toBe(type);
        expect(template.displayName).toBeDefined();
        expect(Array.isArray(template.sections)).toBe(true);
      }
    );
  });

  describe('TEMPLATES', () => {
    it('should have templates for all types', () => {
      const types: IssueType[] = ['feat', 'bug', 'task', 'refactor', 'docs', 'unknown'];
      for (const type of types) {
        expect(TEMPLATES[type]).toBeDefined();
      }
    });

    it('should have FEAT_TEMPLATE with required sections', () => {
      const required = FEAT_TEMPLATE.sections.filter((s) => s.required);
      expect(required.length).toBeGreaterThanOrEqual(2);
      expect(required.some((s) => s.name === 'Description')).toBe(true);
      expect(required.some((s) => s.name === 'Acceptance Criteria')).toBe(true);
    });

    it('should have BUG_TEMPLATE with required sections', () => {
      const required = BUG_TEMPLATE.sections.filter((s) => s.required);
      expect(required.length).toBeGreaterThanOrEqual(3);
      expect(required.some((s) => s.name === 'Bug Description')).toBe(true);
      expect(required.some((s) => s.name === 'Steps to Reproduce')).toBe(true);
      expect(required.some((s) => s.name === 'Expected Behavior')).toBe(true);
    });

    it('should have TASK_TEMPLATE with description section', () => {
      expect(TASK_TEMPLATE.sections.some((s) => s.name === 'Description')).toBe(true);
    });

    it('should have REFACTOR_TEMPLATE with current/target state sections', () => {
      const required = REFACTOR_TEMPLATE.sections.filter((s) => s.required);
      expect(required.some((s) => s.name === 'Current State')).toBe(true);
      expect(required.some((s) => s.name === 'Target State')).toBe(true);
    });

    it('should have DOCS_TEMPLATE with description section', () => {
      expect(DOCS_TEMPLATE.sections.some((s) => s.name === 'Description')).toBe(true);
    });
  });

  describe('extractSectionContent', () => {
    const descriptionSection: RequiredSection = {
      name: 'Description',
      pattern: /^##?\s*description/im,
      required: true,
      description: 'Test description',
    };

    it('should extract section content', () => {
      const body = `## Description

This is the description content.

## Next Section

Other content.`;

      const content = extractSectionContent(body, descriptionSection);
      expect(content).toBe('This is the description content.');
    });

    it('should extract content until end if no next section', () => {
      const body = `## Description

This is all the content.
Multiple lines.`;

      const content = extractSectionContent(body, descriptionSection);
      expect(content).toContain('This is all the content.');
      expect(content).toContain('Multiple lines.');
    });

    it('should return undefined if section not found', () => {
      const body = '## Other Section\n\nContent here.';
      const content = extractSectionContent(body, descriptionSection);
      expect(content).toBeUndefined();
    });

    it('should handle single # headers', () => {
      const body = `# Description

Content with single hash.`;

      const content = extractSectionContent(body, descriptionSection);
      expect(content).toContain('Content with single hash.');
    });
  });

  describe('validateSection', () => {
    const requiredSection: RequiredSection = {
      name: 'Description',
      pattern: /^##?\s*description/im,
      required: true,
      description: 'Required section',
    };

    const optionalSection: RequiredSection = {
      name: 'Notes',
      pattern: /^##?\s*notes/im,
      required: false,
      description: 'Optional section',
    };

    it('should validate found required section', () => {
      const body = '## Description\n\nContent here.';
      const result = validateSection(body, requiredSection);

      expect(result.section).toBe('Description');
      expect(result.found).toBe(true);
      expect(result.required).toBe(true);
      expect(result.content).toBe('Content here.');
    });

    it('should validate missing required section', () => {
      const body = '## Other\n\nContent here.';
      const result = validateSection(body, requiredSection);

      expect(result.section).toBe('Description');
      expect(result.found).toBe(false);
      expect(result.required).toBe(true);
      expect(result.content).toBeUndefined();
    });

    it('should validate missing optional section', () => {
      const body = '## Description\n\nContent.';
      const result = validateSection(body, optionalSection);

      expect(result.section).toBe('Notes');
      expect(result.found).toBe(false);
      expect(result.required).toBe(false);
    });

    it('should treat empty section as not found', () => {
      const body = '## Description\n\n## Next';
      const result = validateSection(body, requiredSection);

      expect(result.found).toBe(false);
    });
  });

  describe('validateIssueBody', () => {
    it('should validate valid feat issue', () => {
      const title = 'feat: Add new feature';
      const body = `## Description

Adding a new feature to the system.

## Acceptance Criteria

- [ ] Feature works
- [ ] Tests pass`;

      const result = validateIssueBody(title, body);

      expect(result.valid).toBe(true);
      expect(result.issueType).toBe('feat');
      expect(result.missingRequired).toHaveLength(0);
    });

    it('should detect missing required sections in feat issue', () => {
      const title = 'feat: Add new feature';
      const body = `## Description

Just a description, no acceptance criteria.`;

      const result = validateIssueBody(title, body);

      expect(result.valid).toBe(false);
      expect(result.issueType).toBe('feat');
      expect(result.missingRequired).toContain('Acceptance Criteria');
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should validate valid bug issue', () => {
      const title = 'bug: Something is broken';
      const body = `## Bug Description

The button doesn't work.

## Steps to Reproduce

1. Click the button
2. Nothing happens

## Expected Behavior

The action should complete.`;

      const result = validateIssueBody(title, body);

      expect(result.valid).toBe(true);
      expect(result.issueType).toBe('bug');
      expect(result.missingRequired).toHaveLength(0);
    });

    it('should detect missing sections in bug issue', () => {
      const title = 'bug: Something broken';
      const body = '## Bug Description\n\nBroken thing.';

      const result = validateIssueBody(title, body);

      expect(result.valid).toBe(false);
      expect(result.issueType).toBe('bug');
      expect(result.missingRequired).toContain('Steps to Reproduce');
      expect(result.missingRequired).toContain('Expected Behavior');
    });

    it('should validate valid refactor issue', () => {
      const title = 'refactor: Improve code structure';
      const body = `## Current State

Code is messy.

## Target State

Code will be clean.`;

      const result = validateIssueBody(title, body);

      expect(result.valid).toBe(true);
      expect(result.issueType).toBe('refactor');
    });

    it('should handle unknown issue types gracefully', () => {
      const title = 'Something without prefix';
      const body = '## Description\n\nSome content.';

      const result = validateIssueBody(title, body);

      expect(result.issueType).toBe('unknown');
      expect(result.suggestions).toContain(
        'Consider using a prefix like "feat:", "bug:", "task:", "refactor:", or "docs:" in the title'
      );
    });

    it('should allow explicit type override', () => {
      const title = 'No prefix here';
      const body = `## Description

Content here.

## Acceptance Criteria

- [ ] Done`;

      const result = validateIssueBody(title, body, 'feat');

      expect(result.issueType).toBe('feat');
      expect(result.valid).toBe(true);
    });

    it('should match alternative section headers', () => {
      const title = 'feat: Test alternative headers';
      const body = `## Overview

This is the overview (alternative to Description).

## Definition of Done

- [ ] Complete`;

      const result = validateIssueBody(title, body);

      expect(result.valid).toBe(true);
      expect(result.sections.find((s) => s.section === 'Description')?.found).toBe(true);
      expect(result.sections.find((s) => s.section === 'Acceptance Criteria')?.found).toBe(true);
    });
  });

  describe('generateTemplateBody', () => {
    it('should generate template for feat type', () => {
      const body = generateTemplateBody('feat');

      expect(body).toContain('## Description');
      expect(body).toContain('## Acceptance Criteria');
    });

    it('should generate template for bug type', () => {
      const body = generateTemplateBody('bug');

      expect(body).toContain('Bug Description');
      expect(body).toContain('Steps to Reproduce');
      expect(body).toContain('Expected Behavior');
    });

    it('should generate template for all types without errors', () => {
      const types: IssueType[] = ['feat', 'bug', 'task', 'refactor', 'docs', 'unknown'];
      for (const type of types) {
        const body = generateTemplateBody(type);
        expect(typeof body).toBe('string');
        expect(body.length).toBeGreaterThan(0);
      }
    });
  });

  describe('formatValidationResult', () => {
    it('should format valid result', () => {
      const result = validateIssueBody(
        'feat: Test',
        '## Description\n\nContent.\n\n## Acceptance Criteria\n\n- [ ] Done'
      );

      const formatted = formatValidationResult(result);

      expect(formatted).toContain('Feature Request');
      expect(formatted).toContain('VALID');
      expect(formatted).toContain('Description');
      expect(formatted).toContain('Acceptance Criteria');
    });

    it('should format invalid result with suggestions', () => {
      const result = validateIssueBody('feat: Test', '## Description\n\nJust description.');

      const formatted = formatValidationResult(result);

      expect(formatted).toContain('INVALID');
      expect(formatted).toContain('Acceptance Criteria');
      expect(formatted).toContain('Suggestions');
    });

    it('should include required/optional labels', () => {
      const result = validateIssueBody('feat: Test', '## Description\n\nContent.');

      const formatted = formatValidationResult(result);

      expect(formatted).toContain('(required)');
      expect(formatted).toContain('(optional)');
    });
  });
});
