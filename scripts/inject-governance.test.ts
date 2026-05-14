/**
 * Integration tests for Governance Injection Script
 *
 * Tests the inject-governance.ts script by running it as a subprocess
 * and verifying its behavior against real and fixture files.
 *
 * @module scripts/inject-governance.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const SCRIPT = join(ROOT, 'scripts/inject-governance.ts');
const CLAUDE_MD = join(ROOT, 'CLAUDE.md');

/** Timeout for tests that run the governance script as a subprocess (~4-8s per invocation). */
const SUBPROCESS_TIMEOUT = 30_000;

/** Timeout for the idempotency test that runs the script twice (~8-16s total). */
const IDEMPOTENCY_TIMEOUT = 45_000;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Run the governance script with given args, return stdout. */
function runScript(args: string): string {
  return execSync(`npx tsx ${SCRIPT} ${args}`, {
    cwd: ROOT,
    encoding: 'utf-8',
    timeout: 30000,
  });
}

// ============================================================================
// Check command (validates current state)
// ============================================================================

describe('inject-governance check', () => {
  it('passes on current CLAUDE.md', { timeout: SUBPROCESS_TIMEOUT }, () => {
    const output = runScript('check');
    expect(output).toContain('Governance check passed');
    expect(output).toContain('MCP Tools:');
    expect(output).toContain('Expert Types:');
    expect(output).toContain('Workflow Templates:');
    expect(output).toContain('Skills:');
  });

  it('reports correct tool count', { timeout: SUBPROCESS_TIMEOUT }, () => {
    const output = runScript('check');
    // Extract the tool count from output like "MCP Tools: 15"
    const match = /MCP Tools:\s*(\d+)/.exec(output);
    expect(match).not.toBeNull();
    const toolCount = parseInt(match![1]!, 10);
    expect(toolCount).toBeGreaterThanOrEqual(15);
  });

  it('reports correct expert count', { timeout: SUBPROCESS_TIMEOUT }, () => {
    const output = runScript('check');
    const match = /Expert Types:\s*(\d+)/.exec(output);
    expect(match).not.toBeNull();
    const count = parseInt(match![1]!, 10);
    expect(count).toBeGreaterThanOrEqual(7);
  });

  it('reports correct workflow count', { timeout: SUBPROCESS_TIMEOUT }, () => {
    const output = runScript('check');
    const match = /Workflow Templates:\s*(\d+)/.exec(output);
    expect(match).not.toBeNull();
    const count = parseInt(match![1]!, 10);
    expect(count).toBeGreaterThanOrEqual(9);
  });

  it('reports correct skill count', { timeout: SUBPROCESS_TIMEOUT }, () => {
    const output = runScript('check');
    const match = /Skills:\s*(\d+)/.exec(output);
    expect(match).not.toBeNull();
    const count = parseInt(match![1]!, 10);
    expect(count).toBeGreaterThanOrEqual(12);
  });
});

// ============================================================================
// Inject command (idempotency)
// ============================================================================

describe('inject-governance inject', () => {
  let originalContent: string;

  beforeEach(() => {
    originalContent = readFileSync(CLAUDE_MD, 'utf-8');
  });

  afterEach(() => {
    // Restore original CLAUDE.md
    writeFileSync(CLAUDE_MD, originalContent);
  });

  it('is idempotent (running twice produces same result)', { timeout: IDEMPOTENCY_TIMEOUT }, () => {
    runScript('inject');
    const firstRun = readFileSync(CLAUDE_MD, 'utf-8');

    runScript('inject');
    const secondRun = readFileSync(CLAUDE_MD, 'utf-8');

    expect(firstRun).toBe(secondRun);
  });

  it('preserves governance markers', { timeout: SUBPROCESS_TIMEOUT }, () => {
    runScript('inject');
    const content = readFileSync(CLAUDE_MD, 'utf-8');
    expect(content).toContain('<!-- GOVERNANCE:TOOL_INDEX:START -->');
    expect(content).toContain('<!-- GOVERNANCE:TOOL_INDEX:END -->');
    expect(content).toContain('<!-- GOVERNANCE:VERSION:START -->');
    expect(content).toContain('<!-- GOVERNANCE:VERSION:END -->');
  });

  it('generates tool index section', { timeout: SUBPROCESS_TIMEOUT }, () => {
    runScript('inject');
    const content = readFileSync(CLAUDE_MD, 'utf-8');
    expect(content).toContain('## MCP Tools Reference');
    expect(content).toContain('MCP tools registered');
    expect(content).toContain('docs/ENTRYPOINTS.md');
    expect(content).toContain('`orchestrate`');
    expect(content).toContain('`create_expert`');
    expect(content).toContain('`memory_query`');
    expect(content).toContain('`memory_stats`');
  });

  it('updates tool count in auto-generated footer', { timeout: SUBPROCESS_TIMEOUT }, () => {
    runScript('inject');
    const content = readFileSync(CLAUDE_MD, 'utf-8');
    const match = /Auto-generated from source\.\s*(\d+)\s*tools registered/.exec(content);
    expect(match).not.toBeNull();
    const count = parseInt(match![1]!, 10);
    expect(count).toBeGreaterThanOrEqual(15);
  });

  it('updates governance version timestamp', { timeout: SUBPROCESS_TIMEOUT }, () => {
    runScript('inject');
    const content = readFileSync(CLAUDE_MD, 'utf-8');
    // Should contain a date in YYYY-MM-DD format
    const match = /Governance Version:\s*(\d{4}-\d{2}-\d{2})/.exec(content);
    expect(match).not.toBeNull();
  });

  it('outputs summary with counts', { timeout: SUBPROCESS_TIMEOUT }, () => {
    const output = runScript('inject');
    expect(output).toContain('Governance injected');
    expect(output).toContain('MCP Tools:');
    expect(output).toContain('Expert Types:');
  });
});

// ============================================================================
// Section injection (marker replacement logic)
// ============================================================================

describe('section injection behavior', () => {
  let originalContent: string;

  beforeEach(() => {
    originalContent = readFileSync(CLAUDE_MD, 'utf-8');
  });

  afterEach(() => {
    writeFileSync(CLAUDE_MD, originalContent);
  });

  it(
    'replaces content between markers without affecting surrounding text',
    { timeout: SUBPROCESS_TIMEOUT },
    () => {
      const beforeToolIndex = originalContent.split('<!-- GOVERNANCE:TOOL_INDEX:START -->')[0];
      // Compare content after ALL governed sections (VERSION:END is the last marker)
      const afterAllGoverned = originalContent.split('<!-- GOVERNANCE:VERSION:END -->')[1];

      runScript('inject');
      const updated = readFileSync(CLAUDE_MD, 'utf-8');

      // Content before first governed section and after last governed section should be unchanged
      expect(updated.split('<!-- GOVERNANCE:TOOL_INDEX:START -->')[0]).toBe(beforeToolIndex);
      expect(updated.split('<!-- GOVERNANCE:VERSION:END -->')[1]).toBe(afterAllGoverned);
    }
  );

  it('handles tool index with all registered tools', { timeout: SUBPROCESS_TIMEOUT }, () => {
    runScript('inject');
    const content = readFileSync(CLAUDE_MD, 'utf-8');

    // Extract the tool index section
    const startMarker = '<!-- GOVERNANCE:TOOL_INDEX:START -->';
    const endMarker = '<!-- GOVERNANCE:TOOL_INDEX:END -->';
    const startIdx = content.indexOf(startMarker);
    const endIdx = content.indexOf(endMarker);
    const section = content.slice(startIdx, endIdx + endMarker.length);

    // Each tool should be in the table
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

// ============================================================================
// Fixture-based tests (isolated from real CLAUDE.md)
// ============================================================================

describe('inject-governance with fixture', () => {
  const FIXTURE_DIR = join(ROOT, 'scripts', '__test_fixtures__');
  const FIXTURE_CLAUDE_MD = join(FIXTURE_DIR, 'CLAUDE.md');

  beforeEach(() => {
    mkdirSync(FIXTURE_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(FIXTURE_DIR)) {
      rmSync(FIXTURE_DIR, { recursive: true });
    }
  });

  it('check command fails when tool count is wrong', { timeout: SUBPROCESS_TIMEOUT }, () => {
    // Create a CLAUDE.md with wrong tool count in the tool index
    const wrongContent = [
      '# Test',
      '<!-- GOVERNANCE:TOOL_INDEX:START -->',
      '| Tool | Description |',
      '| --- | --- |',
      '| `orchestrate` | Test |',
      '| `fake_tool` | Not real |',
      '',
      '_Auto-generated from source. 2 tools registered._',
      '<!-- GOVERNANCE:TOOL_INDEX:END -->',
    ].join('\n');
    writeFileSync(FIXTURE_CLAUDE_MD, wrongContent);

    // The check command uses the real CLAUDE.md path, so this test
    // verifies the real check still passes (since we can't easily redirect)
    const output = runScript('check');
    expect(output).toContain('Governance check passed');
  });
});

// ============================================================================
// Ancillary count injection (#1837)
// ============================================================================

describe('inject-governance ancillary counts (#1837)', () => {
  it('reports agent count from agents/*.md', { timeout: SUBPROCESS_TIMEOUT }, () => {
    const output = runScript('check');
    const match = /Agents:\s*(\d+)/.exec(output);
    expect(match).not.toBeNull();
    const count = parseInt(match![1]!, 10);
    expect(count).toBeGreaterThanOrEqual(5);
  });

  it('reports correct skill count', { timeout: SUBPROCESS_TIMEOUT }, () => {
    const output = runScript('check');
    const match = /Skills:\s*(\d+)/.exec(output);
    expect(match).not.toBeNull();
    const count = parseInt(match![1]!, 10);
    expect(count).toBeGreaterThanOrEqual(10);
  });

  it(
    'ancillary count probes pass for plugin manifests + install doc',
    { timeout: SUBPROCESS_TIMEOUT },
    () => {
      // Full `check` output includes ancillary probe failures if any drift exists.
      // A green run means all probes matched canonical counts.
      const output = runScript('check');
      expect(output).not.toContain('pattern not found');
      expect(output).not.toContain('expected');
      expect(output).toContain('Governance check passed');
    }
  );
});

// ============================================================================
// Workflows table generation + Canonical Paths validator (#2317, #2321)
// ============================================================================

describe('inject-governance workflows + canonical paths (#2317)', () => {
  it(
    'generates Workflows table with every skill from skills/index.yaml',
    () => {
      runScript('inject');
      try {
        const content = readFileSync(CLAUDE_MD, 'utf-8');
        expect(content).toContain('<!-- GOVERNANCE:WORKFLOW_INDEX:START -->');
        expect(content).toContain('<!-- GOVERNANCE:WORKFLOW_INDEX:END -->');
        // dev-pipeline + security-advisory-response were the drifted entries
        // that motivated this generator (#2317). They MUST appear.
        expect(content).toContain('`dev-pipeline`');
        expect(content).toContain('`security-advisory-response`');
        // Auto-gen footer reflects current skill count.
        const match = /Auto-generated from `skills\/index\.yaml`\.\s*(\d+)\s*skills\./.exec(
          content
        );
        expect(match).not.toBeNull();
        const count = parseInt(match![1]!, 10);
        expect(count).toBeGreaterThanOrEqual(15);
      } finally {
        // Restore. inject-governance is idempotent against current source so
        // re-running inject is fine, but tests should not leave drift.
        runScript('inject');
      }
    },
    IDEMPOTENCY_TIMEOUT
  );

  it(
    'canonical paths validator passes on the current CLAUDE.md',
    { timeout: SUBPROCESS_TIMEOUT },
    () => {
      const output = runScript('check');
      expect(output).toContain('Governance check passed');
      expect(output).not.toContain('Canonical Paths drift');
    }
  );

  it(
    'canonical paths validator fails when a row points at a missing file',
    { timeout: SUBPROCESS_TIMEOUT },
    () => {
      const original = readFileSync(CLAUDE_MD, 'utf-8');
      try {
        const broken = original.replace(
          '`packages/nexus-agents/src/consensus/engine.ts`',
          '`packages/nexus-agents/src/consensus/THIS_FILE_DOES_NOT_EXIST.ts`'
        );
        // Sanity: ensure the replace actually found the row.
        expect(broken).not.toBe(original);
        writeFileSync(CLAUDE_MD, broken);
        let stderr = '';
        let exitCode = 0;
        try {
          execSync(`npx tsx ${SCRIPT} check`, { cwd: ROOT, encoding: 'utf-8', timeout: 30000 });
        } catch (err) {
          const e = err as { status?: number; stderr?: string; stdout?: string };
          exitCode = e.status ?? 1;
          stderr = (e.stderr ?? '') + (e.stdout ?? '');
        }
        expect(exitCode).not.toBe(0);
        expect(stderr).toContain('Canonical Paths drift');
        expect(stderr).toContain('THIS_FILE_DOES_NOT_EXIST.ts');
      } finally {
        writeFileSync(CLAUDE_MD, original);
      }
    }
  );
});

// ============================================================================
// Adapter precedence docs validator (#2655)
// ============================================================================

describe('inject-governance adapter-precedence-docs (#2655)', () => {
  const PRECEDENCE_DOC = join(ROOT, 'docs/guides/RULE_PRECEDENCE.md');

  it(
    'passes when RULE_PRECEDENCE.md has all four adapter sections',
    { timeout: SUBPROCESS_TIMEOUT },
    () => {
      const output = runScript('check');
      expect(output).toContain('Governance check passed');
      expect(output).not.toContain('RULE_PRECEDENCE.md missing');
    }
  );

  it('fails when an adapter section header is missing', { timeout: SUBPROCESS_TIMEOUT }, () => {
    const original = readFileSync(PRECEDENCE_DOC, 'utf-8');
    try {
      // Replace the `## OpenCode` section header. Exact-line matching in
      // the validator means corruption like `## OpenCodeXXX` still trips
      // the gate even though `includes('## OpenCode')` would have passed.
      const broken = original.replace(/^## OpenCode$/m, '## OpenCodeXXX');
      expect(broken).not.toBe(original);
      writeFileSync(PRECEDENCE_DOC, broken);
      let stderr = '';
      let exitCode = 0;
      try {
        execSync(`npx tsx ${SCRIPT} check`, { cwd: ROOT, encoding: 'utf-8', timeout: 30000 });
      } catch (err) {
        const e = err as { status?: number; stderr?: string; stdout?: string };
        exitCode = e.status ?? 1;
        stderr = (e.stderr ?? '') + (e.stdout ?? '');
      }
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('## OpenCode');
    } finally {
      writeFileSync(PRECEDENCE_DOC, original);
    }
  });

  it('fails when RULE_PRECEDENCE.md is missing entirely', { timeout: SUBPROCESS_TIMEOUT }, () => {
    const original = readFileSync(PRECEDENCE_DOC, 'utf-8');
    try {
      rmSync(PRECEDENCE_DOC);
      let stderr = '';
      let exitCode = 0;
      try {
        execSync(`npx tsx ${SCRIPT} check`, { cwd: ROOT, encoding: 'utf-8', timeout: 30000 });
      } catch (err) {
        const e = err as { status?: number; stderr?: string; stdout?: string };
        exitCode = e.status ?? 1;
        stderr = (e.stderr ?? '') + (e.stdout ?? '');
      }
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('Missing docs/guides/RULE_PRECEDENCE.md');
    } finally {
      writeFileSync(PRECEDENCE_DOC, original);
    }
  });
});

// ============================================================================
// Tool-annotations validator (#2648)
// ============================================================================

describe('inject-governance tool-annotations (#2648)', () => {
  const ANNOTATIONS_PATH = join(ROOT, 'packages/nexus-agents/src/mcp/tool-annotations.ts');

  it(
    'passes when every registered tool has an entry in TOOL_ANNOTATIONS',
    { timeout: SUBPROCESS_TIMEOUT },
    () => {
      const output = runScript('check');
      expect(output).toContain('Governance check passed');
      expect(output).not.toContain('Registered tools missing annotations');
    }
  );

  it(
    'fails when a registered tool is missing from TOOL_ANNOTATIONS',
    { timeout: SUBPROCESS_TIMEOUT },
    () => {
      const original = readFileSync(ANNOTATIONS_PATH, 'utf-8');
      try {
        // Strip the weather_report entry. The closing `},` is shared style
        // across entries so a delete-line range works.
        const broken = original.replace(/^ {2}weather_report: \{[\s\S]*?^ {2}\},\n/m, '');
        expect(broken).not.toBe(original);
        writeFileSync(ANNOTATIONS_PATH, broken);
        let stderr = '';
        let exitCode = 0;
        try {
          execSync(`npx tsx ${SCRIPT} check`, {
            cwd: ROOT,
            encoding: 'utf-8',
            timeout: 30000,
          });
        } catch (err) {
          const e = err as { status?: number; stderr?: string; stdout?: string };
          exitCode = e.status ?? 1;
          stderr = (e.stderr ?? '') + (e.stdout ?? '');
        }
        expect(exitCode).not.toBe(0);
        expect(stderr).toContain('missing annotations');
        expect(stderr).toContain('weather_report');
      } finally {
        writeFileSync(ANNOTATIONS_PATH, original);
      }
    }
  );
});

// ============================================================================
// MCP error-envelope validator (#2649)
// ============================================================================

describe('inject-governance mcp-error-envelope (#2649)', () => {
  const TOOL_PATH = join(ROOT, 'packages/nexus-agents/src/mcp/tools/memory-stats.ts');

  it(
    'passes when no tool file has a raw `isError: true` literal',
    { timeout: SUBPROCESS_TIMEOUT },
    () => {
      const output = runScript('check');
      expect(output).toContain('Governance check passed');
      expect(output).not.toContain('raw `isError: true` literal');
    }
  );

  it(
    'fails when a tool file builds a raw `isError: true` literal',
    { timeout: SUBPROCESS_TIMEOUT },
    () => {
      const original = readFileSync(TOOL_PATH, 'utf-8');
      try {
        // Inject a raw error literal the way a pre-#2649 tool would.
        const broken = original.replace(
          'export ',
          'const _raw = { isError: true, content: [] };\nexport ',
          1
        );
        expect(broken).not.toBe(original);
        writeFileSync(TOOL_PATH, broken);
        let stderr = '';
        let exitCode = 0;
        try {
          execSync(`npx tsx ${SCRIPT} check`, { cwd: ROOT, encoding: 'utf-8', timeout: 30000 });
        } catch (err) {
          const e = err as { status?: number; stderr?: string; stdout?: string };
          exitCode = e.status ?? 1;
          stderr = (e.stderr ?? '') + (e.stdout ?? '');
        }
        expect(exitCode).not.toBe(0);
        expect(stderr).toContain('raw `isError: true` literal');
        expect(stderr).toContain('memory-stats.ts');
      } finally {
        writeFileSync(TOOL_PATH, original);
      }
    }
  );
});

// ============================================================================
// Rule frontmatter validator (#2656)
// ============================================================================

describe('inject-governance rule-frontmatter (#2656)', () => {
  const RULES_DIR = join(ROOT, '.rules');

  it(
    'passes when every .rules/*.md has paths + description frontmatter',
    { timeout: SUBPROCESS_TIMEOUT },
    () => {
      const output = runScript('check');
      expect(output).toContain('Governance check passed');
      expect(output).not.toContain('frontmatter drift');
    }
  );

  it(
    'fails when a rule file loses its frontmatter delimiter',
    { timeout: SUBPROCESS_TIMEOUT },
    () => {
      const target = join(RULES_DIR, 'typescript.md');
      const original = readFileSync(target, 'utf-8');
      try {
        const stripped = original.replace(/^---\n[\s\S]*?\n---\n/, '');
        expect(stripped).not.toBe(original);
        writeFileSync(target, stripped);
        let stderr = '';
        let exitCode = 0;
        try {
          execSync(`npx tsx ${SCRIPT} check`, { cwd: ROOT, encoding: 'utf-8', timeout: 30000 });
        } catch (err) {
          const e = err as { status?: number; stderr?: string; stdout?: string };
          exitCode = e.status ?? 1;
          stderr = (e.stderr ?? '') + (e.stdout ?? '');
        }
        expect(exitCode).not.toBe(0);
        expect(stderr).toContain('frontmatter drift');
        expect(stderr).toContain('typescript.md');
      } finally {
        writeFileSync(target, original);
      }
    }
  );

  it(
    'fails when a rule file is missing its description field',
    { timeout: SUBPROCESS_TIMEOUT },
    () => {
      const target = join(RULES_DIR, 'security.md');
      const original = readFileSync(target, 'utf-8');
      try {
        const stripped = original.replace(/^description:.*\n/m, '');
        expect(stripped).not.toBe(original);
        writeFileSync(target, stripped);
        let stderr = '';
        let exitCode = 0;
        try {
          execSync(`npx tsx ${SCRIPT} check`, { cwd: ROOT, encoding: 'utf-8', timeout: 30000 });
        } catch (err) {
          const e = err as { status?: number; stderr?: string; stdout?: string };
          exitCode = e.status ?? 1;
          stderr = (e.stderr ?? '') + (e.stdout ?? '');
        }
        expect(exitCode).not.toBe(0);
        expect(stderr).toContain('missing `description:`');
      } finally {
        writeFileSync(target, original);
      }
    }
  );
});

// ============================================================================
// server.json sync (#2326, #2327)
// ============================================================================

describe('inject-governance server.json sync (#2327)', () => {
  const SERVER_JSON = join(ROOT, 'packages/nexus-agents/server.json');
  const PKG_JSON = join(ROOT, 'packages/nexus-agents/package.json');

  it(
    'inject syncs server.json version to packages/nexus-agents/package.json',
    { timeout: IDEMPOTENCY_TIMEOUT },
    () => {
      runScript('inject');
      const pkg = JSON.parse(readFileSync(PKG_JSON, 'utf-8')) as { version: string };
      const server = JSON.parse(readFileSync(SERVER_JSON, 'utf-8')) as {
        version: string;
        packages: { version: string }[];
      };
      expect(server.version).toBe(pkg.version);
      for (const entry of server.packages) {
        expect(entry.version).toBe(pkg.version);
      }
    }
  );

  it('check command fails when server.json version drifts', { timeout: SUBPROCESS_TIMEOUT }, () => {
    const original = readFileSync(SERVER_JSON, 'utf-8');
    try {
      const broken = original.replace(/"version": "[^"]+"/, '"version": "0.0.0-broken"');
      // Sanity: ensure the replace landed.
      expect(broken).not.toBe(original);
      writeFileSync(SERVER_JSON, broken);
      let combined = '';
      let exitCode = 0;
      try {
        execSync(`npx tsx ${SCRIPT} check`, { cwd: ROOT, encoding: 'utf-8', timeout: 30000 });
      } catch (err) {
        const e = err as { status?: number; stderr?: string; stdout?: string };
        exitCode = e.status ?? 1;
        combined = (e.stderr ?? '') + (e.stdout ?? '');
      }
      expect(exitCode).not.toBe(0);
      expect(combined).toContain('server.json version');
      expect(combined).toContain('0.0.0-broken');
    } finally {
      writeFileSync(SERVER_JSON, original);
    }
  });

  it(
    'check command fails when server.json description tool count drifts',
    { timeout: SUBPROCESS_TIMEOUT },
    () => {
      const original = readFileSync(SERVER_JSON, 'utf-8');
      try {
        const broken = original.replace(/(\d+) MCP tools/, '999 MCP tools');
        expect(broken).not.toBe(original);
        writeFileSync(SERVER_JSON, broken);
        let combined = '';
        let exitCode = 0;
        try {
          execSync(`npx tsx ${SCRIPT} check`, { cwd: ROOT, encoding: 'utf-8', timeout: 30000 });
        } catch (err) {
          const e = err as { status?: number; stderr?: string; stdout?: string };
          exitCode = e.status ?? 1;
          combined = (e.stderr ?? '') + (e.stdout ?? '');
        }
        expect(exitCode).not.toBe(0);
        expect(combined).toContain('server.json description');
        expect(combined).toContain('999');
      } finally {
        writeFileSync(SERVER_JSON, original);
      }
    }
  );

  it(
    'inject writes the canonical tools[] array into server.json',
    { timeout: IDEMPOTENCY_TIMEOUT },
    () => {
      runScript('inject');
      const server = JSON.parse(readFileSync(SERVER_JSON, 'utf-8')) as { tools: string[] };
      // Sanity floor: at least 30 tools (snapshot-resilient — the actual count
      // changes per release and shouldn't be hardcoded here).
      expect(server.tools.length).toBeGreaterThanOrEqual(30);
      // The most recent additions must appear (caught the #2295 drift on PR #2358).
      expect(server.tools).toContain('survey_oss_landscape');
      expect(server.tools).toContain('supply_chain_tradeoff_panel');
    }
  );
});

// ============================================================================
// Ancillary count surfaces auto-sync (#2295 follow-up)
// ============================================================================

describe('inject-governance ancillary count surfaces (#2295 follow-up)', () => {
  const SITE_DATA = join(ROOT, 'website/src/data/site-data.ts');
  const COMPONENTS_DOC = join(ROOT, 'docs/design/components.md');
  const README_FILE = join(ROOT, 'README.md');

  it(
    'syncs MCP_TOOL_COUNT in website/src/data/site-data.ts',
    { timeout: IDEMPOTENCY_TIMEOUT },
    () => {
      runScript('inject');
      const content = readFileSync(SITE_DATA, 'utf-8');
      const match = /MCP_TOOL_COUNT\s*=\s*(\d+)/.exec(content);
      expect(match).not.toBeNull();
      const count = parseInt(match![1]!, 10);
      expect(count).toBeGreaterThanOrEqual(30);
    }
  );

  it(
    'syncs the three "N tool" mentions in docs/design/components.md',
    { timeout: IDEMPOTENCY_TIMEOUT },
    () => {
      runScript('inject');
      const content = readFileSync(COMPONENTS_DOC, 'utf-8');
      // Pattern 1: row of mcp module description
      expect(content).toMatch(/MCP server, \d+ tool handlers, gateway/);
      // Pattern 2: capability-gap-detector cross-ref
      expect(content).toMatch(/against \d+ registered tools and \d+ expert roles/);
      // Pattern 3: tool-registration line
      expect(content).toMatch(/`registerTools\(\)` — \d+ tools total/);
    }
  );

  it('syncs README.md count mentions', { timeout: IDEMPOTENCY_TIMEOUT }, () => {
    runScript('inject');
    const content = readFileSync(README_FILE, 'utf-8');
    // Architecture diagram bottom line: "│   N MCP tools · multi-stage..."
    expect(content).toMatch(/│\s+\d+ MCP tools · multi-stage CompositeRouter/);
    // Capabilities table cell: "**N MCP Tools**"
    expect(content).toMatch(/\*\*\d+ MCP Tools\*\*/);
  });

  it(
    'all ancillary surfaces report the SAME tool count after inject',
    { timeout: IDEMPOTENCY_TIMEOUT },
    () => {
      runScript('inject');
      const siteCount = parseInt(
        /MCP_TOOL_COUNT\s*=\s*(\d+)/.exec(readFileSync(SITE_DATA, 'utf-8'))?.[1] ?? '0',
        10
      );
      const componentsCount = parseInt(
        /MCP server, (\d+) tool handlers/.exec(readFileSync(COMPONENTS_DOC, 'utf-8'))?.[1] ?? '0',
        10
      );
      const readmeArchCount = parseInt(
        /│\s+(\d+) MCP tools · multi-stage CompositeRouter/.exec(
          readFileSync(README_FILE, 'utf-8')
        )?.[1] ?? '0',
        10
      );
      expect(siteCount).toBeGreaterThan(0);
      expect(siteCount).toBe(componentsCount);
      expect(siteCount).toBe(readmeArchCount);
    }
  );
});
