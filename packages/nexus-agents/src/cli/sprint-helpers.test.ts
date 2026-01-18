/**
 * Tests for sprint-helpers utilities
 *
 * Verifies issue parsing, priority extraction, and formatting functions.
 * (Source: Issue #230, CODING_STANDARDS.md)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  colors,
  symbols,
  writeLine,
  extractPriority,
  extractIssueType,
  extractEstimatedEffort,
  parseIssue,
  isNotEpic,
  categorizeByPriority,
  printProposal,
  printSprintResult,
} from './sprint-helpers.js';
import type {
  SprintIssue,
  SprintProposal,
  SprintPlanResult,
  GitHubIssueRaw,
} from './sprint-types.js';

describe('sprint-helpers', () => {
  let stdoutWriteMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    stdoutWriteMock = vi.fn();
    vi.spyOn(process.stdout, 'write').mockImplementation(stdoutWriteMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('colors and symbols', () => {
    it('should define color codes', () => {
      expect(colors.reset).toBeDefined();
      expect(colors.green).toBeDefined();
      expect(colors.yellow).toBeDefined();
      expect(colors.red).toBeDefined();
      expect(colors.cyan).toBeDefined();
      expect(colors.dim).toBeDefined();
      expect(colors.bold).toBeDefined();
    });

    it('should define symbols', () => {
      expect(symbols.check).toBeDefined();
      expect(symbols.cross).toBeDefined();
      expect(symbols.bullet).toBeDefined();
    });
  });

  describe('writeLine', () => {
    it('should write text with newline to stdout', () => {
      writeLine('test output');

      expect(stdoutWriteMock).toHaveBeenCalledWith('test output\n');
    });

    it('should handle empty string', () => {
      writeLine('');

      expect(stdoutWriteMock).toHaveBeenCalledWith('\n');
    });
  });

  describe('extractPriority', () => {
    it('should extract P1 priority', () => {
      expect(extractPriority(['P1', 'bug'])).toBe('P1');
      expect(extractPriority(['p1'])).toBe('P1');
    });

    it('should extract P2 priority', () => {
      expect(extractPriority(['P2', 'enhancement'])).toBe('P2');
      expect(extractPriority(['p2'])).toBe('P2');
    });

    it('should extract P3 priority', () => {
      expect(extractPriority(['P3'])).toBe('P3');
      expect(extractPriority(['p3', 'feature'])).toBe('P3');
    });

    it('should extract P4 priority', () => {
      expect(extractPriority(['P4'])).toBe('P4');
      expect(extractPriority(['p4', 'tech-debt'])).toBe('P4');
    });

    it('should return null for no priority', () => {
      expect(extractPriority(['bug', 'enhancement'])).toBeNull();
      expect(extractPriority([])).toBeNull();
    });

    it('should be case insensitive', () => {
      expect(extractPriority(['P1'])).toBe('P1');
      expect(extractPriority(['p1'])).toBe('P1');
      expect(extractPriority(['P2'])).toBe('P2');
      expect(extractPriority(['p2'])).toBe('P2');
    });
  });

  describe('extractIssueType', () => {
    it('should identify feat: prefix', () => {
      expect(extractIssueType('feat: add new feature')).toBe('feat');
      expect(extractIssueType('feature: implement login')).toBe('feat');
      expect(extractIssueType('enhancement: improve UX')).toBe('feat');
    });

    it('should identify bug: prefix', () => {
      expect(extractIssueType('bug: fix crash on load')).toBe('bug');
      expect(extractIssueType('fix: resolve memory leak')).toBe('bug');
    });

    it('should identify task: prefix', () => {
      expect(extractIssueType('task: update dependencies')).toBe('task');
      expect(extractIssueType('chore: clean up code')).toBe('task');
    });

    it('should identify refactor: prefix', () => {
      expect(extractIssueType('refactor: simplify logic')).toBe('refactor');
    });

    it('should identify docs: prefix', () => {
      expect(extractIssueType('docs: update README')).toBe('docs');
      expect(extractIssueType('documentation: add API docs')).toBe('docs');
    });

    it('should return other for unknown prefixes', () => {
      expect(extractIssueType('random issue title')).toBe('other');
      expect(extractIssueType('implement feature')).toBe('other');
    });

    it('should be case insensitive', () => {
      expect(extractIssueType('FEAT: uppercase prefix')).toBe('feat');
      expect(extractIssueType('BUG: uppercase bug')).toBe('bug');
    });
  });

  describe('extractEstimatedEffort', () => {
    it('should extract hours format', () => {
      expect(extractEstimatedEffort('Estimated Effort: ~4-6 hours')).toBe('~4-6 hours');
      expect(extractEstimatedEffort('Effort: 2h')).toBe('2h');
      expect(extractEstimatedEffort('Estimated effort: 8 hours')).toBe('8 hours');
    });

    it('should extract days format', () => {
      expect(extractEstimatedEffort('Estimated Effort: 2 days')).toBe('2 days');
      expect(extractEstimatedEffort('Effort: 1d')).toBe('1d');
    });

    it('should extract weeks format', () => {
      expect(extractEstimatedEffort('Estimated Effort: 1 week')).toBe('1 week');
      expect(extractEstimatedEffort('Effort: 2w')).toBe('2w');
    });

    it('should return undefined for no effort', () => {
      expect(extractEstimatedEffort('No effort estimate here')).toBeUndefined();
      expect(extractEstimatedEffort('')).toBeUndefined();
    });

    it('should handle various patterns', () => {
      expect(extractEstimatedEffort('## Estimated Effort\n~4-6 hours')).toBe('~4-6 hours');
    });
  });

  describe('parseIssue', () => {
    const createRawIssue = (overrides: Partial<GitHubIssueRaw> = {}): GitHubIssueRaw => ({
      number: 123,
      title: 'feat: add new feature',
      body: 'Description here\n\nEstimated Effort: ~4 hours',
      state: 'open',
      labels: [{ name: 'P1' }, { name: 'enhancement' }],
      createdAt: '2024-01-15T10:00:00Z',
      updatedAt: '2024-01-16T12:00:00Z',
      ...overrides,
    });

    it('should parse issue number', () => {
      const raw = createRawIssue({ number: 456 });
      const parsed = parseIssue(raw);

      expect(parsed.number).toBe(456);
    });

    it('should parse issue title', () => {
      const raw = createRawIssue({ title: 'bug: fix crash' });
      const parsed = parseIssue(raw);

      expect(parsed.title).toBe('bug: fix crash');
    });

    it('should extract labels', () => {
      const raw = createRawIssue({
        labels: [{ name: 'bug' }, { name: 'P2' }],
      });
      const parsed = parseIssue(raw);

      expect(parsed.labels).toContain('bug');
      expect(parsed.labels).toContain('P2');
    });

    it('should extract priority from labels', () => {
      const raw = createRawIssue({
        labels: [{ name: 'P1' }],
      });
      const parsed = parseIssue(raw);

      expect(parsed.priority).toBe('P1');
    });

    it('should extract issue type from title', () => {
      const raw = createRawIssue({ title: 'bug: fix login issue' });
      const parsed = parseIssue(raw);

      expect(parsed.type).toBe('bug');
    });

    it('should extract estimated effort from body', () => {
      const raw = createRawIssue({ body: 'Details\n\nEffort: 2h' });
      const parsed = parseIssue(raw);

      expect(parsed.estimatedEffort).toBe('2h');
    });

    it('should preserve timestamps', () => {
      const raw = createRawIssue({
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      });
      const parsed = parseIssue(raw);

      expect(parsed.createdAt).toBe('2024-01-01T00:00:00Z');
      expect(parsed.updatedAt).toBe('2024-01-02T00:00:00Z');
    });
  });

  describe('isNotEpic', () => {
    it('should return true for non-epic issues', () => {
      const issue: SprintIssue = {
        number: 1,
        title: 'Regular issue',
        labels: ['bug', 'P1'],
        priority: 'P1',
        type: 'bug',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
      };

      expect(isNotEpic(issue)).toBe(true);
    });

    it('should return false for epic issues', () => {
      const issue: SprintIssue = {
        number: 1,
        title: 'Epic issue',
        labels: ['epic', 'P1'],
        priority: 'P1',
        type: 'feat',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
      };

      expect(isNotEpic(issue)).toBe(false);
    });

    it('should be case insensitive', () => {
      const issue: SprintIssue = {
        number: 1,
        title: 'Epic issue',
        labels: ['EPIC', 'P1'],
        priority: 'P1',
        type: 'feat',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
      };

      expect(isNotEpic(issue)).toBe(false);
    });
  });

  describe('categorizeByPriority', () => {
    const createIssue = (priority: SprintIssue['priority']): SprintIssue => ({
      number: Math.floor(Math.random() * 1000),
      title: `Issue with priority ${String(priority)}`,
      labels: priority !== null ? [priority] : [],
      priority,
      type: 'feat',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-02',
    });

    it('should categorize P1 issues', () => {
      const issues = [createIssue('P1'), createIssue('P2')];
      const result = categorizeByPriority(issues);

      expect(result.p1).toHaveLength(1);
    });

    it('should categorize P2 issues', () => {
      const issues = [createIssue('P2'), createIssue('P2')];
      const result = categorizeByPriority(issues);

      expect(result.p2).toHaveLength(2);
    });

    it('should categorize P3 issues', () => {
      const issues = [createIssue('P3')];
      const result = categorizeByPriority(issues);

      expect(result.p3).toHaveLength(1);
    });

    it('should categorize P4 issues', () => {
      const issues = [createIssue('P4')];
      const result = categorizeByPriority(issues);

      expect(result.p4).toHaveLength(1);
    });

    it('should categorize unassigned issues', () => {
      const issues = [createIssue(null)];
      const result = categorizeByPriority(issues);

      expect(result.unassigned).toHaveLength(1);
    });

    it('should handle mixed priorities', () => {
      const issues = [
        createIssue('P1'),
        createIssue('P2'),
        createIssue('P3'),
        createIssue('P4'),
        createIssue(null),
      ];
      const result = categorizeByPriority(issues);

      expect(result.p1).toHaveLength(1);
      expect(result.p2).toHaveLength(1);
      expect(result.p3).toHaveLength(1);
      expect(result.p4).toHaveLength(1);
      expect(result.unassigned).toHaveLength(1);
    });

    it('should handle empty array', () => {
      const result = categorizeByPriority([]);

      expect(result.p1).toHaveLength(0);
      expect(result.p2).toHaveLength(0);
      expect(result.p3).toHaveLength(0);
      expect(result.p4).toHaveLength(0);
      expect(result.unassigned).toHaveLength(0);
    });
  });

  describe('printProposal', () => {
    const mockProposal: SprintProposal = {
      title: 'Sprint 2024-W03',
      goals: ['Complete feature X', 'Fix critical bugs'],
      p1Issues: [
        {
          number: 1,
          title: 'Critical bug',
          labels: ['P1', 'bug'],
          priority: 'P1',
          type: 'bug',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-02',
        },
      ],
      p2Issues: [
        {
          number: 2,
          title: 'High priority feature',
          labels: ['P2', 'feat'],
          priority: 'P2',
          type: 'feat',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-02',
        },
      ],
      p3Issues: [],
      p4Issues: [],
      body: 'Generated sprint proposal body',
    };

    it('should print proposal title', () => {
      printProposal(mockProposal);

      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('Sprint Proposal');
      expect(output).toContain('Sprint 2024-W03');
    });

    it('should print goals', () => {
      printProposal(mockProposal);

      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('Goals');
      expect(output).toContain('Complete feature X');
      expect(output).toContain('Fix critical bugs');
    });

    it('should print P1 issues', () => {
      printProposal(mockProposal);

      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('P1 Critical');
      expect(output).toContain('#1');
      expect(output).toContain('Critical bug');
    });

    it('should print P2 issues', () => {
      printProposal(mockProposal);

      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('P2 High');
      expect(output).toContain('#2');
    });

    it('should not print empty P3 section', () => {
      printProposal(mockProposal);

      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      // P3 section header should not appear if no P3 issues
      expect(output).not.toContain('P3 Nice-to-Have (0)');
    });
  });

  describe('printSprintResult', () => {
    it('should print JSON format', () => {
      const result: SprintPlanResult = {
        proposal: {
          title: 'Sprint',
          goals: ['Goal 1'],
          p1Issues: [],
          p2Issues: [],
          p3Issues: [],
          p4Issues: [],
          body: 'Sprint proposal body',
        },
        success: true,
      };

      printSprintResult(result, 'json');

      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(() => JSON.parse(output) as unknown).not.toThrow();
    });

    it('should print error message', () => {
      const result: SprintPlanResult = {
        success: false,
        error: 'Failed to fetch issues',
      };

      printSprintResult(result, 'text');

      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('Error');
      expect(output).toContain('Failed to fetch issues');
    });

    it('should print vote outcome when approved', () => {
      const result: SprintPlanResult = {
        proposal: {
          title: 'Sprint',
          goals: [],
          p1Issues: [],
          p2Issues: [],
          p3Issues: [],
          p4Issues: [],
          body: 'Sprint proposal body',
        },
        success: true,
        voteOutcome: 'approved',
      };

      printSprintResult(result, 'text');

      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('Vote Result');
      expect(output).toContain('APPROVED');
    });

    it('should print vote outcome when rejected', () => {
      const result: SprintPlanResult = {
        proposal: {
          title: 'Sprint',
          goals: [],
          p1Issues: [],
          p2Issues: [],
          p3Issues: [],
          p4Issues: [],
          body: 'Sprint proposal body',
        },
        success: true,
        voteOutcome: 'rejected',
      };

      printSprintResult(result, 'text');

      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('Vote Result');
      expect(output).toContain('REJECTED');
    });

    it('should print created issue number', () => {
      const result: SprintPlanResult = {
        proposal: {
          title: 'Sprint',
          goals: [],
          p1Issues: [],
          p2Issues: [],
          p3Issues: [],
          p4Issues: [],
          body: 'Sprint proposal body',
        },
        success: true,
        createdIssueNumber: 123,
      };

      printSprintResult(result, 'text');

      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).toContain('Created issue');
      expect(output).toContain('#123');
    });

    it('should not print vote outcome when skipped', () => {
      const result: SprintPlanResult = {
        proposal: {
          title: 'Sprint',
          goals: [],
          p1Issues: [],
          p2Issues: [],
          p3Issues: [],
          p4Issues: [],
          body: 'Sprint proposal body',
        },
        success: true,
        voteOutcome: 'skipped',
      };

      printSprintResult(result, 'text');

      const output = stdoutWriteMock.mock.calls.map((call: unknown[]) => String(call[0])).join('');
      expect(output).not.toContain('Vote Result');
    });
  });
});
