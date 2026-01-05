/**
 * Tests for workflow run command
 *
 * Verifies workflow execution functionality across formats.
 * (Source: Issue #67, CODING_STANDARDS.md)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runWorkflowRun, printWorkflowRunResult, listWorkflowTemplates } from './workflow-run.js';
import type { WorkflowRunResult } from './workflow-run.js';

describe('workflow-run', () => {
  let stdoutWriteMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutWriteMock = vi.fn();
    vi.spyOn(process.stdout, 'write').mockImplementation(stdoutWriteMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runWorkflowRun', () => {
    // Standard inputs for workflows that require them
    const codeReviewInput = '{"files": ["src/main.ts"]}';
    const featureInput = '{"feature": "implement test feature"}';
    const bugFixInput = '{"bugDescription": "test bug description"}';
    const docsInput = '{"scope": "readme"}';

    it('should find built-in code-review workflow with required inputs', async () => {
      const result = await runWorkflowRun({
        name: 'code-review',
        input: codeReviewInput,
        dryRun: true,
        verbose: undefined,
      });

      expect(result.success).toBe(true);
      expect(result.workflowName).toBe('code-review');
      expect(result.dryRun).toBe(true);
    });

    it('should find built-in feature-implementation workflow with inputs', async () => {
      const result = await runWorkflowRun({
        name: 'feature-implementation',
        input: featureInput,
        dryRun: true,
        verbose: undefined,
      });

      expect(result.success).toBe(true);
      expect(result.workflowName).toBe('feature-implementation');
    });

    it('should find built-in bug-fix workflow with inputs', async () => {
      const result = await runWorkflowRun({
        name: 'bug-fix',
        input: bugFixInput,
        dryRun: true,
        verbose: undefined,
      });

      expect(result.success).toBe(true);
      expect(result.workflowName).toBe('bug-fix');
    });

    it('should find built-in documentation-update workflow with inputs', async () => {
      const result = await runWorkflowRun({
        name: 'documentation-update',
        input: docsInput,
        dryRun: true,
        verbose: undefined,
      });

      expect(result.success).toBe(true);
      expect(result.workflowName).toBe('documentation-update');
    });

    it('should return error for unknown workflow', async () => {
      const result = await runWorkflowRun({
        name: 'non-existent-workflow',
        input: undefined,
        dryRun: false,
        verbose: undefined,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should parse JSON input string', async () => {
      const result = await runWorkflowRun({
        name: 'code-review',
        input: codeReviewInput,
        dryRun: true,
        verbose: undefined,
      });

      expect(result.success).toBe(true);
    });

    it('should fail on invalid JSON input', async () => {
      const result = await runWorkflowRun({
        name: 'code-review',
        input: 'not-json',
        dryRun: true,
        verbose: undefined,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to parse inputs');
    });

    it('should include step count in result', async () => {
      const result = await runWorkflowRun({
        name: 'code-review',
        input: codeReviewInput,
        dryRun: true,
        verbose: undefined,
      });

      expect(result.success).toBe(true);
      expect(result.steps).toBeGreaterThan(0);
    });

    it('should set dryRun flag correctly', async () => {
      const dryRunResult = await runWorkflowRun({
        name: 'code-review',
        input: codeReviewInput,
        dryRun: true,
        verbose: undefined,
      });

      const normalResult = await runWorkflowRun({
        name: 'code-review',
        input: codeReviewInput,
        dryRun: false,
        verbose: undefined,
      });

      expect(dryRunResult.dryRun).toBe(true);
      expect(normalResult.dryRun).toBe(false);
    });

    it('should fail when required inputs are missing', async () => {
      const result = await runWorkflowRun({
        name: 'code-review',
        input: undefined,
        dryRun: true,
        verbose: undefined,
      });

      expect(result.success).toBe(false);
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors?.some((e) => e.includes('files'))).toBe(true);
    });
  });

  describe('printWorkflowRunResult', () => {
    it('should print success result for dry run', () => {
      const result: WorkflowRunResult = {
        success: true,
        message: 'Test message',
        workflowName: 'test-workflow',
        dryRun: true,
        steps: 3,
      };

      printWorkflowRunResult(result);

      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('Dry Run Complete');
      expect(output).toContain('test-workflow');
      expect(output).toContain('3');
    });

    it('should print success result for normal run', () => {
      const result: WorkflowRunResult = {
        success: true,
        message: 'Test message',
        workflowName: 'test-workflow',
        dryRun: false,
        steps: 5,
      };

      printWorkflowRunResult(result);

      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('Workflow Ready');
      expect(output).toContain('MCP server');
    });

    it('should print failure result', () => {
      const result: WorkflowRunResult = {
        success: false,
        message: 'Workflow not found',
        dryRun: false,
      };

      printWorkflowRunResult(result);

      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('Workflow Failed');
      expect(output).toContain('Workflow not found');
    });

    it('should print validation errors', () => {
      const result: WorkflowRunResult = {
        success: false,
        message: 'Validation failed',
        dryRun: false,
        validationErrors: ['Missing required input: files', 'Invalid type for input'],
      };

      printWorkflowRunResult(result);

      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('Validation Errors');
      expect(output).toContain('Missing required input: files');
      expect(output).toContain('Invalid type for input');
    });
  });

  describe('listWorkflowTemplates', () => {
    it('should return built-in templates', async () => {
      const templates = await listWorkflowTemplates();

      expect(templates.length).toBeGreaterThan(0);
      expect(templates.some((t) => t.name === 'code-review')).toBe(true);
      expect(templates.some((t) => t.name === 'feature-implementation')).toBe(true);
      expect(templates.some((t) => t.name === 'bug-fix')).toBe(true);
      expect(templates.some((t) => t.name === 'documentation-update')).toBe(true);
    });

    it('should mark templates as built-in', async () => {
      const templates = await listWorkflowTemplates();

      const codeReview = templates.find((t) => t.name === 'code-review');
      expect(codeReview).toBeDefined();
      expect(codeReview?.builtIn).toBe(true);
    });

    it('should include category for templates', async () => {
      const templates = await listWorkflowTemplates();

      const codeReview = templates.find((t) => t.name === 'code-review');
      expect(codeReview?.category).toBeDefined();
    });
  });
});
