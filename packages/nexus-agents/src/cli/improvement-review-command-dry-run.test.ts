/**
 * `improvement-review --file-issues --dry-run` through the REAL parser (#6677).
 *
 * The CLI parser stores `--dry-run` as `options.dryRun`; the handler used to
 * read `options['dry-run']`, which nothing sets, so `--dry-run` filed real
 * issues. The sibling test file hand-builds the options bag and so could never
 * see that. Here the argv goes through `parseCliArgs` → handler →
 * `runImprovementReview`, and only the `gh` process boundary is replaced.
 *
 * The fitness audit is pinned below the floor so a signal EXISTS to file — the
 * positive-control case proves `gh issue create` would run, which is what keeps
 * the dry-run assertion from passing vacuously on an empty signal list.
 */

import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';

const ghExecMock = vi.fn<(args: readonly string[]) => Promise<{ readonly stdout: string }>>();
vi.mock('../mcp/tools/improvement-review-issue-filing.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../mcp/tools/improvement-review-issue-filing.js')>();
  return { ...actual, defaultGhExec: (args: readonly string[]) => ghExecMock(args) };
});

vi.mock('../governance/fitness-score.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../governance/fitness-score.js')>();
  return {
    ...actual,
    calculateFitnessScore: () => ({
      score: 40,
      dimensions: {},
      findings: [],
      timestamp: new Date(0).toISOString(),
      version: 'test-below-floor',
    }),
  };
});

import { parseCliArgs } from '../cli.js';
import { handleImprovementReviewCommand } from './improvement-review-command.js';

/** Canned `gh` answers for the calls the filing path makes before `issue create`. */
function fakeGh(args: readonly string[]): Promise<{ readonly stdout: string }> {
  if (args[0] === 'repo') return Promise.resolve({ stdout: '{"nameWithOwner":"acme/widgets"}' });
  if (args[0] === 'issue' && args[1] === 'create') {
    return Promise.resolve({ stdout: 'https://github.com/acme/widgets/issues/1\n' });
  }
  return Promise.resolve({ stdout: '[]' });
}

function issueCreateCalls(): number {
  return ghExecMock.mock.calls.filter(([args]) => args[0] === 'issue' && args[1] === 'create')
    .length;
}

describe('improvement-review --dry-run through parseCliArgs (#6677)', () => {
  let logSpy: MockInstance | undefined;
  let writeSpy: MockInstance | undefined;

  beforeEach(() => {
    ghExecMock.mockReset();
    ghExecMock.mockImplementation(fakeGh);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    logSpy?.mockRestore();
    writeSpy?.mockRestore();
  });

  it('positive control: --file-issues without --dry-run reaches gh issue create', async () => {
    await handleImprovementReviewCommand(
      parseCliArgs(['improvement-review', '--file-issues', '--format', 'json'])
    );
    expect(issueCreateCalls()).toBeGreaterThan(0);
  });

  it('--file-issues --dry-run never calls gh', async () => {
    const parsed = parseCliArgs(['improvement-review', '--file-issues', '--dry-run']);
    expect(parsed.options.dryRun).toBe(true);

    await handleImprovementReviewCommand(parsed);

    expect(issueCreateCalls()).toBe(0);
    expect(ghExecMock).not.toHaveBeenCalled();
  });
});
