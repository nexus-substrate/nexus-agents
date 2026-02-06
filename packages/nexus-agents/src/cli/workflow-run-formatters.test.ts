/**
 * nexus-agents/cli - Workflow Run Formatters Tests
 *
 * Comprehensive test suite for workflow run formatters module.
 *
 * @module cli/workflow-run-formatters.test
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import type { WorkflowDefinition } from '../core/index.js';
import type { TemplateMetadata } from '../workflows/index.js';
import {
  formatStep,
  printWorkflowRunResult,
  printWorkflowTemplateList,
} from './workflow-run-formatters.js';
import type { WorkflowRunResult } from './workflow-run-types.js';
import { colors } from './workflow-run-types.js';

describe('workflow-run-formatters', () => {
  let stdoutWriteSpy: MockInstance;

  beforeEach(() => {
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
  });

  describe('formatStep', () => {
    it('formats a step with single-digit index', () => {
      const step = { id: 'test-step', agent: 'test-agent', action: 'test-action' };
      const result = formatStep(step, 0);

      expect(result).toBe(`   1. ${colors.cyan}test-step${colors.reset} → test-agent::test-action`);
    });

    it('formats a step with double-digit index', () => {
      const step = { id: 'test-step', agent: 'test-agent', action: 'test-action' };
      const result = formatStep(step, 15);

      expect(result).toBe(`  16. ${colors.cyan}test-step${colors.reset} → test-agent::test-action`);
    });

    it('formats a step with index zero', () => {
      const step = { id: 'init', agent: 'setup', action: 'initialize' };
      const result = formatStep(step, 0);

      expect(result).toContain(' 1. ');
      expect(result).toContain('init');
      expect(result).toContain('setup::initialize');
    });

    it('formats a step with large index', () => {
      const step = { id: 'final', agent: 'cleanup', action: 'finish' };
      const result = formatStep(step, 99);

      expect(result).toContain('100. ');
      expect(result).toContain('final');
    });

    it('preserves special characters in step properties', () => {
      const step = {
        id: 'step-with-dashes',
        agent: 'agent_with_underscores',
        action: 'action:with:colons',
      };
      const result = formatStep(step, 0);

      expect(result).toContain('step-with-dashes');
      expect(result).toContain('agent_with_underscores');
      expect(result).toContain('action:with:colons');
    });
  });

  describe('printWorkflowRunResult', () => {
    describe('success results', () => {
      it('prints basic success result', () => {
        const result: WorkflowRunResult = {
          success: true,
          message: 'Workflow executed successfully',
          workflowName: 'test-workflow',
          dryRun: false,
        };

        printWorkflowRunResult(result);

        expect(stdoutWriteSpy).toHaveBeenCalled();
        const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Workflow Ready');
        expect(output).toContain('test-workflow');
        expect(output).toContain('Full execution requires the MCP server');
      });

      it('prints dry run success result', () => {
        const result: WorkflowRunResult = {
          success: true,
          message: 'Dry run completed',
          workflowName: 'test-workflow',
          dryRun: true,
        };

        printWorkflowRunResult(result);

        const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Dry Run Complete');
        expect(output).not.toContain('Full execution requires the MCP server');
      });

      it('prints success result with steps count', () => {
        const result: WorkflowRunResult = {
          success: true,
          message: 'Workflow ready',
          workflowName: 'test-workflow',
          dryRun: false,
          steps: 5,
        };

        printWorkflowRunResult(result);

        const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Steps: 5');
      });

      it('prints success result without steps when undefined', () => {
        const result: WorkflowRunResult = {
          success: true,
          message: 'Workflow ready',
          workflowName: 'test-workflow',
          dryRun: false,
        };

        printWorkflowRunResult(result);

        const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
        expect(output).not.toContain('Steps:');
      });

      it('prints success result with unknown workflow name', () => {
        const result: WorkflowRunResult = {
          success: true,
          message: 'Workflow ready',
          dryRun: false,
        };

        printWorkflowRunResult(result);

        const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('unknown');
      });

      it('prints execution plan in verbose mode', () => {
        const result: WorkflowRunResult = {
          success: true,
          message: 'Workflow ready',
          workflowName: 'test-workflow',
          dryRun: false,
        };

        const workflow: WorkflowDefinition = {
          name: 'test-workflow',
          version: '1.0.0',
          inputs: [],
          steps: [
            { id: 'step-1', agent: 'code_expert', action: 'action-1', inputs: {} },
            { id: 'step-2', agent: 'testing_expert', action: 'action-2', inputs: {} },
          ],
        };

        printWorkflowRunResult(result, { workflow, verbose: true });

        const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Execution Plan:');
        expect(output).toContain('step-1');
        expect(output).toContain('step-2');
        expect(output).toContain('code_expert::action-1');
        expect(output).toContain('testing_expert::action-2');
      });

      it('does not print execution plan when verbose is false', () => {
        const result: WorkflowRunResult = {
          success: true,
          message: 'Workflow ready',
          workflowName: 'test-workflow',
          dryRun: false,
        };

        const workflow: WorkflowDefinition = {
          name: 'test-workflow',
          version: '1.0.0',
          inputs: [],
          steps: [{ id: 'step-1', agent: 'code_expert', action: 'action-1', inputs: {} }],
        };

        printWorkflowRunResult(result, { workflow, verbose: false });

        const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
        expect(output).not.toContain('Execution Plan:');
        expect(output).not.toContain('step-1');
      });

      it('does not print execution plan when workflow is undefined', () => {
        const result: WorkflowRunResult = {
          success: true,
          message: 'Workflow ready',
          workflowName: 'test-workflow',
          dryRun: false,
        };

        printWorkflowRunResult(result, { verbose: true });

        const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
        expect(output).not.toContain('Execution Plan:');
      });

      it('handles workflow with empty steps array', () => {
        const result: WorkflowRunResult = {
          success: true,
          message: 'Workflow ready',
          workflowName: 'test-workflow',
          dryRun: false,
        };

        const workflow: WorkflowDefinition = {
          name: 'test-workflow',
          version: '1.0.0',
          inputs: [],
          steps: [],
        };

        printWorkflowRunResult(result, { workflow, verbose: true });

        const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Execution Plan:');
        // No step lines should be printed
        expect(output.split('\n').filter((line) => line.match(/^\s+\d+\./)).length).toBe(0);
      });

      it('prints with default options when no options provided', () => {
        const result: WorkflowRunResult = {
          success: true,
          message: 'Workflow ready',
          workflowName: 'test-workflow',
          dryRun: false,
        };

        printWorkflowRunResult(result);

        const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Workflow Ready');
        expect(output).not.toContain('Execution Plan:');
      });
    });

    describe('failure results', () => {
      it('prints basic failure result', () => {
        const result: WorkflowRunResult = {
          success: false,
          message: 'Workflow failed to execute',
          workflowName: 'test-workflow',
          dryRun: false,
        };

        printWorkflowRunResult(result);

        const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Workflow Failed');
        expect(output).toContain('Workflow failed to execute');
      });

      it('prints failure result with validation errors', () => {
        const result: WorkflowRunResult = {
          success: false,
          message: 'Validation failed',
          workflowName: 'test-workflow',
          dryRun: true,
          validationErrors: ['Missing required input: url', 'Invalid format for input: timeout'],
        };

        printWorkflowRunResult(result);

        const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Workflow Failed');
        expect(output).toContain('Validation Errors:');
        expect(output).toContain('Missing required input: url');
        expect(output).toContain('Invalid format for input: timeout');
      });

      it('prints failure result with empty validation errors array', () => {
        const result: WorkflowRunResult = {
          success: false,
          message: 'Workflow failed',
          workflowName: 'test-workflow',
          dryRun: false,
          validationErrors: [],
        };

        printWorkflowRunResult(result);

        const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Workflow Failed');
        expect(output).not.toContain('Validation Errors:');
      });

      it('prints failure result without validation errors when undefined', () => {
        const result: WorkflowRunResult = {
          success: false,
          message: 'Workflow failed',
          workflowName: 'test-workflow',
          dryRun: false,
        };

        printWorkflowRunResult(result);

        const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Workflow Failed');
        expect(output).not.toContain('Validation Errors:');
      });

      it('prints failure result with single validation error', () => {
        const result: WorkflowRunResult = {
          success: false,
          message: 'Validation failed',
          workflowName: 'test-workflow',
          dryRun: true,
          validationErrors: ['Missing required input: url'],
        };

        printWorkflowRunResult(result);

        const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain('Validation Errors:');
        expect(output).toContain('Missing required input: url');
      });

      it('handles long error messages', () => {
        const longMessage = 'A'.repeat(200);
        const result: WorkflowRunResult = {
          success: false,
          message: longMessage,
          workflowName: 'test-workflow',
          dryRun: false,
        };

        printWorkflowRunResult(result);

        const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain(longMessage);
      });
    });

    describe('output formatting', () => {
      it('outputs empty lines before and after result', () => {
        const result: WorkflowRunResult = {
          success: true,
          message: 'Success',
          workflowName: 'test',
          dryRun: false,
        };

        printWorkflowRunResult(result);

        const calls = stdoutWriteSpy.mock.calls.map((call) => String(call[0]));
        expect(calls[0]).toBe('\n');
        expect(calls[calls.length - 1]).toBe('\n');
      });

      it('uses color codes in output', () => {
        const result: WorkflowRunResult = {
          success: true,
          message: 'Success',
          workflowName: 'test',
          dryRun: false,
        };

        printWorkflowRunResult(result);

        const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
        expect(output).toContain(colors.green);
        expect(output).toContain(colors.bold);
        expect(output).toContain(colors.reset);
      });
    });
  });

  describe('printWorkflowTemplateList', () => {
    it('prints empty list message when no templates', () => {
      printWorkflowTemplateList([]);

      const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
      expect(output).toContain('Available Workflow Templates:');
      expect(output).toContain('No templates found');
    });

    it('prints single template', () => {
      const templates: TemplateMetadata[] = [
        {
          id: 'test-template',
          name: 'test-template',
          version: '1.0.0',
          description: 'Test template description',
          category: 'development',
          keywords: ['test'],
          builtIn: true,
          path: 'templates/test.yaml',
        },
      ];

      printWorkflowTemplateList(templates);

      const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
      expect(output).toContain('Available Workflow Templates:');
      expect(output).toContain('development:');
      expect(output).toContain('test-template');
      expect(output).toContain('(built-in)');
      expect(output).toContain('Test template description');
    });

    it('prints multiple templates in same category', () => {
      const templates: TemplateMetadata[] = [
        {
          id: 'template-1',
          name: 'template-1',
          version: '1.0.0',
          description: 'First template',
          category: 'development',
          keywords: [],
          builtIn: true,
          path: 'templates/test.yaml',
        },
        {
          id: 'template-2',
          name: 'template-2',
          version: '1.0.0',
          description: 'Second template',
          category: 'development',
          keywords: [],
          builtIn: false,
          path: 'templates/test.yaml',
        },
      ];

      printWorkflowTemplateList(templates);

      const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
      expect(output).toContain('development:');
      expect(output).toContain('template-1');
      expect(output).toContain('template-2');
      expect(output).toContain('First template');
      expect(output).toContain('Second template');
    });

    it('groups templates by category', () => {
      const templates: TemplateMetadata[] = [
        {
          id: 'dev-template',
          name: 'dev-template',
          version: '1.0.0',
          category: 'development',
          keywords: [],
          builtIn: true,
          path: 'templates/test.yaml',
        },
        {
          id: 'test-template',
          name: 'test-template',
          version: '1.0.0',
          category: 'testing',
          keywords: [],
          builtIn: true,
          path: 'templates/test.yaml',
        },
        {
          id: 'doc-template',
          name: 'doc-template',
          version: '1.0.0',
          category: 'documentation',
          keywords: [],
          builtIn: true,
          path: 'templates/test.yaml',
        },
      ];

      printWorkflowTemplateList(templates);

      const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
      expect(output).toContain('development:');
      expect(output).toContain('testing:');
      expect(output).toContain('documentation:');
      expect(output).toContain('dev-template');
      expect(output).toContain('test-template');
      expect(output).toContain('doc-template');
    });

    it('shows built-in tag for built-in templates', () => {
      const templates: TemplateMetadata[] = [
        {
          id: 'builtin',
          name: 'builtin',
          version: '1.0.0',
          category: 'development',
          keywords: [],
          builtIn: true,
          path: 'templates/test.yaml',
        },
      ];

      printWorkflowTemplateList(templates);

      const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
      expect(output).toContain('(built-in)');
    });

    it('does not show built-in tag for custom templates', () => {
      const templates: TemplateMetadata[] = [
        {
          id: 'custom',
          name: 'custom',
          version: '1.0.0',
          category: 'custom',
          keywords: [],
          builtIn: false,
          path: 'templates/test.yaml',
        },
      ];

      printWorkflowTemplateList(templates);

      const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
      expect(output).not.toContain('(built-in)');
    });

    it('truncates long descriptions at 60 characters', () => {
      const longDescription = 'A'.repeat(100);
      const templates: TemplateMetadata[] = [
        {
          id: 'template',
          name: 'template',
          version: '1.0.0',
          description: longDescription,
          category: 'development',
          keywords: [],
          builtIn: true,
          path: 'templates/test.yaml',
        },
      ];

      printWorkflowTemplateList(templates);

      const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
      // Description should be truncated to 60 chars
      expect(output).toContain('A'.repeat(60));
      expect(output).not.toContain('A'.repeat(61));
    });

    it('handles multi-line descriptions by using only first line', () => {
      const templates: TemplateMetadata[] = [
        {
          id: 'template',
          name: 'template',
          version: '1.0.0',
          description: 'First line\nSecond line\nThird line',
          category: 'development',
          keywords: [],
          builtIn: true,
          path: 'templates/test.yaml',
        },
      ];

      printWorkflowTemplateList(templates);

      const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
      expect(output).toContain('First line');
      expect(output).not.toContain('Second line');
      expect(output).not.toContain('Third line');
    });

    it('handles templates without description', () => {
      const templates: TemplateMetadata[] = [
        {
          id: 'template',
          name: 'template',
          version: '1.0.0',
          category: 'development',
          keywords: [],
          builtIn: true,
          path: 'templates/test.yaml',
        },
      ];

      printWorkflowTemplateList(templates);

      const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
      expect(output).toContain('template');
      // Should not crash, just won't show description line
    });

    it('handles empty string description', () => {
      const templates: TemplateMetadata[] = [
        {
          id: 'template',
          name: 'template',
          version: '1.0.0',
          description: '',
          category: 'development',
          keywords: [],
          builtIn: true,
          path: 'templates/test.yaml',
        },
      ];

      printWorkflowTemplateList(templates);

      const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
      expect(output).toContain('template');
    });

    it('adds blank line after each category', () => {
      const templates: TemplateMetadata[] = [
        {
          id: 'dev-template',
          name: 'dev-template',
          version: '1.0.0',
          category: 'development',
          keywords: [],
          builtIn: true,
          path: 'templates/test.yaml',
        },
        {
          id: 'test-template',
          name: 'test-template',
          version: '1.0.0',
          category: 'testing',
          keywords: [],
          builtIn: true,
          path: 'templates/test.yaml',
        },
      ];

      printWorkflowTemplateList(templates);

      const calls = stdoutWriteSpy.mock.calls.map((call) => String(call[0]));
      // Each category should be followed by a blank line
      const blankLines = calls.filter((call) => call === '\n');
      expect(blankLines.length).toBeGreaterThan(2);
    });

    it('handles all category types', () => {
      const categories: Array<'development' | 'review' | 'documentation' | 'testing' | 'custom'> = [
        'development',
        'review',
        'documentation',
        'testing',
        'custom',
      ];

      const templates: TemplateMetadata[] = categories.map((category, index) => ({
        id: `template-${String(index)}`,
        name: `template-${String(index)}`,
        version: '1.0.0',
        category,
        keywords: [],
        builtIn: true,
        path: 'templates/test.yaml',
      }));

      printWorkflowTemplateList(templates);

      const output = stdoutWriteSpy.mock.calls.map((call) => String(call[0])).join('');
      for (const category of categories) {
        expect(output).toContain(`${category}:`);
      }
    });
  });
});
