/**
 * Doctor line for CLIs disabled by `NEXUS_DISABLED_CLIS` (#6590). A sibling of
 * `doctor-formatting.ts` for the file cap, in the same shape as
 * `doctor-voter-transport.ts`.
 *
 * @module cli/doctor-disabled-clis
 */

import type { CliName } from '../cli-adapters/types.js';
import { colors, symbols, writeLine } from './ansi-output.js';

/**
 * Names the disabled CLIs. They are not probed, so without this line they
 * would simply be missing from the CLI list. Prints nothing when none is.
 */
export function printDisabledClis(disabled: readonly CliName[]): void {
  if (disabled.length === 0) return;
  writeLine(
    `  ${colors.yellow}${symbols.circle}${colors.reset} Disabled by NEXUS_DISABLED_CLIS: ${disabled.join(', ')} (not probed)`
  );
}
