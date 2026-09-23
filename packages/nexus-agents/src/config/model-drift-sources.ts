/**
 * Discovery sources for the model-drift report (#6625).
 *
 * Every source wraps a listing the repo already has code for; none is a new
 * HTTP client:
 *
 *   - `gateway`: the OpenAI-compatible gateway catalog, through
 *     `discoverModels`, so the #6617 chat filter and operator allowlist apply;
 *   - `anthropic-api` / `openai-api` / `google-api`: the SDK adapters'
 *     `listModels()` (`/v1/models`, `models.list`);
 *   - `openrouter`: the unauthenticated catalog source that
 *     `buildDefaultModelSources` registers on the AvailableModelsCache.
 *
 * A source with no credentials or no configuration probes as `unmeasured`
 * with the reason, and is never called. A source that fails THROWS, so the
 * report records it as `failed`; neither is ever a list of zero models.
 *
 * The CLI adapters' `listModels()` are left out on purpose: claude, codex and
 * gemini enumerate the committed models.dev snapshot, which is not a live
 * listing, so it cannot say a model was added or withdrawn.
 *
 * @module config/model-drift-sources
 */

import { createClaudeAdapter } from '../adapters/claude-adapter.js';
import { createGeminiAdapter } from '../adapters/gemini-adapter.js';
import { createOpenAIAdapter } from '../adapters/openai-adapter.js';
import {
  discoverModels,
  readOpenAICompatEnv,
  type DiscoveredModel,
  type OpenAICompatConfig,
} from '../adapters/openai-compat-adapter.js';
import type { ConfigError, Result } from '../core/index.js';
import type { ModelMetadata } from '../core/types/model.js';
import { getDefaultRegistry } from './model-registry.js';
import type { ModelVendor } from './model-identity.js';
import type { DriftProbe, DriftSource, ListedModel } from './model-drift.js';
import {
  createOpenRouterModelsSource,
  type OpenRouterCatalogModel,
} from './openrouter-models-source.js';

/** A vendor whose list endpoint an SDK adapter wraps. */
export type DriftVendorApi = 'anthropic' | 'openai' | 'google';

/** Structural view of an adapter that lists models. */
export interface ModelLister {
  listModels(): Promise<readonly ModelMetadata[]>;
}

/** Injectable transports; every default is the production path. */
export interface DriftSourceDeps {
  readonly env?: NodeJS.ProcessEnv;
  readonly readGateway?: () => OpenAICompatConfig | null;
  readonly discoverGateway?: (
    config: OpenAICompatConfig
  ) => Promise<Result<readonly DiscoveredModel[], ConfigError>>;
  readonly vendorLister?: (vendor: DriftVendorApi, apiKey: string) => ModelLister;
  readonly openRouterCatalog?: () => Promise<readonly OpenRouterCatalogModel[]>;
}

const VENDOR_APIS: ReadonlyArray<{
  readonly name: string;
  readonly vendor: DriftVendorApi;
  readonly keyEnv: string;
}> = [
  { name: 'anthropic-api', vendor: 'anthropic', keyEnv: 'ANTHROPIC_API_KEY' },
  { name: 'openai-api', vendor: 'openai', keyEnv: 'OPENAI_API_KEY' },
  { name: 'google-api', vendor: 'google', keyEnv: 'GOOGLE_AI_API_KEY' },
];

function unmeasured(reason: string): DriftProbe {
  return { status: 'unmeasured', reason };
}

/**
 * The adapters need a model id to construct, though listing never uses it.
 * Take one from the registry rather than writing a model string here.
 */
function registryModelIdFor(vendor: ModelVendor): string {
  const entry = getDefaultRegistry()
    .allEntries()
    .find((e) => e.source === 'in-tree' && e.vendor === vendor);
  if (entry === undefined) throw new Error(`no in-tree ${vendor} model to construct a lister`);
  return entry.cliModelName ?? entry.id;
}

function defaultVendorLister(vendor: DriftVendorApi, apiKey: string): ModelLister {
  const config = { modelId: registryModelIdFor(vendor), apiKey };
  if (vendor === 'anthropic') return createClaudeAdapter(config);
  if (vendor === 'openai') return createOpenAIAdapter(config);
  return createGeminiAdapter(config);
}

function fromMetadata(m: ModelMetadata): ListedModel {
  return {
    id: m.id,
    ...(m.createdAt !== undefined && { createdAt: m.createdAt }),
    ...(m.contextLength !== undefined && { contextLength: m.contextLength }),
    // `ModelMetadata.pricing` is in gateway-defined units, so it cannot be
    // drafted as USD per 1M tokens; the draft says `unknown` instead.
  };
}

function vendorApiSource(
  api: (typeof VENDOR_APIS)[number],
  env: NodeJS.ProcessEnv,
  lister: NonNullable<DriftSourceDeps['vendorLister']>
): DriftSource {
  return {
    name: api.name,
    probe: async () => {
      const apiKey = env[api.keyEnv]?.trim();
      if (apiKey === undefined || apiKey === '') return unmeasured(`${api.keyEnv} is not set`);
      const models = await lister(api.vendor, apiKey).listModels();
      return { status: 'measured', models: models.map(fromMetadata) };
    },
  };
}

function gatewaySource(deps: DriftSourceDeps): DriftSource {
  const read = deps.readGateway ?? readOpenAICompatEnv;
  const discover = deps.discoverGateway ?? ((c: OpenAICompatConfig) => discoverModels(c));
  return {
    name: 'gateway',
    probe: async () => {
      const config = read();
      if (config === null) return unmeasured('no OpenAI-compatible gateway configured');
      const result = await discover(config);
      if (!result.ok) throw result.error;
      const models = result.value.map((m) => ({
        id: m.id,
        ...(m.created !== undefined && { createdAt: m.created }),
      }));
      return { status: 'measured', models };
    },
  };
}

function openRouterSource(deps: DriftSourceDeps): DriftSource {
  const list = deps.openRouterCatalog ?? (() => createOpenRouterModelsSource().listModels());
  return {
    name: 'openrouter',
    probe: async () => {
      const catalog = await list();
      const models = catalog.map((m) => ({
        id: m.id,
        ...(m.createdAt !== undefined && { createdAt: m.createdAt }),
        ...(m.contextLength !== undefined && { contextLength: m.contextLength }),
        ...(m.pricing !== undefined && { pricing: m.pricing }),
      }));
      return { status: 'measured', models };
    },
  };
}

/** Every drift source, in report order. Building a source probes nothing. */
export function buildDriftSources(deps: DriftSourceDeps = {}): readonly DriftSource[] {
  const env = deps.env ?? process.env;
  const lister = deps.vendorLister ?? defaultVendorLister;
  return [
    gatewaySource(deps),
    ...VENDOR_APIS.map((api) => vendorApiSource(api, env, lister)),
    openRouterSource(deps),
  ];
}
