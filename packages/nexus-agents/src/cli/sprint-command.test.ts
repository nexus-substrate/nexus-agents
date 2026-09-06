/**
 * Tests for sprint command module.
 * (Source: Issue #230, Epic #225)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./sandbox-exec.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./sandbox-exec.js')>()),
  safeExecSandboxed: vi.fn(),
}));

import {
  extractPriority,
  extractIssueType,
  extractEstimatedEffort,
  parseIssue,
  isNotEpic,
  categorizeByPriority,
  generateSprintTitle,
  generateGoals,
  generateProposal,
  generateProposalBody,
  createSprintIssue,
} from './sprint-command.js';
import { voteOutcomeForExitCode } from './sprint-helpers.js';
import { safeExecSandboxed } from './sandbox-exec.js';
import type {
  SprintIssue,
  GitHubIssueRaw,
  SprintCommandOptions,
  SprintProposal,
} from './sprint-types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockRawIssue(overrides: Partial<GitHubIssueRaw> = {}): GitHubIssueRaw {
  return {
    number: 100,
    title: 'feat: Test feature',
    body: 'Test body',
    state: 'open',
    labels: [],
    createdAt: '2026-01-10T00:00:00Z',
    updatedAt: '2026-01-11T00:00:00Z',
    ...overrides,
  };
}

function createMockSprintIssue(overrides: Partial<SprintIssue> = {}): SprintIssue {
  return {
    number: 100,
    title: 'feat: Test feature',
    labels: [],
    priority: null,
    createdAt: '2026-01-10T00:00:00Z',
    updatedAt: '2026-01-11T00:00:00Z',
    type: 'feat',
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('sprint-command', () => {
  describe('extractPriority', () => {
    it.each([
      [['P1'], 'P1'],
      [['P2'], 'P2'],
      [['P3'], 'P3'],
      [['P4'], 'P4'],
      [['p1'], 'P1'],
      [['enhancement', 'p2'], 'P2'],
      [['bug', 'P1', 'urgent'], 'P1'],
    ])('should extract priority from labels %j', (labels, expected) => {
      expect(extractPriority(labels)).toBe(expected);
    });

    it('should return null when no priority label', () => {
      expect(extractPriority([])).toBeNull();
      expect(extractPriority(['bug', 'enhancement'])).toBeNull();
    });
  });

  describe('extractIssueType', () => {
    it.each([
      ['feat: Add new feature', 'feat'],
      ['feature: Something', 'feat'],
      ['enhancement: Better', 'feat'],
      ['bug: Fix crash', 'bug'],
      ['fix: Resolve issue', 'bug'],
      ['task: Do thing', 'task'],
      ['chore: Cleanup', 'task'],
      ['refactor: Improve code', 'refactor'],
      ['docs: Update readme', 'docs'],
      ['documentation: Add guide', 'docs'],
      ['Something without prefix', 'other'],
    ])('should extract type from "%s" as "%s"', (title, expected) => {
      expect(extractIssueType(title)).toBe(expected);
    });

    it('should be case-insensitive', () => {
      expect(extractIssueType('FEAT: Upper case')).toBe('feat');
      expect(extractIssueType('Bug: Mixed case')).toBe('bug');
    });
  });

  describe('extractEstimatedEffort', () => {
    it.each([
      ['Estimated Effort: ~4-6 hours', '~4-6 hours'],
      ['Estimated effort: 2h', '2h'],
      ['Effort: 1 week', '1 week'],
      ['effort: ~2-3 days', '~2-3 days'],
      ['## Estimated Effort\n\n~8h', '~8h'],
    ])('should extract effort from "%s"', (body, expected) => {
      expect(extractEstimatedEffort(body)).toBe(expected);
    });

    it('should return undefined when no effort found', () => {
      expect(extractEstimatedEffort('No effort mentioned')).toBeUndefined();
      expect(extractEstimatedEffort('')).toBeUndefined();
    });
  });

  describe('parseIssue', () => {
    it('should parse raw issue into SprintIssue', () => {
      const raw = createMockRawIssue({
        number: 123,
        title: 'bug: Fix login',
        labels: [{ name: 'bug' }, { name: 'P1' }],
        body: 'Estimated Effort: ~2h',
      });

      const result = parseIssue(raw);

      expect(result.number).toBe(123);
      expect(result.title).toBe('bug: Fix login');
      expect(result.labels).toEqual(['bug', 'P1']);
      expect(result.priority).toBe('P1');
      expect(result.type).toBe('bug');
      expect(result.estimatedEffort).toBe('~2h');
    });

    it('should handle issue without priority or effort', () => {
      const raw = createMockRawIssue({
        title: 'Some issue',
        labels: [],
        body: 'Just a description',
      });

      const result = parseIssue(raw);

      expect(result.priority).toBeNull();
      expect(result.type).toBe('other');
      expect(result.estimatedEffort).toBeUndefined();
    });
  });

  describe('isNotEpic', () => {
    it('should return true for non-epic issues', () => {
      const issue = createMockSprintIssue({ labels: ['bug', 'P1'] });
      expect(isNotEpic(issue)).toBe(true);
    });

    it('should return false for epic issues', () => {
      const issue = createMockSprintIssue({ labels: ['epic'] });
      expect(isNotEpic(issue)).toBe(false);
    });

    it('should be case-insensitive for epic label', () => {
      const issue1 = createMockSprintIssue({ labels: ['EPIC'] });
      const issue2 = createMockSprintIssue({ labels: ['Epic'] });
      expect(isNotEpic(issue1)).toBe(false);
      expect(isNotEpic(issue2)).toBe(false);
    });
  });

  describe('categorizeByPriority', () => {
    it('should categorize issues by priority', () => {
      const issues: SprintIssue[] = [
        createMockSprintIssue({ number: 1, priority: 'P1' }),
        createMockSprintIssue({ number: 2, priority: 'P2' }),
        createMockSprintIssue({ number: 3, priority: 'P3' }),
        createMockSprintIssue({ number: 4, priority: 'P4' }),
        createMockSprintIssue({ number: 5, priority: null }),
      ];

      const result = categorizeByPriority(issues);

      expect(result.p1).toHaveLength(1);
      expect(result.p2).toHaveLength(1);
      expect(result.p3).toHaveLength(1);
      expect(result.p4).toHaveLength(1);
      expect(result.unassigned).toHaveLength(1);
      expect(result.p1[0]?.number).toBe(1);
      expect(result.unassigned[0]?.number).toBe(5);
    });

    it('should handle empty list', () => {
      const result = categorizeByPriority([]);
      expect(result.p1).toHaveLength(0);
      expect(result.p2).toHaveLength(0);
      expect(result.p3).toHaveLength(0);
      expect(result.p4).toHaveLength(0);
      expect(result.unassigned).toHaveLength(0);
    });

    it('should handle multiple issues per priority', () => {
      const issues: SprintIssue[] = [
        createMockSprintIssue({ number: 1, priority: 'P1' }),
        createMockSprintIssue({ number: 2, priority: 'P1' }),
        createMockSprintIssue({ number: 3, priority: 'P1' }),
      ];

      const result = categorizeByPriority(issues);
      expect(result.p1).toHaveLength(3);
    });
  });

  describe('generateSprintTitle', () => {
    it('should generate title with duration', () => {
      const title = generateSprintTitle('1 week');
      expect(title).toContain('sprint:');
      expect(title).toContain('- 1 week');
    });

    it('should include date in MM/DD/YYYY format', () => {
      const title = generateSprintTitle('2 weeks');
      expect(title).toMatch(/sprint: \d{2}\/\d{2}\/\d{4}/);
    });

    it('contains no shell metacharacters — it is passed to gh --title (#2913)', () => {
      // The title is an inline `gh issue create --title` argument; the sandbox
      // gate rejects `( ) ; & |` etc. Parentheses around the duration used to
      // make every sprint-issue creation fail.
      expect(generateSprintTitle('1 week')).not.toMatch(/[;&|`$()<>]/);
    });
  });

  describe('generateGoals', () => {
    it('should generate goals from feature issues', () => {
      const p1: SprintIssue[] = [
        createMockSprintIssue({ type: 'feat' }),
        createMockSprintIssue({ type: 'feat' }),
      ];
      const p2: SprintIssue[] = [];

      const goals = generateGoals(p1, p2);
      expect(goals).toContain('Implement 2 new features');
    });

    it('should generate goals from bug issues', () => {
      const p1: SprintIssue[] = [createMockSprintIssue({ type: 'bug' })];
      const p2: SprintIssue[] = [createMockSprintIssue({ type: 'bug' })];

      const goals = generateGoals(p1, p2);
      expect(goals).toContain('Fix 2 bugs');
    });

    it('should generate goals from mixed issues', () => {
      const p1: SprintIssue[] = [
        createMockSprintIssue({ type: 'feat' }),
        createMockSprintIssue({ type: 'bug' }),
      ];
      const p2: SprintIssue[] = [];

      const goals = generateGoals(p1, p2);
      expect(goals).toContain('Implement 1 new feature');
      expect(goals).toContain('Fix 1 bug');
    });

    it('should provide fallback goal when no features or bugs', () => {
      const p1: SprintIssue[] = [createMockSprintIssue({ type: 'task' })];
      const p2: SprintIssue[] = [];

      const goals = generateGoals(p1, p2);
      expect(goals).toContain('Complete prioritized backlog items');
    });
  });

  describe('generateProposalBody', () => {
    it('should generate markdown body with all sections', () => {
      const p1 = [createMockSprintIssue({ number: 1, title: 'P1 Issue' })];
      const p2 = [createMockSprintIssue({ number: 2, title: 'P2 Issue' })];
      const p3 = [createMockSprintIssue({ number: 3, title: 'P3 Issue' })];

      const body = generateProposalBody('Sprint Title', ['Goal 1'], p1, p2, p3);

      expect(body).toContain('## Goals');
      expect(body).toContain('Goal 1');
      expect(body).toContain('## P1 (Critical)');
      expect(body).toContain('#1');
      expect(body).toContain('## P2 (High Priority)');
      expect(body).toContain('#2');
      expect(body).toContain('## P3 (Nice to Have)');
      expect(body).toContain('#3');
      expect(body).toContain('nexus-agents sprint plan');
    });

    it('should include estimated effort in body', () => {
      const p1 = [createMockSprintIssue({ number: 1, title: 'Issue', estimatedEffort: '~4h' })];

      const body = generateProposalBody('Title', ['Goal'], p1, [], []);

      expect(body).toContain('(~4h)');
    });

    it('should skip empty priority sections', () => {
      const body = generateProposalBody('Title', ['Goal'], [], [], []);

      expect(body).not.toContain('## P1');
      expect(body).not.toContain('## P2');
      expect(body).not.toContain('## P3');
    });
  });

  describe('generateProposal', () => {
    const defaultOptions: SprintCommandOptions = {
      subcommand: 'plan',
      maxPerPriority: 5,
      duration: '1 week',
    };

    it('should generate proposal with issues', () => {
      const issues: SprintIssue[] = [
        createMockSprintIssue({ number: 1, priority: 'P1', type: 'feat' }),
        createMockSprintIssue({ number: 2, priority: 'P2', type: 'bug' }),
      ];

      const proposal = generateProposal(issues, defaultOptions);

      expect(proposal.title).toContain('sprint:');
      expect(proposal.goals.length).toBeGreaterThan(0);
      expect(proposal.p1Issues).toHaveLength(1);
      expect(proposal.p2Issues).toHaveLength(1);
      expect(proposal.body).toContain('## Goals');
    });

    it('should respect maxPerPriority limit', () => {
      const issues: SprintIssue[] = Array.from({ length: 10 }, (_, i) =>
        createMockSprintIssue({ number: i + 1, priority: 'P1' })
      );

      const proposal = generateProposal(issues, { ...defaultOptions, maxPerPriority: 3 });

      expect(proposal.p1Issues).toHaveLength(3);
    });

    it('should use provided duration', () => {
      const issues: SprintIssue[] = [createMockSprintIssue({ priority: 'P1' })];

      const proposal = generateProposal(issues, { ...defaultOptions, duration: '2 weeks' });

      expect(proposal.title).toContain('- 2 weeks');
    });

    it('should handle empty issues list', () => {
      const proposal = generateProposal([], defaultOptions);

      expect(proposal.p1Issues).toHaveLength(0);
      expect(proposal.p2Issues).toHaveLength(0);
      expect(proposal.goals).toContain('Complete prioritized backlog items');
    });
  });
});

// #2913 (audit #2824 bullet 10): createSprintIssue embedded the markdown
// proposal body in the command string as `--body '<body>'`. The body has a
// markdown table (`|`) and `(effort)` parentheticals, so the sandbox
// `validateArgs` gate denied it and every sprint epic silently failed to
// create. The body is now piped via stdin.
describe('createSprintIssue', () => {
  const mockExec = vi.mocked(safeExecSandboxed);

  function makeProposal(): SprintProposal {
    return {
      title: generateSprintTitle('1 week'),
      goals: ['Ship the thing'],
      p1Issues: [],
      p2Issues: [],
      p3Issues: [],
      p4Issues: [],
      body: '## Goals\n\n| Item | Priority |\n| ---- | -------- |\n- [ ] #1 - thing (small)',
    };
  }

  beforeEach(() => {
    mockExec.mockReset();
  });

  it('pipes the body via --body-file - stdin, not an inline --body arg', () => {
    mockExec.mockReturnValue('https://github.com/o/r/issues/42');

    const num = createSprintIssue(makeProposal());

    expect(num).toBe(42);
    const call = mockExec.mock.calls[0];
    expect(call?.[0]).toContain('--body-file -');
    expect(call?.[0]).not.toContain("--body '");
    expect((call?.[1] as { stdin?: string } | undefined)?.stdin).toContain('| Item | Priority |');
  });

  it('keeps shell metacharacters out of the command string', () => {
    mockExec.mockReturnValue('https://github.com/o/r/issues/7');

    createSprintIssue(makeProposal());

    // Title + flags only — the body (with `|`, `(`, `)`) lives in stdin.
    expect(mockExec.mock.calls[0]?.[0]).not.toMatch(/[|()]/);
  });
});

describe('voteOutcomeForExitCode (#5344)', () => {
  /**
   * `sprint plan --vote` collapsed every non-zero exit into `rejected`, so a
   * panel that could not reach quorum was recorded as having rejected the
   * sprint plan. That is a verdict on the plan, and nobody delivered one — the
   * last of the four consumers #4135 named that had not been wired.
   */
  it('records a quorum void as no_quorum, not as a rejection', () => {
    expect(voteOutcomeForExitCode(2)).toBe('no_quorum');
  });

  it('still records a genuine rejection', () => {
    expect(voteOutcomeForExitCode(1)).toBe('rejected');
  });

  it('still records an approval', () => {
    expect(voteOutcomeForExitCode(0)).toBe('approved');
  });

  it('treats an unrecognised non-zero exit as a rejection, not as a quorum void', () => {
    // Fail closed on the side that blocks issue creation: only exit 2, which
    // the caller opts into via `onNoQuorum: 'exit2'`, means the panel was short.
    expect(voteOutcomeForExitCode(3)).toBe('rejected');
    expect(voteOutcomeForExitCode(127)).toBe('rejected');
  });
});
