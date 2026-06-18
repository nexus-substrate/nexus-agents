/**
 * Command-metadata PARITY GATE (Issue #3212, Option B — vote-decided 7-0).
 *
 * #3212's dispatch refactor already shipped: dispatch is table-driven
 * (`SYNC_COMMAND_HANDLERS` / `ASYNC_COMMAND_HANDLERS` in `cli-commands.ts`),
 * `COMMAND_CATALOG` (`cli-command-catalog.ts`) is the metadata source, and
 * `VALID_COMMANDS` (`cli-types.ts`) is the routing allowlist. Those three are
 * PARALLEL command-name structures maintained by hand, so they DRIFT — #3713
 * is the canonical example (`auto-remediate` was dispatchable + cataloged but
 * absent from `VALID_COMMANDS`, so the CLI silently started the MCP server).
 *
 * This gate asserts the REAL invariant between the three structures so that
 * drift fails CI with the offending command named. It deliberately does NOT
 * assert blanket set-equality — there are legitimate, documented asymmetries
 * (see {@link ALLOWED_ASYMMETRY}). It builds NO unified registry and refactors
 * NO dispatch (the vote rejected both).
 */

import { describe, it, expect } from 'vitest';

import { listDispatchableCommands } from './cli-commands.js';
import { COMMAND_CATALOG } from './cli-command-catalog.js';
import { VALID_COMMANDS } from './cli-types.js';

/**
 * Documented, legitimate asymmetries between the command structures. Every
 * entry needs a one-line justification for WHY it is exempt; the gate must
 * not force deleting intentional behavior. Keep this list as small as the
 * truth allows — anything here is a structure the parity check would
 * otherwise flag.
 */
const ALLOWED_ASYMMETRY = {
  /**
   * In `COMMAND_CATALOG` but intentionally NOT dispatchable. These have no
   * entry in either dispatch table by design.
   */
  catalogNotDispatchable: new Set<string>([
    // Pseudo-entry: the no-arg invocation (`nexus-agents`) runs the MCP
    // server. There is no `(default)` handler — `server` is the dispatchable
    // form. `catalogForExtractors()` already strips it for the same reason.
    '(default)',
  ]),
  /**
   * Dispatchable (routable) but intentionally NOT in `COMMAND_CATALOG`. These
   * are real commands the dispatcher routes but that carry no catalog metadata
   * by design.
   */
  dispatchableNotCatalog: new Set<string>([
    // `help` / `version` are intercepted at the top of `handleSyncCommand`
    // with special `process.exit` behavior (not via the dispatch tables) and
    // are rendered by the `--help` HEADER, not the COMMANDS list — so they
    // correctly carry no `COMMAND_CATALOG` entry.
    'help',
    'version',
  ]),
} as const;

/** Sorted symmetric set helpers — keep failure messages deterministic. */
function diff(a: ReadonlySet<string>, b: ReadonlySet<string>): string[] {
  return [...a].filter((x) => !b.has(x)).sort((x, y) => x.localeCompare(y));
}

describe('command parity gate (#3212)', () => {
  const dispatchable = new Set(listDispatchableCommands());
  const catalog = new Set(COMMAND_CATALOG.map((e) => e.command));
  const valid = new Set<string>(VALID_COMMANDS);

  it('lists dispatchable commands with no duplicates across the sync/async/special sets', () => {
    const raw = listDispatchableCommands();
    expect(
      new Set(raw).size,
      `duplicate dispatchable command name(s): ${raw
        .filter((c, i) => raw.indexOf(c) !== i)
        .join(', ')}`
    ).toBe(raw.length);
  });

  // ── dispatch ⊆ catalog ────────────────────────────────────────────────────
  // Every command the dispatcher routes must have catalog metadata, so it
  // shows up in `--help`, the entrypoint extractor, and the repo-index. The
  // only exemptions are the special-cased `help`/`version` (see allowlist).
  it('every dispatchable command has COMMAND_CATALOG metadata (minus allowed asymmetry)', () => {
    const offenders = diff(dispatchable, catalog).filter(
      (c) => !ALLOWED_ASYMMETRY.dispatchableNotCatalog.has(c)
    );
    expect(
      offenders,
      `dispatchable but MISSING from COMMAND_CATALOG: ${offenders.join(', ')}. ` +
        `Add a catalog entry (correct, surfaced behavior) or, if intentionally ` +
        `metadata-free, add to ALLOWED_ASYMMETRY.dispatchableNotCatalog with a reason.`
    ).toEqual([]);
  });

  // ── catalog ⊆ dispatch ────────────────────────────────────────────────────
  // Every cataloged command must be dispatchable, else `--help` advertises a
  // command the CLI cannot route. Only `(default)` (the pseudo no-arg entry)
  // is exempt.
  it('every COMMAND_CATALOG command is dispatchable (minus allowed asymmetry)', () => {
    const offenders = diff(catalog, dispatchable).filter(
      (c) => !ALLOWED_ASYMMETRY.catalogNotDispatchable.has(c)
    );
    expect(
      offenders,
      `in COMMAND_CATALOG but NOT dispatchable: ${offenders.join(', ')}. ` +
        `This advertises a command with no handler — investigate for a removed/renamed ` +
        `handler (real bug), or add to ALLOWED_ASYMMETRY.catalogNotDispatchable if intentional.`
    ).toEqual([]);
  });

  // ── VALID_COMMANDS == dispatchable ─────────────────────────────────────────
  // `VALID_COMMANDS` carries no independent data — it is the routing allowlist
  // and must be EXACTLY the dispatchable set. A valid-but-undispatchable
  // command routes to nothing; a dispatchable-but-invalid command is rejected
  // by `isValidCommand` and silently falls through to the MCP server (#3713).
  it('VALID_COMMANDS equals the dispatchable set exactly', () => {
    const validNotDispatchable = diff(valid, dispatchable);
    const dispatchableNotValid = diff(dispatchable, valid);
    expect(
      validNotDispatchable,
      `in VALID_COMMANDS but NOT dispatchable (routes to nothing): ${validNotDispatchable.join(
        ', '
      )}`
    ).toEqual([]);
    expect(
      dispatchableNotValid,
      `dispatchable but NOT in VALID_COMMANDS (isValidCommand rejects it → silent ` +
        `MCP-server fallthrough, cf. #3713): ${dispatchableNotValid.join(', ')}`
    ).toEqual([]);
  });

  // Guard the allowlist itself: a stale exemption (for a command that no longer
  // exists, or that is now correctly symmetric) should be removed so the list
  // stays honest.
  it('ALLOWED_ASYMMETRY has no stale entries', () => {
    const staleCatalogNotDispatchable = [...ALLOWED_ASYMMETRY.catalogNotDispatchable].filter(
      (c) => !(catalog.has(c) && !dispatchable.has(c))
    );
    expect(
      staleCatalogNotDispatchable,
      `ALLOWED_ASYMMETRY.catalogNotDispatchable lists command(s) that are no longer ` +
        `catalog-only: ${staleCatalogNotDispatchable.join(', ')}`
    ).toEqual([]);
    const staleDispatchableNotCatalog = [...ALLOWED_ASYMMETRY.dispatchableNotCatalog].filter(
      (c) => !(dispatchable.has(c) && !catalog.has(c))
    );
    expect(
      staleDispatchableNotCatalog,
      `ALLOWED_ASYMMETRY.dispatchableNotCatalog lists command(s) that are no longer ` +
        `dispatch-only: ${staleDispatchableNotCatalog.join(', ')}`
    ).toEqual([]);
  });
});
