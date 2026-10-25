/** SDK normalization can supply defaults; only an explicit raw JSON field is a report. */
import type { ILogger } from '../../core/index.js';
import { validatedModelIdentity } from '../../cli-adapters/model-identity.js';

/** Extract a validated report without retaining or logging any response body content. */
export function readSdkReportedModel(body: unknown, logger: ILogger): string | undefined {
  if (body === undefined) return undefined;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    logger.debug('SDK model report unavailable', { reason: 'unsupported-body' });
    return undefined;
  }
  const prototype: unknown = Object.getPrototypeOf(body);
  if (prototype !== Object.prototype && prototype !== null) {
    logger.debug('SDK model report unavailable', { reason: 'non-json-object' });
    return undefined;
  }
  const model: unknown = Object.getOwnPropertyDescriptor(body, 'model')?.value;
  if (model === undefined) {
    logger.debug('SDK model report unavailable', { reason: 'missing-model' });
    return undefined;
  }
  return validatedModelIdentity(model);
}
