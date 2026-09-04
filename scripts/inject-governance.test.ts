/**
 * Integration tests for the Governance Injection Script.
 *
 * #3954: these tests previously spawned ~30 `npx tsx scripts/inject-governance.ts`
 * subprocesses (≈8-12s cold start each, ≈400s total) and mutated SHARED real repo
 * files (`server.json`, `AGENTS.md`, `CLAUDE.md`, …) in place. That made the file
 * unsafe under the forks pool (cross-test interference + subprocess contention),
 * so it was excluded from the root `vitest.config.ts`.
 *
 * It is now parallel-safe and fast:
 *
 *   - ISOLATION: a per-worker temp sandbox is seeded with a copy of every file
 *     the check/inject logic reads or writes. `NEXUS_SCRIPT_ROOT` (the seam in
 *     `script-paths.ts`) redirects the script's ENTIRE path graph — including the
 *     helper drift-gate modules that derive their paths from the same `ROOT` —
 *     at that sandbox. No real tracked file is ever mutated.
 *   - SPEED: the exported `checkGovernance` / `injectGovernance` functions run
 *     IN-PROCESS (no `npx tsx` cold starts). Console output is captured to assert
 *     on the same summaries / error strings the subprocess tests inspected.
 *
 * Coverage is preserved: injection idempotence, every governed section, and the
 * drift gates (counts, README/ENTRYPOINTS tables, canonical paths, rules index,
 * generated-from-AGENTS block, tool annotations, error envelope, distinctness,
 * prerequisites, output consistency, rule frontmatter, server.json) are all still
 * asserted — just against the sandbox instead of the real tree.
 *
 * @module scripts/inject-governance.test
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { parseRegisteredToolNames } from './parse-tool-manifest.js';
import { parseCommandCatalog } from './parse-cli-command-catalog.js';

/** Real repo root (parent of `scripts/`). Source of the pristine fixtures. */
const REAL_ROOT = join(import.meta.dirname, '..');

/**
 * Files + directories the governance check/inject logic reads or writes. Copied
 * into the sandbox so the redirected `ROOT` resolves a complete tree. The whole
 * `packages/nexus-agents/src` subtree is copied because `checkCanonicalPaths`
 * existence-checks every `src/...` path in AGENTS.md's "Canonical paths" table
 * against the (redirected) root.
 */
const SANDBOX_PATHS: readonly string[] = [
  'CLAUDE.md',
  'README.md',
  'AGENTS.md',
  '.prettierrc',
  '.prettierignore',
  'docs',
  'skills',
  'agents',
  'governance',
  '.rules',
  '.claude-plugin',
  'website/src/data/site-data.ts',
  'packages/nexus-agents/package.json',
  'packages/nexus-agents/server.json',
  'packages/nexus-agents/src',
  'packages/nexus-memory/src/registry.ts',
];

let SANDBOX = '';
let core: {
  checkGovernance: () => boolean;
  injectGovernance: () => Promise<void>;
};

/** Absolute path inside the sandbox for a repo-relative path. */
function box(rel: string): string {
  return join(SANDBOX, rel);
}

/** Files that `inject` rewrites — snapshotted/restored around inject tests. */
const INJECT_WRITES: readonly string[] = [
  'CLAUDE.md',
  'README.md',
  'AGENTS.md',
  'docs/ENTRYPOINTS.md',
  'docs/getting-started/PLUGIN_INSTALL.md',
  'docs/design/components.md',
  'website/src/data/site-data.ts',
  'packages/nexus-agents/server.json',
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
];

beforeAll(async () => {
  SANDBOX = mkdtempSync(join(tmpdir(), 'inject-governance-'));
  for (const rel of SANDBOX_PATHS) {
    const dest = box(rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(REAL_ROOT, rel), dest, { recursive: true });
  }
  // Seed a git repo so `getGovernanceSourceDate()` (which runs `git log` with
  // cwd=ROOT to derive a deterministic version stamp) resolves a real commit
  // date instead of shelling out against a non-git dir — that path works via a
  // today's-date fallback but floods stderr with "fatal: not a git repository".
  execSync('git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm seed', {
    cwd: SANDBOX,
    stdio: 'ignore',
  });
  // Redirect the whole script path graph at the sandbox BEFORE importing the
  // module, so `script-paths.ts` (and every helper that derives from its ROOT)
  // binds to the sandbox on first evaluation.
  process.env['NEXUS_SCRIPT_ROOT'] = SANDBOX;
  core = await import('./inject-governance.js');
});

afterAll(() => {
  delete process.env['NEXUS_SCRIPT_ROOT'];
  if (SANDBOX !== '') rmSync(SANDBOX, { recursive: true, force: true });
});

/** Run `checkGovernance()` in-process, capturing console output. */
function runCheck(): { ok: boolean; output: string } {
  const lines: string[] = [];
  const push = (...a: unknown[]): void => void lines.push(a.map(String).join(' '));
  const log = vi.spyOn(console, 'log').mockImplementation(push);
  const err = vi.spyOn(console, 'error').mockImplementation(push);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  let ok = false;
  try {
    ok = core.checkGovernance();
  } catch (e) {
    // A gate that THROWS (e.g. the rule-frontmatter parser on a malformed file)
    // is a check failure: the CLI surfaces it as a non-zero exit + stderr. Mirror
    // that here so callers see `ok === false` with the message in the output,
    // exactly as the subprocess tests observed via the thrown stack on stderr.
    ok = false;
    lines.push(e instanceof Error ? e.message : String(e));
  } finally {
    log.mockRestore();
    err.mockRestore();
    warn.mockRestore();
  }
  return { ok, output: lines.join('\n') };
}

/** Run `injectGovernance()` in-process, capturing console output. */
async function runInject(): Promise<string> {
  const lines: string[] = [];
  const push = (...a: unknown[]): void => void lines.push(a.map(String).join(' '));
  const log = vi.spyOn(console, 'log').mockImplementation(push);
  const err = vi.spyOn(console, 'error').mockImplementation(push);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    await core.injectGovernance();
  } finally {
    log.mockRestore();
    err.mockRestore();
    warn.mockRestore();
  }
  return lines.join('\n');
}

/**
 * Snapshot one sandbox file, run `body` (which may corrupt it), then restore it.
 * Keeps the sandbox pristine across the sequentially-run tests in this file.
 */
function withSandboxFile(rel: string, body: (original: string) => void): void {
  const path = box(rel);
  const original = readFileSync(path, 'utf-8');
  try {
    body(original);
  } finally {
    writeFileSync(path, original);
  }
}

/** Snapshot the full set of inject-written files, run `body`, restore them all. */
async function withInjectSnapshot(body: () => Promise<void>): Promise<void> {
  const snapshot = new Map<string, string>();
  for (const rel of INJECT_WRITES) snapshot.set(rel, readFileSync(box(rel), 'utf-8'));
  try {
    await body();
  } finally {
    for (const [rel, content] of snapshot) writeFileSync(box(rel), content);
  }
}

// ============================================================================
// Check command (validates current state)
// ============================================================================

describe('inject-governance check', () => {
  it('passes on the sandbox CLAUDE.md', () => {
    const { ok, output } = runCheck();
    expect(ok).toBe(true);
    expect(output).toContain('Governance check passed');
    expect(output).toContain('MCP Tools:');
    expect(output).toContain('Expert Types:');
    expect(output).toContain('Workflow Templates:');
    expect(output).toContain('Skills:');
  });

  it('reports correct tool count', () => {
    const { output } = runCheck();
    const match = /MCP Tools:\s*(\d+)/.exec(output);
    expect(match).not.toBeNull();
    expect(parseInt(match![1]!, 10)).toBeGreaterThanOrEqual(15);
  });

  it('reports correct expert count', () => {
    const { output } = runCheck();
    const match = /Expert Types:\s*(\d+)/.exec(output);
    expect(match).not.toBeNull();
    expect(parseInt(match![1]!, 10)).toBeGreaterThanOrEqual(7);
  });

  it('reports correct workflow count', () => {
    const { output } = runCheck();
    const match = /Workflow Templates:\s*(\d+)/.exec(output);
    expect(match).not.toBeNull();
    expect(parseInt(match![1]!, 10)).toBeGreaterThanOrEqual(9);
  });

  it('reports correct skill count', () => {
    const { output } = runCheck();
    const match = /Skills:\s*(\d+)/.exec(output);
    expect(match).not.toBeNull();
    expect(parseInt(match![1]!, 10)).toBeGreaterThanOrEqual(12);
  });

  it('reports agent count from agents/*.md', () => {
    const { output } = runCheck();
    const match = /Agents:\s*(\d+)/.exec(output);
    expect(match).not.toBeNull();
    expect(parseInt(match![1]!, 10)).toBeGreaterThanOrEqual(5);
  });

  it('ancillary count probes pass for plugin manifests + install doc', () => {
    const { ok, output } = runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('pattern not found');
    expect(output).toContain('Governance check passed');
  });
});

// ============================================================================
// Inject command (idempotency + generated sections)
// ============================================================================

describe('inject-governance inject', () => {
  it('is idempotent (running twice produces same result)', async () => {
    await withInjectSnapshot(async () => {
      await runInject();
      const firstRun = readFileSync(box('CLAUDE.md'), 'utf-8');
      await runInject();
      const secondRun = readFileSync(box('CLAUDE.md'), 'utf-8');
      expect(firstRun).toBe(secondRun);
    });
  });

  // #5218: the stamp had two writers — `generateVersionSection` computed it into
  // CLAUDE.md, while AGENTS.md carried a hand-held copy inside the AGNOSTIC:BODY
  // slice that gets copied verbatim into CLAUDE.md. Editing any of the five
  // governance sources moved the computed date, CLAUDE.md took the new one,
  // AGENTS.md kept the old, and the #3446 staleness check then failed on an
  // unrelated PR. It broke main on 2026-09-02 exactly this way, after #5216
  // touched `expert-config.ts`.
  it('writes the same governance stamp into AGENTS.md and CLAUDE.md', async () => {
    await withInjectSnapshot(async () => {
      await runInject();
      const stampOf = (file: string): string | undefined =>
        /_Governance Version: (\d{4}-\d{2}-\d{2})_/.exec(readFileSync(box(file), 'utf-8'))?.[1];

      const agents = stampOf('AGENTS.md');
      const claude = stampOf('CLAUDE.md');

      expect(agents).toBeDefined();
      expect(claude).toBeDefined();
      // Two files, one computed value. If these can drift, the staleness check
      // fires on whichever PR happens to touch a governance source next.
      expect(agents).toBe(claude);
    });
  });

  it('leaves the staleness check passing after a governance source moves the stamp', async () => {
    await withInjectSnapshot(async () => {
      // Simulate what broke main: AGENTS.md holding an older stamp than the
      // computed date. Before the fix, inject updated only CLAUDE.md and the
      // check then reported the block stale.
      const agentsPath = box('AGENTS.md');
      const stale = readFileSync(agentsPath, 'utf-8').replace(
        /_Governance Version: \d{4}-\d{2}-\d{2}_/,
        '_Governance Version: 2000-01-01_'
      );
      writeFileSync(agentsPath, stale);

      await runInject();
      const { ok } = runCheck();
      expect(ok).toBe(true);
    });
  });

  it('preserves governance markers', async () => {
    await withInjectSnapshot(async () => {
      await runInject();
      const content = readFileSync(box('CLAUDE.md'), 'utf-8');
      expect(content).toContain('<!-- GOVERNANCE:TOOL_INDEX:START -->');
      expect(content).toContain('<!-- GOVERNANCE:TOOL_INDEX:END -->');
      expect(content).toContain('<!-- GOVERNANCE:VERSION:START -->');
      expect(content).toContain('<!-- GOVERNANCE:VERSION:END -->');
    });
  });

  it('generates tool index section', async () => {
    await withInjectSnapshot(async () => {
      await runInject();
      const content = readFileSync(box('CLAUDE.md'), 'utf-8');
      expect(content).toContain('## MCP Tools Reference');
      expect(content).toContain('MCP tools registered');
      expect(content).toContain('docs/ENTRYPOINTS.md');
      expect(content).toContain('`orchestrate`');
      expect(content).toContain('`create_expert`');
      expect(content).toContain('`memory_query`');
      expect(content).toContain('`memory_stats`');
    });
  });

  it('updates tool count in auto-generated footer', async () => {
    await withInjectSnapshot(async () => {
      await runInject();
      const content = readFileSync(box('CLAUDE.md'), 'utf-8');
      const match = /Auto-generated from source\.\s*(\d+)\s*tools registered/.exec(content);
      expect(match).not.toBeNull();
      expect(parseInt(match![1]!, 10)).toBeGreaterThanOrEqual(15);
    });
  });

  it('updates governance version timestamp', async () => {
    await withInjectSnapshot(async () => {
      await runInject();
      const content = readFileSync(box('CLAUDE.md'), 'utf-8');
      expect(/Governance Version:\s*(\d{4}-\d{2}-\d{2})/.exec(content)).not.toBeNull();
    });
  });

  it('outputs summary with counts', async () => {
    await withInjectSnapshot(async () => {
      const output = await runInject();
      expect(output).toContain('Governance injected');
      expect(output).toContain('MCP Tools:');
      expect(output).toContain('Expert Types:');
    });
  });
});

// ============================================================================
// Section injection (marker replacement logic)
// ============================================================================

describe('AGENTS.md toolchain footer (#5142, item 2)', () => {
  const PKG_REL = 'packages/nexus-agents/package.json';
  const footer = (
    file: string,
    key: 'TypeScript' | 'Node.js' | 'MCP Protocol'
  ): string | undefined =>
    new RegExp(`_${key.replace('.', '\\.')}: ([^_\\n]+)_`).exec(
      readFileSync(box(file), 'utf-8')
    )?.[1];

  it('generates the footer from package.json and the installed SDK, into both files', async () => {
    // Before this, the footer said `TypeScript: 5.9+` while package.json said
    // `^6.0.3`, and nothing read it. The AGENTS→CLAUDE copy guaranteed the two
    // COPIES agreed while checking neither against anything.
    await withInjectSnapshot(async () => {
      const pkgPath = box(PKG_REL);
      const originalPkg = readFileSync(pkgPath, 'utf-8');
      try {
        const pkg = JSON.parse(originalPkg) as {
          dependencies: Record<string, string>;
          engines: Record<string, string>;
        };
        pkg.dependencies['typescript'] = '^7.0.0';
        pkg.engines['node'] = '>=24.0.0';
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

        await runInject();

        for (const file of ['AGENTS.md', 'CLAUDE.md']) {
          expect(footer(file, 'TypeScript')).toBe('7.x');
          expect(footer(file, 'Node.js')).toBe('>=24.0.0');
          // The SDK constant, not a date typed into a comment.
          expect(footer(file, 'MCP Protocol')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
        expect(footer('AGENTS.md', 'MCP Protocol')).toBe(footer('CLAUDE.md', 'MCP Protocol'));
        expect(runCheck().ok).toBe(true);
      } finally {
        writeFileSync(pkgPath, originalPkg);
      }
    });
  });

  it('check fails when the TypeScript footer disagrees with package.json', async () => {
    await withInjectSnapshot(async () => {
      await runInject();
      const agentsPath = box('AGENTS.md');
      writeFileSync(
        agentsPath,
        readFileSync(agentsPath, 'utf-8').replace(/_TypeScript: [^_\n]+_/, '_TypeScript: 5.9+_')
      );

      const { ok, output } = runCheck();

      expect(ok).toBe(false);
      expect(output).toContain('AGENTS.md TypeScript footer');
      expect(output).toContain('found 5.9+');
    });
  });

  it('check fails when the MCP Protocol footer disagrees with the installed SDK', async () => {
    // The only occurrences of the protocol date in src/ are comments; the SDK
    // export is the fact. A footer that drifts from it must be reportable.
    await withInjectSnapshot(async () => {
      await runInject();
      const agentsPath = box('AGENTS.md');
      writeFileSync(
        agentsPath,
        readFileSync(agentsPath, 'utf-8').replace(
          /_MCP Protocol: [^_\n]+_/,
          '_MCP Protocol: 2000-01-01_'
        )
      );

      const { ok, output } = runCheck();

      expect(ok).toBe(false);
      expect(output).toContain('AGENTS.md MCP Protocol footer');
      expect(output).toContain('found 2000-01-01');
    });
  });

  it('a single inject converges CLAUDE.md after an AGENTS.md footer change', async () => {
    // The ordering hazard the footer surfaced: `applyAllSectionInjections`
    // copies AGENTS.md's body into CLAUDE.md, and every AGENTS.md writer used
    // to run AFTER it — so one pass left CLAUDE.md a step behind, and check
    // reported the FROM_AGENTS block stale. Masked while the only inline
    // values were counts that rarely move.
    await withInjectSnapshot(async () => {
      const agentsPath = box('AGENTS.md');
      writeFileSync(
        agentsPath,
        readFileSync(agentsPath, 'utf-8').replace(/_TypeScript: [^_\n]+_/, '_TypeScript: 5.9+_')
      );

      await runInject();

      expect(footer('AGENTS.md', 'TypeScript')).toBe(footer('CLAUDE.md', 'TypeScript'));
      expect(footer('CLAUDE.md', 'TypeScript')).not.toBe('5.9+');
      expect(runCheck().ok).toBe(true);
    });
  });
});

describe('section injection behavior', () => {
  it('replaces content between markers without affecting surrounding text', async () => {
    await withInjectSnapshot(async () => {
      const original = readFileSync(box('CLAUDE.md'), 'utf-8');
      const beforeToolIndex = original.split('<!-- GOVERNANCE:TOOL_INDEX:START -->')[0];
      const afterAllGoverned = original.split('<!-- GOVERNANCE:VERSION:END -->')[1];

      await runInject();
      const updated = readFileSync(box('CLAUDE.md'), 'utf-8');

      expect(updated.split('<!-- GOVERNANCE:TOOL_INDEX:START -->')[0]).toBe(beforeToolIndex);
      expect(updated.split('<!-- GOVERNANCE:VERSION:END -->')[1]).toBe(afterAllGoverned);
    });
  });

  it('handles tool index with all registered tools', async () => {
    await withInjectSnapshot(async () => {
      await runInject();
      const content = readFileSync(box('CLAUDE.md'), 'utf-8');
      const startMarker = '<!-- GOVERNANCE:TOOL_INDEX:START -->';
      const endMarker = '<!-- GOVERNANCE:TOOL_INDEX:END -->';
      const section = content.slice(
        content.indexOf(startMarker),
        content.indexOf(endMarker) + endMarker.length
      );
      const expectedTools = [
        'orchestrate',
        'create_expert',
        'execute_expert',
        'run_workflow',
        'consensus_vote',
        'delegate_to_model',
        'list_experts',
        'list_workflows',
        'research_query',
        'research_add',
        'research_discover',
        'research_analyze',
        'research_catalog_review',
        'memory_query',
        'memory_stats',
      ];
      for (const tool of expectedTools) {
        expect(section).toContain(`\`${tool}\``);
      }
    });
  });
});

// ============================================================================
// README MCP tools table drift gate (#2269) — isolated drift test
// ============================================================================

describe('inject-governance README tool table (#2269)', () => {
  it('check fails when the README tool table drifts', () => {
    withSandboxFile('README.md', (original) => {
      // Drop a generated table row so the README table no longer matches the
      // registry — the gate must catch it.
      const broken = original.replace(/\| `orchestrate`[^\n]*\n/, '');
      expect(broken).not.toBe(original);
      writeFileSync(box('README.md'), broken);
      const { ok, output } = runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('README MCP tools table is stale');
    });
  });
});

// ============================================================================
// Workflows table generation + Canonical Paths validator (#2317, #2321, #3446)
// ============================================================================

describe('inject-governance workflows + canonical paths (#2317)', () => {
  it('generates Workflows table with every skill from skills/index.yaml', async () => {
    await withInjectSnapshot(async () => {
      await runInject();
      const content = readFileSync(box('CLAUDE.md'), 'utf-8');
      expect(content).toContain('<!-- GOVERNANCE:WORKFLOW_INDEX:START -->');
      expect(content).toContain('<!-- GOVERNANCE:WORKFLOW_INDEX:END -->');
      // dev-pipeline + security-advisory-response were the drifted entries that
      // motivated this generator (#2317). They MUST appear.
      expect(content).toContain('`dev-pipeline`');
      expect(content).toContain('`security-advisory-response`');
      const match = /Auto-generated from `skills\/index\.yaml`\.\s*(\d+)\s*skills\./.exec(content);
      expect(match).not.toBeNull();
      expect(parseInt(match![1]!, 10)).toBeGreaterThanOrEqual(15);
    });
  });

  it('canonical paths validator passes on the current CLAUDE.md', () => {
    const { ok, output } = runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('Canonical Paths drift');
  });

  it('canonical paths validator fails when a row points at a missing file', () => {
    withSandboxFile('AGENTS.md', (original) => {
      // #3446: the canonical-paths table is authored in AGENTS.md; AGENTS uses
      // the `src/...` shorthand for the nexus-agents package.
      const broken = original.replace(
        '`src/consensus/engine.ts`',
        '`src/consensus/THIS_FILE_DOES_NOT_EXIST.ts`'
      );
      expect(broken).not.toBe(original);
      writeFileSync(box('AGENTS.md'), broken);
      const { ok, output } = runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('Canonical Paths drift');
      expect(output).toContain('THIS_FILE_DOES_NOT_EXIST.ts');
    });
  });
});

// ============================================================================
// Adapter precedence docs validator (#2655)
// ============================================================================

describe('inject-governance adapter-precedence-docs (#2655)', () => {
  const PRECEDENCE_DOC = 'docs/guides/RULE_PRECEDENCE.md';

  it('passes when RULE_PRECEDENCE.md has all four adapter sections', () => {
    const { ok, output } = runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('RULE_PRECEDENCE.md missing');
  });

  it('fails when an adapter section header is missing', () => {
    withSandboxFile(PRECEDENCE_DOC, (original) => {
      // Exact-line matching in the validator means `## OpenCodeXXX` still trips
      // the gate even though `includes('## OpenCode')` would have passed.
      const broken = original.replace(/^## OpenCode$/m, '## OpenCodeXXX');
      expect(broken).not.toBe(original);
      writeFileSync(box(PRECEDENCE_DOC), broken);
      const { ok, output } = runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('## OpenCode');
    });
  });

  it('fails when RULE_PRECEDENCE.md is missing entirely', () => {
    withSandboxFile(PRECEDENCE_DOC, () => {
      rmSync(box(PRECEDENCE_DOC));
      const { ok, output } = runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('Missing docs/guides/RULE_PRECEDENCE.md');
    });
  });
});

// ============================================================================
// Rules-index generator + drift gate (#2657)
// ============================================================================

describe('inject-governance rules-index (#2657)', () => {
  it('passes when the AGENTS.md Rules index matches .rules/*.md frontmatter', () => {
    const { ok, output } = runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('AGENTS.md Rules index is stale');
  });

  it('generates a Rules index row for every .rules/*.md file', () => {
    const content = readFileSync(box('AGENTS.md'), 'utf-8');
    const start = content.indexOf('<!-- GOVERNANCE:RULES_INDEX:START -->');
    const end = content.indexOf('<!-- GOVERNANCE:RULES_INDEX:END -->');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const section = content.slice(start, end);
    expect(section).toContain('[`.rules/typescript.md`](./.rules/typescript.md)');
    expect(section).toContain('`**/*.ts`, `**/*.tsx`');
    expect(section).toMatch(/_Auto-generated from `\.rules\/\*\.md` frontmatter.*\d+ rules\._/);
  });

  it('fails when the AGENTS.md Rules index drifts from frontmatter', () => {
    withSandboxFile('AGENTS.md', (original) => {
      const broken = original.replace(/\| \[`\.rules\/typescript\.md`\][^\n]*\n/, '');
      expect(broken).not.toBe(original);
      writeFileSync(box('AGENTS.md'), broken);
      const { ok, output } = runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('AGENTS.md Rules index is stale');
    });
  });
});

// ============================================================================
// CLAUDE.md generated-from-AGENTS block + drift gate (#3446, Phase 2+3)
// ============================================================================

describe('inject-governance claude-from-agents (#3446)', () => {
  it('passes when the CLAUDE.md generated block matches AGENTS.md AGNOSTIC:BODY', () => {
    const { ok, output } = runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('GENERATED:FROM_AGENTS block is stale');
  });

  it('CLAUDE.md generated block carries the agnostic body sliced from AGENTS.md', () => {
    const content = readFileSync(box('CLAUDE.md'), 'utf-8');
    const start = content.indexOf('<!-- GENERATED:FROM_AGENTS:START -->');
    const end = content.indexOf('<!-- GENERATED:FROM_AGENTS:END -->');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = content.slice(start, end);
    expect(block).toContain('DO NOT EDIT THIS BLOCK BY HAND');
    expect(block).toContain('#3446');
    expect(block).toContain('## Prime directive');
    expect(block).toContain('## Default working mode');
    expect(block).toContain('## Untrusted-input safety invariants');
    expect(block).toContain('## Consensus voting thresholds');
    expect(block).not.toContain('AGNOSTIC:BODY:START');
    expect(block).not.toContain('AGNOSTIC:BODY:END');
  });

  it('fails when the CLAUDE.md generated block is hand-edited (drifts from AGENTS.md)', () => {
    withSandboxFile('CLAUDE.md', (original) => {
      const broken = original.replace('## Prime directive', '## Prime directive (hand-edited)');
      expect(broken).not.toBe(original);
      writeFileSync(box('CLAUDE.md'), broken);
      const { ok, output } = runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('GENERATED:FROM_AGENTS block is stale');
    });
  });

  it('fails when AGENTS.md AGNOSTIC:BODY is edited without re-running inject', () => {
    withSandboxFile('AGENTS.md', (original) => {
      const broken = original.replace(
        'Clever code is maintenance debt.',
        'Clever code is maintenance debt. (edited but not injected)'
      );
      expect(broken).not.toBe(original);
      writeFileSync(box('AGENTS.md'), broken);
      const { ok, output } = runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('GENERATED:FROM_AGENTS block is stale');
    });
  });

  it('fails LOUD on reordered AGNOSTIC:BODY markers instead of silently erasing the body', () => {
    withSandboxFile('AGENTS.md', (original) => {
      const broken = original
        .replace('<!-- AGNOSTIC:BODY:START -->', '<!-- AGNOSTIC:BODY:TMP -->')
        .replace('<!-- AGNOSTIC:BODY:END -->', '<!-- AGNOSTIC:BODY:START -->')
        .replace('<!-- AGNOSTIC:BODY:TMP -->', '<!-- AGNOSTIC:BODY:END -->');
      expect(broken).not.toBe(original);
      writeFileSync(box('AGENTS.md'), broken);
      // The generator THROWS on malformed markers rather than silently erasing
      // the body; runCheck() surfaces that throw as a failed check.
      const { ok, output } = runCheck();
      expect(ok).toBe(false);
      expect(output).toMatch(/reordered|malformed/i);
    });
  });

  it('inject regenerates the CLAUDE.md block from AGENTS.md (idempotent)', async () => {
    await withInjectSnapshot(async () => {
      await runInject();
      const firstRun = readFileSync(box('CLAUDE.md'), 'utf-8');
      await runInject();
      const secondRun = readFileSync(box('CLAUDE.md'), 'utf-8');
      expect(firstRun).toBe(secondRun);
      expect(firstRun).toContain('## Prime directive');
    });
  });
});

// ============================================================================
// Tool-annotations validator (#2648)
// ============================================================================

describe('inject-governance tool-annotations (#2648)', () => {
  const MANIFEST = 'packages/nexus-agents/src/mcp/tools/tool-manifest.ts';

  it('passes when every registered tool has an entry in TOOL_ANNOTATIONS', () => {
    const { ok, output } = runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('Registered tools missing annotations');
  });

  it('fails when a registered tool is missing its manifest annotations block', () => {
    withSandboxFile(MANIFEST, (original) => {
      const broken = original.replace(
        /(name: 'weather_report',\s*)annotations:\s*\{[\s\S]*?\},\s*/m,
        '$1'
      );
      expect(broken).not.toBe(original);
      writeFileSync(box(MANIFEST), broken);
      const { ok, output } = runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('missing annotations');
      expect(output).toContain('weather_report');
    });
  });
});

// ============================================================================
// MCP error-envelope validator (#2649)
// ============================================================================

describe('inject-governance mcp-error-envelope (#2649)', () => {
  const TOOL = 'packages/nexus-agents/src/mcp/tools/memory-stats.ts';

  it('passes when no tool file has a raw `isError: true` literal', () => {
    const { ok, output } = runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('raw `isError: true` literal');
  });

  it('fails when a tool file builds a raw `isError: true` literal', () => {
    withSandboxFile(TOOL, (original) => {
      // String-pattern replace already targets only the first occurrence.
      const broken = original.replace(
        'export ',
        'const _raw = { isError: true, content: [] };\nexport '
      );
      expect(broken).not.toBe(original);
      writeFileSync(box(TOOL), broken);
      const { ok, output } = runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('raw `isError: true` literal');
      expect(output).toContain('memory-stats.ts');
    });
  });
});

// ============================================================================
// Tool-distinctness validator (#2650)
// ============================================================================

describe('inject-governance tool-distinctness (#2650)', () => {
  const BASELINE = 'docs/ops/tool-distinctness-baseline.json';

  it('passes when every flagged tool pair is in the baseline', () => {
    const { ok, output } = runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('distinctness');
  });

  it('fails when a flagged pair is dropped from the baseline', () => {
    withSandboxFile(BASELINE, (original) => {
      const parsed = JSON.parse(original) as { pairs: unknown[] };
      const dropped = { ...parsed, pairs: parsed.pairs.slice(1) };
      writeFileSync(box(BASELINE), JSON.stringify(dropped, null, 2) + '\n');
      const { ok, output } = runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('NEW overlapping pair');
    });
  });
});

// ============================================================================
// Tool-prerequisites validator (#2652)
// ============================================================================

describe('inject-governance tool-prerequisites (#2652)', () => {
  const PREREQ = 'packages/nexus-agents/src/mcp/middleware/tool-prerequisites.ts';

  it('passes when every non-read-only tool has a prerequisite decision', () => {
    const { ok, output } = runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('no prerequisite decision');
  });

  it('fails when a non-read-only tool is dropped from both prerequisite maps', () => {
    withSandboxFile(PREREQ, (original) => {
      // `orchestrate` executes tasks (never read-only), so dropping its
      // NO_PREREQUISITE entry must trip the gate (#3444).
      const broken = original.replace(/^ {2}orchestrate:[\s\S]*?',\n/m, '');
      expect(broken).not.toBe(original);
      writeFileSync(box(PREREQ), broken);
      const { ok, output } = runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('no prerequisite decision');
      expect(output).toContain('orchestrate');
    });
  });
});

// ============================================================================
// Tool-output-consistency validator (#2653)
// ============================================================================

describe('inject-governance tool-output-consistency (#2653)', () => {
  const TOOL = 'packages/nexus-agents/src/mcp/tools/memory-write.ts';

  it('passes when no tool output types a timestamp as a bare number', () => {
    const { ok, output } = runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('timestamp-named field');
  });

  it('fails when a tool output schema types a timestamp field as a number', () => {
    withSandboxFile(TOOL, (original) => {
      const broken = original.replace(
        'const outputSchema = {',
        'const outputSchema = {\n    createdAt: z.number(),'
      );
      expect(broken).not.toBe(original);
      writeFileSync(box(TOOL), broken);
      const { ok, output } = runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('timestamp-named field');
      expect(output).toContain('memory-write.ts');
    });
  });
});

// ============================================================================
// Rule frontmatter validator (#2656)
// ============================================================================

describe('inject-governance rule-frontmatter (#2656)', () => {
  it('passes when every .rules/*.md has paths + description frontmatter', () => {
    const { ok, output } = runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('frontmatter drift');
  });

  it('fails when a rule file loses its frontmatter delimiter', () => {
    withSandboxFile('.rules/typescript.md', (original) => {
      const stripped = original.replace(/^---\n[\s\S]*?\n---\n/, '');
      expect(stripped).not.toBe(original);
      writeFileSync(box('.rules/typescript.md'), stripped);
      const { ok, output } = runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('frontmatter drift');
      expect(output).toContain('typescript.md');
    });
  });

  it('fails when a rule file is missing its description field', () => {
    withSandboxFile('.rules/security.md', (original) => {
      const stripped = original.replace(/^description:.*\n/m, '');
      expect(stripped).not.toBe(original);
      writeFileSync(box('.rules/security.md'), stripped);
      const { ok, output } = runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('missing `description:`');
    });
  });
});

// ============================================================================
// server.json sync (#2326, #2327)
// ============================================================================

describe('inject-governance server.json sync (#2327)', () => {
  const SERVER_JSON = 'packages/nexus-agents/server.json';
  const PKG_JSON = 'packages/nexus-agents/package.json';

  it('inject syncs server.json version to packages/nexus-agents/package.json', async () => {
    await withInjectSnapshot(async () => {
      await runInject();
      const pkg = JSON.parse(readFileSync(box(PKG_JSON), 'utf-8')) as { version: string };
      const server = JSON.parse(readFileSync(box(SERVER_JSON), 'utf-8')) as {
        version: string;
        packages: { version: string }[];
      };
      expect(server.version).toBe(pkg.version);
      for (const entry of server.packages) {
        expect(entry.version).toBe(pkg.version);
      }
    });
  });

  it('check command fails when server.json version drifts', () => {
    withSandboxFile(SERVER_JSON, (original) => {
      const broken = original.replace(/"version": "[^"]+"/, '"version": "0.0.0-broken"');
      expect(broken).not.toBe(original);
      writeFileSync(box(SERVER_JSON), broken);
      const { ok, output } = runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('server.json version');
      expect(output).toContain('0.0.0-broken');
    });
  });

  it('check command fails when server.json description tool count drifts', () => {
    withSandboxFile(SERVER_JSON, (original) => {
      const broken = original.replace(/(\d+) MCP tools/, '999 MCP tools');
      expect(broken).not.toBe(original);
      writeFileSync(box(SERVER_JSON), broken);
      const { ok, output } = runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('server.json description');
      expect(output).toContain('999');
    });
  });

  it('inject writes the canonical tools[] array into server.json', async () => {
    await withInjectSnapshot(async () => {
      await runInject();
      const server = JSON.parse(readFileSync(box(SERVER_JSON), 'utf-8')) as { tools: string[] };
      expect(server.tools.length).toBeGreaterThanOrEqual(30);
      expect(server.tools).toContain('survey_oss_landscape');
      expect(server.tools).toContain('supply_chain_tradeoff_panel');
    });
  });
});

// ============================================================================
// Ancillary count surfaces auto-sync (#2295 follow-up)
// ============================================================================

describe('inject-governance ancillary count surfaces (#2295 follow-up)', () => {
  const SITE_DATA = 'website/src/data/site-data.ts';
  const COMPONENTS_DOC = 'docs/design/components.md';
  const README_FILE = 'README.md';

  it('syncs MCP_TOOL_COUNT in website/src/data/site-data.ts', async () => {
    await withInjectSnapshot(async () => {
      await runInject();
      const content = readFileSync(box(SITE_DATA), 'utf-8');
      const match = /MCP_TOOL_COUNT\s*=\s*(\d+)/.exec(content);
      expect(match).not.toBeNull();
      expect(parseInt(match![1]!, 10)).toBeGreaterThanOrEqual(30);
    });
  });

  it('syncs the three "N tool" mentions in docs/design/components.md', async () => {
    await withInjectSnapshot(async () => {
      await runInject();
      const content = readFileSync(box(COMPONENTS_DOC), 'utf-8');
      expect(content).toMatch(/MCP server, \d+ tool handlers, gateway/);
      expect(content).toMatch(/against \d+ registered tools and \d+ expert roles/);
      expect(content).toMatch(/`registerTools\(\)` — \d+ tools total/);
    });
  });

  it('syncs README.md count mentions', async () => {
    await withInjectSnapshot(async () => {
      await runInject();
      const content = readFileSync(box(README_FILE), 'utf-8');
      expect(content).toMatch(/│\s+\d+ MCP tools · multi-stage CompositeRouter/);
      expect(content).toMatch(/\*\*\d+ MCP Tools\*\*/);
    });
  });

  it('all ancillary surfaces report the SAME tool count after inject', async () => {
    await withInjectSnapshot(async () => {
      await runInject();
      const siteCount = parseInt(
        /MCP_TOOL_COUNT\s*=\s*(\d+)/.exec(readFileSync(box(SITE_DATA), 'utf-8'))?.[1] ?? '0',
        10
      );
      const componentsCount = parseInt(
        /MCP server, (\d+) tool handlers/.exec(readFileSync(box(COMPONENTS_DOC), 'utf-8'))?.[1] ??
          '0',
        10
      );
      const readmeArchCount = parseInt(
        /│\s+(\d+) MCP tools · multi-stage CompositeRouter/.exec(
          readFileSync(box(README_FILE), 'utf-8')
        )?.[1] ?? '0',
        10
      );
      expect(siteCount).toBeGreaterThan(0);
      expect(siteCount).toBe(componentsCount);
      expect(siteCount).toBe(readmeArchCount);
    });
  });
});

// ============================================================================
// ENTRYPOINTS.md MCP-tool enumerations (#3334)
// ============================================================================

describe('inject-governance ENTRYPOINTS tool enumerations (#3334)', () => {
  const ENTRYPOINTS = 'docs/ENTRYPOINTS.md';

  /** Extract the two enumeration surfaces from the sandbox ENTRYPOINTS.md. */
  function readSurfaces(): { prose: string; yaml: string } {
    const content = readFileSync(box(ENTRYPOINTS), 'utf-8');
    const proseStart = content.indexOf('<!-- GOVERNANCE:ENTRYPOINTS_TOOLS:START -->');
    const proseEnd = content.indexOf('<!-- GOVERNANCE:ENTRYPOINTS_TOOLS:END -->');
    const yamlStart = content.indexOf('<!-- BEGIN:MCP_TOOLS -->');
    const yamlEnd = content.indexOf('<!-- END:MCP_TOOLS -->');
    return {
      prose: content.slice(proseStart, proseEnd),
      yaml: content.slice(yamlStart, yamlEnd),
    };
  }

  /** Registered tool names from the sandbox TOOL_MANIFEST (source of truth, #3566). */
  function registeredTools(): string[] {
    const src = readFileSync(box('packages/nexus-agents/src/mcp/tools/tool-manifest.ts'), 'utf-8');
    const names = parseRegisteredToolNames(src);
    expect(names.length).toBeGreaterThan(0);
    return names;
  }

  it('passes check on the current ENTRYPOINTS.md (no drift)', () => {
    const { ok, output } = runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('ENTRYPOINTS.md MCP tool enumerations are stale');
  });

  it('renders every registered tool exactly once in BOTH surfaces', async () => {
    await withInjectSnapshot(async () => {
      await runInject();
      const { prose, yaml } = readSurfaces();
      const tools = registeredTools();
      expect(tools.length).toBeGreaterThanOrEqual(30);
      const proseRows = prose
        .split('\n')
        .map((line) => /^\| `([^`]+)` /.exec(line)?.[1])
        .filter((n): n is string => n !== undefined);
      for (const name of tools) {
        const proseHits = proseRows.filter((n) => n === name).length;
        expect(proseHits, `prose cell for ${name}`).toBe(1);
        const yamlHits = yaml.split(`- name: ${name}\n`).length - 1;
        expect(yamlHits, `yaml entry for ${name}`).toBe(1);
      }
      const footer = /(\d+) tools\._/.exec(prose);
      expect(footer).not.toBeNull();
      expect(parseInt(footer![1]!, 10)).toBe(tools.length);
    });
  });

  it('check fails when an ENTRYPOINTS enumeration drifts', () => {
    withSandboxFile(ENTRYPOINTS, (original) => {
      const broken = original.replace(/ {4}- name: orchestrate\n {6}auth: none\n/, '');
      expect(broken).not.toBe(original);
      writeFileSync(box(ENTRYPOINTS), broken);
      const { ok, output } = runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('ENTRYPOINTS.md MCP tool enumerations are stale');
    });
  });
});

// ============================================================================
// ENTRYPOINTS.md CLI command tables (#5458)
// ============================================================================

describe('inject-governance ENTRYPOINTS CLI command tables (#5458)', () => {
  const ENTRYPOINTS = 'docs/ENTRYPOINTS.md';
  const CATALOG = 'packages/nexus-agents/src/cli-command-catalog.ts';
  const CLI_START = '<!-- GOVERNANCE:ENTRYPOINTS_CLI:START -->';
  const CLI_END = '<!-- GOVERNANCE:ENTRYPOINTS_CLI:END -->';

  /** The generated CLI block from the sandbox ENTRYPOINTS.md. */
  function readCliBlock(): string {
    const content = readFileSync(box(ENTRYPOINTS), 'utf-8');
    const start = content.indexOf(CLI_START);
    const end = content.indexOf(CLI_END);
    expect(start, 'CLI block start marker').toBeGreaterThanOrEqual(0);
    expect(end, 'CLI block end marker').toBeGreaterThan(start);
    return content.slice(start, end);
  }

  /** First-cell command names of every table row in the block, in order. */
  function rowCommands(block: string): string[] {
    return block
      .split('\n')
      .map((line) => /^\| `([^`]+)` /.exec(line)?.[1])
      .filter((n): n is string => n !== undefined);
  }

  it('renders every catalog command exactly once, grouped by audience', async () => {
    await withInjectSnapshot(async () => {
      await runInject();
      const block = readCliBlock();
      const catalog = parseCommandCatalog(readFileSync(box(CATALOG), 'utf-8'));
      expect(catalog.length).toBeGreaterThan(40);
      const rows = rowCommands(block);
      expect(rows.length).toBe(catalog.length);
      for (const entry of catalog) {
        expect(rows.filter((n) => n === entry.command).length, `row for ${entry.command}`).toBe(1);
      }
      // One `###` heading per audience band, in --help order.
      const headings = block.split('\n').filter((l) => l.startsWith('### '));
      expect(headings.length).toBe(4);
      expect(headings[0]).toContain('Essential');
      expect(headings[3]).toContain('Internal');
      const footer = /(\d+) commands\._/.exec(block);
      expect(footer).not.toBeNull();
      expect(parseInt(footer![1]!, 10)).toBe(catalog.length);
    });
  });

  it('check fails when a CLI command row is removed', () => {
    withSandboxFile(ENTRYPOINTS, (original) => {
      const broken = original.replace(/^\| `orchestrate` +\|[^\n]*\n/m, '');
      expect(broken).not.toBe(original);
      writeFileSync(box(ENTRYPOINTS), broken);
      const { ok, output } = runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('ENTRYPOINTS.md CLI command tables are stale');
    });
  });

  it('escapes pipes and backslashes in a description so the table stays valid', async () => {
    await withInjectSnapshot(async () => {
      // Plant an entry whose description carries both characters that can
      // break a markdown table cell; restore the catalog by hand afterwards
      // (withSandboxFile is synchronous and inject is not).
      const pristine = readFileSync(box(CATALOG), 'utf-8');
      const planted =
        "  {\n    command: 'pipe-probe',\n    description: 'Reads a | b, then C:\\\\path <repo>; second sentence.',\n    audience: 'internal',\n  },\n];";
      const mutated = pristine.replace(/\n\];/, `\n${planted}`);
      expect(mutated).not.toBe(pristine);
      try {
        writeFileSync(box(CATALOG), mutated);
        await runInject();
        const block = readCliBlock();
        const row = block.split('\n').find((l) => l.startsWith('| `pipe-probe`'));
        expect(row).toBeDefined();
        // Two columns → exactly three unescaped pipes; the description's own
        // pipe survives as `\|` and the backslash as `\\`.
        expect(row!.split(/(?<!\\)\|/).length - 1).toBe(3);
        expect(row).toContain('a \\| b');
        expect(row).toContain('C:\\\\path');
        // A bare placeholder is inline HTML to markdownlint (MD033).
        expect(row).toContain('\\<repo>');
      } finally {
        writeFileSync(box(CATALOG), pristine);
      }
    });
  });
});
