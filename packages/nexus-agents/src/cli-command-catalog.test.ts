/**
 * Tests for the CLI command catalog (Issue #2135).
 *
 * Verifies audience filtering, grouping, and rendered output shape used by
 * the tiered `--help`.
 */

import { describe, it, expect } from 'vitest';

import {
  COMMAND_CATALOG,
  ESSENTIAL_AUDIENCE_CAP,
  filterCatalog,
  groupByAudience,
  renderCommandsSection,
  catalogForExtractors,
  getCommandDescription,
} from './cli-command-catalog.js';
import { renderHelp, HELP_TEXT } from './cli-help-text.js';
import { COMMAND_HELP, formatCommandHelp, formatAllCommandsHelp } from './cli-command-help.js';
import { isValidCommand } from './cli-types.js';

describe('cli-command-catalog (#2135)', () => {
  describe('COMMAND_CATALOG invariants', () => {
    it('has no duplicate command names', () => {
      const names = COMMAND_CATALOG.map((e) => e.command);
      expect(new Set(names).size).toBe(names.length);
    });

    // Regression for #3713: `auto-remediate` shipped in the catalog + the
    // dispatch table but NOT in cli-types VALID_COMMANDS, so isValidCommand()
    // returned false and the CLI silently fell through to starting the MCP
    // server. Every real command MUST be a valid CliCommand or it won't route.
    it('every catalog command (except the pseudo "(default)") is a valid CliCommand', () => {
      const missing = COMMAND_CATALOG.map((e) => e.command)
        .filter((c) => c !== '(default)')
        .filter((c) => !isValidCommand(c));
      expect(missing, `in catalog but missing from VALID_COMMANDS: ${missing.join(', ')}`).toEqual(
        []
      );
    });

    it('auto-remediate is a routable command (#3713)', () => {
      expect(isValidCommand('auto-remediate')).toBe(true);
    });

    it('tags every entry with a valid audience', () => {
      const valid = new Set(['essential', 'advanced', 'maintainer', 'internal']);
      for (const entry of COMMAND_CATALOG) {
        expect(valid.has(entry.audience)).toBe(true);
      }
    });

    it(`keeps the essential tier small (<=${String(ESSENTIAL_AUDIENCE_CAP)}) so new users are not overwhelmed`, () => {
      const essentialCount = COMMAND_CATALOG.filter((e) => e.audience === 'essential').length;
      // #2492: when this fails, demote a less-onboarding-critical entry to
      // `advanced` rather than bumping the cap. See ESSENTIAL_AUDIENCE_CAP's
      // docstring for the policy.
      expect(essentialCount).toBeLessThanOrEqual(ESSENTIAL_AUDIENCE_CAP);
    });
  });

  describe('filterCatalog', () => {
    it('excludes maintainer entries by default', () => {
      const filtered = filterCatalog(false);
      for (const entry of filtered) {
        expect(entry.audience).not.toBe('maintainer');
      }
    });

    it('returns every non-internal entry when showAll=true (#2156)', () => {
      // internal-tier entries are never shown in human-facing output, even
      // under --all. The extractor path uses catalogForExtractors() instead.
      const filtered = filterCatalog(true);
      const nonInternalCount = COMMAND_CATALOG.filter((e) => e.audience !== 'internal').length;
      expect(filtered.length).toBe(nonInternalCount);
      for (const entry of filtered) {
        expect(entry.audience).not.toBe('internal');
      }
    });

    it('always excludes internal-tier entries from human-facing output (#2156)', () => {
      for (const entry of filterCatalog(false)) expect(entry.audience).not.toBe('internal');
      for (const entry of filterCatalog(true)) expect(entry.audience).not.toBe('internal');
    });

    it('shrinks the visible surface in default mode', () => {
      const defaultCount = filterCatalog(false).length;
      const allCount = filterCatalog(true).length;
      expect(defaultCount).toBeLessThan(allCount);
    });
  });

  describe('catalogForExtractors (#2156)', () => {
    it('excludes the (default) placeholder — it has no handler', () => {
      const extractor = catalogForExtractors();
      expect(extractor.find((e) => e.command === '(default)')).toBeUndefined();
    });

    it('includes internal-tier entries (unlike filterCatalog)', () => {
      const extractor = catalogForExtractors();
      expect(extractor.some((e) => e.audience === 'internal')).toBe(true);
    });

    it('includes every real command (essential + advanced + maintainer + internal)', () => {
      const expected = COMMAND_CATALOG.filter((e) => e.command !== '(default)').length;
      expect(catalogForExtractors().length).toBe(expected);
    });
  });

  describe('groupByAudience', () => {
    it('preserves catalog order within each group', () => {
      const groups = groupByAudience(COMMAND_CATALOG);
      const essential = groups.get('essential') ?? [];
      const catalogEssential = COMMAND_CATALOG.filter((e) => e.audience === 'essential').map(
        (e) => e.command
      );
      expect(essential.map((e) => e.command)).toEqual(catalogEssential);
    });
  });

  describe('renderCommandsSection', () => {
    it('produces tiered output with Essential + Advanced headings but not Maintainer by default', () => {
      const out = renderCommandsSection(false);
      expect(out).toContain('Essential');
      expect(out).toContain('Advanced');
      expect(out).not.toContain('Maintainer');
      expect(out).toContain('Run with --all');
    });

    it('includes Maintainer heading when showAll=true', () => {
      const out = renderCommandsSection(true);
      expect(out).toContain('Essential');
      expect(out).toContain('Advanced');
      expect(out).toContain('Maintainer');
      expect(out).not.toContain('Run with --all');
    });

    it('indents entries with 4 spaces so they nest under COMMANDS:', () => {
      const out = renderCommandsSection(false);
      // Every entry row starts with 4 spaces (command name column) — the
      // grouping heading is indented 2 spaces instead.
      const entryLines = out.split('\n').filter((l) => /^ {4}\S/.test(l));
      expect(entryLines.length).toBeGreaterThan(0);
    });
  });

  describe('renderHelp — top-level tiering', () => {
    it('returns HELP_TEXT verbatim when all=true', () => {
      expect(renderHelp({ all: true })).toBe(HELP_TEXT);
    });

    it('swaps in the tiered COMMANDS block when all=false', () => {
      const tiered = renderHelp({ all: false });
      expect(tiered).toContain('Essential');
      expect(tiered).toContain('Run with --all');
      // Maintainer-only commands must not appear in the COMMANDS listing
      // itself. (Examples further down may still reference them; filtering
      // the EXAMPLES block is intentionally out of scope for #2135.)
      const commandsMatch = /COMMANDS:\n([\s\S]*?)\n\nOPTIONS:/.exec(tiered);
      expect(commandsMatch).not.toBeNull();
      const commandsBlock = commandsMatch?.[1] ?? '';
      expect(commandsBlock).not.toMatch(/^ {4}swe-bench\b/m);
      expect(commandsBlock).not.toMatch(/^ {4}release-validate\b/m);
      expect(commandsBlock).not.toMatch(/^ {4}fitness-audit\b/m);
    });

    it('preserves USAGE / OPTIONS / EXAMPLES sections in default mode', () => {
      // #2446: per-subcommand option blocks (SETUP OPTIONS:, VOTE OPTIONS:, …)
      // were removed from the static help text — they're surfaced via
      // `nexus-agents <command> --help` instead. The default --help now
      // points at that hint instead of inlining the option lists.
      const tiered = renderHelp({ all: false });
      expect(tiered).toContain('USAGE:');
      expect(tiered).toContain('OPTIONS:');
      expect(tiered).toContain('EXAMPLES:');
      expect(tiered).toContain('nexus-agents <command> --help');
    });

    it('keeps the full view showing all commands when all=true', () => {
      const full = renderHelp({ all: true });
      // Sanity: maintainer-band commands come back when --all is set.
      expect(full).toContain('swe-bench');
      expect(full).toContain('fitness-audit');
      expect(full).toContain('release-notes');
    });

    it('default view is substantially shorter than --all view', () => {
      const tiered = renderHelp({ all: false });
      const full = renderHelp({ all: true });
      expect(tiered.length).toBeLessThan(full.length);
    });
  });

  // ── Single-source drift gate (#3209) ──────────────────────────────────────
  // The same one-line description used to be copied (and DRIFTED) across three
  // files: the catalog, the HELP_TEXT command list, and COMMAND_HELP. The exact
  // bug: `vote` read "5-6 agents" (catalog) vs "6 agents" (HELP_TEXT) vs
  // "6 agents by default" (COMMAND_HELP) — all wrong; the panel is 7. These
  // tests assert COMMAND_CATALOG is the ONE source and every other help surface
  // derives from it, so the drift cannot regress.
  describe('single-source command descriptions (#3209)', () => {
    /**
     * Asserts the rendered COMMANDS block contains one row per visible catalog
     * command whose text is exactly `<command padEnd(16)> <catalog description>`
     * — i.e. the rendered list IS the catalog, with no drifted copy. Matches the
     * exact row shape `renderCommandsSection` produces (padEnd(16), 1 space).
     */
    function expectCommandsMatchCatalog(helpText: string, showAll: boolean): void {
      const commandsMatch = /COMMANDS:\n([\s\S]*?)\n\nOPTIONS:/.exec(helpText);
      expect(commandsMatch).not.toBeNull();
      const block = commandsMatch?.[1] ?? '';
      for (const entry of filterCatalog(showAll)) {
        const expectedRow = `    ${entry.command.padEnd(16)} ${entry.description}`;
        expect(
          block.includes(expectedRow),
          `COMMANDS list is missing the catalog row for "${entry.command}" ` +
            `(expected exactly: "${expectedRow.trim()}") — descriptions have drifted ` +
            `from COMMAND_CATALOG`
        ).toBe(true);
      }
    }

    it('the rendered COMMANDS list (--all) matches catalog descriptions verbatim', () => {
      expectCommandsMatchCatalog(renderHelp({ all: true }), true);
    });

    it('the default COMMANDS list matches catalog descriptions verbatim', () => {
      expectCommandsMatchCatalog(renderHelp({ all: false }), false);
    });

    it('every COMMAND_HELP command has a catalog description (no third copy)', () => {
      for (const entry of COMMAND_HELP) {
        expect(
          getCommandDescription(entry.command),
          `COMMAND_HELP command "${entry.command}" is not in COMMAND_CATALOG — ` +
            `its one-line description cannot be single-sourced`
        ).toBeDefined();
      }
    });

    it('per-command help renders the catalog description (formatCommandHelp)', () => {
      for (const entry of COMMAND_HELP) {
        const help = formatCommandHelp(entry.command);
        expect(help).toBeDefined();
        const description = getCommandDescription(entry.command) ?? '';
        expect(help).toContain(description);
      }
    });

    it('the all-commands summary renders catalog descriptions (formatAllCommandsHelp)', () => {
      const summary = formatAllCommandsHelp();
      for (const entry of COMMAND_HELP) {
        const description = getCommandDescription(entry.command) ?? '';
        expect(summary).toContain(description);
      }
    });

    it('reconciles the vote drift to the real 7-agent default panel', () => {
      // Regression for the exact #3209 example. getVoterRoles() in
      // mcp/tools/consensus-vote.ts returns 7 roles by default, 3 for --quick.
      const vote = getCommandDescription('vote');
      expect(vote).toContain('7 agents');
      expect(vote).not.toContain('6 agents');
      expect(vote).not.toContain('5-6');
    });
  });
});
