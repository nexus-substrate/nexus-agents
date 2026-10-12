/**
 * Model catalog admission policy and gateway reachability tracking (#7072).
 *
 * Increment C of Epic #4391:
 * - Keeps provider × model dimension in catalog snapshot
 * - Gateway-reachability admission: admits a model only if covered by
 *   a configured gateway's `serves()` or explicit pins (never all ~6,250 models)
 * - Untrusted catalog input validation: strict schema, size limits, and SSRF protection
 *
 * @module config/model-catalog-admission
 */

import { z } from 'zod';
import { canonicalModelKey } from './model-equivalence.js';
import { MODEL_IDS } from './model-capabilities-types.js';
import type { ModelEntry } from './model-registry.js';
import type { ModelVendor } from './model-identity.js';
import type { ModelsDevSnapshot } from './models-dev-snapshot-loader.js';

export const MAX_CATALOG_PAYLOAD_BYTES = 25 * 1024 * 1024; // 25 MiB

export const PROVIDER_TO_VENDOR: Readonly<Record<string, ModelVendor>> = {
  anthropic: 'anthropic',
  openai: 'openai',
  google: 'google',
  'google-vertex': 'google',
  meta: 'meta',
  mistral: 'mistral',
  cohere: 'cohere',
  deepseek: 'deepseek',
  alibaba: 'qwen',
  qwen: 'qwen',
  nvidia: 'nvidia',
};

/** Mapping from configured CLI name to models.dev provider key. */
export const CLI_GATEWAY_TO_PROVIDER: Readonly<Record<string, string>> = {
  claude: 'anthropic',
  codex: 'openai',
  gemini: 'google',
  opencode: 'openrouter',
};

const ModelsDevRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  family: z.string().optional(),
  tool_call: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  attachment: z.boolean().optional(),
  modalities: z
    .object({
      input: z.array(z.string()).optional(),
      output: z.array(z.string()).optional(),
    })
    .optional(),
  cost: z
    .object({
      input: z.number().optional(),
      output: z.number().optional(),
      cache_read: z.number().optional(),
    })
    .optional(),
  limit: z
    .object({
      context: z.number().optional(),
      output: z.number().optional(),
    })
    .optional(),
  release_date: z.string().optional(),
  last_updated: z.string().optional(),
  open_weights: z.boolean().optional(),
});

export type ModelsDevRecord = z.infer<typeof ModelsDevRecordSchema>;

const ModelsDevProviderSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  models: z.record(z.string(), ModelsDevRecordSchema).optional(),
});

export type ModelsDevProvider = z.infer<typeof ModelsDevProviderSchema>;

const ModelsDevCatalogSchema = z.record(z.string(), ModelsDevProviderSchema);

export type ModelsDevCatalog = z.infer<typeof ModelsDevCatalogSchema>;

export type ServesResult = 'yes' | 'no' | 'unknown';
export type ServesPredicate = (modelId: string) => Promise<ServesResult> | ServesResult;

export interface CatalogAdmissionPolicy {
  readonly explicitPins?: ReadonlySet<string>;
  readonly configuredGateways?: readonly string[];
  readonly servesPredicates?: readonly ServesPredicate[];
  readonly includeInTreePins?: boolean;
}

export type UrlValidationResult =
  { readonly ok: true; readonly url: URL } | { readonly ok: false; readonly error: string };

const PRIVATE_IPV4_PATTERNS = [
  /^127\./, // Loopback
  /^10\./, // Class A
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Class B
  /^192\.168\./, // Class C
  /^169\.254\./, // Link-local
  /^0\./, // Current network
];

function isPrivateIpHost(hostname: string): boolean {
  if (hostname === 'localhost') return true;
  for (const pattern of PRIVATE_IPV4_PATTERNS) {
    if (pattern.test(hostname)) return true;
  }
  const cleanIpv6 = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    cleanIpv6 === '::1' ||
    cleanIpv6.startsWith('fc') ||
    cleanIpv6.startsWith('fd') ||
    cleanIpv6.startsWith('fe80')
  );
}

/** Validate URL for catalog fetching against SSRF risks. */
export function validateCatalogFetchUrl(
  inputUrl: string,
  allowedHostnames: readonly string[] = ['models.dev']
): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    return { ok: false, error: 'Invalid URL string' };
  }

  if (parsed.protocol !== 'https:') {
    return { ok: false, error: `Refused non-HTTPS protocol: ${parsed.protocol}` };
  }

  if (parsed.username !== '' || parsed.password !== '') {
    return { ok: false, error: 'Refused embedded credentials in catalog URL' };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isPrivateIpHost(hostname)) {
    return { ok: false, error: `Refused private or loopback IP host: ${hostname}` };
  }

  const isAllowedHost = allowedHostnames.some(
    (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
  );
  if (!isAllowedHost) {
    return { ok: false, error: `Hostname ${hostname} is not in the allowed host list` };
  }

  return { ok: true, url: parsed };
}

/** Validate catalog payload size against payload ceiling. */
export function validateCatalogPayloadSize(
  byteLength: number,
  maxBytes: number = MAX_CATALOG_PAYLOAD_BYTES
): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  if (byteLength > maxBytes) {
    return {
      ok: false,
      error: `Oversized catalog payload: ${String(byteLength)} bytes exceeds maximum ${String(maxBytes)} bytes`,
    };
  }
  return { ok: true };
}

/** Strictly parse and validate raw models.dev catalog JSON. */
export function parseModelsDevCatalog(
  raw: unknown
):
  | { readonly ok: true; readonly data: ModelsDevCatalog }
  | { readonly ok: false; readonly error: string } {
  const result = ModelsDevCatalogSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true, data: result.data };
}

function isPinnedModel(modelId: string, explicitPins?: ReadonlySet<string>): boolean {
  if (explicitPins === undefined) return false;
  if (explicitPins.has(modelId)) return true;
  const canonicalKey = canonicalModelKey(modelId);
  return canonicalKey !== null && explicitPins.has(canonicalKey);
}

function matchesConfiguredGateway(
  modelGateways: readonly string[],
  configuredGateways?: readonly string[]
): boolean {
  if (configuredGateways === undefined || configuredGateways.length === 0) return false;
  const configuredSet = new Set(configuredGateways);
  return modelGateways.some((gw) => {
    if (configuredSet.has(gw)) return true;
    for (const [cli, provider] of Object.entries(CLI_GATEWAY_TO_PROVIDER)) {
      if (configuredSet.has(cli) && provider === gw) return true;
    }
    return false;
  });
}

function matchesServesPredicate(modelId: string, predicates?: readonly ServesPredicate[]): boolean {
  if (predicates === undefined) return false;
  return predicates.some((predicate) => predicate(modelId) === 'yes');
}

function resolveModelAdmission(
  modelId: string,
  modelGateways: readonly string[],
  policy: CatalogAdmissionPolicy
): boolean {
  if (isPinnedModel(modelId, policy.explicitPins)) return true;
  if (matchesConfiguredGateway(modelGateways, policy.configuredGateways)) return true;
  return matchesServesPredicate(modelId, policy.servesPredicates);
}

function attachScalarMetadata(entry: Record<string, unknown>, raw: ModelsDevRecord): void {
  if (raw.name !== undefined && raw.name !== raw.id) entry['displayName'] = raw.name;
  if (raw.last_updated !== undefined) entry['verifiedAt'] = raw.last_updated;
  if (raw.limit?.context !== undefined) entry['contextWindow'] = raw.limit.context;
  if (raw.limit?.output !== undefined) entry['maxOutputTokens'] = raw.limit.output;
}

function attachCapabilityMetadata(entry: Record<string, unknown>, raw: ModelsDevRecord): void {
  if (raw.cost?.input !== undefined && raw.cost.output !== undefined) {
    entry['pricing'] = { inputPer1M: raw.cost.input, outputPer1M: raw.cost.output };
  }
  if (raw.tool_call === true) {
    entry['toolCapabilities'] = ['function_calling'];
  }
}

function attachOptionalMetadata(entry: Record<string, unknown>, raw: ModelsDevRecord): void {
  attachScalarMetadata(entry, raw);
  attachCapabilityMetadata(entry, raw);
}

function mapCatalogRecord(
  raw: ModelsDevRecord,
  vendor: ModelVendor,
  gateways: readonly string[]
): ModelEntry | null {
  if (raw.id.length === 0) return null;
  const family = typeof raw.family === 'string' && raw.family.length > 0 ? raw.family : raw.id;
  const entry: Record<string, unknown> = {
    id: raw.id,
    vendor,
    family,
    parallelToolCalls: false,
    promptCaching: 'none',
    toolDefinitionFormat: 'openai',
    maxRecommendedTurnBudget: 10,
    strictJson: true,
    quirks: [],
    profileId: `models-dev-${vendor}`,
    source: 'models-dev',
    gateways,
  };
  attachOptionalMetadata(entry, raw);
  return entry as unknown as ModelEntry;
}

interface CatalogIndexResult {
  readonly rawGateways: Record<string, string[]>;
  readonly canonicalGateways: Record<string, string[]>;
  readonly rawEntriesByModelId: Map<string, { raw: ModelsDevRecord; vendor: ModelVendor }>;
}

function recordModelGateway(
  rawGateways: Record<string, string[]>,
  canonicalGateways: Record<string, string[]>,
  modelId: string,
  providerKey: string
): void {
  rawGateways[modelId] ??= [];
  if (!rawGateways[modelId].includes(providerKey)) {
    rawGateways[modelId].push(providerKey);
  }
  const cKey = canonicalModelKey(modelId);
  if (cKey !== null) {
    canonicalGateways[cKey] ??= [];
    if (!canonicalGateways[cKey].includes(providerKey)) {
      canonicalGateways[cKey].push(providerKey);
    }
  }
}

function indexCatalogProviders(catalog: ModelsDevCatalog): CatalogIndexResult {
  const rawGateways: Record<string, string[]> = {};
  const canonicalGateways: Record<string, string[]> = {};
  const rawEntriesByModelId = new Map<string, { raw: ModelsDevRecord; vendor: ModelVendor }>();

  for (const [providerKey, provider] of Object.entries(catalog)) {
    if (provider.models === undefined) continue;
    const vendor = PROVIDER_TO_VENDOR[providerKey];
    for (const rawRecord of Object.values(provider.models)) {
      const id = rawRecord.id;
      recordModelGateway(rawGateways, canonicalGateways, id, providerKey);
      if (vendor !== undefined && !rawEntriesByModelId.has(id)) {
        rawEntriesByModelId.set(id, { raw: rawRecord, vendor });
      }
    }
  }

  return { rawGateways, canonicalGateways, rawEntriesByModelId };
}

function buildGatewaysByModel(
  rawGateways: Record<string, string[]>,
  canonicalGateways: Record<string, string[]>
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const id of Object.keys(rawGateways)) {
    const direct = rawGateways[id] ?? [];
    const cKey = canonicalModelKey(id);
    const byCanonical = cKey !== null ? (canonicalGateways[cKey] ?? []) : [];
    result[id] = [...new Set([...direct, ...byCanonical])].sort();
  }
  return result;
}

function buildEffectivePins(policy: CatalogAdmissionPolicy): Set<string> {
  const pins = new Set(policy.explicitPins ?? []);
  if (policy.includeInTreePins !== false) {
    for (const pinnedId of MODEL_IDS) {
      pins.add(pinnedId);
      const key = canonicalModelKey(pinnedId);
      if (key !== null) pins.add(key);
    }
  }
  return pins;
}

/** Filter catalog to admitted models and index provider × model coverage. */
export function filterAdmittedModels(
  catalog: ModelsDevCatalog,
  policy: CatalogAdmissionPolicy = {}
): {
  readonly admittedEntries: readonly ModelEntry[];
  readonly gatewaysByModel: Readonly<Record<string, readonly string[]>>;
} {
  const { rawGateways, canonicalGateways, rawEntriesByModelId } = indexCatalogProviders(catalog);
  const gatewaysByModel = buildGatewaysByModel(rawGateways, canonicalGateways);
  const effectivePins = buildEffectivePins(policy);
  const effectivePolicy: CatalogAdmissionPolicy = { ...policy, explicitPins: effectivePins };

  const admittedEntries: ModelEntry[] = [];
  for (const id of Object.keys(gatewaysByModel).sort()) {
    const gateways = gatewaysByModel[id] ?? [];
    if (!resolveModelAdmission(id, gateways, effectivePolicy)) continue;

    const mapped = rawEntriesByModelId.get(id);
    if (mapped !== undefined) {
      const entry = mapCatalogRecord(mapped.raw, mapped.vendor, gateways);
      if (entry !== null) admittedEntries.push(entry);
    }
  }

  return { admittedEntries, gatewaysByModel };
}

function resolveCanonicalServers(
  modelId: string,
  index: Readonly<Record<string, readonly string[]>>
): readonly string[] | undefined {
  const targetKey = canonicalModelKey(modelId);
  if (targetKey === null) return undefined;
  for (const [k, gws] of Object.entries(index)) {
    if (canonicalModelKey(k) === targetKey) return gws;
  }
  return undefined;
}

function resolveModelServers(modelId: string, snapshot?: ModelsDevSnapshot): readonly string[] {
  const index = snapshot?.gatewaysByModel;
  if (index?.[modelId] !== undefined) return index[modelId];

  if (index !== undefined) {
    const canonical = resolveCanonicalServers(modelId, index);
    if (canonical !== undefined) return canonical;
  }

  const entry = snapshot?.entries.find((e) => e.id === modelId);
  return entry?.gateways ?? [];
}

function filterToConfiguredGateways(
  servers: readonly string[],
  configured: readonly string[]
): readonly string[] {
  const matched: string[] = [];
  for (const cfg of configured) {
    const provider = CLI_GATEWAY_TO_PROVIDER[cfg] ?? cfg;
    if (servers.includes(provider) || servers.includes(cfg)) {
      matched.push(cfg);
    }
  }
  return matched;
}

/** Answers which configured gateways serve model X (#7072). */
export function whichGatewaysServe(
  modelId: string,
  options: {
    readonly snapshot?: ModelsDevSnapshot;
    readonly configuredGateways?: readonly string[];
  } = {}
): readonly string[] {
  const servers = resolveModelServers(modelId, options.snapshot);
  if (options.configuredGateways === undefined) return servers;
  return filterToConfiguredGateways(servers, options.configuredGateways);
}
