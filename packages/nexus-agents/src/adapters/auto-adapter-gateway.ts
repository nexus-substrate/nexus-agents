/**
 * Single-model SDK gateway selection and its discovery provenance.
 * @module adapters/auto-adapter-gateway
 */
import type { ILogger } from '../core/index.js';
import type { AdapterSelection } from './auto-adapter.js';
import { SdkAdapter } from './sdk/index.js';
import { hostnameOf, readGatewayEnv } from './sdk/gateway-env.js';
import { CUSTOM_API_DEFAULT_MODEL } from '../config/defaults.js';
import { resolveGatewayDefault } from './gateway-family-slots.js';
import { gatewayDiscoveryStatus } from './gateway-discovery.js';
import { withGatewayUsageRecording } from './gateway-usage-recording.js';

/**
 * Tries the custom-openai SDK adapter if the gateway URL and key are both
 * set: `NEXUS_OPENAI_COMPAT_URL` / `NEXUS_OPENAI_COMPAT_KEY`, or their
 * deprecated aliases `NEXUS_CUSTOM_API_BASE_URL` / `NEXUS_CUSTOM_API_KEY`
 * (#4392 increment 3; the resolver warns once when an alias is in use). The
 * adapter constructor runs the base URL through an SSRF guard (see
 * adapters/sdk/custom-api-validation.ts). Epic #2119.
 *
 * Only the hostname reaches the log and the reason string: a base URL can
 * carry userinfo.
 */
export function tryCustomOpenAiAdapter(logger: ILogger): AdapterSelection | null {
  const {
    baseUrl: customBaseUrl,
    apiKey: customKey,
    deprecated,
  } = readGatewayEnv(process.env, logger);
  if (customKey === undefined || customBaseUrl === undefined) return null;
  const choice = customModelChoice(logger);
  if (choice === null) return null;
  const { modelId: customModelId, note } = choice;
  // Discovery does not probe the deprecated SDK transport. A catalogue read
  // from OpenCode can belong to a different gateway entirely (#6862).
  const modelVerified = deprecated.some((use) => !use.shadowed) ? undefined : choice.modelVerified;
  const host = hostnameOf(customBaseUrl);
  logger.info('Using custom-openai SDK adapter', { model: customModelId, host });
  // The caller's logger reaches the adapter on failed calls (#4392 inc 3).
  const adapter = new SdkAdapter(
    {
      providerId: 'custom-openai',
      modelId: customModelId,
      apiKey: customKey,
      baseUrl: customBaseUrl,
    },
    logger
  );
  return {
    // Snapshot the selection on the call's adapter, rather than reading the
    // resilient proxy's mutable health after a refresh/failover (#6862).
    // Always wrapped, so pricing never depends on whether discovery measured
    // the choice: every custom-openai call is priced by the gateway declaration.
    adapter: withGatewayUsageRecording(adapter, 'api:custom-openai', modelVerified),
    source: 'api',
    name: 'custom-openai',
    reason: `Using custom OpenAI-compatible gateway at ${host} (model: ${customModelId}${note})`,
    ...(modelVerified !== undefined && { modelVerified }),
  };
}

/**
 * The model the custom-openai adapter sends. With no gateway catalogue it is
 * `NEXUS_CUSTOM_MODEL` or the built-in default, exactly as before #6626. In
 * gateway mode it is a matched catalogue model (`resolveGatewayDefault`);
 * after failed discovery the configured id is explicitly unverified.
 * Null when the catalogue holds no chat model. Absence of verification means
 * no discovery measured this choice (including deprecated configuration).
 */
function customModelChoice(
  logger: ILogger
): { modelId: string; note: string; modelVerified?: boolean } | null {
  const d = resolveGatewayDefault(process.env, logger);
  if (d.kind === 'inactive') {
    const modelId = process.env['NEXUS_CUSTOM_MODEL'] ?? CUSTOM_API_DEFAULT_MODEL;
    if (gatewayDiscoveryStatus() !== 'failed') return { modelId, note: '' };
    // #4392: a gateway is configured but its catalogue could not be read, so
    // nothing says it serves this model. Still sent (a gateway without a
    // working /models can serve it), but never as if it were validated.
    logger.warn(
      `Gateway discovery failed, so the custom-openai model '${modelId}' is sent unverified; ` +
        'set NEXUS_CUSTOM_MODEL to a model the gateway serves, or run `nexus-agents doctor --gateway`',
      { model: modelId }
    );
    return { modelId, note: '; unverified: gateway discovery failed', modelVerified: false };
  }
  if (d.kind === 'resolved')
    return {
      modelId: d.adapter.modelId,
      note: `; gateway default by ${d.via}`,
      modelVerified: true,
    };
  logger.warn('Gateway catalogue has no chat model; the custom-openai default is unavailable');
  return null;
}
