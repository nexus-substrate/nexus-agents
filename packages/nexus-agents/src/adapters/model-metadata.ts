/** Bounded lazy selected-model metadata shared by expanded-input consumers. */
import type { IModelAdapter } from '../core/types/model.js';
import { UNRESOLVED_MODEL_ID } from '../config/model-equivalence.js';
import { CLI_SUBPROCESS_TIMEOUTS } from '../config/timeouts.js';
import { withTimeout } from '../utils/async-utils.js';
import { raceAbort } from './abort-utils.js';

/**
 * Warm distinct unresolved proxies without completing a prompt. A caller must
 * re-read metadata and refuse unknown capacity; this is not served-model proof.
 * Cancellation stops awaiting detection, not its underlying initialization.
 */
export async function warmModelMetadata(
  adapters: Iterable<IModelAdapter>,
  signal?: AbortSignal
): Promise<void> {
  signal?.throwIfAborted();
  for (const adapter of new Set(adapters)) {
    if (adapter.modelId !== UNRESOLVED_MODEL_ID) continue;
    const warmed = await withTimeout(
      raceAbort(adapter.countTokens(''), signal),
      CLI_SUBPROCESS_TIMEOUTS.spawnMs,
      'Model metadata detection timed out'
    );
    if (!warmed.ok) throw new Error(warmed.error);
    signal?.throwIfAborted();
  }
  signal?.throwIfAborted();
}
