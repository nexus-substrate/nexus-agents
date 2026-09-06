import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  MANUAL_ONLY,
  assessWiring,
  hasCliEntryGuard,
  isReachableFromCi,
  readInScopeScripts,
  readNpmScripts,
  readWorkflowText,
} from './check-script-wiring.js';

describe('isReachableFromCi', () => {
  it('does not count a paths: trigger entry as wiring (#5028)', () => {
    // The gate whose job is catching unwired gates used a bare
    // `workflowText.includes(basename)`. Deleting the
    // `run: pnpm exec tsx scripts/check-governor-ratification.ts` step from
    // governor-review.yml leaves the filename in two `paths:` blocks, so the
    // script reported as reachable while nothing executed it.
    const pathsOnly = [
      'on:',
      '  pull_request:',
      '    paths:',
      "      - 'scripts/check-governor-ratification.ts'",
    ].join('\n');

    expect(isReachableFromCi('check-governor-ratification.ts', pathsOnly, {})).toBe(false);
  });

  it('still counts a real run: step as wiring', () => {
    // The pair: tightening must not report a genuinely wired script as unwired,
    // which is how a gate teaches people to ignore it.
    const withRun =
      'jobs:\n  x:\n    steps:\n      - run: pnpm exec tsx scripts/check-governor-ratification.ts';

    expect(isReachableFromCi('check-governor-ratification.ts', withRun, {})).toBe(true);
  });

  const noNpm = {};

  it('counts a direct filename reference in a workflow', () => {
    expect(isReachableFromCi('check-x.ts', 'run: pnpm exec tsx scripts/check-x.ts', noNpm)).toBe(
      true
    );
  });

  it('counts an npm-script hop', () => {
    // check-pricing-drift.ts appears in no workflow; `check:pricing-drift` does.
    expect(
      isReachableFromCi('check-x.ts', 'run: pnpm check:x', {
        'check:x': 'pnpm exec tsx scripts/check-x.ts',
      })
    ).toBe(true);
  });

  it('tolerates flags between the package manager and the script name', () => {
    // ci.yml uses `pnpm --silent check:model-drift`. A stricter pattern reported
    // that script as unwired — a false positive found by running the gate.
    expect(
      isReachableFromCi('check-x.ts', 'OUTPUT=$(pnpm --silent check:x 2>&1)', {
        'check:x': 'pnpm exec tsx scripts/check-x.ts',
      })
    ).toBe(true);
  });

  it('does NOT count an npm script that no workflow invokes', () => {
    // The exact state of check-authority-tier-drift before #4562: an npm
    // script existed, nothing ran it.
    expect(
      isReachableFromCi('check-x.ts', 'run: pnpm lint', {
        'check:x': 'pnpm exec tsx scripts/check-x.ts',
      })
    ).toBe(false);
  });

  it('does not count a bare mention of the script name in prose', () => {
    expect(
      isReachableFromCi('check-x.ts', '# see check:x for details', {
        'check:x': 'pnpm exec tsx scripts/check-x.ts',
      })
    ).toBe(false);
  });

  it('reports a script with neither a workflow nor an npm script as unreachable', () => {
    expect(isReachableFromCi('check-x.ts', 'run: pnpm lint', noNpm)).toBe(false);
  });

  it('does not count an npm-script invocation quoted inside a workflow string (#5501)', () => {
    // verify-review.yml never runs review-pr.ts; it posts a comment whose TEXT
    // says `pnpm review <n>`. Guarding review-pr.ts made the gate enumerate it,
    // and the npm hop then reported it wired — "reachable from CI" for a script
    // no workflow executes, which is the misreport this gate exists to catch.
    const commentBody =
      "body: 'Label removed. Please re-run `pnpm review ' + context.payload.pull_request.number + '` to review.'";
    const review = { review: 'pnpm exec tsx scripts/review-pr.ts' };

    expect(isReachableFromCi('review-pr.ts', commentBody, review)).toBe(false);
  });

  it('does not count a direct invocation quoted inside an echo (#5501)', () => {
    // docs-check.yml's remediation hints: echo "Run 'pnpm exec tsx scripts/x.ts'".
    const hint = `echo "Run 'pnpm exec tsx scripts/check-x.ts' and commit the changes"`;

    expect(isReachableFromCi('check-x.ts', hint, noNpm)).toBe(false);
  });

  it('still counts an invocation that follows a closed string on the same line', () => {
    // The pair: only an UNBALANCED quote before the invocation means "inside a
    // string". `echo "…" && pnpm x` is a real run.
    expect(
      isReachableFromCi('check-x.ts', 'run: echo "checking" && pnpm check:x', {
        'check:x': 'pnpm exec tsx scripts/check-x.ts',
      })
    ).toBe(true);
    expect(
      isReachableFromCi(
        'check-x.ts',
        'run: echo "checking" && pnpm exec tsx scripts/check-x.ts',
        noNpm
      )
    ).toBe(true);
  });
});

describe('hasCliEntryGuard', () => {
  // The three shapes scripts/ actually uses (grepped, not invented):
  //   process.argv[1]?.endsWith('x.ts') === true          (check-*, arch-lint, …)
  //   import.meta.url === `file://${process.argv[1]}`     (claims-check, pr-review-*, …)
  //   import.meta.url === pathToFileURL(argv[1]).href     (inject-governance, generate-tool-reference)
  //   fileURLToPath(import.meta.url) === process.argv[1]  (check-harness-alignment)
  it.each([
    ["if (process.argv[1]?.endsWith('x.ts') === true) {\n  process.exit(main());\n}", 'endsWith'],
    [
      'const p = process.argv[1] ?? "";\nif (import.meta.url === `file://${p}`) {\n  main();\n}',
      'file://',
    ],
    [
      'const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;',
      'pathToFileURL',
    ],
    [
      'const invokedDirectly =\n  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];',
      'fileURLToPath',
    ],
  ])('recognises the %s shape', (source) => {
    expect(hasCliEntryGuard(source)).toBe(true);
  });

  it('does not treat a library module as an entry point', () => {
    // audit-exceptions.ts: exports only, reached by its test sibling. That is a
    // module, not a gate, and must not be reported as an unwired gate.
    expect(
      hasCliEntryGuard('export function loadLedger(root: string): string[] { return []; }')
    ).toBe(false);
  });

  it('does not treat a bare import.meta.url URL resolution as a guard', () => {
    // inject-governance.ts resolves a package.json path this way, hundreds of
    // lines before its real guard. The resolution alone is not an entry point.
    expect(
      hasCliEntryGuard("const pkg = new URL('../packages/x/package.json', import.meta.url);")
    ).toBe(false);
  });
});

describe('readInScopeScripts', () => {
  const dirs: string[] = [];
  function fixture(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'wiring-scope-'));
    dirs.push(root);
    mkdirSync(join(root, 'scripts'));
    for (const [name, body] of Object.entries(files))
      writeFileSync(join(root, 'scripts', name), body);
    return root;
  }
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  const GUARD = "if (process.argv[1]?.endsWith('self.ts') === true) main();\n";

  it('includes a non-check- script that carries a CLI entry guard (#5458)', () => {
    // The #4553 class sitting just outside the old `check-` glob: a gate-shaped
    // script under another name was invisible to the gate that exists to find
    // unwired gates.
    const root = fixture({ 'analyze-thing.ts': `export function f() {}\n${GUARD}` });
    expect(readInScopeScripts(root)).toEqual(['analyze-thing.ts']);
  });

  it('keeps every check-*.ts in scope whether or not it has a guard', () => {
    // check-pricing-drift.ts calls main() unconditionally; it was in scope
    // before and must stay in scope.
    const root = fixture({ 'check-plain.ts': 'main();\n' });
    expect(readInScopeScripts(root)).toEqual(['check-plain.ts']);
  });

  it('ignores a non-check- script with no guard (a library module)', () => {
    const root = fixture({ 'helpers.ts': 'export const x = 1;\n' });
    expect(readInScopeScripts(root)).toEqual([]);
  });

  it('ignores test files even when they carry a guard-shaped line', () => {
    const root = fixture({ 'thing.test.ts': GUARD, 'check-x.test.ts': 'it()' });
    expect(readInScopeScripts(root)).toEqual([]);
  });

  it('returns sorted basenames', () => {
    const root = fixture({ 'zeta.ts': GUARD, 'check-b.ts': '', 'alpha.ts': GUARD });
    expect(readInScopeScripts(root)).toEqual(['alpha.ts', 'check-b.ts', 'zeta.ts']);
  });
});

describe('assessWiring', () => {
  it('reports an allowlisted script that is now wired as stale', () => {
    // An allowlist entry is a claim ("nothing in CI runs this"). Once a
    // workflow does run it, the claim is false and the entry is paperwork
    // that would hide the next real regression under it.
    const verdict = assessWiring({
      inScopeScripts: ['check-a.ts'],
      workflowText: 'run: pnpm exec tsx scripts/check-a.ts',
      npmScripts: {},
      allowlist: { 'check-a.ts': 'operator-run' },
    });

    expect(verdict.stale).toEqual([{ basename: 'check-a.ts', reason: 'wired' }]);
    expect(verdict.manualOnly).toEqual([]);
  });

  it('reports an allowlisted script that is no longer enumerated as stale', () => {
    // Deleted, renamed, or lost its guard: either way the entry no longer
    // describes a script the gate can see.
    const verdict = assessWiring({
      inScopeScripts: [],
      workflowText: '',
      npmScripts: {},
      allowlist: { 'gone.ts': 'was a gate once' },
    });

    expect(verdict.stale).toEqual([{ basename: 'gone.ts', reason: 'not-enumerated' }]);
  });

  it('reports no stale entries when the allowlist is empty (named empty case)', () => {
    const verdict = assessWiring({
      inScopeScripts: ['check-a.ts'],
      workflowText: '',
      npmScripts: {},
      allowlist: {},
    });

    expect(verdict.stale).toEqual([]);
    expect(verdict.unwired).toEqual(['check-a.ts']);
  });

  it('partitions reachable from unreachable', () => {
    const verdict = assessWiring({
      inScopeScripts: ['check-a.ts', 'check-b.ts'],
      workflowText: 'pnpm exec tsx scripts/check-a.ts',
      npmScripts: {},
    });

    expect(verdict.wired).toEqual(['check-a.ts']);
    expect(verdict.unwired).toEqual(['check-b.ts']);
  });

  it('reports nothing unwired when everything is reachable', () => {
    const verdict = assessWiring({
      inScopeScripts: ['check-a.ts'],
      workflowText: 'pnpm exec tsx scripts/check-a.ts',
      npmScripts: {},
    });

    expect(verdict.unwired).toEqual([]);
  });
});

describe('MANUAL_ONLY against the real tree', () => {
  // The allowlist is measured, not trusted: every entry must still name a
  // script that exists, that the gate enumerates, and that nothing in CI runs.
  // A stale entry is exactly the kind of silent paperwork #4553 is about.
  const root = process.cwd();
  const workflowText = readWorkflowText(root);
  const npmScripts = readNpmScripts(root);
  const inScope = readInScopeScripts(root);

  it('has at least one entry (the table is not decorative)', () => {
    expect(Object.keys(MANUAL_ONLY).length).toBeGreaterThan(0);
  });

  it.each(Object.keys(MANUAL_ONLY))('%s exists, is enumerated, and is unwired', (basename) => {
    expect(existsSync(join(root, 'scripts', basename))).toBe(true);
    expect(inScope).toContain(basename);
    expect(isReachableFromCi(basename, workflowText, npmScripts)).toBe(false);
  });

  // #5501: these ran their body unconditionally at module top level, so the
  // gate could not see them even though every one is (or is meant to be) an
  // entry point. Each now carries the standard guard; if one loses it, the
  // gate silently stops measuring it, which is the #4553 class again.
  it.each([
    'backfill-research-quality.ts',
    'generate-agents-index.ts',
    'generate-docs-content.ts',
    'generate-repo-index.ts',
    'generate-skills-index.ts',
    'review-pr.ts',
    'sync-models-dev.ts',
    'sync-plugin-version.ts',
  ])('%s carries a CLI entry guard and is enumerated (#5501)', (basename) => {
    expect(inScope).toContain(basename);
  });

  it('the widened gate passes on the real tree', () => {
    const verdict = assessWiring({ inScopeScripts: inScope, workflowText, npmScripts });
    expect(verdict.unwired).toEqual([]);
    expect(verdict.stale).toEqual([]);
    // The widening must actually widen: at least one non-check- script is in scope.
    expect(inScope.some((b) => !b.startsWith('check-'))).toBe(true);
  });
});
