/**
 * Gateway catalogue refinement (#6605, #6600).
 *
 * A corporate OpenAI-spec gateway lists everything it fronts, and discovery
 * builds one adapter — so one potential voter seat — per listed id. Three
 * things in a real listing break that:
 *
 *   1. duplicate rows, which would build two adapters for one model;
 *   2. non-chat models (embedding, TTS, image, moderation, audio, rerank),
 *      which error when asked to vote and can void an `absolute_quorum` panel;
 *   3. catalogues far above the adapter cap, which today refuse discovery
 *      outright — the operator allowlist (`NEXUS_OPENAI_COMPAT_MODELS`) is
 *      applied here, BEFORE the caller checks the cap.
 *
 * Ids are never rewritten: whatever survives is sent to the gateway exactly as
 * it was listed.
 *
 * @module adapters/gateway-catalog-filter
 */

import type { ILogger } from '../core/index.js';
import { OPENAI_COMPAT_MODELS_ENV } from './sdk/types.js';

/** How many excluded ids an exclusion log line carries as a sample. */
const EXCLUDED_SAMPLE_SIZE = 5;

/**
 * Read the operator allowlist: comma-separated, trimmed, empties and repeats
 * dropped. Unset, empty or all-blank yields `[]`, which means "no allowlist".
 */
export function readModelAllowlist(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  const raw = env[OPENAI_COMPAT_MODELS_ENV];
  if (raw === undefined) return [];
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  return [...new Set(entries)];
}

// ============================================================================
// Chat classification
// ============================================================================

type ChatVerdict = 'chat' | 'non-chat';

/** Listing `type` / `mode` values that name a chat-capable model. */
const CHAT_KINDS: ReadonlySet<string> = new Set([
  'chat',
  'completion',
  'completions',
  'chat_completion',
  'llm',
  'language',
  'text',
  'responses',
]);

/** Listing `type` / `mode` values that name a model which cannot chat. */
const NON_CHAT_KINDS: ReadonlySet<string> = new Set([
  'embedding',
  'embeddings',
  'image',
  'image_generation',
  'audio',
  'audio_speech',
  'audio_transcription',
  'tts',
  'stt',
  'transcription',
  'speech',
  'moderation',
  'moderations',
  'rerank',
  'reranker',
  'video',
  'video_generation',
]);

/** Fields gateways use to say what kind of model a row is. */
const KIND_FIELDS = ['type', 'mode', 'model_type', 'task'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function verdictFromKind(listing: Record<string, unknown>): ChatVerdict | undefined {
  for (const field of KIND_FIELDS) {
    const value = listing[field];
    if (typeof value !== 'string') continue;
    const kind = value.trim().toLowerCase();
    if (CHAT_KINDS.has(kind)) return 'chat';
    if (NON_CHAT_KINDS.has(kind)) return 'non-chat';
  }
  return undefined;
}

/** `capabilities.chat` / `capabilities.completion_chat` booleans. */
function verdictFromCapabilities(listing: Record<string, unknown>): ChatVerdict | undefined {
  const caps = listing['capabilities'];
  if (!isRecord(caps)) return undefined;
  const chat = caps['chat'] ?? caps['completion_chat'];
  if (typeof chat !== 'boolean') return undefined;
  return chat ? 'chat' : 'non-chat';
}

/** `architecture.output_modalities` array, or its `architecture.modality` `in->out` string. */
function verdictFromModalities(listing: Record<string, unknown>): ChatVerdict | undefined {
  const arch = listing['architecture'];
  if (!isRecord(arch)) return undefined;
  const outputs = arch['output_modalities'];
  if (Array.isArray(outputs) && outputs.length > 0) {
    return outputs.includes('text') ? 'chat' : 'non-chat';
  }
  const modality = arch['modality'];
  if (typeof modality !== 'string' || !modality.includes('->')) return undefined;
  const out = modality.slice(modality.indexOf('->') + 2).split('+');
  return out.includes('text') ? 'chat' : 'non-chat';
}

/**
 * What the listing row itself says, or `undefined` when it says nothing —
 * most gateways return only the OpenAI-standard `{id, object, created,
 * owned_by}`, and then the id heuristic decides.
 */
function verdictFromMetadata(listing: unknown): ChatVerdict | undefined {
  if (!isRecord(listing)) return undefined;
  return (
    verdictFromKind(listing) ?? verdictFromCapabilities(listing) ?? verdictFromModalities(listing)
  );
}

/**
 * Id shapes of non-chat models across the three families: OpenAI
 * (`text-embedding-*`, `tts-*`, `whisper-*`, `dall-e-*`, `*-moderation-*`,
 * `gpt-image-*`, `*-audio-*`, `*-realtime-*`, `*-transcribe`, `sora-*`),
 * Google (`*-embedding-*`, `imagen-*`, `*-image`, `*-live-*`, `veo-*`,
 * `lyria-*`) and rerankers. Whole-token where a substring would misfire
 * (`tts`, `audio`, `image`, `speech`, `realtime`, `live`, `video`, `sora`,
 * `veo`, `lyria`).
 */
const NON_CHAT_ID_PATTERNS: readonly RegExp[] = [
  /embed/,
  /whisper/,
  /moderation/,
  /rerank/,
  /dall-?e/,
  /imagen/,
  /transcri(?:be|ption)/,
  /(?:^|[-_/.:])(?:tts|audio|image|speech|realtime|live|video|sora|veo|lyria)(?:[-_/.:]|$)/,
];

function verdictFromId(id: string): ChatVerdict {
  const lower = id.toLowerCase();
  return NON_CHAT_ID_PATTERNS.some((p) => p.test(lower)) ? 'non-chat' : 'chat';
}

/**
 * Whether an id names a chat model, by the id alone. The same classifier
 * discovery falls back on when a listing carries no metadata; the family-slot
 * mapping (#6604) applies it too, so a realtime or image model a gateway
 * listed as chat never serves a CLI slot.
 */
export function isChatModelId(id: string): boolean {
  return verdictFromId(id) === 'chat';
}

// ============================================================================
// Refinement
// ============================================================================

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function dropDuplicates<T extends { readonly id: string }>(
  entries: readonly T[],
  logger: ILogger | undefined
): readonly T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    kept.push(entry);
  }
  const removed = entries.length - kept.length;
  if (removed > 0) {
    logger?.info(`Removed ${String(removed)} duplicate gateway model id(s)`, { removed });
  }
  return kept;
}

function dropNonChat<T extends { readonly id: string; readonly listing: unknown }>(
  entries: readonly T[],
  logger: ILogger | undefined
): { readonly chat: readonly T[]; readonly excluded: readonly string[] } {
  const chat: T[] = [];
  const excluded: string[] = [];
  for (const entry of entries) {
    const verdict = verdictFromMetadata(entry.listing) ?? verdictFromId(entry.id);
    if (verdict === 'chat') chat.push(entry);
    else excluded.push(entry.id);
  }
  if (excluded.length > 0) {
    logger?.info(
      `Excluded ${String(excluded.length)} non-chat gateway model(s) (embedding, TTS, image, moderation, audio, rerank)`,
      { excluded: excluded.length, sample: excluded.slice(0, EXCLUDED_SAMPLE_SIZE) }
    );
  }
  return { chat, excluded };
}

function applyAllowlist<T extends { readonly id: string }>(
  chat: readonly T[],
  excluded: readonly string[],
  allowlist: readonly string[],
  logger: ILogger | undefined
): readonly T[] {
  const patterns = allowlist.map((entry) => ({ entry, regex: globToRegExp(entry) }));
  const kept = chat.filter((e) => patterns.some((p) => p.regex.test(e.id)));
  const unmatched = patterns.filter((p) => !kept.some((e) => p.regex.test(e.id)));
  if (unmatched.length > 0) {
    const nonChat = unmatched.filter((p) => excluded.some((id) => p.regex.test(id)));
    logger?.warn(
      `${OPENAI_COMPAT_MODELS_ENV} entries matched no chat model in the gateway catalogue`,
      {
        absent: unmatched.filter((p) => !nonChat.includes(p)).map((p) => p.entry),
        excludedAsNonChat: nonChat.map((p) => p.entry),
      }
    );
  }
  return kept;
}

/**
 * Deduplicate, drop non-chat models, then — when `allowlist` is non-empty —
 * keep only the chat models it names. Listing order is preserved. The caller
 * applies the adapter cap to the result.
 */
export function refineGatewayCatalog<T extends { readonly id: string; readonly listing: unknown }>(
  entries: readonly T[],
  allowlist: readonly string[],
  logger?: ILogger
): readonly T[] {
  const { chat, excluded } = dropNonChat(dropDuplicates(entries, logger), logger);
  if (allowlist.length === 0) return chat;
  return applyAllowlist(chat, excluded, allowlist, logger);
}
