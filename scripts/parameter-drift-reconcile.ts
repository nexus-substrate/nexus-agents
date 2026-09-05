/**
 * nexus-agents/config — pure reconciliation between the hand-curated
 * model-parameter capability map and the provider's machine-readable
 * `supported_parameters` (#4121, epic #4066 layer 4).
 *
 * The curated map (`KNOWN_PARAMETER_INCOMPATIBILITIES` +
 * `ModelCapability.unsupportedParameters` / `.maxTokensParam`, resolved via
 * {@link unsupportedParametersForModel}) is the SOURCE OF TRUTH — a human vets
 * every change to it. This module never edits it. It only ANSWERS: "for the models
 * the provider and the registry both know about, does the registry's opinion about
 * a request parameter still match what the provider now advertises?" A mismatch is
 * DRIFT — surfaced as a finding so the drift-guard workflow can open an issue for a
 * human to reconcile.
 *
 * Design: this is a PURE function over already-fetched views (no network, no clock,
 * no `gh`) so the diff logic is unit-testable in isolation. The IO — fetching the
 * catalog, enumerating the registry, opening the issue — lives in the thin script
 * `scripts/check-parameter-drift.ts`.
 *
 * @module config/parameter-drift-reconcile
 */

/** The provider's view of one model (subset of {@link OpenRouterCatalogModel}). */
export interface ProviderParamView {
  /** The id as it appears in the provider catalog. */
  readonly id: string;
  /**
   * The provider's machine-readable capability list. A param present here is
   * supported; a param absent is unsupported. `undefined` means the provider
   * reported NO capability list for this model — we cannot reconcile it (skip).
   */
  readonly supportedParameters?: readonly string[];
}

/** The registry's (curated) view of one model. */
export interface RegistryParamView {
  /** The canonical registry id — used only for reporting. */
  readonly modelId: string;
  /**
   * Ids under which this model may appear in the provider catalog (e.g. the
   * registry id and its `cliModelName`). The join matches on the FIRST of these
   * present in the provider catalog.
   */
  readonly providerIds: readonly string[];
  /**
   * The params the curated map declares this model REJECTS
   * ({@link unsupportedParametersForModel}). A param NOT in this list is, per the
   * registry, supported.
   */
  readonly unsupportedParameters: readonly string[];
}

/** One reconciliation disagreement between the curated map and the provider. */
export interface ParameterDriftFinding {
  /** Canonical registry id. */
  readonly modelId: string;
  /** The provider-catalog id we matched it against. */
  readonly providerId: string;
  /** The request parameter the two sources disagree about. */
  readonly param: string;
  /** The registry's (curated) opinion: does it accept `param`? */
  readonly registrySupported: boolean;
  /** The provider's advertised opinion: does it accept `param`? */
  readonly providerSupported: boolean;
}

/**
 * Params the curated map reasons about and that a provider catalog also reports —
 * so a disagreement is meaningful. Currently `temperature` (the #4061/#4062
 * incidents). Kept explicit rather than "every param the provider lists" so we
 * don't raise noise for params the registry has no opinion about.
 */
export const DEFAULT_RECONCILABLE_PARAMS: readonly string[] = ['temperature'];

/**
 * Reconcile the curated capability map against the provider's advertised
 * `supported_parameters`. Returns one finding per (model, param) the two sources
 * disagree about.
 *
 * Rules:
 *  - Only models present in BOTH sources are compared (a model in one source only
 *    yields NO finding — we can't reconcile what one side doesn't know).
 *  - A provider model whose `supportedParameters` is `undefined` is skipped (the
 *    provider gave us no capability list to compare against).
 *  - For each candidate param (the union of `reconcilableParams` and the model's
 *    own declared-unsupported params), DRIFT = registry-supported !=
 *    provider-supported.
 *
 * Pure & deterministic: same inputs → same findings. It NEVER mutates its inputs
 * and NEVER touches the curated map.
 */
/** First provider-catalog id (of a model's candidates) that carries a capability
 * list, plus that list. `undefined` when none match (only-in-one-source). */
function joinToCatalog(
  providerIds: readonly string[],
  byId: ReadonlyMap<string, readonly string[]>
): { providerId: string; providerParams: readonly string[] } | undefined {
  for (const candidate of providerIds) {
    const providerParams = byId.get(candidate);
    if (providerParams !== undefined) return { providerId: candidate, providerParams };
  }
  return undefined;
}

/** Which registry models the reconcile could join to the catalog, and which it
 * silently skipped. Reported by the gate (#5677) so "no findings" can be told
 * apart from "nothing joined". */
export interface ParameterJoinSummary {
  readonly joined: ReadonlyArray<{ modelId: string; providerId: string }>;
  readonly unmatched: readonly string[];
}

function indexCatalog(
  providerModels: readonly ProviderParamView[]
): Map<string, readonly string[]> {
  // Keep only models that carry a capability list (the ones we can reconcile).
  const byId = new Map<string, readonly string[]>();
  for (const m of providerModels) {
    if (m.supportedParameters !== undefined) byId.set(m.id, m.supportedParameters);
  }
  return byId;
}

export function summarizeParameterJoin(
  providerModels: readonly ProviderParamView[],
  registryModels: readonly RegistryParamView[]
): ParameterJoinSummary {
  const byId = indexCatalog(providerModels);
  const joined: { modelId: string; providerId: string }[] = [];
  const unmatched: string[] = [];
  for (const reg of registryModels) {
    const match = joinToCatalog(reg.providerIds, byId);
    if (match === undefined) unmatched.push(reg.modelId);
    else joined.push({ modelId: reg.modelId, providerId: match.providerId });
  }
  return { joined, unmatched };
}

export function reconcileParameterDrift(
  providerModels: readonly ProviderParamView[],
  registryModels: readonly RegistryParamView[],
  reconcilableParams: readonly string[] = DEFAULT_RECONCILABLE_PARAMS
): ParameterDriftFinding[] {
  const byId = indexCatalog(providerModels);

  const findings: ParameterDriftFinding[] = [];
  for (const reg of registryModels) {
    // Join: first provider id we know about wins.
    const match = joinToCatalog(reg.providerIds, byId);
    if (match === undefined) continue; // only-in-one-source → no finding
    const { providerId, providerParams } = match;

    const unsupported = new Set(reg.unsupportedParameters);
    const candidates = new Set<string>([...reconcilableParams, ...reg.unsupportedParameters]);
    for (const param of candidates) {
      const registrySupported = !unsupported.has(param);
      const providerSupported = providerParams.includes(param);
      if (registrySupported !== providerSupported) {
        findings.push({
          modelId: reg.modelId,
          providerId,
          param,
          registrySupported,
          providerSupported,
        });
      }
    }
  }
  return findings;
}
