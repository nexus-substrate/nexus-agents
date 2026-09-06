/* eslint-disable no-console */
/**
 * Catalogue-drift sweep (#4417).
 *
 * Compares every in-tree model entry's `cliModelName` against the generated
 * catalogue (`model-registry.generated.json`, refreshed weekly by
 * `.github/workflows/registry-refresh.yml`). Fully offline and deterministic:
 * both inputs are committed files, so this never depends on models.dev being
 * reachable and produces the same answer for the same commit.
 *
 * **Scope is deliberately narrow.** #4408 established that inferring EOL from
 * catalogue absence is unsound — `gpt-4o` is retired and still listed, and
 * catalogue diffing had a 2/3 false-positive rate against our entries. So this
 * asks only questions with factual answers:
 *
 *  - does this exact id exist under this entry's provider?
 *  - if not, does any other provider serve it? (reseller-only → advisory)
 *  - do `contextWindow` and pricing match the catalogue record for that id?
 *
 * Nothing here decides what a model *should* be repointed at. #4410 needed a
 * 7-voter vote to choose among three live siblings; a script should not
 * pretend that is mechanical.
 *
 * **Severity is directional, and that matters more than it sounds.** An
 * overstated context window fails *after* the context has been assembled — the
 * expensive, confusing way. An understated one merely leaves capacity unused.
 * Reporting both as "mismatch" is how a useful report becomes noise nobody
 * reads, which is the failure mode #4424 just fixed elsewhere.
 *
 * Report-only by design. Exits non-zero on defects so a caller *may* gate on
 * it, but it is not wired into CI as a blocking gate — see #4417 for why that
 * waits until the false-positive rate is measured over real runs.
 *
 * @module scripts/check-catalogue-drift
 * (Source: #4417; motivated by the hand-found #4410 and #4416)
 */

import { readFileSync } from 'node:fs';

/** A model record as it appears in the generated catalogue. */
export interface CatalogueEntry {
  readonly id: string;
  readonly contextWindow?: number | undefined;
  readonly pricing?: { readonly inputPer1M?: number; readonly outputPer1M?: number } | undefined;
}

/** The subset of an in-tree model entry this sweep reads. */
export interface InTreeModel {
  readonly id: string;
  readonly provider: string;
  readonly cliModelName?: string | undefined;
  readonly contextWindow?: number | undefined;
  readonly pricing?: { readonly inputPer1M?: number; readonly outputPer1M?: number } | undefined;
}

export type DriftKind =
  | 'missing-everywhere'
  | 'provider-absent'
  | 'context-overstated'
  | 'context-understated'
  | 'price-mismatch'
  | 'false-free';

export interface DriftFinding {
  readonly modelId: string;
  readonly kind: DriftKind;
  readonly severity: 'defect' | 'advisory';
  readonly detail: string;
}

export interface DriftOptions {
  /**
   * Treat "in-tree says 0/0, catalogue charges" as a defect rather than an
   * ordinary price drift. Off by default because a genuinely free tier that
   * the catalogue has not caught up with is a plausible false positive; on,
   * it catches #4410's second half, where a zero price made the cost-aware
   * stages actively prefer a model that could only fail.
   */
  readonly treatFalseFreeAsDefect?: boolean;
}

/**
 * Local alias namespaces that never appear in a public catalogue. `custom/`
 * denotes an operator-configured endpoint; flagging it every run is pure noise.
 */
const ALIAS_PREFIXES = ['custom/'];

/** Prices differ in the last bits across sources; compare with a tolerance. */
const PRICE_EPSILON = 0.001;

/**
 * The catalogue keys entries as `<provider>/<modelId>`, but a `cliModelName`
 * sometimes already carries a vendor segment (`anthropic/claude-sonnet-4-6`
 * under provider `anthropic`). Concatenating unconditionally yields
 * `anthropic/anthropic/...` and a bogus "missing" — the first hand-run of this
 * check did exactly that on three entries.
 */
function candidateKeys(model: InTreeModel, cliModelName: string): string[] {
  const prefixed = `${model.provider}/${cliModelName}`;
  return cliModelName.startsWith(`${model.provider}/`)
    ? [cliModelName, prefixed]
    : [prefixed, cliModelName];
}

/** Providers other than this entry's that serve the same bare model id. */
function otherProvidersServing(
  cliModelName: string,
  catalogue: readonly CatalogueEntry[]
): string[] {
  const suffix = `/${cliModelName}`;
  const out = new Set<string>();
  for (const e of catalogue) {
    if (e.id === cliModelName || e.id.endsWith(suffix)) {
      const slash = e.id.indexOf('/');
      out.add(slash > 0 ? e.id.slice(0, slash) : e.id);
    }
  }
  return [...out].sort();
}

function priceDetail(
  mi: number,
  mo: number | undefined,
  ci: number,
  co: number | undefined
): string {
  const m = `${String(mi)}/${mo === undefined ? '?' : String(mo)}`;
  const c = `${String(ci)}/${co === undefined ? '?' : String(co)}`;
  return `in-tree ${m} vs catalogue ${c} per 1M`;
}

interface PricePair {
  readonly mi: number;
  readonly mo: number | undefined;
  readonly ci: number;
  readonly co: number | undefined;
}

/** Both sides must carry an input price, or there is nothing to compare. */
function readPrices(model: InTreeModel, hit: CatalogueEntry): PricePair | null {
  const mp = model.pricing;
  const cp = hit.pricing;
  if (mp === undefined || cp === undefined) return null;
  const mi = mp.inputPer1M;
  const ci = cp.inputPer1M;
  if (mi === undefined || ci === undefined) return null;
  return { mi, mo: mp.outputPer1M, ci, co: cp.outputPer1M };
}

function pricesDiffer(p: PricePair): boolean {
  if (Math.abs(p.mi - p.ci) > PRICE_EPSILON) return true;
  if (p.mo === undefined || p.co === undefined) return false;
  return Math.abs(p.mo - p.co) > PRICE_EPSILON;
}

function comparePricing(
  model: InTreeModel,
  hit: CatalogueEntry,
  opts: DriftOptions
): DriftFinding | null {
  const p = readPrices(model, hit);
  if (p === null || !pricesDiffer(p)) return null;

  const detail = priceDetail(p.mi, p.mo, p.ci, p.co);
  const claimsFree = p.mi === 0 && (p.mo ?? 0) === 0;
  const catalogueCharges = p.ci > 0 || (p.co ?? 0) > 0;

  if (claimsFree && catalogueCharges && opts.treatFalseFreeAsDefect === true) {
    return {
      modelId: model.id,
      kind: 'false-free',
      severity: 'defect',
      detail: `${detail} — a zero price makes cost-aware routing prefer this entry`,
    };
  }
  return { modelId: model.id, kind: 'price-mismatch', severity: 'advisory', detail };
}

function compareContext(model: InTreeModel, hit: CatalogueEntry): DriftFinding | null {
  const mine = model.contextWindow;
  const theirs = hit.contextWindow;
  if (mine === undefined || theirs === undefined || mine === theirs) return null;

  return mine > theirs
    ? {
        modelId: model.id,
        kind: 'context-overstated',
        severity: 'defect',
        detail: `claims ${String(mine)} but catalogue serves ${String(theirs)} — over-budgeted requests fail after the context is assembled`,
      }
    : {
        modelId: model.id,
        kind: 'context-understated',
        severity: 'advisory',
        detail: `claims ${String(mine)}, catalogue serves ${String(theirs)} — unused capacity, no failure`,
      };
}

/** No catalogue row under this entry's provider: dead id, or reseller-only. */
function absenceFinding(
  model: InTreeModel,
  cliModelName: string,
  catalogue: readonly CatalogueEntry[]
): DriftFinding {
  const others = otherProvidersServing(cliModelName, catalogue);
  if (others.length === 0) {
    return {
      modelId: model.id,
      kind: 'missing-everywhere',
      severity: 'defect',
      detail: `"${cliModelName}" appears under no provider in the catalogue`,
    };
  }
  return {
    modelId: model.id,
    kind: 'provider-absent',
    severity: 'advisory',
    detail: `not served by "${model.provider}", but ${String(others.length)} other provider(s) list it: ${others.join(', ')}`,
  };
}

/** Compare in-tree entries against the catalogue. Pure — no I/O. */
export function findCatalogueDrift(
  models: readonly InTreeModel[],
  catalogue: readonly CatalogueEntry[],
  opts: DriftOptions = {}
): DriftFinding[] {
  const byId = new Map(catalogue.map((e) => [e.id, e]));
  const findings: DriftFinding[] = [];

  for (const model of models) {
    const cliModelName = model.cliModelName;
    if (cliModelName === undefined || cliModelName === '') continue;
    if (ALIAS_PREFIXES.some((prefix) => cliModelName.startsWith(prefix))) continue;

    const hit = candidateKeys(model, cliModelName)
      .map((k) => byId.get(k))
      .find((e): e is CatalogueEntry => e !== undefined);

    if (hit === undefined) {
      // Comparing numbers against some other provider's row would be
      // inventing data, so absence ends the checks for this entry.
      findings.push(absenceFinding(model, cliModelName, catalogue));
      continue;
    }

    const ctx = compareContext(model, hit);
    if (ctx !== null) findings.push(ctx);
    const price = comparePricing(model, hit, opts);
    if (price !== null) findings.push(price);
  }

  return findings.sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'defect' ? -1 : 1
  );
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const GENERATED = 'packages/nexus-agents/src/config/model-registry.generated.json';

async function main(): Promise<void> {
  const { DEFAULT_MODEL_CAPABILITIES } =
    (await import('../packages/nexus-agents/src/config/in-tree-data.js')) as {
      DEFAULT_MODEL_CAPABILITIES: { models: InTreeModel[] };
    };

  const generated = JSON.parse(readFileSync(GENERATED, 'utf8')) as {
    generatedAt?: string;
    entries: CatalogueEntry[];
  };

  const findings = findCatalogueDrift(DEFAULT_MODEL_CAPABILITIES.models, generated.entries, {
    treatFalseFreeAsDefect: true,
  });

  const models = DEFAULT_MODEL_CAPABILITIES.models.length;
  console.log(
    `Catalogue drift: ${String(models)} in-tree entries vs ${String(generated.entries.length)} catalogue entries` +
      (generated.generatedAt !== undefined ? ` (generated ${generated.generatedAt})` : '')
  );

  if (findings.length === 0) {
    console.log('✓ No drift.');
    return;
  }

  const defects = findings.filter((f) => f.severity === 'defect');
  for (const f of findings) {
    const mark = f.severity === 'defect' ? '✗ DEFECT  ' : '· advisory';
    console.log(`${mark} ${f.modelId} [${f.kind}]\n            ${f.detail}`);
  }
  console.log(
    `\n${String(defects.length)} defect(s), ${String(findings.length - defects.length)} advisory.`
  );

  if (defects.length > 0) {
    console.log(
      '\nA defect means the registry describes something the transport will not serve.\n' +
        'Choosing the replacement is a judgement call — see #4410 for why that is not automated.'
    );
    process.exitCode = 1;
  }
}

// Run only when invoked directly, so the test can import the pure function.
if (process.argv[1]?.endsWith('check-catalogue-drift.ts') === true) {
  void main();
}
