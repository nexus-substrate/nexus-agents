/**
 * The router's CLI admission predicate (#6720).
 *
 * `isCliAvailable` (factory) and `doctor` both decide from it whether a CLI
 * serves its own slot, so doctor cannot report "CLI" for a slot the router
 * sends to the gateway. A module of its own so modules that mock the factory
 * wholesale still reach the real predicate.
 *
 * @module cli-adapters/cli-admission
 */

import type { HealthStatus } from './types.js';
import type { AuthProbeResult } from '../cli/cli-auth-probe.js';

/** The auth probe determined the CLI cannot serve: logged out or not installed. */
export function cliAuthBlocks(auth: Pick<AuthProbeResult, 'state'>): boolean {
  return auth.state === 'needs-login' || auth.state === 'not-installed';
}

/**
 * Whether a CLI with this health and auth probe is available to route to.
 *
 * #4391: `unknown` auth is ADMITTED, not excluded. Some gateways expose no
 * auth signal we can read — agy has no non-interactive auth check at all, and
 * its `models` subcommand hangs without a TTY (#4393). Treating an absence of
 * evidence as a failure is what excluded a working agy arm from routing
 * (#4346); treating it as success is how the retired gemini CLI stayed
 * selectable while failing every call (#4318). We admit it and let real
 * invocation failures do the excluding, via the circuit breaker the adapters
 * now feed (#4330).
 */
export function isCliAdmitted(
  health: Pick<HealthStatus, 'healthy'>,
  auth: Pick<AuthProbeResult, 'state'>
): boolean {
  return health.healthy && !cliAuthBlocks(auth);
}
