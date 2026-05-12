/**
 * nexus-agents/mcp - Registry Import Logic
 *
 * Generates draft ModelCapability entries for adding new models
 * to the canonical registry. Conservative quality scores (5/10)
 * require human review before being trusted for routing.
 *
 * @module mcp/tools/registry-import
 * (Source: Issue #889, Epic #888)
 */

import type {
  ModelCapability,
  Provider,
  CliNameLiteral,
} from '../../config/model-capabilities-types.js';
import { getInTreeCapabilitiesMatrix } from '../../config/model-config-helpers.js';
import type { RegistryImportInput, RegistryImportResponse } from './registry-import-types.js';

// ============================================================================
// Provider → CLI mapping
// ============================================================================

const PROVIDER_CLI_MAP: Record<Provider, CliNameLiteral> = {
  anthropic: 'claude',
  google: 'gemini',
  openai: 'codex',
  'custom-openai': 'opencode',
  openrouter: 'opencode',
};

/** Default context windows when we can't determine from API. */
const DEFAULT_CONTEXT_WINDOWS: Record<Provider, number> = {
  anthropic: 200_000,
  google: 1_000_000,
  openai: 128_000,
  'custom-openai': 200_000,
  openrouter: 262_144,
};

// ============================================================================
// Public API
// ============================================================================

/**
 * Generates a draft ModelCapability entry for a given provider model.
 *
 * Always returns a template with conservative defaults.
 * Quality scores are set to 5/10 (middle of range) and
 * marked as unvalidated in the warnings.
 */
export function generateRegistryEntry(input: RegistryImportInput): RegistryImportResponse {
  const { provider, modelId, dryRun } = input;

  const existingEntry = findExistingEntry(provider, modelId);
  if (existingEntry !== undefined) {
    return {
      dryRun,
      entry: existingEntry,
      persisted: false,
      warnings: ['Model already exists in registry — no changes made.'],
    };
  }

  const entry = buildDraftEntry(provider, modelId);
  const warnings = buildWarnings(provider, modelId);

  return {
    dryRun,
    entry,
    persisted: false,
    warnings,
  };
}

// ============================================================================
// Internal Helpers
// ============================================================================

/** Checks if a model with this provider + modelId already exists. */
function findExistingEntry(provider: Provider, modelId: string): ModelCapability | undefined {
  return getInTreeCapabilitiesMatrix().models.find(
    (m) => m.provider === provider && m.cliModelName === modelId
  );
}

/** Builds a draft ModelCapability with conservative defaults. */
function buildDraftEntry(provider: Provider, modelId: string): ModelCapability {
  const cliName = PROVIDER_CLI_MAP[provider];
  const suggestedId = suggestRegistryId(provider, modelId);
  const displayName = formatDisplayName(provider, modelId);

  return {
    id: suggestedId as ModelCapability['id'],
    displayName,
    provider,
    contextWindow: DEFAULT_CONTEXT_WINDOWS[provider],
    outputModalities: ['text', 'code'],
    inputModalities: ['text', 'code'],
    toolCapabilities: ['function_calling'],
    specialFeatures: [],
    pricing: { inputPer1M: 0, outputPer1M: 0 },
    qualityScores: { reasoning: 5, codeGeneration: 5, speed: 5, cost: 5 },
    cliName,
    cliModelName: modelId,
  };
}

/** Suggests a registry ID from provider + model name. */
function suggestRegistryId(provider: Provider, modelId: string): string {
  const prefix = PROVIDER_CLI_MAP[provider];
  const simplified = modelId
    .replace(/[-_]?\d{8}$/, '')
    .replace(/^(claude|gemini|gpt|o\d)[-_]?/, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (simplified === '') return `${prefix}-new`;
  return `${prefix}-${simplified}`;
}

/** Formats a human-readable display name. */
function formatDisplayName(provider: Provider, modelId: string): string {
  const providerNames: Record<Provider, string> = {
    anthropic: 'Claude',
    google: 'Gemini',
    openai: 'Codex',
    'custom-openai': 'Custom',
    openrouter: 'OpenRouter',
  };
  const base = providerNames[provider];
  const cleaned = modelId
    .replace(/[-_]?\d{8}$/, '')
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
  return `${base} ${cleaned}`;
}

/** Generates warnings about fields that need human review. */
function buildWarnings(provider: Provider, modelId: string): string[] {
  return [
    `Quality scores set to 5/10 (unvalidated) — needs human review.`,
    `Pricing set to 0 — update from ${provider} pricing page.`,
    `Context window defaulted to ${String(DEFAULT_CONTEXT_WINDOWS[provider])} — verify from docs.`,
    `Registry ID is a suggestion — update to match MODEL_IDS enum before persisting.`,
    `Model "${modelId}" must be added to MODEL_IDS const in model-capabilities-types.ts.`,
  ];
}
