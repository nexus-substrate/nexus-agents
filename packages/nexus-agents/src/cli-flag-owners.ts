/**
 * Commands that own their flags (#6679, #6678).
 *
 * ONE parser defines each one's flags — `parseHookArgs` in
 * `cli/hooks/hook-router.ts` for `hooks`, `parseResearchIndexArgs` in
 * `cli/research-index-helpers.ts` for `research index` — and their spellings
 * collide with global ones (`--validate`, `--source`, `--format`, `-o`, `-v`,
 * `-f`). The strict global parser rejected the flags it did not know (every
 * `setup`-installed hook exited 3; `research index --generate`) and
 * consumed-and-dropped the ones it did (`hooks --validate`,
 * `research index --validate -o f`). `parseCliArgs` in `cli.ts` therefore
 * forwards everything after the command name verbatim, as positionals, for
 * the handler to hand to that parser. Its own module because `cli.ts` is at
 * its line cap.
 *
 * @module cli-flag-owners
 */

import type { CliCommand } from './cli-types.js';

/** A command that owns its flags — everywhere, or only under one subcommand. */
export interface FlagOwner {
  readonly command: CliCommand;
  readonly subcommand?: string;
}

const FLAG_OWNERS: readonly FlagOwner[] = [
  { command: 'hooks' },
  { command: 'research', subcommand: 'index' },
];

/** The flag-owning command `args` invokes, or undefined for every other command. */
export function findFlagOwner(args: readonly string[]): FlagOwner | undefined {
  return FLAG_OWNERS.find(
    (owner) =>
      args[0] === owner.command && (owner.subcommand === undefined || args[1] === owner.subcommand)
  );
}
