/**
 * nexus-agents issue template definitions tests
 *
 * Tests for template constants (feat, bug, task, refactor, docs).
 *
 * (Source: Issue #229, Epic #225)
 */

import { describe, it, expect } from 'vitest';
import {
  FEAT_TEMPLATE,
  BUG_TEMPLATE,
  TASK_TEMPLATE,
  REFACTOR_TEMPLATE,
  DOCS_TEMPLATE,
  UNKNOWN_TEMPLATE,
  TEMPLATES,
  TYPE_PATTERNS,
} from './issue-template-definitions.js';
import type { IssueTemplate, IssueType } from './issue-template-types.js';

describe('issue-template-definitions', () => {
  describe('FEAT_TEMPLATE', () => {
    it('should have correct type and display name', () => {
      expect(FEAT_TEMPLATE.type).toBe('feat');
      expect(FEAT_TEMPLATE.displayName).toBe('Feature Request');
    });

    it('should have required sections', () => {
      const sectionNames = FEAT_TEMPLATE.sections.map((s) => s.name);
      expect(sectionNames).toContain('Description');
      expect(sectionNames).toContain('Acceptance Criteria');
    });

    it('should have patterns that match section headers', () => {
      const descSection = FEAT_TEMPLATE.sections.find((s) => s.name === 'Description');
      expect(descSection).toBeDefined();
      expect(descSection?.pattern.test('## Description')).toBe(true);
      expect(descSection?.pattern.test('# Overview')).toBe(true);
      expect(descSection?.required).toBe(true);
    });

    it('should have example body', () => {
      expect(FEAT_TEMPLATE.example).toBeDefined();
      expect(FEAT_TEMPLATE.example).toContain('## Description');
      expect(FEAT_TEMPLATE.example).toContain('## Acceptance Criteria');
    });

    it('should have optional effort estimation section', () => {
      const effortSection = FEAT_TEMPLATE.sections.find((s) => s.name === 'Estimated Effort');
      expect(effortSection).toBeDefined();
      expect(effortSection?.required).toBe(false);
    });
  });

  describe('BUG_TEMPLATE', () => {
    it('should have correct type and display name', () => {
      expect(BUG_TEMPLATE.type).toBe('bug');
      expect(BUG_TEMPLATE.displayName).toBe('Bug Report');
    });

    it('should have required bug sections', () => {
      const sectionNames = BUG_TEMPLATE.sections.map((s) => s.name);
      expect(sectionNames).toContain('Bug Description');
      expect(sectionNames).toContain('Steps to Reproduce');
      expect(sectionNames).toContain('Expected Behavior');
    });

    it('should mark critical sections as required', () => {
      const requiredSections = BUG_TEMPLATE.sections.filter((s) => s.required).map((s) => s.name);
      expect(requiredSections).toContain('Bug Description');
      expect(requiredSections).toContain('Steps to Reproduce');
      expect(requiredSections).toContain('Expected Behavior');
    });

    it('should have optional environment section', () => {
      const envSection = BUG_TEMPLATE.sections.find((s) => s.name === 'Environment');
      expect(envSection).toBeDefined();
      expect(envSection?.required).toBe(false);
    });

    it('should match reproduction steps variations', () => {
      const stepsSection = BUG_TEMPLATE.sections.find((s) => s.name === 'Steps to Reproduce');
      expect(stepsSection?.pattern.test('## Steps to Reproduce')).toBe(true);
      expect(stepsSection?.pattern.test('## Reproduction')).toBe(true);
      expect(stepsSection?.pattern.test('# How to Reproduce')).toBe(true);
    });
  });

  describe('TASK_TEMPLATE', () => {
    it('should have correct type and display name', () => {
      expect(TASK_TEMPLATE.type).toBe('task');
      expect(TASK_TEMPLATE.displayName).toBe('Task');
    });

    it('should have description as only required section', () => {
      const requiredSections = TASK_TEMPLATE.sections.filter((s) => s.required);
      expect(requiredSections).toHaveLength(1);
      expect(requiredSections[0]?.name).toBe('Description');
    });

    it('should have optional parent issue section', () => {
      const parentSection = TASK_TEMPLATE.sections.find((s) => s.name === 'Parent Issue');
      expect(parentSection).toBeDefined();
      expect(parentSection?.required).toBe(false);
      expect(parentSection?.pattern.test('## Epic')).toBe(true);
      expect(parentSection?.pattern.test('# Part of')).toBe(true);
    });

    it('should have files to modify section', () => {
      const filesSection = TASK_TEMPLATE.sections.find((s) => s.name === 'Files to Modify');
      expect(filesSection).toBeDefined();
      expect(filesSection?.pattern.test('## Files')).toBe(true);
      expect(filesSection?.pattern.test('# Affected Files')).toBe(true);
    });
  });

  describe('REFACTOR_TEMPLATE', () => {
    it('should have correct type and display name', () => {
      expect(REFACTOR_TEMPLATE.type).toBe('refactor');
      expect(REFACTOR_TEMPLATE.displayName).toBe('Refactoring');
    });

    it('should require current and target state sections', () => {
      const requiredSections = REFACTOR_TEMPLATE.sections
        .filter((s) => s.required)
        .map((s) => s.name);
      expect(requiredSections).toContain('Current State');
      expect(requiredSections).toContain('Target State');
    });

    it('should match state section variations', () => {
      const currentSection = REFACTOR_TEMPLATE.sections.find((s) => s.name === 'Current State');
      expect(currentSection?.pattern.test('## Current State')).toBe(true);
      expect(currentSection?.pattern.test('# Before')).toBe(true);
      expect(currentSection?.pattern.test('## Motivation')).toBe(true);
    });

    it('should have optional migration plan section', () => {
      const migrationSection = REFACTOR_TEMPLATE.sections.find((s) => s.name === 'Migration Plan');
      expect(migrationSection).toBeDefined();
      expect(migrationSection?.required).toBe(false);
    });
  });

  describe('DOCS_TEMPLATE', () => {
    it('should have correct type and display name', () => {
      expect(DOCS_TEMPLATE.type).toBe('docs');
      expect(DOCS_TEMPLATE.displayName).toBe('Documentation');
    });

    it('should have description as required section', () => {
      const descSection = DOCS_TEMPLATE.sections.find((s) => s.name === 'Description');
      expect(descSection).toBeDefined();
      expect(descSection?.required).toBe(true);
    });

    it('should have optional affected files section', () => {
      const filesSection = DOCS_TEMPLATE.sections.find((s) => s.name === 'Affected Files');
      expect(filesSection).toBeDefined();
      expect(filesSection?.required).toBe(false);
    });

    it('should have concise example body', () => {
      expect(DOCS_TEMPLATE.example).toBeDefined();
      expect(DOCS_TEMPLATE.example).toContain('README.md');
    });
  });

  describe('UNKNOWN_TEMPLATE', () => {
    it('should have correct type and display name', () => {
      expect(UNKNOWN_TEMPLATE.type).toBe('unknown');
      expect(UNKNOWN_TEMPLATE.displayName).toBe('Unknown');
    });

    it('should have minimal required sections', () => {
      const requiredSections = UNKNOWN_TEMPLATE.sections.filter((s) => s.required);
      expect(requiredSections).toHaveLength(0);
    });

    it('should have optional description section', () => {
      const descSection = UNKNOWN_TEMPLATE.sections.find((s) => s.name === 'Description');
      expect(descSection).toBeDefined();
      expect(descSection?.required).toBe(false);
    });
  });

  describe('TEMPLATES', () => {
    it('should include all issue types', () => {
      const types: IssueType[] = ['feat', 'bug', 'task', 'refactor', 'docs', 'unknown'];
      types.forEach((type) => {
        expect(TEMPLATES[type]).toBeDefined();
        expect(TEMPLATES[type]?.type).toBe(type);
      });
    });

    it('should map templates to correct types', () => {
      expect(TEMPLATES.feat).toBe(FEAT_TEMPLATE);
      expect(TEMPLATES.bug).toBe(BUG_TEMPLATE);
      expect(TEMPLATES.task).toBe(TASK_TEMPLATE);
      expect(TEMPLATES.refactor).toBe(REFACTOR_TEMPLATE);
      expect(TEMPLATES.docs).toBe(DOCS_TEMPLATE);
      expect(TEMPLATES.unknown).toBe(UNKNOWN_TEMPLATE);
    });

    it('should provide all templates as read-only', () => {
      const templateRecord: Record<IssueType, IssueTemplate> = TEMPLATES;
      Object.keys(templateRecord).forEach((key) => {
        const template = templateRecord[key as IssueType];
        expect(template).toBeDefined();
        expect(Object.isFrozen(template.sections)).toBe(false);
      });
    });
  });

  describe('TYPE_PATTERNS', () => {
    it('should match feat titles', () => {
      const featPattern = TYPE_PATTERNS.find((p) => p.type === 'feat');
      expect(featPattern).toBeDefined();
      expect(featPattern?.pattern.test('feat: Add new feature')).toBe(true);
      expect(featPattern?.pattern.test('feature: Add something')).toBe(true);
      expect(featPattern?.pattern.test('enhancement: Improve X')).toBe(true);
      expect(featPattern?.pattern.test('FEAT: Add feature')).toBe(true);
    });

    it('should match bug titles', () => {
      const bugPattern = TYPE_PATTERNS.find((p) => p.type === 'bug');
      expect(bugPattern).toBeDefined();
      expect(bugPattern?.pattern.test('bug: Fix issue')).toBe(true);
      expect(bugPattern?.pattern.test('fix: Resolve problem')).toBe(true);
      expect(bugPattern?.pattern.test('BUG: Something broken')).toBe(true);
    });

    it('should match task titles', () => {
      const taskPattern = TYPE_PATTERNS.find((p) => p.type === 'task');
      expect(taskPattern).toBeDefined();
      expect(taskPattern?.pattern.test('task: Do something')).toBe(true);
      expect(taskPattern?.pattern.test('chore: Update deps')).toBe(true);
      expect(taskPattern?.pattern.test('TASK: Clean up')).toBe(true);
    });

    it('should match refactor titles', () => {
      const refactorPattern = TYPE_PATTERNS.find((p) => p.type === 'refactor');
      expect(refactorPattern).toBeDefined();
      expect(refactorPattern?.pattern.test('refactor: Improve code')).toBe(true);
      expect(refactorPattern?.pattern.test('refactoring: Clean up')).toBe(true);
    });

    it('should match docs titles', () => {
      const docsPattern = TYPE_PATTERNS.find((p) => p.type === 'docs');
      expect(docsPattern).toBeDefined();
      expect(docsPattern?.pattern.test('docs: Update README')).toBe(true);
      expect(docsPattern?.pattern.test('documentation: Add guide')).toBe(true);
    });

    it('should be case insensitive', () => {
      TYPE_PATTERNS.forEach((entry) => {
        const lowercase = `${entry.type}: something`;
        const uppercase = `${entry.type.toUpperCase()}: something`;
        expect(entry.pattern.test(lowercase)).toBe(true);
        expect(entry.pattern.test(uppercase)).toBe(true);
      });
    });

    it('should have exactly 5 patterns', () => {
      expect(TYPE_PATTERNS).toHaveLength(5);
    });
  });

  describe('section pattern matching', () => {
    it('should match variations with case insensitivity', () => {
      const descPattern = /^##?\s*(?:description|overview|summary)/im;
      expect(descPattern.test('## Description')).toBe(true);
      expect(descPattern.test('# description')).toBe(true);
      expect(descPattern.test('## DESCRIPTION')).toBe(true);
      expect(descPattern.test('# Summary')).toBe(true);
    });

    it('should handle single or double hash headers', () => {
      const pattern = /^##?\s*description/im;
      expect(pattern.test('# Description')).toBe(true);
      expect(pattern.test('## Description')).toBe(true);
      expect(pattern.test('### Description')).toBe(false);
    });
  });
});
