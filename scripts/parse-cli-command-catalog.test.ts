/**
 * Fixture tests for the AST-based CLI command-catalog parser (#5458).
 *
 * `COMMAND_CATALOG` is the single source of truth for top-level CLI commands.
 * The docs generator (`inject-governance.ts`) and the phantom-row gate
 * (`check-cli-docs-drift.ts`) both read it through this parser, so a shape the
 * parser silently drops would drop it from BOTH surfaces at once. These pin the
 * shapes the catalog actually uses: multi-line prettier-wrapped strings, comments
 * between properties, and the `(default)` placeholder entry.
 *
 * @module scripts/parse-cli-command-catalog.test
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCommandCatalog } from './parse-cli-command-catalog.js';

describe('parseCommandCatalog', () => {
  it('reads command, description and audience in source order', () => {
    const src = `export const COMMAND_CATALOG: readonly CommandCatalogEntry[] = [
      { command: 'hello', description: 'Show welcome', audience: 'essential' },
      { command: 'session', description: 'Manage sessions', audience: 'advanced' },
    ];`;
    expect(parseCommandCatalog(src)).toEqual([
      { command: 'hello', description: 'Show welcome', audience: 'essential' },
      { command: 'session', description: 'Manage sessions', audience: 'advanced' },
    ]);
  });

  it('survives comments between properties and prettier-wrapped descriptions', () => {
    const src = `export const COMMAND_CATALOG = [
      // ── Essential ──
      {
        command: 'vote',
        // Default panel is 7 roles.
        description:
          'Run consensus vote on a proposal (7 agents; --quick uses 3)',
        audience: 'essential',
      },
    ];`;
    expect(parseCommandCatalog(src)).toEqual([
      {
        command: 'vote',
        description: 'Run consensus vote on a proposal (7 agents; --quick uses 3)',
        audience: 'essential',
      },
    ]);
  });

  it('keeps the (default) placeholder — it is a documented invocation', () => {
    const src = `const COMMAND_CATALOG = [
      { command: '(default)', description: 'Start MCP server', audience: 'essential' },
    ];`;
    expect(parseCommandCatalog(src).map((e) => e.command)).toEqual(['(default)']);
  });

  it('throws on an entry missing any of the three fields rather than dropping it', () => {
    // A half-written entry must not vanish from the docs AND the gate at once;
    // the parser names the entry so the failure is loud in both consumers.
    const src = `const COMMAND_CATALOG = [
      { command: 'ok', description: 'fine', audience: 'internal' },
      { command: 'broken', audience: 'internal' },
    ];`;
    expect(() => parseCommandCatalog(src)).toThrow(/entry #1 .*missing .*description/);
  });

  it('throws on a field that is present but not a plain string literal', () => {
    // Each shape is one the parser cannot evaluate. Silently dropping the entry
    // would make `--help --all` show N+1 commands while the docs show N with CI
    // green — the exact drift this parser exists to prevent.
    const shapes: readonly [string, RegExp][] = [
      [
        "{ command: `cmd-${suffix}`, description: 'd', audience: 'internal' }",
        /command.*TemplateExpression/,
      ],
      [
        "{ command: 'x' + 'y', description: 'd', audience: 'internal' }",
        /command.*BinaryExpression/,
      ],
      ["{ command: NAME, description: 'd', audience: 'internal' }", /command.*Identifier/],
      ["{ command: 'ok', description: DESC, audience: 'internal' }", /description.*Identifier/],
    ];
    for (const [entry, expected] of shapes) {
      const src = `const COMMAND_CATALOG = [\n  ${entry},\n];`;
      expect(() => parseCommandCatalog(src), entry).toThrow(expected);
    }
  });

  it('throws on an array element that is not an object literal (spread, identifier)', () => {
    expect(() =>
      parseCommandCatalog(
        `const COMMAND_CATALOG = [ ...EXTRA, { command: 'a', description: 'b', audience: 'internal' } ];`
      )
    ).toThrow(/element #0 .*SpreadElement/);
    expect(() =>
      parseCommandCatalog(
        `const COMMAND_CATALOG = [ { command: 'a', description: 'b', audience: 'internal' }, ENTRY ];`
      )
    ).toThrow(/element #1 .*Identifier/);
  });

  it('accepts a no-substitution template literal', () => {
    const src =
      'const COMMAND_CATALOG = [{ command: `plain`, description: `d`, audience: `internal` }];';
    expect(parseCommandCatalog(src).map((e) => e.command)).toEqual(['plain']);
  });

  it('returns [] when COMMAND_CATALOG is absent or not a literal', () => {
    // Named explicitly: callers treat [] as "parser found nothing" and fail
    // closed — an empty table must never be reported as a clean generation.
    expect(parseCommandCatalog('export const OTHER = [];')).toEqual([]);
    expect(parseCommandCatalog('export const COMMAND_CATALOG = buildCatalog();')).toEqual([]);
  });

  it('reads the real catalog and finds the essential band', () => {
    const src = readFileSync(
      join(import.meta.dirname, '../packages/nexus-agents/src/cli-command-catalog.ts'),
      'utf-8'
    );
    const entries = parseCommandCatalog(src);
    expect(entries.length).toBeGreaterThan(40);
    expect(entries.map((e) => e.command)).toContain('orchestrate');
    expect(new Set(entries.map((e) => e.audience))).toEqual(
      new Set(['essential', 'advanced', 'maintainer', 'internal'])
    );
  });

  it('parses exactly as many entries as the runtime catalog exports (parity)', async () => {
    // The parser reads the literal; the CLI reads the module. If they ever
    // disagree, a command is in `--help` but not in the docs or the gate.
    const runtime = await import('../packages/nexus-agents/src/cli-command-catalog.js');
    const src = readFileSync(
      join(import.meta.dirname, '../packages/nexus-agents/src/cli-command-catalog.ts'),
      'utf-8'
    );
    const parsed = parseCommandCatalog(src);
    expect(parsed.length).toBe(runtime.COMMAND_CATALOG.length);
    expect(parsed).toEqual(runtime.COMMAND_CATALOG);
  });
});
