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
import type { CliCheckResult, DoctorResult } from './doctor.js';
import type { GatewayHealth } from './doctor-gateway.js';
import {
  formatGatewayCoveredCli,
  gatewayCoveredClis,
  gatewaySlotServing,
} from './doctor-gateway-slots.js';

/** The reason every report line gives for a CLI switched off on purpose. */
const DISABLED_BY_ENV = 'disabled by NEXUS_DISABLED_CLIS';

/**
 * The model-advisory reason for a model whose CLI is disabled (#6728): it is
 * switched off, not missing, so the report must not tell the operator to
 * install it. When a healthy gateway has a slot for the CLI, the reason also
 * says whether the gateway serves that slot — the same `decideSlotServing`
 * answer `doctor --gateway` prints.
 */
export function disabledCliModelReason(
  cli: CliName,
  gateway: GatewayHealth,
  clis: readonly CliCheckResult[]
): string {
  const base = `${cli} CLI is ${DISABLED_BY_ENV}`;
  const slot = gatewaySlotServing(gateway, clis).find((s) => s.slot === cli);
  if (slot === undefined) return base;
  return slot.serving === 'gateway'
    ? `${base}; the gateway serves its slot with ${slot.model}`
    : `${base}; the gateway has no ${slot.family} model`;
}

/**
 * The CLI list's header glyph inputs: `status` is ✓, else `warn` is ⚠, else ✗.
 * An installed CLI on an unsupported version is ✗ — it fails the verdict —
 * unless the gateway serves its slot, which makes any broken CLI ⚠ (#6782).
 */
export function cliHeaderState(
  cli: CliCheckResult,
  gatewayCovered: boolean
): { readonly status: boolean; readonly warn: boolean } {
  const unsupported = cli.installed && cli.versionStatus === 'unsupported';
  const status = cli.installed && cli.authenticated && !unsupported;
  const degraded = !cli.authenticated || cli.versionStatus === 'outdated';
  return { status, warn: gatewayCovered || (cli.installed && !unsupported && degraded) };
}

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
  // #6782: a broken CLI the gateway serves around is reported, not failed.
  for (const covered of gatewayCoveredClis(result.gateway, result.clis)) {
    writeLine(
      `  ${colors.yellow}${symbols.warn}${colors.reset} ${formatGatewayCoveredCli(covered)}`
    );
  }
}
