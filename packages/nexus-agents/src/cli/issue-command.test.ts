/**
 * Tests for issue-command CLI
 *
 * (Source: Issue #249 - CLI test coverage)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchGitHubIssue,
  createGitHubIssue,
  validateIssue,
  printValidationResult,
  printTemplate,
  issueCommand,
} from './issue-command.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Mock issue-templates module
vi.mock('./issue-templates.js', () => ({
  validateIssueBody: vi.fn(),
  generateTemplateBody: vi.fn(),
  getTemplate: vi.fn(),
}));

import { execSync } from 'node:child_process';
import { validateIssueBody, generateTemplateBody, getTemplate } from './issue-templates.js';

const mockExecSync = vi.mocked(execSync);
const mockValidateIssueBody = vi.mocked(validateIssueBody);
const mockGenerateTemplateBody = vi.mocked(generateTemplateBody);
const mockGetTemplate = vi.mocked(getTemplate);

describe('issue-command', () => {
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutWriteSpy.mockRestore();
  });

  describe('fetchGitHubIssue', () => {
    it('should fetch and parse GitHub issue', () => {
      mockExecSync.mockReturnValue(
        JSON.stringify({
          number: 123,
          title: 'feat: Add feature',
          body: '## Description\n\nTest body',
          state: 'OPEN',
          labels: [{ name: 'enhancement' }],
        })
      );

      const issue = fetchGitHubIssue(123);

      expect(issue).toEqual({
        number: 123,
        title: 'feat: Add feature',
        body: '## Description\n\nTest body',
        state: 'open',
        labels: ['enhancement'],
      });
      expect(mockExecSync).toHaveBeenCalledWith(
        'gh issue view 123 --json number,title,body,state,labels',
        expect.any(Object)
      );
    });

    it('should return null on error', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('gh: issue not found');
      });

      const issue = fetchGitHubIssue(999);

      expect(issue).toBeNull();
    });

    it('should handle closed issues', () => {
      mockExecSync.mockReturnValue(
        JSON.stringify({
          number: 100,
          title: 'fix: Bug fix',
          body: null,
          state: 'CLOSED',
          labels: [],
        })
      );

      const issue = fetchGitHubIssue(100);

      expect(issue?.state).toBe('closed');
      expect(issue?.body).toBe('');
    });
  });

  describe('createGitHubIssue', () => {
    it('should create issue and return issue number', () => {
      mockExecSync.mockReturnValue('https://github.com/owner/repo/issues/456\n');

      const issueNumber = createGitHubIssue('feat: New feature', '## Description', ['enhancement']);

      expect(issueNumber).toBe(456);
    });

    it('should return null on error', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('gh: authentication failed');
      });

      const issueNumber = createGitHubIssue('title', 'body', []);

      expect(issueNumber).toBeNull();
    });

    it('should return null if no issue number in output', () => {
      mockExecSync.mockReturnValue('Created issue successfully');

      const issueNumber = createGitHubIssue('title', 'body', []);

      expect(issueNumber).toBeNull();
    });
  });

  describe('validateIssue', () => {
    it('should return error when issue not found', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('not found');
      });

      const result = validateIssue(999);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found or not accessible');
    });

    it('should validate issue and return result', () => {
      mockExecSync.mockReturnValue(
        JSON.stringify({
          number: 123,
          title: 'feat: Add feature',
          body: '## Description\n\nTest',
          state: 'OPEN',
          labels: [],
        })
      );

      mockValidateIssueBody.mockReturnValue({
        valid: true,
        template: { type: 'feat', displayName: 'Feature', sections: [] },
        sections: [],
        suggestions: [],
      });

      const result = validateIssue(123);

      expect(result.success).toBe(true);
      expect(result.validation?.valid).toBe(true);
    });

    it('should return invalid validation when body is invalid', () => {
      mockExecSync.mockReturnValue(
        JSON.stringify({
          number: 123,
          title: 'bad title',
          body: '',
          state: 'OPEN',
          labels: [],
        })
      );

      mockValidateIssueBody.mockReturnValue({
        valid: false,
        template: { type: 'generic', displayName: 'Generic', sections: [] },
        sections: [{ section: 'Description', required: true, found: false }],
        suggestions: ['Add a Description section'],
      });

      const result = validateIssue(123);

      expect(result.success).toBe(false);
      expect(result.validation?.suggestions.length).toBeGreaterThan(0);
    });
  });

  describe('printValidationResult', () => {
    it('should print JSON format', () => {
      const result = {
        success: true,
        issueNumber: 123,
        validation: {
          valid: true,
          template: { type: 'feat' as const, displayName: 'Feature', sections: [] },
          sections: [],
          suggestions: [],
        },
      };

      printValidationResult(result, 'json');

      expect(stdoutWriteSpy).toHaveBeenCalled();
      const output = stdoutWriteSpy.mock.calls[0]?.[0] as string;
      expect((): unknown => JSON.parse(output)).not.toThrow();
    });

    it('should print error when present', () => {
      const result = {
        success: false,
        issueNumber: 999,
        error: 'Issue not found',
      };

      printValidationResult(result, 'text');

      expect(stdoutWriteSpy).toHaveBeenCalled();
      const output = stdoutWriteSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Error');
    });
  });

  describe('printTemplate', () => {
    it('should print template for issue type', () => {
      mockGetTemplate.mockReturnValue({
        type: 'feat',
        displayName: 'Feature',
        sections: [{ name: 'Description', required: true, description: 'Describe the feature' }],
      });
      mockGenerateTemplateBody.mockReturnValue('## Description\n\n<!-- Describe the feature -->');

      printTemplate('feat');

      expect(stdoutWriteSpy).toHaveBeenCalled();
      const output = stdoutWriteSpy.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('Feature');
      expect(output).toContain('Description');
    });
  });

  describe('issueCommand', () => {
    it('should return 1 for validate without issue number', () => {
      const exitCode = issueCommand({ subcommand: 'validate' });

      expect(exitCode).toBe(1);
    });

    it('should return 0 for valid issue', () => {
      mockExecSync.mockReturnValue(
        JSON.stringify({
          number: 123,
          title: 'feat: Feature',
          body: '## Description\n\nValid',
          state: 'OPEN',
          labels: [],
        })
      );

      mockValidateIssueBody.mockReturnValue({
        valid: true,
        template: { type: 'feat', displayName: 'Feature', sections: [] },
        sections: [],
        suggestions: [],
      });

      const exitCode = issueCommand({ subcommand: 'validate', issueNumber: 123 });

      expect(exitCode).toBe(0);
    });

    it('should return 1 for invalid issue', () => {
      mockExecSync.mockReturnValue(
        JSON.stringify({
          number: 123,
          title: 'bad',
          body: '',
          state: 'OPEN',
          labels: [],
        })
      );

      mockValidateIssueBody.mockReturnValue({
        valid: false,
        template: { type: 'generic', displayName: 'Generic', sections: [] },
        sections: [],
        suggestions: [],
      });

      const exitCode = issueCommand({ subcommand: 'validate', issueNumber: 123 });

      expect(exitCode).toBe(1);
    });

    it('should return 0 for create subcommand', () => {
      mockGetTemplate.mockReturnValue({
        type: 'fix',
        displayName: 'Bug Fix',
        sections: [],
      });
      mockGenerateTemplateBody.mockReturnValue('## Description\n\n');

      const exitCode = issueCommand({ subcommand: 'create', type: 'fix' });

      expect(exitCode).toBe(0);
    });

    it('should return 1 for unknown subcommand', () => {
      // @ts-expect-error - testing invalid input
      const exitCode = issueCommand({ subcommand: 'unknown' });

      expect(exitCode).toBe(1);
    });
  });
});
