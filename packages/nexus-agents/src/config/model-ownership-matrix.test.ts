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
import { getDefaultRegistry, setDefaultRegistry } from './model-registry.js';
import { getCliForModelId, resolveCliSlot } from './model-availability.js';
import {
  buildModelInfo,
  findCanonicalModel,
  getCliModelName,
  getDefaultModelForCli,
  getInTreeCapabilitiesMatrix,
  getModelContextWindow,
  getModelDisplayName,
  getModelMaxOutput,
  getModelQualityScores,
  lookupInTreeCapability,
  modelSupportsAll,
  resolveCliAlias,
  resolveCliCostPer1M,
  resolveCliModelName,
} from './model-config-helpers.js';
import { buildInTreeEntries } from './in-tree-entries.js';
import { buildDriftSources } from './model-drift-sources.js';
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
  readonly contextWindow?: number;
  readonly displayName?: string;
  readonly maxOutputTokens?: number;
  readonly qualityScores?: {
    reasoning: number;
    codeGeneration: number;
    speed: number;
    cost: number;
  };
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
  /** The codex default the registry resolves to; `gpt-6.1-sol` unless an overlay re-points it. */
  readonly resolvedDefault?: string;
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
  // ---- cliName: an in-tree cliName wins over the vendor (vendor-first is wrong).
  {
    name: 'cliName: in-tree model whose CLI differs from its vendor',
    overlay: [],
    target: 'opencode-custom-opus',
    owner: 'opencode',
    slot: 'opencode',
    codexBudget: { input: 5, output: 30 },
    codexCeiling: undefined,
    defaultPriced: false,
  },
  {
    // The overlay drops cliName; the in-tree owner of the id, not the
    // anthropic vendor, still decides.
    name: 'cliName: overlay on a model whose CLI differs from its vendor',
    overlay: [{ id: 'opencode-custom-opus', vendor: 'anthropic', family: 'claude' }],
    target: 'opencode-custom-opus',
    owner: 'opencode',
    slot: 'opencode',
    codexBudget: { input: 5, output: 30 },
    codexCeiling: undefined,
    defaultPriced: false,
  },
  // ---- vendor: the entry's declared vendor, not the vendor guessed from the id.
  {
    name: 'vendor: opaque overlay id declared openai',
    overlay: [
      {
        id: 'corp-prod',
        vendor: 'openai',
        family: 'corp',
        pricing: { inputPer1M: 60, outputPer1M: 120 },
      },
    ],
    target: 'corp-prod',
    owner: undefined,
    slot: 'codex',
    codexBudget: { input: 60, output: 120 },
    codexCeiling: undefined,
    defaultPriced: false,
  },
  {
    // An openai-looking id declared google: the declared vendor wins.
    name: 'vendor: openai-looking overlay id declared google',
    overlay: [
      {
        id: 'gpt-lookalike',
        vendor: 'google',
        family: 'gemini',
        pricing: { inputPer1M: 60, outputPer1M: 120 },
      },
    ],
    target: 'gpt-lookalike',
    owner: undefined,
    slot: 'gemini',
    codexBudget: { input: 5, output: 30 },
    codexCeiling: undefined,
    defaultPriced: false,
  },
  // ---- aliases: an overlay that aliases an in-tree id takes over that id.
  {
    // The registry re-points the default to corp-sol (#3185) and the codex
    // adapter sends that model through the codex binary
    // (codex-adapter.ts: getCliModelName(getDefaultModelForCli('codex'))), so
    // the codex owner of the aliased id follows the entry that replaced it.
    name: 'aliases: overlay aliasing the codex default re-points it',
    overlay: [
      {
        id: 'corp-sol',
        vendor: 'mistral',
        family: 'corp',
        aliases: ['gpt-6.1-sol'],
        pricing: { inputPer1M: 7, outputPer1M: 9 },
      },
    ],
    target: 'gpt-6.1-sol',
    owner: 'codex',
    slot: 'codex',
    codexBudget: { input: 7, output: 9 },
    codexCeiling: 16,
    defaultPriced: true,
    resolvedDefault: 'corp-sol',
  },
  {
    name: 'aliases: the re-pointed default by its own id',
    overlay: [{ id: 'corp-sol', vendor: 'mistral', family: 'corp', aliases: ['gpt-6.1-sol'] }],
    target: 'corp-sol',
    owner: 'codex',
    slot: 'codex',
    codexBudget: { input: 5, output: 30 },
    codexCeiling: undefined,
    defaultPriced: false,
    resolvedDefault: 'corp-sol',
  },
  {
    // Aliases owned by two CLIs: no confident owner, so the declared vendor
    // routes it. First-alias-wins would put its $60/$120 on codex.
    name: 'aliases: overlay aliasing models of two CLIs',
    overlay: [
      {
        id: 'mixed',
        vendor: 'google',
        family: 'mixed',
        aliases: ['gpt-5.5', 'claude-opus'],
        pricing: { inputPer1M: 60, outputPer1M: 120 },
      },
    ],
    target: 'mixed',
    owner: undefined,
    slot: 'gemini',
    // gpt-5.5 is now an alias of `mixed`, so gpt-5.6-sol's $4/$20 is the bound.
    codexBudget: { input: 4, output: 20 },
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
  // Build it now, as a running server has: `getDefaultModelForCli` follows an
  // overlay only once the singleton exists (#3185 bootstrap guard).
  getDefaultRegistry();
}

describe('model ownership and unpriced pricing over the overlay matrix (#6866)', () => {
  it.each(ROWS)('$name', (row) => {
    loadOverlay(row.overlay);
    const codexDefault = getDefaultModelForCli('codex');
    expect(codexDefault).toBe(row.resolvedDefault ?? 'gpt-6.1-sol');

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

const METADATA_ROWS = [
  {
    name: 'pricing-only overlay keeps in-tree metadata',
    target: 'gpt-5.6-sol',
    overlay: { id: 'gpt-5.6-sol', pricing: { inputPer1M: 1, outputPer1M: 2 } },
  },
  {
    name: 'explicit overlay context wins',
    target: 'gpt-5.6-sol',
    overlay: { id: 'gpt-5.6-sol', contextWindow: 32_768 },
  },
  {
    name: 'explicit overlay display, output and quality win',
    target: 'gpt-5.6-sol',
    overlay: {
      id: 'gpt-5.6-sol',
      displayName: 'Operator Sol',
      maxOutputTokens: 4_096,
      qualityScores: { reasoning: 1, codeGeneration: 2, speed: 3, cost: 4 },
    },
  },
  {
    name: 'overlay keyed by an in-tree alias keeps metadata',
    target: 'openai/gpt-6.1-sol',
    inTreeId: 'gpt-6.1-sol',
    overlay: { id: 'openai/gpt-6.1-sol', pricing: { inputPer1M: 1, outputPer1M: 2 } },
  },
  {
    name: 'overlay alias pointing to an in-tree id keeps metadata',
    target: 'corp-sol',
    overlay: { id: 'corp-sol', aliases: ['gpt-5.6-sol'] },
  },
  {
    name: 'overlay alias resolves to its in-tree metadata',
    target: 'sol-pinned',
    overlay: { id: 'gpt-5.6-sol', aliases: ['sol-pinned'] },
  },
];

describe('metadata over real manifest overlays (#6873)', () => {
  it.each(METADATA_ROWS)('$name', (row) => {
    loadOverlay([{ vendor: 'openai', family: 'gpt', ...row.overlay }]);
    const baseline = buildInTreeEntries().find((e) => e.id === (row.inTreeId ?? 'gpt-5.6-sol'));
    expect(baseline).toBeDefined();
    const expected = { ...baseline, ...row.overlay };
    if (expected.contextWindow === undefined) throw new Error('fixture must declare context');
    const target = row.target as ModelId;
    expect(getModelContextWindow(target), 'context window').toBe(expected.contextWindow);
    expect(getModelDisplayName(target), 'display name').toBe(expected.displayName);
    expect(getModelMaxOutput(target), 'max output').toBe(expected.maxOutputTokens);
    expect(getModelQualityScores(target), 'quality scores').toEqual(expected.qualityScores);
    expect(getCliModelName(target), 'CLI model name').toBe(expected.cliModelName);
    expect(lookupInTreeCapability(target)?.inputModalities).toEqual(expected.inputModalities);
    expect(modelSupportsAll(target, { minContextWindow: expected.contextWindow })).toBe(true);
  });

  it('brand-new overlays keep defaults when omitted and honor explicit metadata', () => {
    loadOverlay([
      { id: 'acme-x1', vendor: 'mistral', family: 'acme' },
      { id: 'acme-x2', vendor: 'mistral', family: 'acme', contextWindow: 32_768 },
    ]);
    expect(getModelContextWindow('acme-x1' as ModelId)).toBe(8_192);
    expect(getModelDisplayName('acme-x1' as ModelId)).toBe('acme-x1');
    expect(getModelMaxOutput('acme-x1' as ModelId)).toBeUndefined();
    expect(getModelQualityScores('acme-x1' as ModelId)).toBeUndefined();
    expect(getModelContextWindow('acme-x2' as ModelId)).toBe(32_768);
  });

  it('CLI lookup and the runtime matrix retain omitted metadata', () => {
    loadOverlay([{ id: 'claude-opus', vendor: 'anthropic', family: 'claude' }]);
    const baseline = buildInTreeEntries().find((e) => e.id === 'claude-opus');
    expect(baseline).toBeDefined();
    expect(resolveCliAlias('opus')).toBe('claude-opus');
    expect(findCanonicalModel('claude', 'opus')?.contextWindow).toBe(baseline?.contextWindow);
    expect(resolveCliModelName('claude', 'opus')).toBe(baseline?.cliModelName);
    expect(buildModelInfo('claude', 'opus')?.contextWindow).toBe(baseline?.contextWindow);
    expect(
      getInTreeCapabilitiesMatrix().models.find((e) => e.id === 'claude-opus')?.contextWindow
    ).toBe(baseline?.contextWindow);
  });

  it('a bare overlay claiming a CLI alias is never sent to the CLI as --model', () => {
    // Overlays cannot declare cliName, so an overlay-only id is not a name the
    // Claude CLI accepts; `opus` must still resolve to the curated model.
    loadOverlay([
      { id: 'claude-opus-corp', vendor: 'anthropic', family: 'claude', aliases: ['opus'] },
      { id: 'sonnet', vendor: 'anthropic', family: 'claude' },
    ]);
    expect(resolveCliAlias('opus')).toBe('claude-opus');
    expect(resolveCliAlias('sonnet')).toBe('claude-sonnet');
    expect(findCanonicalModel('claude', 'opus')?.id).toBe('claude-opus');
  });

  it('ambiguous in-tree aliases do not inherit one models metadata', () => {
    loadOverlay([
      {
        id: 'mixed',
        vendor: 'google',
        family: 'mixed',
        aliases: ['gpt-5.6-sol', 'claude-opus'],
        displayName: 'Mixed overlay',
      },
    ]);
    expect(getModelContextWindow('mixed' as ModelId)).toBe(8_192);
    expect(getModelMaxOutput('mixed' as ModelId)).toBeUndefined();
    expect(getModelQualityScores('mixed' as ModelId)).toBeUndefined();
    expect(getModelDisplayName('mixed' as ModelId)).toBe('Mixed overlay');
  });

  it('CLI helpers use an overlay keyed by an in-tree alias', () => {
    loadOverlay([
      {
        id: 'openai/gpt-6.1-sol',
        vendor: 'openai',
        family: 'gpt',
        contextWindow: 32_768,
      },
    ]);
    expect(resolveCliAlias('openai/gpt-6.1-sol')).toBe('openai/gpt-6.1-sol');
    expect(findCanonicalModel('codex', 'openai/gpt-6.1-sol')?.contextWindow).toBe(32_768);
    expect(buildModelInfo('codex', 'openai/gpt-6.1-sol')?.contextWindow).toBe(32_768);
  });

  it('CLI helpers retain legacy registry aliases when an overlay supplies new aliases', () => {
    loadOverlay([
      {
        id: 'gpt-6.1-sol',
        vendor: 'openai',
        family: 'gpt',
        aliases: ['sol-pinned'],
        contextWindow: 32_768,
      },
    ]);
    expect(resolveCliAlias('openai/gpt-6.1-sol')).toBe('gpt-6.1-sol');
    expect(findCanonicalModel('codex', 'openai/gpt-6.1-sol')?.contextWindow).toBe(32_768);
  });

  it('vendor discovery still constructs a lister when every vendor model is overlaid', async () => {
    const first = buildInTreeEntries().find((e) => e.vendor === 'openai');
    if (first === undefined) throw new Error('fixture must contain an OpenAI model');
    loadOverlay(
      buildInTreeEntries()
        .filter((e) => e.vendor === 'openai')
        .map((e) => ({
          id: e.id,
          vendor: e.vendor,
          family: e.family,
        }))
    );
    const adapter = await import('../adapters/openai-adapter.js');
    const construct = vi.spyOn(adapter, 'createOpenAIAdapter').mockImplementation(() => {
      throw new Error('lister constructed');
    });
    try {
      const source = buildDriftSources({ env: { OPENAI_API_KEY: 'test-placeholder' } }).find(
        (s) => s.name === 'openai-api'
      );
      expect(source).toBeDefined();
      await expect(source?.probe()).rejects.toThrow('lister constructed');
      expect(construct).toHaveBeenCalledWith({
        modelId: first.cliModelName ?? first.id,
        apiKey: 'test-placeholder',
      });
    } finally {
      construct.mockRestore();
    }
  });
});
