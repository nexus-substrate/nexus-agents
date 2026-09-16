/**
 * Doctor lines for the voter transport (#4255) and the gateway's cost
 * declaration (#4392 increment 2). A sibling of `doctor-formatting.ts` for
 * the file cap, in the same shape as `doctor-claude-model.ts`.
 *
 * @module cli/doctor-voter-transport
 */

import { describeGatewayCostDeclaration } from '../adapters/sdk/gateway-cost.js';
import {
  DEFAULT_OPENAI_COMPAT_ENDPOINT,
  GATEWAY_COST_ENV,
  OPENAI_COMPAT_ENDPOINT_ENV,
} from '../adapters/sdk/types.js';
import type { VoterTransportCheck } from './doctor.js';
import { colors, symbols, writeLine } from './ansi-output.js';

const CHECK = `${colors.green}${symbols.check}${colors.reset}`;
const WARN = `${colors.yellow}${symbols.warn}${colors.reset}`;

/**
 * Prints which transport voter/consensus calls will use (#4255): an
 * in-process OpenAI-compatible gateway when configured, else the CLI
 * subprocess round-robin fallback. A configured gateway is followed by its
 * cost line.
 */
export function printVoterTransportCheck(check: VoterTransportCheck): void {
  if (check.configured) {
    writeLine(`${CHECK} Voter transport: In-process gateway`);
    printGatewayCostLine(check.cost);
    return;
  }
  writeLine(`${CHECK} Voter transport: ${colors.dim}CLI subprocess${colors.reset}`);
  writeLine(
    `  ${colors.dim}Set NEXUS_OPENAI_COMPAT_URL and NEXUS_OPENAI_COMPAT_KEY for faster in-process voting${colors.reset}`
  );
}

const CEILING_CONSEQUENCE =
  'the task-class cost ceiling and the per-task budget exclude this gateway until declared';

/** One warning per gap, each naming its own fix (see `VoterTransportCheck.cost`). */
const GAP_LINES: Record<'unset' | 'invalid' | 'no-default', string> = {
  unset: `Gateway cost: UNSET — set ${GATEWAY_COST_ENV}=free|local|priced[:<in>,<out>]; ${CEILING_CONSEQUENCE}`,
  invalid: `Gateway cost: INVALID — ${GATEWAY_COST_ENV} does not parse (the startup env warning names the reason); ${CEILING_CONSEQUENCE}`,
  'no-default': `Gateway cost: NOT DECLARED for the voter gateway — ${GATEWAY_COST_ENV} names neither a bare declaration nor this gateway's endpoint (${OPENAI_COMPAT_ENDPOINT_ENV}, default ${DEFAULT_OPENAI_COMPAT_ENDPOINT}); add a bare or <endpoint>= entry; ${CEILING_CONSEQUENCE}`,
};

/**
 * The gateway's cost declaration. Each gap is a warning that names its fix
 * and the consequence; none touches `allHealthy`. No line at all when no
 * gateway is configured (`cost` absent).
 */
function printGatewayCostLine(cost: VoterTransportCheck['cost']): void {
  if (cost === undefined) return;
  if (typeof cost === 'string') {
    writeLine(`${WARN} ${GAP_LINES[cost]}`);
    return;
  }
  writeLine(`${CHECK} Gateway cost: ${describeGatewayCostDeclaration(cost)}`);
}
