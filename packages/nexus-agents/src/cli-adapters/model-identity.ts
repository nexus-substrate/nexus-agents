/** Admission of response identities before display, pricing or ledger projection. */
import { VoterSummarySchema } from '../audit/vote-record.js';
import { UNRESOLVED_MODEL_ID } from '../config/model-equivalence.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger({ component: 'model-identity' });

/**
 * Reuse the unchanged ledger's raw-identity constraints instead of forking them.
 * Invalid optional evidence never invalidates a successful completion or vote.
 */
export function validatedModelIdentity(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const parsed = VoterSummarySchema.shape.servedModel.safeParse(value);
  if (parsed.success && parsed.data !== UNRESOLVED_MODEL_ID) return parsed.data;
  logger.warn('Omitting invalid optional model identity', {
    valueType: typeof value,
    ...(typeof value === 'string' ? { length: value.length } : {}),
  });
  return undefined;
}
