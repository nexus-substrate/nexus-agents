/** Canonical validation and bounded host guard for per-model gateway clients. */
import { ConfigError } from '../core/index.js';
import { validateCustomApiBaseUrl } from './sdk/custom-api-validation.js';
import {
  checkGatewayHost,
  GatewayHostRefusedError,
  GATEWAY_HOST_LOOKUP_TIMED_OUT,
} from './gateway-host-status.js';

/** Validate before construction, without exposing URL credentials in errors. */
export function validateOpenAICompatBaseUrl(baseUrl: string | undefined): string {
  const validated = validateCustomApiBaseUrl(baseUrl);
  if (!validated.ok) throw validated.error;
  return validated.value.toString();
}

/** Cache an allowed host check; refusals remain retryable and never send HTTP. */
export function guardedGatewayFetch(baseUrl: string): typeof fetch {
  let allowed: Promise<void> | undefined;
  const check = async (): Promise<void> => {
    const status = await checkGatewayHost(baseUrl);
    if (status.state === 'refused_private_host') throw new GatewayHostRefusedError(status);
    if (status.state === 'lookup_timed_out') {
      throw new ConfigError(`${GATEWAY_HOST_LOOKUP_TIMED_OUT} (host ${status.host})`);
    }
  };
  return async (input, init) => {
    allowed ??= check();
    try {
      await allowed;
    } catch (error: unknown) {
      allowed = undefined;
      throw error;
    }
    return fetch(input, init);
  };
}
