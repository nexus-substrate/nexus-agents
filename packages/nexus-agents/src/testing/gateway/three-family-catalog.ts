/**
 * A recorded `GET /v1/models` catalogue for an OpenAI-spec gateway that fronts
 * OpenAI, Anthropic and Google models (#6610).
 *
 * The rows follow what LiteLLM-, Bedrock- and Vertex-backed gateways actually
 * list: ids carry slashes, dots, colons, underscores and vendor prefixes
 * (`anthropic.`, `vertex_ai/`, `models/`), some are dated snapshots, two rows
 * are listed twice, and ten are models that cannot chat (embedding, TTS,
 * transcription, image, moderation). Only the OpenAI-standard fields are
 * present, so the chat/non-chat decision falls to the id heuristic, as it does
 * on most real gateways.
 *
 * Listing order is part of the recording: discovery preserves it, and the
 * voter panel round-robins over it.
 *
 * @module testing/gateway/three-family-catalog
 */

/** One `data[]` row of an OpenAI-spec `GET /v1/models` response. */
export interface CatalogEntry {
  readonly id: string;
  readonly object: 'model';
  readonly created: number;
  readonly owned_by: string;
}

function row(id: string, created: number, ownedBy: string): CatalogEntry {
  return { id, object: 'model', created, owned_by: ownedBy };
}

/** The recorded catalogue, in listing order. */
export const THREE_FAMILY_CATALOG: readonly CatalogEntry[] = [
  // OpenAI
  row('gpt-5.2', 1765000000, 'openai'),
  row('gpt-5.2-2025-12-11', 1765400000, 'openai'),
  row('openai/gpt-4o', 1715367049, 'openai'),
  row('gpt-4o-mini', 1721172741, 'openai'),
  row('openai/o3', 1744000000, 'openai'),
  row('text-embedding-3-large', 1705953180, 'openai'),
  row('tts-1-hd', 1699046015, 'openai'),
  row('whisper-1', 1677532384, 'openai'),
  row('dall-e-3', 1698785189, 'openai'),
  row('omni-moderation-latest', 1731689265, 'openai'),
  row('gpt-5.2', 1765000000, 'openai'),
  // Anthropic
  row('anthropic.claude-sonnet-4-5-20250929-v1:0', 1759104000, 'anthropic'),
  row('claude-opus-4-1-20250805', 1754352000, 'anthropic'),
  row('anthropic/claude-haiku-4.5', 1760486400, 'anthropic'),
  row('claude_4_5_opus', 1763000000, 'anthropic'),
  // Google
  row('vertex_ai/gemini-2.5-pro', 1750118400, 'google'),
  row('models/gemini-2.5-flash', 1750118400, 'google'),
  row('gemini-3-pro-preview', 1763337600, 'google'),
  row('models/text-embedding-004', 1715731200, 'google'),
  row('gemini-embedding-001', 1752624000, 'google'),
  row('vertex_ai/imagen-4.0-generate-001', 1747353600, 'google'),
  row('gemini-2.5-flash-preview-tts', 1747958400, 'google'),
  row('gemini-2.5-flash-image', 1756252800, 'google'),
  row('models/gemini-2.5-flash', 1750118400, 'google'),
];

/**
 * The chat models discovery must keep from {@link THREE_FAMILY_CATALOG}:
 * deduplicated, non-chat rows dropped, ids verbatim, listing order kept.
 */
export const THREE_FAMILY_CHAT_IDS: readonly string[] = [
  'gpt-5.2',
  'gpt-5.2-2025-12-11',
  'openai/gpt-4o',
  'gpt-4o-mini',
  'openai/o3',
  'anthropic.claude-sonnet-4-5-20250929-v1:0',
  'claude-opus-4-1-20250805',
  'anthropic/claude-haiku-4.5',
  'claude_4_5_opus',
  'vertex_ai/gemini-2.5-pro',
  'models/gemini-2.5-flash',
  'gemini-3-pro-preview',
];

/**
 * The recorded catalogue plus `extra` fine-tuned chat rows, for the cap and
 * allowlist cases. The extra ids match none of the families' bare prefixes,
 * so an allowlist such as `claude*` does not reach them.
 */
export function oversizedCatalog(extra: number): readonly CatalogEntry[] {
  const tuned = Array.from({ length: extra }, (_, i) =>
    row(`bedrock/anthropic.claude-3-haiku-ft-${String(i).padStart(3, '0')}`, 1720000000 + i, 'org')
  );
  return [...THREE_FAMILY_CATALOG, ...tuned];
}

export type ModelFamily = 'openai' | 'anthropic' | 'google';

/** The upstream family a catalogue id belongs to, read from the id alone. */
export function familyOf(id: string): ModelFamily {
  const lower = id.toLowerCase();
  if (lower.includes('claude') || lower.startsWith('anthropic')) return 'anthropic';
  if (lower.includes('gemini') || lower.startsWith('vertex_ai/') || lower.startsWith('models/')) {
    return 'google';
  }
  return 'openai';
}
