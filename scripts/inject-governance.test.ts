/**
 * Integration tests for the Governance Injection Script.
 *
 * #3954: these tests previously spawned ~30 `pnpm exec tsx scripts/inject-governance.ts`
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
 *     IN-PROCESS (no `pnpm exec tsx` cold starts). Console output is captured to assert
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
import * as prettier from 'prettier';
import { parseRegisteredToolNames } from './parse-tool-manifest.js';
import { GOVERNANCE_STAMP_PATTERN } from './governance-stamp-exemption.js';
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
  checkGovernance: () => Promise<boolean>;
  injectGovernance: () => Promise<void>;
  GOVERNANCE_STAMP_SOURCES: readonly string[];
  withOnDiskBlock: (regenerated: string, expected: string, onDisk: string) => string | undefined;
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
async function runCheck(): Promise<{ ok: boolean; output: string }> {
  const lines: string[] = [];
  const push = (...a: unknown[]): void => void lines.push(a.map(String).join(' '));
  const log = vi.spyOn(console, 'log').mockImplementation(push);
  const err = vi.spyOn(console, 'error').mockImplementation(push);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  let ok = false;
  try {
    ok = await core.checkGovernance();
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
async function withSandboxFile(
  rel: string,
  body: (original: string) => void | Promise<void>
): Promise<void> {
  const path = box(rel);
  const original = readFileSync(path, 'utf-8');
  try {
    await body(original);
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

describe('governance stamp source set (#5491)', () => {
  it('does not include the model registry — model data is not governance content', () => {
    // in-tree-data.ts was a stamp source, so a pricing sync or a dead-slug
    // repoint moved the stamp, forced the regenerated line to be committed into
    // AGENTS.md/CLAUDE.md, and pushed a routine data PR through the governor
    // ratification gate. Panel #5491 chose to drop it (option b, 4/6).
    expect(core.GOVERNANCE_STAMP_SOURCES.some((p) => p.endsWith('config/in-tree-data.ts'))).toBe(
      false
    );
  });

  it('still derives the stamp from the governance-content sources', () => {
    const tails = core.GOVERNANCE_STAMP_SOURCES.map((p) => p.split('/').slice(-2).join('/'));
    expect(tails).toContain('tools/index.ts');
    expect(tails).toContain('experts/expert-config.ts');
    expect(tails).toContain('workflows/template-types.ts');
    expect(core.GOVERNANCE_STAMP_SOURCES.length).toBeGreaterThanOrEqual(4);
  });
});

describe('inject-governance check', () => {
  it('passes on the sandbox CLAUDE.md', async () => {
    const { ok, output } = await runCheck();
    expect(ok).toBe(true);
    expect(output).toContain('Governance check passed');
    expect(output).toContain('MCP Tools:');
    expect(output).toContain('Expert Types:');
    expect(output).toContain('Workflow Templates:');
    expect(output).toContain('Skills:');
  });

  it('reports correct tool count', async () => {
    const { output } = await runCheck();
    const match = /MCP Tools:\s*(\d+)/.exec(output);
    expect(match).not.toBeNull();
    expect(parseInt(match![1]!, 10)).toBeGreaterThanOrEqual(15);
  });

  it('reports correct expert count', async () => {
    const { output } = await runCheck();
    const match = /Expert Types:\s*(\d+)/.exec(output);
    expect(match).not.toBeNull();
    expect(parseInt(match![1]!, 10)).toBeGreaterThanOrEqual(7);
  });

  it('reports correct workflow count', async () => {
    const { output } = await runCheck();
    const match = /Workflow Templates:\s*(\d+)/.exec(output);
    expect(match).not.toBeNull();
    expect(parseInt(match![1]!, 10)).toBeGreaterThanOrEqual(9);
  });

  it('reports correct skill count', async () => {
    const { output } = await runCheck();
    const match = /Skills:\s*(\d+)/.exec(output);
    expect(match).not.toBeNull();
    expect(parseInt(match![1]!, 10)).toBeGreaterThanOrEqual(12);
  });

  it('reports agent count from agents/*.md', async () => {
    const { output } = await runCheck();
    const match = /Agents:\s*(\d+)/.exec(output);
    expect(match).not.toBeNull();
    expect(parseInt(match![1]!, 10)).toBeGreaterThanOrEqual(5);
  });

  it('ancillary count probes pass for plugin manifests + install doc', async () => {
    const { ok, output } = await runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('pattern not found');
    expect(output).toContain('Governance check passed');
  });

  // #5882: a missing probe target used to `return true` with no output, so
  // "the file was read and agreed" was indistinguishable from "the file is
  // gone and nothing was checked". It was the ONLY silent outcome — a present
  // file whose pattern had drifted printed and failed. PLUGIN_INSTALL.md alone
  // carries 6 probes and lives under docs/getting-started/, which this repo
  // reorganises routinely.
  it('fails loudly when a probe target is missing', async () => {
    const target = box('docs/getting-started/PLUGIN_INSTALL.md');
    const saved = readFileSync(target, 'utf-8');
    rmSync(target);
    try {
      const { ok, output } = await runCheck();

      expect(ok).toBe(false);
      expect(output).toContain('probe not run');
      expect(output).toContain('PLUGIN_INSTALL.md does not exist');
      // Not `.every()`: every affected probe is reported, not just the first,
      // so one CI log shows the whole blast radius.
      expect(output.match(/probe not run/g)?.length).toBeGreaterThan(1);
      expect(output).not.toContain('Governance check passed');
    } finally {
      writeFileSync(target, saved);
    }
  });

  it('fails loudly when a plugin manifest is missing', async () => {
    // `checkPluginVersion` had the identical shape and the identical silence.
    const target = box('.claude-plugin/plugin.json');
    const saved = readFileSync(target, 'utf-8');
    rmSync(target);
    try {
      const { ok, output } = await runCheck();

      expect(ok).toBe(false);
      expect(output).toContain('Plugin version check: missing');
      expect(output).toContain('check not run');
    } finally {
      writeFileSync(target, saved);
    }
  });

  it('reports how many probes ran on a healthy tree', async () => {
    // The pair, and the reason the count is printed at all: a future tolerant
    // branch cannot hide behind the green summary if the number drops.
    const { ok, output } = await runCheck();

    expect(ok).toBe(true);
    const match = /Count-drift probes run:\s*(\d+)/.exec(output);
    expect(match).not.toBeNull();
    expect(parseInt(match![1]!, 10)).toBeGreaterThanOrEqual(10);
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
        /_Governance Version: ([0-9a-f]{12})_/.exec(readFileSync(box(file), 'utf-8'))?.[1];

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
        /_Governance Version: [0-9a-f]{12}_/,
        '_Governance Version: 000000000000_'
      );
      writeFileSync(agentsPath, stale);

      await runInject();
      const { ok } = await runCheck();
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
      expect(/Governance Version:\s*([0-9a-f]{12})/.exec(content)).not.toBeNull();
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
        expect((await runCheck()).ok).toBe(true);
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

      const { ok, output } = await runCheck();

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

      const { ok, output } = await runCheck();

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
      expect((await runCheck()).ok).toBe(true);
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
  it('check fails when the README tool table drifts', async () => {
    await withSandboxFile('README.md', async (original) => {
      // Drop a generated table row so the README table no longer matches the
      // registry — the gate must catch it.
      const broken = original.replace(/\| `orchestrate`[^\n]*\n/, '');
      expect(broken).not.toBe(original);
      writeFileSync(box('README.md'), broken);
      const { ok, output } = await runCheck();
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

  it('canonical paths validator passes on the current CLAUDE.md', async () => {
    const { ok, output } = await runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('Canonical Paths drift');
  });

  it('canonical paths validator fails when a row points at a missing file', async () => {
    await withSandboxFile('AGENTS.md', async (original) => {
      // #3446: the canonical-paths table is authored in AGENTS.md; AGENTS uses
      // the `src/...` shorthand for the nexus-agents package.
      const broken = original.replace(
        '`src/consensus/engine.ts`',
        '`src/consensus/THIS_FILE_DOES_NOT_EXIST.ts`'
      );
      expect(broken).not.toBe(original);
      writeFileSync(box('AGENTS.md'), broken);
      const { ok, output } = await runCheck();
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

  it('passes when RULE_PRECEDENCE.md has all four adapter sections', async () => {
    const { ok, output } = await runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('RULE_PRECEDENCE.md missing');
  });

  it('fails when an adapter section header is missing', async () => {
    await withSandboxFile(PRECEDENCE_DOC, async (original) => {
      // Exact-line matching in the validator means `## OpenCodeXXX` still trips
      // the gate even though `includes('## OpenCode')` would have passed.
      const broken = original.replace(/^## OpenCode$/m, '## OpenCodeXXX');
      expect(broken).not.toBe(original);
      writeFileSync(box(PRECEDENCE_DOC), broken);
      const { ok, output } = await runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('## OpenCode');
    });
  });

  it('fails when RULE_PRECEDENCE.md is missing entirely', async () => {
    await withSandboxFile(PRECEDENCE_DOC, async () => {
      rmSync(box(PRECEDENCE_DOC));
      const { ok, output } = await runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('Missing docs/guides/RULE_PRECEDENCE.md');
    });
  });
});

// ============================================================================
// Rules-index generator + drift gate (#2657)
// ============================================================================

describe('inject-governance rules-index (#2657)', () => {
  it('passes when the AGENTS.md Rules index matches .rules/*.md frontmatter', async () => {
    const { ok, output } = await runCheck();
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

  it('fails when the AGENTS.md Rules index drifts from frontmatter', async () => {
    await withSandboxFile('AGENTS.md', async (original) => {
      const broken = original.replace(/\| \[`\.rules\/typescript\.md`\][^\n]*\n/, '');
      expect(broken).not.toBe(original);
      writeFileSync(box('AGENTS.md'), broken);
      const { ok, output } = await runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('AGENTS.md Rules index is stale');
    });
  });
});

// ============================================================================
// CLAUDE.md generated-from-AGENTS block + drift gate (#3446, Phase 2+3)
// ============================================================================

describe('inject-governance claude-from-agents (#3446)', () => {
  it('passes when the CLAUDE.md generated block matches AGENTS.md AGNOSTIC:BODY', async () => {
    const { ok, output } = await runCheck();
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

  it('fails when the CLAUDE.md generated block is hand-edited (drifts from AGENTS.md)', async () => {
    await withSandboxFile('CLAUDE.md', async (original) => {
      const broken = original.replace('## Prime directive', '## Prime directive (hand-edited)');
      expect(broken).not.toBe(original);
      writeFileSync(box('CLAUDE.md'), broken);
      const { ok, output } = await runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('GENERATED:FROM_AGENTS block is stale');
    });
  });

  it('fails when AGENTS.md AGNOSTIC:BODY is edited without re-running inject', async () => {
    await withSandboxFile('AGENTS.md', async (original) => {
      const broken = original.replace(
        'Clever code is maintenance debt.',
        'Clever code is maintenance debt. (edited but not injected)'
      );
      expect(broken).not.toBe(original);
      writeFileSync(box('AGENTS.md'), broken);
      const { ok, output } = await runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('GENERATED:FROM_AGENTS block is stale');
    });
  });

  it('fails LOUD on reordered AGNOSTIC:BODY markers instead of silently erasing the body', async () => {
    await withSandboxFile('AGENTS.md', async (original) => {
      const broken = original
        .replace('<!-- AGNOSTIC:BODY:START -->', '<!-- AGNOSTIC:BODY:TMP -->')
        .replace('<!-- AGNOSTIC:BODY:END -->', '<!-- AGNOSTIC:BODY:START -->')
        .replace('<!-- AGNOSTIC:BODY:TMP -->', '<!-- AGNOSTIC:BODY:END -->');
      expect(broken).not.toBe(original);
      writeFileSync(box('AGENTS.md'), broken);
      // The generator THROWS on malformed markers rather than silently erasing
      // the body; runCheck() surfaces that throw as a failed check.
      const { ok, output } = await runCheck();
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
// Generated-block comparison is formatter-normalized (#6062)
// ============================================================================

/** The #6087 out-of-block message; the block message keeps its #3446/#6062 text. */
const OUT_OF_BLOCK = 'CLAUDE.md differs outside the generated block';
const BLOCK_STALE = 'GENERATED:FROM_AGENTS block is stale';
const COULD_NOT_FORMAT = 'governance:check: could not format';

describe('inject-governance claude-from-agents normalization (#6062)', () => {
  /** The one agnostic-body line every fixture below edits; present verbatim in both files. */
  const ANCHOR = '- **Cleverness**: Never. Clever code is maintenance debt.';

  it('check passes after inject when the AGENTS.md body has an inline code span split across lines', async () => {
    // The #6062 repro: prettier normalizes a code span that wraps at 80 columns,
    // so the block `inject` writes is legitimately NOT byte-equal to the raw
    // AGENTS.md slice. The old check compared raw-vs-formatted and failed
    // forever while telling the user to run `inject`, which was a no-op.
    await withInjectSnapshot(async () => {
      const agentsPath = box('AGENTS.md');
      const original = readFileSync(agentsPath, 'utf-8');
      const edited = original.replace(
        ANCHOR,
        `${ANCHOR} Say where the work is: \`Step 3 of 5\`, \`gates green, panel\n   pending\`. The reader should not have to scroll to find out.`
      );
      expect(edited).not.toBe(original);
      writeFileSync(agentsPath, edited);

      await runInject();
      // The edit really travelled into the generated block — the assertion below
      // is about THIS text, not about a block that silently kept the old prose.
      expect(readFileSync(box('CLAUDE.md'), 'utf-8')).toContain('`gates green, panel');

      const { ok, output } = await runCheck();
      expect(output).not.toContain('GENERATED:FROM_AGENTS block is stale');
      expect(ok).toBe(true);
    });
  });

  it('a genuinely stale block still fails, naming the CLAUDE.md line and showing both versions', async () => {
    await withSandboxFile('CLAUDE.md', async (original) => {
      const lines = original.split('\n');
      const idx = lines.indexOf(ANCHOR);
      expect(idx).toBeGreaterThan(-1);
      const edited = ANCHOR.replace('maintenance debt', 'maintenance DEBT');
      lines[idx] = edited;
      writeFileSync(box('CLAUDE.md'), lines.join('\n'));

      const { ok, output } = await runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('GENERATED:FROM_AGENTS block is stale');
      // 1-based line number of the first differing line, in the file the user opens.
      expect(output).toContain(`CLAUDE.md:${String(idx + 1)}`);
      expect(output).toContain(`expected: ${ANCHOR}`);
      expect(output).toContain(`on disk:  ${edited}`);
      // Inject WOULD rewrite this block, so prescribing it is correct here.
      expect(output).toContain('pnpm governance:inject');
    });
  });

  it('blank-line padding of the AGENTS.md slice does not produce a false failure', async () => {
    // The issue names the slice's `\ No newline at end of file` mismatch as the
    // other formatter-sensitive edge. Pad the AGENTS.md slice with blank lines
    // before the END marker — not agnostic-body drift, so the block comparison
    // must stay clean. (A stripped CLAUDE.md end-of-file newline used to be the
    // other half of this test; since #6087 that IS drift — outside the block —
    // because CI's idempotency step fails on it. See the #6087 suite below.)
    await withInjectSnapshot(async () => {
      const agentsPath = box('AGENTS.md');
      const padded = readFileSync(agentsPath, 'utf-8').replace(
        '\n<!-- AGNOSTIC:BODY:END -->',
        '\n\n\n<!-- AGNOSTIC:BODY:END -->'
      );
      expect(padded).toContain('\n\n\n<!-- AGNOSTIC:BODY:END -->');
      writeFileSync(agentsPath, padded);
      await runInject();
      expect(readFileSync(box('CLAUDE.md'), 'utf-8').endsWith('\n')).toBe(true);

      const { ok, output } = await runCheck();
      expect(output).not.toContain('GENERATED:FROM_AGENTS block is stale');
      expect(output).not.toContain(OUT_OF_BLOCK);
      expect(ok).toBe(true);
    });
  });
});

// ============================================================================
// Whole-file parity with CI's idempotency step + actionable formatter errors (#6087)
// ============================================================================

describe('inject-governance whole-file parity + formatter errors (#6087)', () => {
  const ANCHOR = '- **Cleverness**: Never. Clever code is maintenance debt.';
  /** Prettier rewrites `*x*` emphasis to `_x_`, so this line is out-of-block drift. */
  const STAR_EMPHASIS = '*Prettier rewrites this emphasis to underscores.*';

  /** CLAUDE.md with the ANCHOR line inside the generated block edited. */
  function withStaleBlock(original: string): { edited: string; line: number } {
    const lines = original.split('\n');
    const idx = lines.indexOf(ANCHOR);
    expect(idx).toBeGreaterThan(-1);
    lines[idx] = ANCHOR.replace('maintenance debt', 'maintenance DEBT');
    return { edited: lines.join('\n'), line: idx + 1 };
  }

  it('(a) a stripped end-of-file newline is out-of-block drift: named by line, block message absent', async () => {
    await withSandboxFile('CLAUDE.md', async (original) => {
      // CI runs `inject` then `git diff --exit-code CLAUDE.md`; prettier puts the
      // newline back, so this file fails CI. Local check must agree.
      expect(original.endsWith('\n')).toBe(true);
      writeFileSync(box('CLAUDE.md'), original.replace(/\n$/, ''));

      const { ok, output } = await runCheck();
      expect(ok).toBe(false);
      expect(output).toContain(OUT_OF_BLOCK);
      // The difference is where the newline was: one past the last on-disk line.
      expect(output).toContain(`CLAUDE.md:${String(original.split('\n').length)}`);
      expect(output).toContain('on disk:  <end of file>');
      expect(output).toContain('pnpm governance:inject');
      expect(output).not.toContain(BLOCK_STALE);
    });
  });

  it('(a) prose outside the markers that prettier reshapes is out-of-block drift at its own line', async () => {
    await withSandboxFile('CLAUDE.md', async (original) => {
      const lines = original.split('\n');
      // After the H1 (line 9, below the front matter) and its blank line, so the
      // inserted paragraph stands alone at line 11.
      expect(lines[8]).toBe('# Nexus Agents - Claude Code Instructions');
      expect(lines[9]).toBe('');
      lines.splice(10, 0, STAR_EMPHASIS, '');
      writeFileSync(box('CLAUDE.md'), lines.join('\n'));

      const { ok, output } = await runCheck();
      expect(ok).toBe(false);
      expect(output).toContain(`${OUT_OF_BLOCK} — first difference at CLAUDE.md:11`);
      expect(output).toContain(`expected: ${STAR_EMPHASIS.replace(/\*/g, '_')}`);
      expect(output).toContain(`on disk:  ${STAR_EMPHASIS}`);
      expect(output).not.toContain(BLOCK_STALE);
    });
  });

  it('(b) block drift alone prints the block message and NOT the out-of-block message', async () => {
    // The regeneration replaces only the block; the rest of the on-disk file is
    // already formatter-clean, so substituting the on-disk block back into the
    // regeneration reproduces the file byte-for-byte — no out-of-block cause.
    await withSandboxFile('CLAUDE.md', async (original) => {
      const { edited, line } = withStaleBlock(original);
      writeFileSync(box('CLAUDE.md'), edited);

      const { ok, output } = await runCheck();
      expect(ok).toBe(false);
      expect(output).toContain(
        `${BLOCK_STALE} (#3446) — first difference at CLAUDE.md:${String(line)}`
      );
      expect(output).not.toContain(OUT_OF_BLOCK);
    });
  });

  it('(c) block drift AND out-of-block drift are both reported, each by its own message', async () => {
    await withSandboxFile('CLAUDE.md', async (original) => {
      const { edited, line } = withStaleBlock(original);
      expect(edited.endsWith('\n')).toBe(true);
      writeFileSync(box('CLAUDE.md'), edited.replace(/\n$/, ''));

      const { ok, output } = await runCheck();
      expect(ok).toBe(false);
      expect(output).toContain(
        `${BLOCK_STALE} (#3446) — first difference at CLAUDE.md:${String(line)}`
      );
      expect(output).toContain(
        `${OUT_OF_BLOCK} — first difference at CLAUDE.md:${String(edited.split('\n').length)}`
      );
    });
  });

  it('(d) a prettier failure is an actionable message and a failed check, not an unhandled rejection', async () => {
    // A malformed .prettierrc makes `resolveConfig` reject inside
    // `formatWithPrettier` — a real formatter error, not a stub. Prettier caches
    // resolved config per path, so the cache is cleared on both sides.
    await withSandboxFile('.prettierrc', async () => {
      writeFileSync(box('.prettierrc'), '{ "semi": true,');
      await prettier.clearConfigCache();
      try {
        const { ok, output } = await runCheck();
        expect(ok).toBe(false);
        expect(output).toContain(`${COULD_NOT_FORMAT} ${box('CLAUDE.md')}: `);
        // The prettier message travels with it, naming the offending config file.
        expect(output).toContain('.prettierrc');
      } finally {
        await prettier.clearConfigCache();
      }
    });
  });

  it('(e) withOnDiskBlock refuses to splice a block that is not in its own regeneration', () => {
    // The caller derives `expected` from `regenerated`, so this cannot happen
    // today; the guard is for a future change that computes it differently.
    // Unguarded, indexOf(-1) splices at -1 and yields a nonsensical diff — the
    // splice below would return 'nspliced' rather than a refusal.
    expect(core.withOnDiskBlock('before block after', 'block', 'BLOCK')).toBe('before BLOCK after');
    expect(core.withOnDiskBlock('unspliced', 'absent', 'BLOCK')).toBeUndefined();
  });
});

// ============================================================================
// Tool-annotations validator (#2648)
// ============================================================================

describe('inject-governance tool-annotations (#2648)', () => {
  const MANIFEST = 'packages/nexus-agents/src/mcp/tools/tool-manifest.ts';

  it('passes when every registered tool has an entry in TOOL_ANNOTATIONS', async () => {
    const { ok, output } = await runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('Registered tools missing annotations');
  });

  it('fails when a registered tool is missing its manifest annotations block', async () => {
    await withSandboxFile(MANIFEST, async (original) => {
      const broken = original.replace(
        /(name: 'weather_report',\s*)annotations:\s*\{[\s\S]*?\},\s*/m,
        '$1'
      );
      expect(broken).not.toBe(original);
      writeFileSync(box(MANIFEST), broken);
      const { ok, output } = await runCheck();
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

  it('passes when no tool file has a raw `isError: true` literal', async () => {
    const { ok, output } = await runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('raw `isError: true` literal');
  });

  it('fails when a tool file builds a raw `isError: true` literal', async () => {
    await withSandboxFile(TOOL, async (original) => {
      // String-pattern replace already targets only the first occurrence.
      const broken = original.replace(
        'export ',
        'const _raw = { isError: true, content: [] };\nexport '
      );
      expect(broken).not.toBe(original);
      writeFileSync(box(TOOL), broken);
      const { ok, output } = await runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('raw `isError: true` literal');
      expect(output).toContain('memory-stats.ts');
    });
  });

  // #5062: the gate matches the AST, not the text, so a doc comment or a
  // string that NAMES the convention is not an offender. The old regex
  // flagged both of these.
  it('passes when `isError: true` appears only in a comment and a string literal (#5062)', async () => {
    await withSandboxFile(TOOL, async (original) => {
      const mentioned = original.replace(
        'export ',
        '/** Errors return `{ isError: true }` from toolStructuredError. */\n' +
          "const _doc = 'shape: { isError: true }';\n" +
          'export '
      );
      expect(mentioned).not.toBe(original);
      writeFileSync(box(TOOL), mentioned);
      const { ok, output } = await runCheck();
      expect(ok).toBe(true);
      expect(output).not.toContain('raw `isError: true` literal');
    });
  });

  // #5062: the old `[{,]\s*` anchor could not see past a comment line, so a
  // property that follows one inside a multi-line literal slipped through.
  it('fails when `isError: true` follows a comment line inside a multi-line object (#5062)', async () => {
    await withSandboxFile(TOOL, async (original) => {
      const broken = original.replace(
        'export ',
        'const _raw = {\n  // deliberately raw\n  isError: true,\n  content: [],\n};\nexport '
      );
      expect(broken).not.toBe(original);
      writeFileSync(box(TOOL), broken);
      const { ok, output } = await runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('raw `isError: true` literal');
      expect(output).toContain('memory-stats.ts');
    });
  });

  it('fails on `isError: true as const` (#5062)', async () => {
    await withSandboxFile(TOOL, async (original) => {
      const broken = original.replace(
        'export ',
        'const _raw = { isError: true as const, content: [] };\nexport '
      );
      expect(broken).not.toBe(original);
      writeFileSync(box(TOOL), broken);
      const { ok, output } = await runCheck();
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

  it('passes when every flagged tool pair is in the baseline', async () => {
    const { ok, output } = await runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('distinctness');
  });

  it('fails when a flagged pair is dropped from the baseline', async () => {
    await withSandboxFile(BASELINE, async (original) => {
      const parsed = JSON.parse(original) as { pairs: unknown[] };
      const dropped = { ...parsed, pairs: parsed.pairs.slice(1) };
      writeFileSync(box(BASELINE), JSON.stringify(dropped, null, 2) + '\n');
      const { ok, output } = await runCheck();
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

  it('passes when every non-read-only tool has a prerequisite decision', async () => {
    const { ok, output } = await runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('no prerequisite decision');
  });

  it('fails when a non-read-only tool is dropped from both prerequisite maps', async () => {
    await withSandboxFile(PREREQ, async (original) => {
      // `orchestrate` executes tasks (never read-only), so dropping its
      // NO_PREREQUISITE entry must trip the gate (#3444).
      const broken = original.replace(/^ {2}orchestrate:[\s\S]*?',\n/m, '');
      expect(broken).not.toBe(original);
      writeFileSync(box(PREREQ), broken);
      const { ok, output } = await runCheck();
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

  it('passes when no tool output types a timestamp as a bare number', async () => {
    const { ok, output } = await runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('timestamp-named field');
  });

  it('fails when a tool output schema types a timestamp field as a number', async () => {
    await withSandboxFile(TOOL, async (original) => {
      const broken = original.replace(
        'const outputSchema = {',
        'const outputSchema = {\n    createdAt: z.number(),'
      );
      expect(broken).not.toBe(original);
      writeFileSync(box(TOOL), broken);
      const { ok, output } = await runCheck();
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
  it('passes when every .rules/*.md has paths + description frontmatter', async () => {
    const { ok, output } = await runCheck();
    expect(ok).toBe(true);
    expect(output).not.toContain('frontmatter drift');
  });

  it('fails when a rule file loses its frontmatter delimiter', async () => {
    await withSandboxFile('.rules/typescript.md', async (original) => {
      const stripped = original.replace(/^---\n[\s\S]*?\n---\n/, '');
      expect(stripped).not.toBe(original);
      writeFileSync(box('.rules/typescript.md'), stripped);
      const { ok, output } = await runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('frontmatter drift');
      expect(output).toContain('typescript.md');
    });
  });

  it('fails when a rule file is missing its description field', async () => {
    await withSandboxFile('.rules/security.md', async (original) => {
      const stripped = original.replace(/^description:.*\n/m, '');
      expect(stripped).not.toBe(original);
      writeFileSync(box('.rules/security.md'), stripped);
      const { ok, output } = await runCheck();
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

  it('check command fails when server.json version drifts', async () => {
    await withSandboxFile(SERVER_JSON, async (original) => {
      const broken = original.replace(/"version": "[^"]+"/, '"version": "0.0.0-broken"');
      expect(broken).not.toBe(original);
      writeFileSync(box(SERVER_JSON), broken);
      const { ok, output } = await runCheck();
      expect(ok).toBe(false);
      expect(output).toContain('server.json version');
      expect(output).toContain('0.0.0-broken');
    });
  });

  it('check command fails when server.json description tool count drifts', async () => {
    await withSandboxFile(SERVER_JSON, async (original) => {
      const broken = original.replace(/(\d+) MCP tools/, '999 MCP tools');
      expect(broken).not.toBe(original);
      writeFileSync(box(SERVER_JSON), broken);
      const { ok, output } = await runCheck();
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

  it('passes check on the current ENTRYPOINTS.md (no drift)', async () => {
    const { ok, output } = await runCheck();
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

  it('check fails when an ENTRYPOINTS enumeration drifts', async () => {
    await withSandboxFile(ENTRYPOINTS, async (original) => {
      const broken = original.replace(/ {4}- name: orchestrate\n {6}auth: none\n/, '');
      expect(broken).not.toBe(original);
      writeFileSync(box(ENTRYPOINTS), broken);
      const { ok, output } = await runCheck();
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

  it('check fails when a CLI command row is removed', async () => {
    await withSandboxFile(ENTRYPOINTS, async (original) => {
      const broken = original.replace(/^\| `orchestrate` +\|[^\n]*\n/m, '');
      expect(broken).not.toBe(original);
      writeFileSync(box(ENTRYPOINTS), broken);
      const { ok, output } = await runCheck();
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

// ============================================================================
// The stamp is a content digest, not a date (#5943)
// ============================================================================

describe('governance stamp derivation (#5943)', () => {
  // It used to be `git log -1 --format=%cs` over the four stamp sources — the
  // committer date, which GitHub's squash button rewrites to the merge moment.
  // A PR stamped on day 1 and merged on day 2 left main with a stamp the
  // injector would no longer compute, and the NEXT unrelated PR went red on
  // docs-check's `inject` + `git diff --exit-code` step. Ratified 6-1 to
  // replace it with a digest of the sources' content.

  it('renders a line the ONE shared pattern matches', async () => {
    // The architect's condition on the ratification: renderer, AGENTS.md sync
    // and #5983's exemption predicate must all agree, and that is only
    // checkable if there is one definition. This is the check that they do.
    await withInjectSnapshot(async () => {
      await runInject();
      for (const file of ['CLAUDE.md', 'AGENTS.md']) {
        const line = readFileSync(box(file), 'utf-8')
          .split('\n')
          .find((l) => l.startsWith('_Governance Version:'));
        expect(line, `${file} has no stamp line`).toBeDefined();
        expect(GOVERNANCE_STAMP_PATTERN.test(line ?? '')).toBe(true);
      }
    });
  });

  it('is byte-identical across two runs', async () => {
    // Idempotency, which is what #5943 broke.
    await withInjectSnapshot(async () => {
      await runInject();
      const first = readFileSync(box('CLAUDE.md'), 'utf-8');
      await runInject();
      expect(readFileSync(box('CLAUDE.md'), 'utf-8')).toBe(first);
    });
  });

  it('is identical in a sandbox at a different absolute path', async () => {
    // The failure this change shipped on its own first CI run: the digest
    // hashed the ABSOLUTE source paths, so it was `/home/william/...` locally
    // and `/home/runner/...` in CI and the two disagreed. The sandbox lives at
    // a different absolute path than the repo, so identical content must still
    // produce an identical stamp. `extract-api-surface.ts` documents the same
    // failure — "a gate that always fails gets switched off".
    const stampIn = (root: string): string | undefined =>
      readFileSync(join(root, 'CLAUDE.md'), 'utf-8')
        .split('\n')
        .find((l) => l.startsWith('_Governance Version:'));

    await withInjectSnapshot(async () => {
      await runInject();
      expect(SANDBOX).not.toBe(REAL_ROOT);
      expect(stampIn(SANDBOX)).toBe(stampIn(REAL_ROOT));
    });
  });

  it('changes when a stamp source changes, and only then', async () => {
    // The behavioural statement of "derived from content". Deliberately does
    // NOT recompute the sha256 in the test: writing the algorithm twice means
    // a bug in both cancels, and the assertion would pass for the wrong reason.
    await withInjectSnapshot(async () => {
      await runInject();
      const stampOf = (): string | undefined =>
        readFileSync(box('CLAUDE.md'), 'utf-8')
          .split('\n')
          .find((l) => l.startsWith('_Governance Version:'));

      const before = stampOf();
      expect(before).toBeDefined();

      // Touching a NON-source leaves it alone.
      writeFileSync(box('README.md'), '# changed\n');
      await runInject();
      expect(stampOf()).toBe(before);

      // Touching a source moves it.
      // Already absolute, and inside the sandbox because `core` was loaded
      // from there — joining SANDBOX again would double-join.
      const source = core.GOVERNANCE_STAMP_SOURCES[0] ?? '';
      writeFileSync(source, `${readFileSync(source, 'utf-8')}\n// #5943 probe\n`);
      await runInject();
      expect(stampOf()).not.toBe(before);
    });
  });
});
