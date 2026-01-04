/**
 * @nexus-agents/workflows - Template Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import type { WorkflowDefinition } from '@nexus-agents/core';
import { createIsolatedRegistry, resetRegistry, TemplateRegistry } from './template-registry.js';
import { getBuiltInTemplatesPath } from './template-loader.js';
import { BUILT_IN_TEMPLATES } from './template-types.js';

describe('TemplateRegistry', () => {
  let registry: TemplateRegistry;

  beforeEach(() => {
    resetRegistry();
    registry = createIsolatedRegistry();
  });

  describe('initialization', () => {
    it('should load built-in templates on initialize', async () => {
      await registry.initialize();

      const builtIn = registry.getBuiltIn();
      expect(builtIn.length).toBe(BUILT_IN_TEMPLATES.length);
    });

    it('should include all expected built-in templates', async () => {
      await registry.initialize();

      for (const templateName of BUILT_IN_TEMPLATES) {
        const definition = registry.getById(templateName);
        expect(definition).toBeDefined();
        expect(definition?.name).toBe(templateName);
      }
    });

    it('should not reinitialize if already initialized', async () => {
      await registry.initialize();
      const firstCount = registry.getAll().length;

      await registry.initialize();
      const secondCount = registry.getAll().length;

      expect(firstCount).toBe(secondCount);
    });
  });

  describe('getById', () => {
    beforeEach(async () => {
      await registry.initialize();
    });

    it('should return workflow definition for valid ID', () => {
      const definition = registry.getById('code-review');

      expect(definition).toBeDefined();
      expect(definition?.name).toBe('code-review');
      expect(definition?.version).toBe('1.0.0');
      expect(definition?.steps.length).toBeGreaterThan(0);
    });

    it('should return undefined for invalid ID', () => {
      const definition = registry.getById('non-existent-template');

      expect(definition).toBeUndefined();
    });

    it('should return complete workflow structure', () => {
      const definition = registry.getById('code-review');

      expect(definition?.inputs).toBeDefined();
      expect(definition?.steps).toBeDefined();
      expect(Array.isArray(definition?.inputs)).toBe(true);
      expect(Array.isArray(definition?.steps)).toBe(true);
    });
  });

  describe('register', () => {
    beforeEach(async () => {
      await registry.initialize();
    });

    it('should register a custom workflow template', () => {
      const customWorkflow: WorkflowDefinition = {
        name: 'custom-workflow',
        version: '1.0.0',
        description: 'A custom test workflow',
        inputs: [{ name: 'input1', type: 'string', required: true }],
        steps: [
          {
            id: 'step1',
            agent: 'code_expert',
            action: 'custom_action',
            inputs: {},
          },
        ],
      };

      registry.register(customWorkflow);

      const retrieved = registry.getById('custom-workflow');
      expect(retrieved).toEqual(customWorkflow);
    });

    it('should add custom template to metadata', () => {
      const customWorkflow: WorkflowDefinition = {
        name: 'custom-workflow',
        version: '2.0.0',
        description: 'Test description',
        inputs: [],
        steps: [
          {
            id: 'step1',
            agent: 'code_expert',
            action: 'test',
            inputs: {},
          },
        ],
      };

      registry.register(customWorkflow, { category: 'testing' });

      const all = registry.getAll();
      const customMeta = all.find((m) => m.name === 'custom-workflow');

      expect(customMeta).toBeDefined();
      expect(customMeta?.builtIn).toBe(false);
      expect(customMeta?.category).toBe('testing');
    });

    it('should throw when trying to overwrite built-in template', () => {
      const overwriteWorkflow: WorkflowDefinition = {
        name: 'code-review',
        version: '2.0.0',
        inputs: [],
        steps: [{ id: 's1', agent: 'code_expert', action: 'a', inputs: {} }],
      };

      expect(() => {
        registry.register(overwriteWorkflow);
      }).toThrow('Cannot overwrite built-in template');
    });

    it('should allow updating custom templates', () => {
      const workflow: WorkflowDefinition = {
        name: 'updatable',
        version: '1.0.0',
        inputs: [],
        steps: [{ id: 's1', agent: 'code_expert', action: 'a', inputs: {} }],
      };

      registry.register(workflow);

      const updated: WorkflowDefinition = {
        ...workflow,
        version: '2.0.0',
      };

      registry.register(updated);

      const retrieved = registry.getById('updatable');
      expect(retrieved?.version).toBe('2.0.0');
    });
  });

  describe('unregister', () => {
    beforeEach(async () => {
      await registry.initialize();
    });

    it('should unregister custom templates', () => {
      const workflow: WorkflowDefinition = {
        name: 'to-remove',
        version: '1.0.0',
        inputs: [],
        steps: [{ id: 's1', agent: 'code_expert', action: 'a', inputs: {} }],
      };

      registry.register(workflow);
      expect(registry.getById('to-remove')).toBeDefined();

      const result = registry.unregister('to-remove');
      expect(result).toBe(true);
      expect(registry.getById('to-remove')).toBeUndefined();
    });

    it('should return false for non-existent templates', () => {
      const result = registry.unregister('does-not-exist');
      expect(result).toBe(false);
    });

    it('should throw when trying to unregister built-in templates', () => {
      expect(() => registry.unregister('code-review')).toThrow(
        'Cannot unregister built-in template'
      );
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await registry.initialize();
    });

    it('should find templates by name', () => {
      const results = registry.search('code');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.name === 'code-review')).toBe(true);
    });

    it('should find templates by keyword', () => {
      const results = registry.search('security');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.name === 'code-review')).toBe(true);
    });

    it('should return empty array for no matches', () => {
      const results = registry.search('xyznonexistent');

      expect(results).toEqual([]);
    });

    it('should be case insensitive', () => {
      const lowerResults = registry.search('review');
      const upperResults = registry.search('REVIEW');

      expect(lowerResults.length).toBe(upperResults.length);
    });
  });

  describe('getByCategory', () => {
    beforeEach(async () => {
      await registry.initialize();
    });

    it('should filter by development category', () => {
      const results = registry.getByCategory('development');

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.category === 'development')).toBe(true);
    });

    it('should filter by review category', () => {
      const results = registry.getByCategory('review');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.name === 'code-review')).toBe(true);
    });

    it('should return empty for unused categories', () => {
      const results = registry.getByCategory('testing');

      // Built-in templates don't include testing category
      expect(results.length).toBe(0);
    });
  });

  describe('getStats', () => {
    beforeEach(async () => {
      await registry.initialize();
    });

    it('should return correct statistics', () => {
      const stats = registry.getStats();

      expect(stats.builtIn).toBe(BUILT_IN_TEMPLATES.length);
      expect(stats.custom).toBe(0);
      expect(stats.total).toBe(stats.builtIn + stats.custom);
    });

    it('should update stats when registering custom templates', () => {
      registry.register({
        name: 'custom1',
        version: '1.0.0',
        inputs: [],
        steps: [{ id: 's', agent: 'code_expert', action: 'a', inputs: {} }],
      });

      const stats = registry.getStats();
      expect(stats.custom).toBe(1);
    });
  });

  describe('clearCustom', () => {
    beforeEach(async () => {
      await registry.initialize();
    });

    it('should remove all custom templates', () => {
      registry.register({
        name: 'custom1',
        version: '1.0.0',
        inputs: [],
        steps: [{ id: 's', agent: 'code_expert', action: 'a', inputs: {} }],
      });

      registry.register({
        name: 'custom2',
        version: '1.0.0',
        inputs: [],
        steps: [{ id: 's', agent: 'code_expert', action: 'a', inputs: {} }],
      });

      expect(registry.getStats().custom).toBe(2);

      registry.clearCustom();

      expect(registry.getStats().custom).toBe(0);
      expect(registry.getStats().builtIn).toBe(BUILT_IN_TEMPLATES.length);
    });

    it('should preserve built-in templates', () => {
      registry.clearCustom();

      for (const name of BUILT_IN_TEMPLATES) {
        expect(registry.getById(name)).toBeDefined();
      }
    });
  });

  describe('loadFromDirectory', () => {
    const testDir = join(process.cwd(), 'test-templates-temp');

    beforeEach(async () => {
      await registry.initialize();
      await mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
      await rm(testDir, { recursive: true, force: true });
    });

    it('should load templates from directory', async () => {
      const testTemplate = `
name: test-workflow
version: "1.0.0"
description: Test workflow
inputs:
  - name: testInput
    type: string
steps:
  - id: test-step
    agent: code_expert
    action: test_action
    inputs:
      data: \${{ inputs.testInput }}
`;

      await writeFile(join(testDir, 'test-workflow.yaml'), testTemplate);

      const count = await registry.loadFromDirectory(testDir);

      expect(count).toBe(1);
      expect(registry.getById('test-workflow')).toBeDefined();
    });

    it('should skip non-YAML files', async () => {
      await writeFile(join(testDir, 'readme.txt'), 'not a workflow');
      await writeFile(join(testDir, 'config.json'), '{}');

      const count = await registry.loadFromDirectory(testDir);

      expect(count).toBe(0);
    });

    it('should handle invalid YAML gracefully', async () => {
      const invalidYaml = `
name: invalid
version: not-semver
steps: not-an-array
`;

      await writeFile(join(testDir, 'invalid.yaml'), invalidYaml);

      const count = await registry.loadFromDirectory(testDir);

      expect(count).toBe(0);
    });
  });

  describe('built-in template content', () => {
    beforeEach(async () => {
      await registry.initialize();
    });

    it('code-review should have correct structure', () => {
      const def = registry.getById('code-review');

      expect(def?.inputs.some((i) => i.name === 'files')).toBe(true);
      expect(def?.inputs.some((i) => i.name === 'focus')).toBe(true);
      expect(def?.steps.some((s) => s.id === 'analyze')).toBe(true);
      expect(def?.steps.some((s) => s.id === 'security')).toBe(true);
      expect(def?.steps.some((s) => s.id === 'synthesize')).toBe(true);
    });

    it('feature-implementation should have five steps', () => {
      const def = registry.getById('feature-implementation');
      expect(def?.steps.length).toBe(5);
    });

    it('feature-implementation should have correct step order', () => {
      const def = registry.getById('feature-implementation');
      const stepIds = def?.steps.map((s) => s.id);

      expect(stepIds).toEqual(['plan', 'implement', 'test', 'document', 'review']);
    });

    it('bug-fix should have diagnosis and verification', () => {
      const def = registry.getById('bug-fix');

      expect(def?.steps.some((s) => s.id === 'diagnose')).toBe(true);
      expect(def?.steps.some((s) => s.id === 'fix')).toBe(true);
      expect(def?.steps.some((s) => s.id === 'test')).toBe(true);
      expect(def?.steps.some((s) => s.id === 'verify')).toBe(true);
    });

    it('documentation-update should have three main steps', () => {
      const def = registry.getById('documentation-update');

      expect(def?.steps.length).toBe(3);
      expect(def?.steps[0]?.id).toBe('analyze');
      expect(def?.steps[1]?.id).toBe('update');
      expect(def?.steps[2]?.id).toBe('review');
    });
  });
});

describe('getBuiltInTemplatesPath', () => {
  it('should return valid templates directory path', () => {
    const path = getBuiltInTemplatesPath();

    expect(path).toContain('templates');
    expect(path).not.toContain('undefined');
  });
});
