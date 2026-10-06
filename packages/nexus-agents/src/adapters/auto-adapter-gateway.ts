/**
 * Compatibility gateway alias selection and its discovery provenance.
 * @module adapters/auto-adapter-gateway
 */
import type { ILogger, IModelAdapter } from '../core/index.js';
import type { AdapterSelection } from './auto-adapter.js';
import { createOpenAICompatClient, readOpenAICompatEnv } from './openai-compat-adapter.js';
import { hostnameOf, readCustomApiSurface, readGatewayEnv } from './sdk/gateway-env.js';
import { CUSTOM_API_DEFAULT_MODEL } from '../config/defaults.js';
import { resolveGatewayDefault } from './gateway-family-slots.js';
import { gatewayDiscoveryStatus } from './gateway-discovery.js';
import { withGatewayUsageRecording } from './gateway-usage-recording.js';

/**
 * Keep the historical custom-openai arm over the canonical gateway client.
 * Catalogue selection reuses its resolved model id; the alias retains its
 * own API surface and token-cap policy. Only the hostname reaches the log.
 */
export function tryCustomOpenAiAdapter(logger: ILogger): AdapterSelection | null {
  const { baseUrl: customBaseUrl, apiKey: customKey } = readGatewayEnv();
  if (customKey === undefined || customBaseUrl === undefined) return null;
  const choice = customModelChoice(logger);
  if (choice === null) return null;
  const { adapter, note } = choice;
  const customModelId = adapter.modelId;
  const modelVerified = choice.modelVerified;
  const host = hostnameOf(customBaseUrl);
  logger.info('Using custom-openai gateway alias', { model: customModelId, host });
  return {
    // Snapshot the selection on the call's adapter, rather than reading the
    // resilient proxy's mutable health after a refresh/failover (#6862).
    // Always wrapped, so pricing never depends on whether discovery measured
    // the choice: every custom-openai call is priced by the gateway declaration.
    adapter: withGatewayUsageRecording(
      adapter,
      'api:custom-openai',
      modelVerified,
      'sdk-custom-openai'
    ),
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
 * no discovery measured this choice.
 */
function customModelChoice(
  logger: ILogger
): { adapter: IModelAdapter; note: string; modelVerified?: boolean } | null {
  const d = resolveGatewayDefault(process.env, logger);
  if (d.kind === 'unavailable') {
    logger.warn('Gateway catalogue has no chat model; the custom-openai default is unavailable');
    return null;
  }
  const config = readOpenAICompatEnv();
  if (config === null) return null;
  const modelId =
    d.kind === 'resolved'
      ? d.adapter.modelId
      : (process.env['NEXUS_CUSTOM_MODEL'] ?? CUSTOM_API_DEFAULT_MODEL);
  const adapter = createOpenAICompatClient(modelId, {
    ...config,
    logger,
    apiSurface: readCustomApiSurface(),
    omitDefaultTokenCap: true,
  });
  if (d.kind === 'resolved')
    return {
      adapter,
      note: `; gateway default by ${d.via}`,
      modelVerified: true,
    };
  if (gatewayDiscoveryStatus() !== 'failed') return { adapter, note: '' };
  // #4392: failed discovery leaves this configured model explicitly unverified.
  logger.warn(
    `Gateway discovery failed, so the custom-openai model '${modelId}' is sent unverified; ` +
      'set NEXUS_CUSTOM_MODEL to a model the gateway serves, or run `nexus-agents doctor --gateway`',
    { model: modelId }
  );
  return { adapter, note: '; unverified: gateway discovery failed', modelVerified: false };
}
