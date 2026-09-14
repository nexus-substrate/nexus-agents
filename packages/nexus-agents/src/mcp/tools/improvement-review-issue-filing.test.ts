/**
 * Tests for the improvement_review issue-filing step (#6112, #3653), driven
 * through the module's one exported entry point, `maybeFileIssues`, with a
 * `gh` double on the injected `ghExec` seam. No real `gh`, no fs.
 *
 * Moved out of improvement-review.test.ts with the code (#6148 row 2); the
 * seam between `runImprovementReview` and this step stays covered there.
 */

import { describe, it, expect, vi } from 'vitest';
import { maybeFileIssues, type GhExec } from './improvement-review-issue-filing.js';
import type { ImprovementSignal } from './improvement-review.js';
import type { ILogger } from '../../core/index.js';

const ISSUE_URL = 'https://github.com/acme/widgets/issues/';

const silentLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn(),
} as unknown as ILogger;

function sig(over: Partial<ImprovementSignal> = {}): ImprovementSignal {
  return {
    category: 'routing',
    signalKey: 'routing:cli-floor:codex:docs',
    severity: 'warning',
    title: 'routing: codex 30% on docs',
    body: 'floor breach',
    evidence: {},
    ...over,
  };
}

/** One `warning` perf-regression signal per operation name. */
function perfSignals(...ops: readonly string[]): ImprovementSignal[] {
  return ops.map((op) =>
    sig({
      category: 'perf-regression',
      signalKey: signalKey(op),
      severity: 'warning',
      title: `perf-regression: store::${op} p95 regressed`,
    })
  );
}

const signalKey = (op: string): string => `perf-regression:latency:store:${op}`;

/**
 * A `gh` double keyed on the sub-command. `labelListResult` is what
 * `gh label list --json name` returns — a fixed list, `'fail'` for a
 * non-zero exit, or a function of the `--limit` the tool asked for (so a
 * test can return exactly one page without knowing the page size);
 * `issueListResult` is what `gh issue list --search` returns (default: nothing,
 * so no signal reads as a dup); every `gh issue create` succeeds with a
 * numbered URL.
 */
function ghDouble(
  labelListResult: readonly string[] | 'fail' | ((limit: number) => readonly string[]),
  issueListResult: readonly { url: string }[] = []
): {
  ghExec: GhExec;
  calls: string[][];
} {
  const calls: string[][] = [];
  let created = 0;
  const labelList = (args: readonly string[]): Promise<{ stdout: string }> => {
    if (labelListResult === 'fail') return Promise.reject(new Error('gh: HTTP 404'));
    const limit = Number(args[args.indexOf('--limit') + 1]);
    const names = typeof labelListResult === 'function' ? labelListResult(limit) : labelListResult;
    return Promise.resolve({ stdout: JSON.stringify(names.map((name) => ({ name }))) });
  };
  const ghExec: GhExec = (args) => {
    calls.push([...args]);
    const [group, verb] = args;
    if (group === 'label' && verb === 'list') return labelList(args);
    if (group === 'issue' && verb === 'list') {
      return Promise.resolve({ stdout: JSON.stringify(issueListResult) });
    }
    if (group === 'issue' && verb === 'create') {
      created += 1;
      return Promise.resolve({ stdout: `${ISSUE_URL}${String(created)}\n` });
    }
    if (group === 'repo' && verb === 'view') {
      return Promise.resolve({ stdout: JSON.stringify({ nameWithOwner: 'acme/widgets' }) });
    }
    return Promise.reject(new Error(`unexpected gh call: ${args.join(' ')}`));
  };
  return { ghExec, calls };
}

function file(
  ghExec: GhExec,
  signals: readonly ImprovementSignal[],
  targetRepo?: string
): ReturnType<typeof maybeFileIssues> {
  return maybeFileIssues(signals, { fileIssues: true, logger: silentLogger, ghExec, targetRepo });
}

function labelArg(createCall: readonly string[]): string | undefined {
  const i = createCall.indexOf('--label');
  return i === -1 ? undefined : createCall[i + 1];
}

const createCall = (calls: readonly string[][]): readonly string[] | undefined =>
  calls.find((c) => c[0] === 'issue' && c[1] === 'create');

// ============================================================================
// Labels — p0–p4 priority + category on auto-filed issues (#3653), observed on
// the `--label` argument `gh issue create` receives when the repo has them all.
// ============================================================================

describe('maybeFileIssues — issue labels (#3653)', () => {
  const ALL_LABELS = ['p0', 'p1', 'p2', 'p3', 'p4', 'routing', 'security', 'bug', 'tech-debt'];

  async function labelsFiledFor(signal: ImprovementSignal): Promise<string | undefined> {
    const gh = ghDouble(ALL_LABELS);
    const result = await file(gh.ghExec, [signal], 'acme/widgets');
    expect(result.issuesFiled).toHaveLength(1);
    expect(result.issuesFiled[0]?.labelsDropped).toEqual([]);
    return labelArg(createCall(gh.calls) ?? []);
  }

  it('labels a security signal p0 + security', async () => {
    await expect(labelsFiledFor(sig({ category: 'security', signalKey: 'sec-1' }))).resolves.toBe(
      'p0,security'
    );
  });

  it('labels a keyword-detected security signal p0 (fail-closed), keeping its category', async () => {
    await expect(
      labelsFiledFor(sig({ category: 'bug', title: 'auth bypass / injection' }))
    ).resolves.toBe('p0,bug');
  });

  it('labels a critical non-security signal p0', async () => {
    await expect(labelsFiledFor(sig({ severity: 'critical' }))).resolves.toBe('p0,routing');
  });

  it('labels warning → p2 and info → p3', async () => {
    await expect(labelsFiledFor(sig({ severity: 'warning' }))).resolves.toBe('p2,routing');
    await expect(labelsFiledFor(sig({ severity: 'info', category: 'tech-debt' }))).resolves.toBe(
      'p3,tech-debt'
    );
  });
});

// ============================================================================
// Label check against the target repo (#6112)
// ============================================================================

describe('maybeFileIssues — label check against the target repo (#6112)', () => {
  it('(1) drops a label the target repo lacks and files with the rest, reporting the drop', async () => {
    const gh = ghDouble(['perf-regression', 'bug']);
    const result = await file(gh.ghExec, perfSignals('search'), 'acme/widgets');

    expect(result.issuesSkipped).toEqual([]);
    expect(result.issuesFiled).toEqual([
      {
        signalKey: signalKey('search'),
        issueUrl: `${ISSUE_URL}1`,
        labelsDropped: ['p2'],
        labelCheck: 'ok',
      },
    ]);
    expect(labelArg(createCall(gh.calls) ?? [])).toBe('perf-regression');
    // The explicit target reaches every gh call.
    for (const call of gh.calls) {
      expect(call).toContain('--repo');
      expect(call[call.indexOf('--repo') + 1]).toBe('acme/widgets');
    }
    expect(result.issueTarget).toEqual({ repo: 'acme/widgets', source: 'input' });
  });

  it('(2) files with every requested label when the repo has them all — labelsDropped is []', async () => {
    const gh = ghDouble(['p2', 'perf-regression', 'p0']);
    const result = await file(gh.ghExec, perfSignals('search'), 'acme/widgets');

    expect(result.issuesFiled).toHaveLength(1);
    expect(result.issuesFiled[0]?.labelsDropped).toEqual([]);
    expect(result.issuesFiled[0]?.labelCheck).toBe('ok');
    expect(labelArg(createCall(gh.calls) ?? [])).toBe('p2,perf-regression');
  });

  it('(3) files with NO labels when the label list fails, and says the check was unavailable', async () => {
    const gh = ghDouble('fail');
    const result = await file(gh.ghExec, perfSignals('search'), 'acme/widgets');

    expect(result.issuesSkipped).toEqual([]);
    expect(result.issuesFiled).toEqual([
      {
        signalKey: signalKey('search'),
        issueUrl: `${ISSUE_URL}1`,
        labelsDropped: ['p2', 'perf-regression'],
        labelCheck: 'unavailable',
      },
    ]);
    const create = createCall(gh.calls);
    expect(create).toBeDefined();
    expect(create).not.toContain('--label');
  });

  const labelPage = (n: number): readonly string[] =>
    Array.from({ length: n }, (_, i) => `label-${String(i)}`);

  it('does not filter against a page-limited list: exactly `limit` labels → truncated, all labels passed', async () => {
    // The repo may have more labels than one page shows; a label past the
    // page must not be read as nonexistent and silently stripped.
    const gh = ghDouble((limit) => labelPage(limit));
    const result = await file(gh.ghExec, perfSignals('search'), 'acme/widgets');

    expect(result.issuesFiled).toEqual([
      {
        signalKey: signalKey('search'),
        issueUrl: `${ISSUE_URL}1`,
        labelsDropped: [],
        labelCheck: 'truncated',
      },
    ]);
    expect(labelArg(createCall(gh.calls) ?? [])).toBe('p2,perf-regression');
    // The page is large enough that a 200-label repo is not read as truncated.
    const list = gh.calls.find((c) => c[0] === 'label' && c[1] === 'list');
    expect(Number(list?.[list.indexOf('--limit') + 1])).toBeGreaterThanOrEqual(1000);
  });

  it('filters as usual when the list is one short of the page limit', async () => {
    const gh = ghDouble((limit) => [...labelPage(limit - 2), 'perf-regression']);
    const result = await file(gh.ghExec, perfSignals('search'), 'acme/widgets');

    expect(result.issuesFiled[0]?.labelCheck).toBe('ok');
    expect(result.issuesFiled[0]?.labelsDropped).toEqual(['p2']);
    expect(labelArg(createCall(gh.calls) ?? [])).toBe('perf-regression');
  });

  it('(4) fetches the label list once for a run that files three issues', async () => {
    const gh = ghDouble(['p2', 'perf-regression']);
    const result = await file(gh.ghExec, perfSignals('a', 'b', 'c'), 'acme/widgets');

    expect(result.issuesFiled.map((f) => f.signalKey)).toEqual([
      signalKey('a'),
      signalKey('b'),
      signalKey('c'),
    ]);
    const listCalls = gh.calls.filter((c) => c[0] === 'label' && c[1] === 'list');
    expect(listCalls).toHaveLength(1);
    expect(listCalls[0]).toEqual(
      expect.arrayContaining(['label', 'list', '--json', 'name', '--limit'])
    );
  });
});

// ============================================================================
// Target resolution, dedup, rate limit, failure and the off switch
// ============================================================================

describe('maybeFileIssues — target, dedup, rate limit, off switch', () => {
  it('resolves the target from the cwd remote when the caller names none, and says so', async () => {
    const gh = ghDouble(['p2', 'perf-regression']);
    const result = await file(gh.ghExec, perfSignals('search'));

    expect(result.issueTarget).toEqual({ repo: 'acme/widgets', source: 'cwd-remote' });
    const create = createCall(gh.calls);
    expect(create?.[create.indexOf('--repo') + 1]).toBe('acme/widgets');
  });

  it('files without --repo and reports the target as unresolved when the remote lookup fails', async () => {
    const base = ghDouble(['p2', 'perf-regression']);
    const ghExec: GhExec = (args) =>
      args[0] === 'repo' ? Promise.reject(new Error('not a git repository')) : base.ghExec(args);
    const result = await file(ghExec, perfSignals('search'));

    expect(result.issueTarget).toEqual({ repo: null, source: 'unresolved' });
    expect(result.issuesFiled).toHaveLength(1);
    for (const call of base.calls) expect(call).not.toContain('--repo');
  });

  it('skips a signal an open issue already covers (dup:<url>), creating nothing and never listing labels', async () => {
    const dupUrl = `${ISSUE_URL}41`;
    const gh = ghDouble(['p2', 'perf-regression'], [{ url: dupUrl }]);
    const result = await file(gh.ghExec, perfSignals('search'), 'acme/widgets');

    expect(result.issuesFiled).toEqual([]);
    expect(result.issuesSkipped).toEqual([
      { signalKey: signalKey('search'), reason: `dup:${dupUrl}` },
    ]);
    expect(createCall(gh.calls)).toBeUndefined();
    // A run whose signals are all dups never asks for the label list.
    expect(gh.calls.filter((c) => c[0] === 'label')).toEqual([]);
    const search = gh.calls.find((c) => c[0] === 'issue' && c[1] === 'list');
    expect(search).toEqual(
      expect.arrayContaining(['--state', 'open', '--search', `"${signalKey('search')}" in:body`])
    );
  });

  it('files at most five issues per run and skips the rest as rate-limit', async () => {
    const gh = ghDouble(['p2', 'perf-regression']);
    const result = await file(gh.ghExec, perfSignals('a', 'b', 'c', 'd', 'e', 'f'), 'acme/widgets');

    expect(result.issuesFiled.map((f) => f.signalKey)).toEqual(
      ['a', 'b', 'c', 'd', 'e'].map(signalKey)
    );
    expect(result.issuesSkipped).toEqual([{ signalKey: signalKey('f'), reason: 'rate-limit' }]);
    expect(gh.calls.filter((c) => c[0] === 'issue' && c[1] === 'create')).toHaveLength(5);
  });

  it('keeps issuesSkipped for a genuine create failure', async () => {
    const base = ghDouble(['p2', 'perf-regression']);
    const ghExec: GhExec = (args) =>
      args[0] === 'issue' && args[1] === 'create'
        ? Promise.reject(new Error('gh: HTTP 403'))
        : base.ghExec(args);
    const result = await file(ghExec, perfSignals('search'), 'acme/widgets');

    expect(result.issuesFiled).toEqual([]);
    expect(result.issuesSkipped).toEqual([
      { signalKey: signalKey('search'), reason: 'error:gh: HTTP 403' },
    ]);
  });

  it('reports the target as not-filing and touches gh not at all when fileIssues is false', async () => {
    const gh = ghDouble(['p2', 'perf-regression']);
    const result = await maybeFileIssues(perfSignals('search'), {
      fileIssues: false,
      logger: silentLogger,
      ghExec: gh.ghExec,
      targetRepo: undefined,
    });

    expect(result.issueTarget).toEqual({ repo: null, source: 'not-filing' });
    expect(result.issuesFiled).toEqual([]);
    expect(gh.calls).toEqual([]);
  });
});
