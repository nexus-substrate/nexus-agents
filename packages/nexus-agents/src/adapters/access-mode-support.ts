/** Bounded actual-transport capability evidence, never an execution permission grant. */
import type { ExecutionAccessMode, IModelAdapter } from '../core/types/model.js';
import { CLI_SUBPROCESS_TIMEOUTS } from '../config/timeouts.js';
import { withTimeout } from '../utils/async-utils.js';
import { raceAbort, throwIfAborted } from './abort-utils.js';

/** Cancellation stops awaiting the query; underlying detection may continue. */
export async function queryModelAccessMode(
  adapter: IModelAdapter,
  mode: ExecutionAccessMode,
  signal?: AbortSignal
): Promise<boolean | undefined> {
  throwIfAborted(signal, 'Access-mode query aborted');
  try {
    const query = adapter.supportsAccessMode?.bind(adapter);
    if (query === undefined) return undefined;
    const result = await withTimeout(
      raceAbort(
        Promise.resolve().then(() => query(mode, signal)),
        signal
      ),
      CLI_SUBPROCESS_TIMEOUTS.spawnMs,
      'Access-mode evidence unavailable'
    );
    throwIfAborted(signal, 'Access-mode query aborted');
    return result.ok && typeof result.value === 'boolean' ? result.value : undefined;
  } catch {
    throwIfAborted(signal, 'Access-mode query aborted');
    return undefined;
  }
}
