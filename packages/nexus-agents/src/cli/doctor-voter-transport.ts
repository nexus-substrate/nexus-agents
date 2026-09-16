/**
 * Doctor lines for the voter transport (#4255) and the gateway's cost
 * declaration (#4392 increment 2). A sibling of `doctor-formatting.ts` for
 * the file cap, in the same shape as `doctor-claude-model.ts`.
 *
 * @module cli/doctor-voter-transport
 */

import { describeGatewayCostDeclaration } from '../adapters/sdk/gateway-cost.js';
import { GATEWAY_COST_ENV } from '../adapters/sdk/types.js';
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

/**
 * The gateway's cost declaration. UNDECLARED is a warning that names the fix
 * and the consequence; it does not touch `allHealthy`. No line at all when
 * no gateway is configured (`cost` absent).
 */
function printGatewayCostLine(cost: VoterTransportCheck['cost']): void {
  if (cost === undefined) return;
  if (cost === 'undeclared') {
    writeLine(
      `${WARN} Gateway cost: UNDECLARED — set ${GATEWAY_COST_ENV}=free|local|priced[:<in>,<out>]; ` +
        'cost-weighted routing excludes this gateway until declared'
    );
    return;
  }
  writeLine(`${CHECK} Gateway cost: ${describeGatewayCostDeclaration(cost)}`);
}
