/** Internal execution receipts; deliberately absent from public adapter contracts/barrels. */
import type { Result } from '../core/index.js';
import type { CliCircuitBreaker } from './circuit-breaker.js';
import type { CliError, CliResponse, ICliAdapter } from './types.js';

type CliResult = Result<CliResponse, CliError>;
interface OutcomeOwner {
  readonly adapter: ICliAdapter;
  readonly breaker: CliCircuitBreaker;
}

const owners = new WeakMap<CliResult, OutcomeOwner>();

/**
 * Name the actual Base outcome path on a fresh execution container, never the
 * provider's reusable result. The retry loop handles eligible failures; Base
 * handles success. Exempt errors still require the admitting caller's release.
 */
export function withCliOutcomeOwner(
  result: CliResult,
  adapter: ICliAdapter,
  breaker: CliCircuitBreaker
): CliResult {
  const fresh = { ...result };
  owners.set(fresh, { adapter, breaker });
  return fresh;
}

/** Move the receipt when Base adds access-mode evidence to a fresh success result. */
export function transferCliOutcomeOwner(source: CliResult, target: CliResult): CliResult {
  const owner = owners.get(source);
  owners.delete(source);
  if (owner !== undefined) owners.set(target, owner);
  return target;
}

/**
 * One observation only. Exact breaker identity establishes both registry and
 * arm agreement; same-named private breakers do not match. Adapter identity
 * deliberately excludes wrappers forwarding another adapter's result.
 */
export function consumeCliOutcomeOwner(
  result: CliResult,
  adapter: ICliAdapter,
  breaker: CliCircuitBreaker
): boolean {
  const owner = owners.get(result);
  owners.delete(result);
  return owner?.adapter === adapter && owner.breaker === breaker;
}
