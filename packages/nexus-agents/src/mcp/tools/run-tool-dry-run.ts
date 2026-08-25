/**
 * Dry-run support for the `run` entry point (#4806).
 *
 * `run` dispatches across several strategies, and only the dev pipeline can
 * stop after plan+vote. Everything here exists to make the other case a
 * REFUSAL rather than a silent full execution — the objection that decided the
 * consensus vote was precisely that forwarding a do-not-act flag to a
 * dynamically-selected strategy is dangerous unless the unsupported path fails
 * closed.
 *
 * Lives beside `run-tool.ts` rather than inside it because that file is at its
 * `max-lines` ceiling; this is one cohesive concern, not a grab-bag.
 *
 * @module mcp/tools/run-tool-dry-run
 */
import { MetaDispatchError } from '../../orchestration/meta-dispatcher.js';
import { AuthorityRefusalError } from '../../orchestration/authority-tier-guard.js';

/** The only strategy whose executor stops before implementing. */
const DRY_RUN_CAPABLE = 'dev-pipeline';

/**
 * Raised when a dry run is requested of a strategy that cannot stop short of
 * acting.
 *
 * A `business` outcome, not an internal fault: the caller asked for something
 * coherent that this route cannot provide. Refusing is the point — executing a
 * run the caller asked to be dry would be worse than any error.
 */
export class DryRunUnsupportedError extends Error {
  constructor(readonly strategy: string) {
    super(
      `dryRun is not supported by the '${strategy}' strategy — only '${DRY_RUN_CAPABLE}' stops after plan+vote. ` +
        `Refusing rather than running for real. Re-run without dryRun, or force the ${DRY_RUN_CAPABLE} strategy.`
    );
    this.name = 'DryRunUnsupportedError';
  }
}

/**
 * Throws before any executor runs when the selected strategy cannot honour a
 * requested dry run. A no-op when `dryRun` is absent or false — the refusal
 * keys on the request, never on the strategy alone.
 */
export function assertDryRunSupported(dryRun: boolean | undefined, strategy: string): void {
  if (dryRun === true && strategy !== DRY_RUN_CAPABLE) {
    throw new DryRunUnsupportedError(strategy);
  }
}

/**
 * `business` for outcomes the caller asked for and can act on; `internal` for
 * genuine faults.
 *
 * A missing executor, an authority-ladder refusal (#3920) and a refused dry run
 * (#4806) are all fail-closed POLICY results, not defects.
 */
export function classifyDispatchError(err: unknown): 'business' | 'internal' {
  const noExecutor = err instanceof MetaDispatchError && err.code === 'no_executor';
  const refused = err instanceof AuthorityRefusalError;
  const dryRunUnsupported = err instanceof DryRunUnsupportedError;
  return noExecutor || refused || dryRunUnsupported ? 'business' : 'internal';
}
