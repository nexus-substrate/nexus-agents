/**
 * Tests for the DocOps escape-hatch recognizer (#6026).
 *
 * The corpus below is not invented. Every string in HISTORICAL_OCCURRENCES is a
 * verbatim line from a commit on main that contains the token, captured with
 * `git log --grep`. Twelve occurrences across eight commits. Committing them as
 * a fixture is the point: the classification claim in #6026 becomes an
 * executable assertion instead of a sentence in an issue.
 */
import { describe, expect, it } from 'vitest';
import { scanEscapeHatch } from './docops-escape-hatch.js';

/** Verbatim lines from main. `invokes` is what the gate MUST conclude. */
const HISTORICAL_OCCURRENCES: readonly { line: string; invokes: boolean; commit: string }[] = [
  // --- genuine invocations: trailing marker (the `[skip ci]` shape) ---
  {
    commit: 'a2e60bc',
    invokes: true,
    line: '* chore(ci): mechanical --fail-if-no-match flag, no pipeline behaviour change [skip-docops]',
  },
  {
    commit: '96f63f7',
    invokes: true,
    line: '* chore(governance): restamp governance version + skip vacuous docops gate [skip-docops]',
  },
  {
    commit: '8aeabe8',
    invokes: true,
    line: '* chore(docs): refresh repo index for improvement_review tool [skip-docops]',
  },
  // --- genuine invocation: standalone at start of line ---
  {
    commit: 'b31b990',
    invokes: true,
    line: '[skip-docops] — touches doc-pipeline workflow files (docs-check.yml,',
  },
  // --- mentions: every one of these silently bypassed the gate before #6026 ---
  {
    commit: 'a3ecf8c',
    invokes: false,
    line: 'fix(ci): stop the DocOps gate inheriting [skip-docops] from the base branch (#5029)',
  },
  {
    commit: '96f63f7',
    invokes: false,
    line: '  Documentation Management skill manual needs no update. [skip-docops] per docops-spec.',
  },
  {
    commit: '5e9e26f',
    invokes: false,
    line: 'a red check requiring an unjustified skill edit or a [skip-docops] commit',
  },
  {
    commit: '919de90',
    invokes: false,
    line: 'fix(ci): [skip-docops] honored on PR runs (#2411) (#2413)',
  },
  {
    commit: '919de90',
    invokes: false,
    line: '* fix(ci): walk PR commit range for [skip-docops] (#2411)',
  },
  {
    commit: '919de90',
    invokes: false,
    line: 'commit message. Result: [skip-docops] in a PR commit was never honored,',
  },
  {
    commit: '8aeabe8',
    invokes: false,
    line: 'MCP tool. Adds [skip-docops] because the inject-governance.ts change is a',
  },
  {
    commit: '47c4e15',
    invokes: false,
    line: '- Supports [skip-docops] escape hatch for emergencies',
  },
];

describe('scanEscapeHatch — historical corpus', () => {
  it('has the twelve occurrences #6026 measured, not a rounded count', () => {
    expect(HISTORICAL_OCCURRENCES).toHaveLength(12);
    expect(HISTORICAL_OCCURRENCES.filter((o) => o.invokes)).toHaveLength(4);
  });

  for (const { line, invokes, commit } of HISTORICAL_OCCURRENCES) {
    it(`${commit}: ${invokes ? 'INVOKES' : 'mentions'} — ${line.slice(0, 48)}…`, () => {
      expect(scanEscapeHatch(line).invoked).toBe(invokes);
    });
  }

  it('classifies the whole corpus at once the same way', () => {
    const all = HISTORICAL_OCCURRENCES.map((o) => o.line).join('\n');
    const scan = scanEscapeHatch(all);
    expect(scan.invocationLines).toHaveLength(4);
    expect(scan.mentionLines).toHaveLength(8);
    expect(scan.invoked).toBe(true);
  });
});

describe('scanEscapeHatch — the four commits that bypassed the gate while editing it', () => {
  // Each of these changed scripts/check-docops-skill.ts and updated no skill.
  // Under the old `includes()` recognizer all four reported "Check bypassed".
  const SELF_EDITING_COMMITS = [
    'fix(ci): stop the DocOps gate inheriting [skip-docops] from the base branch (#5029)',
    'fix(ci): exempt mechanical action-version bumps from DocOps skill-sync\n\na red check requiring an unjustified skill edit or a [skip-docops] commit',
    'fix(ci): [skip-docops] honored on PR runs (#2411) (#2413)\n\n* fix(ci): walk PR commit range for [skip-docops] (#2411)',
    'feat(ci): add DocOps skill synchronization enforcement gate\n\n- Supports [skip-docops] escape hatch for emergencies',
  ];

  for (const [i, message] of SELF_EDITING_COMMITS.entries()) {
    it(`does not bypass on self-editing commit ${String(i + 1)}`, () => {
      const scan = scanEscapeHatch(message);
      expect(scan.invoked).toBe(false);
      expect(scan.mentionLines.length).toBeGreaterThan(0);
    });
  }
});

describe('scanEscapeHatch — the empty cases are named, not defaulted', () => {
  it('reports absence and mention-only as different states', () => {
    const absent = scanEscapeHatch('fix: unrelated change\n\nNothing to see.');
    expect(absent.invoked).toBe(false);
    expect(absent.mentionLines).toHaveLength(0);

    const mentionOnly = scanEscapeHatch('docs: explain the [skip-docops] hatch to newcomers');
    expect(mentionOnly.invoked).toBe(false);
    expect(mentionOnly.mentionLines).toHaveLength(1);
  });

  it('an empty message is not an invocation', () => {
    expect(scanEscapeHatch('').invoked).toBe(false);
    expect(scanEscapeHatch('   \n\n  ').invoked).toBe(false);
  });
});

describe('scanEscapeHatch — invocation shapes', () => {
  it('accepts an indented standalone token (commit bodies are indented by squash merges)', () => {
    expect(scanEscapeHatch('  [skip-docops] regenerated artifact only').invoked).toBe(true);
  });

  it('accepts a trailing token with trailing whitespace', () => {
    expect(scanEscapeHatch('chore: regen artifacts [skip-docops]   ').invoked).toBe(true);
  });

  it('a line that both mentions and invokes counts as an invocation', () => {
    const line = 'Adds [skip-docops] because the artifact is generated [skip-docops]';
    expect(scanEscapeHatch(line).invoked).toBe(true);
  });

  it('finds an invocation on any line of a multi-commit range, not just the first', () => {
    const range = 'fix: one\n\nbody\n\nchore: two\n\nregenerated only [skip-docops]';
    expect(scanEscapeHatch(range).invoked).toBe(true);
  });
});

describe('scanEscapeHatch — this PR must not bypass the gate it is fixing', () => {
  // The architect seat named this the acceptance test for the whole change: the
  // commit that lands this necessarily writes the token in prose.
  it('does not bypass on a commit body that discusses the token mid-sentence', () => {
    const ownMessage = [
      'fix(ci): recognise an invocation of the DocOps escape hatch, not a mention',
      '',
      'check-docops-skill.ts matched [skip-docops] with a bare includes(), so a',
      'commit that merely named the token disabled the gate. All four commits that',
      'changed the gate itself mentioned [skip-docops] and bypassed it.',
    ].join('\n');
    const scan = scanEscapeHatch(ownMessage);
    expect(scan.invoked).toBe(false);
    expect(scan.mentionLines).toHaveLength(2);
  });
});
