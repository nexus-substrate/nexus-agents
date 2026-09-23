/**
 * Gateway family slots (#6604, epic #6612, panel option A).
 *
 * With an OpenAI-spec gateway configured and discovered, each vendor CLI slot
 * resolves to a gateway model of ITS OWN family: `claude` to an Anthropic
 * model, `codex` to an OpenAI model, `gemini` to a Google model. Before this,
 * a slot with no CLI binary fell back to one hard-coded `NEXUS_CUSTOM_MODEL`
 * (default `gpt-5.5`), so a "claude" outcome could record a GPT call.
 *
 * This module is the ONE place slot → gateway-model resolution happens. The
 * two adapter-construction points consume it: `createAutoAdapter` (every
 * registry-pinned slot: orchestrate workers and their alt adapters, and
 * execute_expert) and `createAllAdapters` (the router arm set used by
 * run_dev_pipeline's expert stage and the `orchestrate` CLI). Both decide
 * "is the CLI available" with the same predicate, `isCliAvailable`.
 *
 * NOT covered here: server-mode voter seats. With a gateway wired, the voter
 * path round-robins the raw gateway adapters (`cli/voter-agents.ts`) and never
 * asks for a slot; dealing seats across families is #6606.
 *
 * Rules:
 * - Family comes from `resolveModelIdentitySync(id).vendor`, and only chat
 *   models count: the one chat-model filter (`isChatModelId`,
 *   `gateway-catalog-filter.ts`) removes realtime, audio, transcription, TTS
 *   and image ids that a gateway listed as chat.
 * - Within a family the order is `rankFamilyModels`
 *   (`gateway-family-ranking.ts`): TIER first, then `/models` `created`
 *   recency, then the generation parsed from the id, with `-latest`, registry
 *   quality and date stamps as tie-breakers only.
 * - `NEXUS_GATEWAY_MODEL_<FAMILY>` pins the family's model. A model absent
 *   from the catalogue, or classified as a DIFFERENT family, warns once and
 *   the ranking applies. A model whose vendor cannot be classified warns once
 *   and is honoured as the operator's explicit choice.
 * - A slot whose family has no gateway model is UNAVAILABLE from the gateway.
 *   It is never given another family's model; a same-family direct API key
 *   may still serve it (`auto-adapter.ts`).
 * - No catalogue registered (no gateway, or discovery failed) is `inactive`:
 *   every caller keeps its pre-#6604 behaviour.
 * - Whether a gateway model is serving a router arm right now is state of
 *   that arm (`cli-adapters/gateway-slot-arm.ts`), which the budget router
 *   reads to price it by `NEXUS_GATEWAY_COST`. There is no process-wide
 *   record: the registry and router paths decide independently.
 *
 * @module adapters/gateway-family-slots
 */

import type { ILogger, IModelAdapter } from '../core/index.js';
import { createLogger } from '../core/index.js';
import type { CliName, EndpointArmId } from '../cli-adapters/types.js';
import { isEndpointArmId } from '../cli-adapters/types.js';
import { resolveModelIdentitySync } from '../config/model-identity.js';
import { rankFamilyModels } from './gateway-family-ranking.js';
import { isChatModelId } from './gateway-catalog-filter.js';

/** A model family a CLI slot is tied to. */
export type GatewayFamily = 'anthropic' | 'openai' | 'google';

/** The family each vendor CLI slot serves. `opencode` has none: it is multi-vendor. */
const SLOT_FAMILY: Readonly<Partial<Record<CliName, GatewayFamily>>> = {
  claude: 'anthropic',
  codex: 'openai',
  gemini: 'google',
};

/** Operator override variable per family. */
export const GATEWAY_MODEL_OVERRIDE_ENV: Readonly<Record<GatewayFamily, string>> = {
  anthropic: 'NEXUS_GATEWAY_MODEL_ANTHROPIC',
  openai: 'NEXUS_GATEWAY_MODEL_OPENAI',
  google: 'NEXUS_GATEWAY_MODEL_GOOGLE',
};

/** How a slot resolves in gateway mode. */
export type GatewaySlotResolution =
  /** No gateway catalogue, or a slot with no family: callers keep their old path. */
  | { readonly kind: 'inactive' }
  | {
      readonly kind: 'resolved';
      readonly family: GatewayFamily;
      /** The gateway model adapter that will serve the slot. */
      readonly adapter: IModelAdapter;
      readonly via: 'override' | 'preference';
    }
  /** Gateway mode, but the gateway serves no model of this slot's family. */
  | { readonly kind: 'unavailable'; readonly family: GatewayFamily };

const defaultLogger = createLogger({ component: 'gateway-family-slots' });

/** The discovered gateway models; `undefined` is "no gateway" (the named empty case). */
let catalog: readonly IModelAdapter[] | undefined;

/** Overrides already warned about, keyed `family=value`, so each warns once. */
const warnedOverrides = new Set<string>();

/**
 * Register the discovered gateway models. An empty list clears the catalogue:
 * a gateway with no models is no gateway, and must not make every slot
 * unavailable.
 */
export function setGatewaySlotCatalog(models: readonly IModelAdapter[]): void {
  catalog = models.length === 0 ? undefined : [...models];
}

/** Whether a discovered gateway catalogue is registered (gateway mode). */
export function hasGatewaySlotCatalog(): boolean {
  return catalog !== undefined;
}

/** Test-only: forget the catalogue and the warn-once memory. */
export function _resetGatewaySlotCatalog(): void {
  catalog = undefined;
  warnedOverrides.clear();
}

/**
 * The family `modelId` belongs to: one of the three, `'other'` for a
 * classified vendor outside them, `undefined` when the vendor is unknown.
 */
export function gatewayModelFamily(modelId: string): GatewayFamily | 'other' | undefined {
  const vendor = resolveModelIdentitySync(modelId).vendor;
  if (vendor === 'anthropic' || vendor === 'openai' || vendor === 'google') return vendor;
  return vendor === 'unknown' ? undefined : 'other';
}

/**
 * The discovery `created` stamp a gateway model adapter carries, if any. The
 * voter seat dealing (#6634) ranks with the same stamps.
 */
export function createdOf(model: object): number | undefined {
  const created: unknown = (model as { created?: unknown }).created;
  return typeof created === 'number' ? created : undefined;
}

/** Warn once per `family=value` about an override. */
function warnOverrideOnce(
  family: GatewayFamily,
  value: string,
  message: string,
  logger: ILogger
): void {
  const key = `${family}=${value}`;
  if (warnedOverrides.has(key)) return;
  warnedOverrides.add(key);
  logger.warn(`${GATEWAY_MODEL_OVERRIDE_ENV[family]}: ${message}`, { model: value });
}

/**
 * The override's adapter when it may serve `family`, else undefined. Absent
 * from the catalogue or classified as another family: warned, ignored. Vendor
 * unknown: warned, honoured as the operator's explicit choice.
 */
function overrideAdapter(
  family: GatewayFamily,
  models: readonly IModelAdapter[],
  env: NodeJS.ProcessEnv,
  logger: ILogger
): IModelAdapter | undefined {
  const value = env[GATEWAY_MODEL_OVERRIDE_ENV[family]]?.trim();
  if (value === undefined || value === '') return undefined;
  const match = models.find((m) => m.modelId === value);
  if (match === undefined) {
    warnOverrideOnce(
      family,
      value,
      'ignored: the model is not in the gateway catalogue; using the family ranking',
      logger
    );
    return undefined;
  }
  const classified = gatewayModelFamily(match.modelId);
  if (classified !== undefined && classified !== family) {
    warnOverrideOnce(
      family,
      value,
      `ignored: the model is classified as ${classified}, not ${family}; using the family ranking`,
      logger
    );
    return undefined;
  }
  if (classified === undefined) {
    warnOverrideOnce(
      family,
      value,
      `honoured, but its vendor could not be classified; confirm it is a ${family} model`,
      logger
    );
  }
  return match;
}

/**
 * Resolve `cli` to a gateway model of its family. See the module doc for the
 * rules; `inactive` means the caller's pre-#6604 path applies unchanged.
 */
export function resolveGatewaySlot(
  cli: CliName,
  env: NodeJS.ProcessEnv = process.env,
  logger: ILogger = defaultLogger
): GatewaySlotResolution {
  if (catalog === undefined) return { kind: 'inactive' };
  return resolveSlotIn(catalog, cli, env, logger);
}

/** {@link resolveGatewaySlot} against an explicit catalogue. */
function resolveSlotIn(
  models: readonly IModelAdapter[],
  cli: CliName,
  env: NodeJS.ProcessEnv,
  logger: ILogger
): GatewaySlotResolution {
  const family = SLOT_FAMILY[cli];
  if (family === undefined) return { kind: 'inactive' };
  const pinned = overrideAdapter(family, models, env, logger);
  if (pinned !== undefined) return { kind: 'resolved', family, adapter: pinned, via: 'override' };
  const inFamily = models.filter(
    (m) => isChatModelId(m.modelId) && gatewayModelFamily(m.modelId) === family
  );
  const best = rankFamilyModels(inFamily.map((m) => ({ id: m.modelId, created: createdOf(m) })))[0];
  const adapter = inFamily.find((m) => m.modelId === best);
  if (adapter === undefined) return { kind: 'unavailable', family };
  return { kind: 'resolved', family, adapter, via: 'preference' };
}

/**
 * The slot's view of its gateway model. `providerId` is the slot identity a
 * CLI-served slot reports (`cli-<slot>`, as `CliToModelAdapter` does), so
 * outcome writers that key on it keep the slot key. `modelId` is the gateway
 * model that actually serves the call, and the gateway-arm marker is carried
 * through so a seat is priced by the gateway's `NEXUS_GATEWAY_COST`
 * declaration rather than a vendor list price.
 */
export function createGatewaySlotAdapter(cli: CliName, model: IModelAdapter): IModelAdapter {
  const arm: unknown = (model as { gatewayArm?: unknown }).gatewayArm;
  const view: IModelAdapter & { gatewayArm?: EndpointArmId } = {
    providerId: `cli-${cli}`,
    modelId: model.modelId,
    capabilities: model.capabilities,
    complete: (request) => model.complete(request),
    stream: (request) => model.stream(request),
    countTokens: (text) => model.countTokens(text),
    validateConfig: () => model.validateConfig(),
    ...(typeof arm === 'string' && isEndpointArmId(arm) && { gatewayArm: arm }),
  };
  return view;
}

/**
 * Each vendor slot's gateway model id, or `'unavailable'` when its family has
 * none. Keys in the order the mapping is reported.
 */
export type GatewaySlotMapping = Readonly<Record<'claude' | 'codex' | 'gemini', string>>;

/**
 * The slot → model mapping for `models`, resolved by the same rules as
 * {@link resolveGatewaySlot}. Takes the catalogue explicitly so `doctor
 * --gateway` (#6609) can report it without registering a process-wide one.
 */
export function gatewaySlotMapping(
  models: readonly IModelAdapter[],
  env: NodeJS.ProcessEnv = process.env,
  logger: ILogger = defaultLogger
): GatewaySlotMapping {
  const modelFor = (cli: keyof GatewaySlotMapping): string => {
    const r = resolveSlotIn(models, cli, env, logger);
    return r.kind === 'resolved' ? r.adapter.modelId : 'unavailable';
  };
  return { claude: modelFor('claude'), codex: modelFor('codex'), gemini: modelFor('gemini') };
}

/** Log the slot → model mapping once at registration, so an operator can see it. */
export function logGatewaySlotMapping(logger: ILogger): void {
  if (catalog === undefined) return;
  logger.info('Gateway family slots resolved', {
    ...gatewaySlotMapping(catalog, process.env, logger),
  });
}
