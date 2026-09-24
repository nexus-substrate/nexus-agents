/**
 * Doctor notes under the CLI list: CLIs disabled by `NEXUS_DISABLED_CLIS`
 * (#6590), and missing CLIs a passing gateway cannot stand in for (#6658). A
 * sibling of `doctor-formatting.ts` for the file cap, in the same shape as
 * `doctor-voter-transport.ts`.
 *
 * @module cli/doctor-disabled-clis
 */

import type { CliName } from '../cli-adapters/types.js';
import { colors, symbols, writeLine } from './ansi-output.js';
import { formatGatewaySlotWarnings } from './doctor-gateway-report.js';
import type { DoctorResult } from './doctor.js';

/**
 * Names the disabled CLIs. They are not probed, so without this line they
 * would simply be missing from the CLI list. Prints nothing when none is.
 */
function printDisabledClis(disabled: readonly CliName[]): void {
  if (disabled.length === 0) return;
  writeLine(
    `  ${colors.yellow}${symbols.circle}${colors.reset} Disabled by NEXUS_DISABLED_CLIS: ${disabled.join(', ')} (not probed)`
  );
}

/**
 * The notes under the CLI list. The gateway-slot warnings print with every
 * `doctor` run, `--gateway` or not: they do not fail the verdict, but a
 * missing CLI whose slot the gateway cannot serve is never silently excused.
 */
export function printCliListNotes(
  result: Pick<DoctorResult, 'disabledClis' | 'gateway' | 'clis'>
): void {
  printDisabledClis(result.disabledClis);
  for (const line of formatGatewaySlotWarnings(result.gateway, result.clis)) writeLine(line);
}
