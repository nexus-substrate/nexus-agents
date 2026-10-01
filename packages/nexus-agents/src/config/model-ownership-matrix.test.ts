/**
 * Overlay matrix for model→CLI ownership and unpriced-default pricing (#6866).
 *
 * Five ratification panels each found one more overlay shape where ownership
 * or pricing disagreed between call sites. This table runs every shape through
 * the REAL registry: each row writes an operator manifest overlay to a temp
 * file, points `NEXUS_MODELS_OVERLAY_PATH` at it, and resets the registry
 * singleton so `getDefaultRegistry()` loads it the way production does.
 *
 * Columns: confident owner (`getCliForModelId`), routing slot
 * (`resolveCliSlot`), the codex budget estimate (`resolveCliCostPer1M`), the
 * codex cost-ceiling estimate (`estimateRegistryCostUsd`), and the ledger's
 * `priced` flag for the codex default (`computeCostDetail`). The invariant
 * the panels asked for is checked on every row: the budget estimate, the
 * ceiling and the ledger agree on whether the default is priced and at what.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setDefaultRegistry } from './model-registry.js';
import { getCliForModelId, resolveCliSlot } from './model-availability.js';
import { getDefaultModelForCli, resolveCliCostPer1M } from './model-config-helpers.js';
import type { CliNameLiteral, ModelId } from './model-capabilities-types.js';
import type { CostPer1M } from './in-tree-data.js';
import { estimateRegistryCostUsd } from '../cli-adapters/budget-arm-cost.js';
import { estimateCost } from '../cli-adapters/budget-utils.js';
import { computeCostDetail } from '../learning/usage-log.js';

const MILLION = 1_000_000;

interface OverlayEntry {
  readonly id: string;
  readonly vendor: string;
  readonly family: string;
  readonly aliases?: readonly string[];
  readonly pricing?: { readonly inputPer1M: number; readonly outputPer1M: number };
}

interface MatrixRow {
  readonly name: string;
  readonly overlay: readonly OverlayEntry[];
  /** The model id the ownership columns are read for. */
  readonly target: string;
  readonly owner: CliNameLiteral | undefined;
  readonly slot: CliNameLiteral | undefined;
  readonly codexBudget: CostPer1M;
  /** Cost-ceiling estimate for 1M input + 1M output on codex; undefined = excluded. */
  readonly codexCeiling: number | undefined;
  readonly defaultPriced: boolean;
}

const ROWS: readonly MatrixRow[] = [
  {
    name: 'in-tree only',
    overlay: [],
    target: 'gpt-6.1-sol',
    owner: 'codex',
    slot: 'codex',
    codexBudget: { input: 5, output: 30 },
    codexCeiling: undefined,
    defaultPriced: false,
  },
  {
    name: 'overlay re-prices a sibling higher',
    overlay: [
      {
        id: 'gpt-5.5',
        vendor: 'openai',
        family: 'gpt',
        pricing: { inputPer1M: 50, outputPer1M: 100 },
      },
    ],
    target: 'gpt-5.5',
    owner: 'codex',
    slot: 'codex',
    codexBudget: { input: 50, output: 100 },
    codexCeiling: undefined,
    defaultPriced: false,
  },
  {
    name: 'overlay prices the default itself',
    overlay: [
      {
        id: 'gpt-6.1-sol',
        vendor: 'openai',
        family: 'gpt',
        pricing: { inputPer1M: 1, outputPer1M: 2 },
      },
    ],
    target: 'gpt-6.1-sol',
    owner: 'codex',
    slot: 'codex',
    codexBudget: { input: 1, output: 2 },
    codexCeiling: 3,
    defaultPriced: true,
  },
  {
    // The overlay replaces the whole entry, so its missing pricing is the
    // registry's answer for gpt-5.6-sol too; gpt-5.5 still bounds the default.
    name: 'overlay on a canonical id without cliName',
    overlay: [{ id: 'gpt-5.6-sol', vendor: 'openai', family: 'gpt' }],
    target: 'gpt-5.6-sol',
    owner: 'codex',
    slot: 'codex',
    codexBudget: { input: 5, output: 30 },
    codexCeiling: undefined,
    defaultPriced: false,
  },
  {
    name: 'overlay alias of an in-tree model',
    overlay: [
      {
        id: 'gpt-5.6-sol',
        vendor: 'openai',
        family: 'gpt',
        aliases: ['sol-pinned'],
        pricing: { inputPer1M: 4, outputPer1M: 20 },
      },
    ],
    target: 'sol-pinned',
    owner: 'codex',
    slot: 'codex',
    codexBudget: { input: 5, output: 30 },
    codexCeiling: undefined,
    defaultPriced: false,
  },
  {
    name: 'overlay id equal to an in-tree alias',
    overlay: [
      {
        id: 'openai/gpt-6.1-sol',
        vendor: 'openai',
        family: 'gpt',
        pricing: { inputPer1M: 1, outputPer1M: 2 },
      },
    ],
    target: 'openai/gpt-6.1-sol',
    owner: 'codex',
    slot: 'codex',
    codexBudget: { input: 5, output: 30 },
    codexCeiling: undefined,
    defaultPriced: false,
  },
  {
    // Not confidently owned (no cliName, not in-tree), but routed to codex by
    // vendor, so it bounds codex's unpriced estimate.
    name: 'brand-new overlay model with a vendor-derivable id',
    overlay: [
      {
        id: 'gpt-7-preview',
        vendor: 'openai',
        family: 'gpt',
        pricing: { inputPer1M: 60, outputPer1M: 120 },
      },
    ],
    target: 'gpt-7-preview',
    owner: undefined,
    slot: 'codex',
    codexBudget: { input: 60, output: 120 },
    codexCeiling: undefined,
    defaultPriced: false,
  },
  {
    name: 'brand-new overlay model with no derivable vendor',
    overlay: [
      {
        id: 'acme-x1',
        vendor: 'mistral',
        family: 'acme',
        pricing: { inputPer1M: 70, outputPer1M: 140 },
      },
    ],
    target: 'acme-x1',
    owner: undefined,
    slot: 'opencode',
    codexBudget: { input: 5, output: 30 },
    codexCeiling: undefined,
    defaultPriced: false,
  },
  {
    name: 'free-input / paid-output sibling',
    overlay: [
      {
        id: 'gpt-5.5',
        vendor: 'openai',
        family: 'gpt',
        pricing: { inputPer1M: 0, outputPer1M: 40 },
      },
    ],
    target: 'gpt-5.5',
    owner: 'codex',
    slot: 'codex',
    // Input: gpt-5.6-sol's $4 is now the highest; output: the overlay's $40.
    codexBudget: { input: 4, output: 40 },
    codexCeiling: undefined,
    defaultPriced: false,
  },
];

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ownership-matrix-'));
  // Point BOTH overlay tiers at the temp dir so a real ~/.nexus-agents
  // manifest on the host cannot leak into a row.
  vi.stubEnv('NEXUS_MODEL_REGISTRY_OVERLAY', join(dir, 'absent-user-overlay.yaml'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  setDefaultRegistry(undefined);
  rmSync(dir, { recursive: true, force: true });
});

function loadOverlay(entries: readonly OverlayEntry[]): void {
  const path = join(dir, 'models-manifest.yaml');
  // JSON is valid YAML; the loader parses either.
  writeFileSync(path, JSON.stringify({ version: 1, models: entries }), 'utf-8');
  vi.stubEnv('NEXUS_MODELS_OVERLAY_PATH', path);
  setDefaultRegistry(undefined);
}

describe('model ownership and unpriced pricing over the overlay matrix (#6866)', () => {
  it.each(ROWS)('$name', (row) => {
    loadOverlay(row.overlay);
    const codexDefault = getDefaultModelForCli('codex');
    expect(codexDefault).toBe('gpt-6.1-sol');

    expect(getCliForModelId(row.target as ModelId), 'owner').toBe(row.owner);
    expect(resolveCliSlot(row.target), 'slot').toBe(row.slot);

    const budget = resolveCliCostPer1M('codex');
    expect(budget, 'budget estimate').toEqual(row.codexBudget);
    expect(estimateCost('codex', MILLION, MILLION), 'estimateCost').toBeCloseTo(
      row.codexBudget.input + row.codexBudget.output,
      9
    );

    const ceiling = estimateRegistryCostUsd('codex', MILLION, MILLION);
    expect(ceiling, 'ceiling').toBe(row.codexCeiling);

    const ledger = computeCostDetail(codexDefault, MILLION, MILLION);
    expect(ledger.priced, 'ledger priced').toBe(row.defaultPriced);

    // The three readers agree: priced ⇒ one price everywhere; unpriced ⇒ the
    // ceiling excludes the default while the budget keeps a non-$0 bound.
    if (ledger.priced) {
      expect(ceiling).toBe(ledger.costUsd);
      expect(budget.input + budget.output).toBe(ledger.costUsd);
    } else {
      expect(ceiling).toBeUndefined();
      expect(budget.input).toBeGreaterThan(0);
      expect(budget.output).toBeGreaterThan(0);
    }
  });
});

describe('ownership of a fuzzy-matched id (#6866)', () => {
  it('prices a decorated id from its canonical entry but does not own it', () => {
    loadOverlay([]);
    const decorated = 'GPT-5.6-Sol';
    // The registry resolves it to gpt-5.6-sol for pricing (#4164)...
    expect(computeCostDetail(decorated, MILLION, MILLION).resolvedId).toBe('gpt-5.6-sol');
    // ...but fuzzy resolution grants metadata only, never a CLI.
    expect(getCliForModelId(decorated as ModelId)).toBeUndefined();
    expect(resolveCliSlot(decorated)).toBe('codex');
  });
});
