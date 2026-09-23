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
  OPENAI_COMPAT_KEY_ENV,
  OPENAI_COMPAT_URL_ENV,
} from '../adapters/sdk/types.js';
import type { VoterTransportCheck } from './doctor.js';
import type { GatewayHealth } from './doctor-gateway.js';
import { colors, symbols, writeLine } from './ansi-output.js';

const CHECK = `${colors.green}${symbols.check}${colors.reset}`;
const WARN = `${colors.yellow}${symbols.warn}${colors.reset}`;
const CROSS = `${colors.red}${symbols.cross}${colors.reset}`;

/**
 * Prints which transport voter/consensus calls will use (#4255): an
 * in-process OpenAI-compatible gateway when configured, else the CLI
 * subprocess round-robin fallback. A configured gateway is followed by its
 * cost line. The gateway line reports the MEASURED gateway (#6609), not the
 * presence of its env vars: a gateway whose discovery fails is not used, and
 * the server falls back to CLI subprocesses.
 */
export function printVoterTransportCheck(check: VoterTransportCheck, gateway: GatewayHealth): void {
  if (check.configured) {
    writeLine(gatewayTransportLine(gateway));
    printGatewayCostLine(check.cost);
    printDeprecatedEnvLines(check.deprecatedEnv);
    return;
  }
  writeLine(`${CHECK} Voter transport: ${colors.dim}CLI subprocess${colors.reset}`);
  writeLine(
    `  ${colors.dim}Set ${OPENAI_COMPAT_URL_ENV} and ${OPENAI_COMPAT_KEY_ENV} for faster in-process voting${colors.reset}`
  );
  printDeprecatedEnvLines(check.deprecatedEnv);
}

/**
 * One warning per deprecated gateway alias in use (#4392 increment 3),
 * naming the replacement and whether the alias is honoured or ignored, then
 * the option-C consequence once: renaming is the opt-in to the gateway path.
 * Warnings only; `allHealthy` is untouched. No line when none is set.
 */
function printDeprecatedEnvLines(deprecatedEnv: VoterTransportCheck['deprecatedEnv']): void {
  if (deprecatedEnv === undefined || deprecatedEnv.length === 0) return;
  for (const d of deprecatedEnv) {
    const status = d.shadowed ? `ignored because ${d.replacement} is set` : 'honoured';
    writeLine(
      `${WARN} ${d.name} is deprecated — use ${d.replacement} (alias until the next major, #6291); ${status}`
    );
  }
  writeLine(
    `  ${colors.dim}The legacy names configure only the single-model custom-openai path; renaming to ` +
      `NEXUS_OPENAI_COMPAT_* opts into the gateway path (model discovery, in-process voter ` +
      `transport, api:<endpoint> arm)${colors.reset}`
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

/** The voter-transport line for a configured gateway, from its measurement. */
function gatewayTransportLine(gateway: GatewayHealth): string {
  switch (gateway.state) {
    case 'healthy':
      return (
        `${CHECK} Voter transport: In-process gateway (${gateway.host}: ` +
        `${String(gateway.chatCount)} chat models answered /models)`
      );
    case 'not_configured':
      // The env names a gateway but its config did not read: nothing was measured.
      return `${WARN} Voter transport: In-process gateway (not measured)`;
    default:
      return (
        `${CROSS} Voter transport: In-process gateway at ${gateway.host} FAILED ` +
        `(${gatewayFailureReason(gateway)}); voters fall back to CLI subprocesses`
      );
  }
}

/** Why a configured gateway is not in use, naming no secret. */
export function gatewayFailureReason(
  gateway: Exclude<GatewayHealth, { state: 'healthy' | 'not_configured' }>
): string {
  switch (gateway.state) {
    case 'refused_private_host':
      return `private-address guard refused it: ${gateway.reason}`;
    case 'discovery_failed':
      return gateway.error;
    case 'no_chat_models':
      return `/models listed ${String(gateway.listedCount)} models, none of them chat models`;
  }
}
