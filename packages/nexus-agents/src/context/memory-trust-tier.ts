/**
 * Trust-tier labels on stored memory, and the prompt-injection filter that
 * reads them (#6751 follow-up hardening).
 *
 * `memory_write` stores the content tier with each entry: as a tag
 * (`trust-tier:N`) on tag-carrying backends, and as `metadata.trustTier` on
 * beliefs. The context retriever reads it back to label injected lines and to
 * keep Tier 3+ entries out of privileged prompt prefixes.
 *
 * An entry with no stored tier is UNLABELLED, not trusted: it renders without a
 * tier label, and is kept, because entries written before this change and
 * entries written by internal producers carry no tier. Only a recorded Tier 3+
 * is excluded.
 *
 * @module context/memory-trust-tier
 */

import { TRUST_TIER_NUMERIC, TrustTierSchema } from '../security/trust-types.js';
import { leastTrustedTier } from '../security/content-trust-tier.js';
import type { TrustTier } from '../security/trust-types.js';
import type { Belief } from './belief-core-types.js';
import type { MemoryEntry } from './memory-backend-types.js';
import type { ScoredMemoryEntry } from './adaptive-memory-types.js';
import type { RankedMemoryItem } from './context-retriever-helpers.js';
import type { UnifiedContext } from './context-retriever.js';

/** Tag prefix carrying a stored entry's trust tier. */
export const MEMORY_TRUST_TIER_TAG_PREFIX = 'trust-tier:';

/** Numeric tier at and above which an entry is excluded from privileged prompts. */
const UNTRUSTED_TIER_FLOOR = 3;

/** The tag that records `tier` on a tag-carrying memory entry. */
export function memoryTrustTierTag(tier: TrustTier): string {
  return `${MEMORY_TRUST_TIER_TAG_PREFIX}${tier}`;
}

/**
 * Tier recorded on a memory entry's tags. Several tier tags resolve to the
 * least-trusted; none (or only malformed ones) resolves to `undefined`.
 */
export function memoryEntryTrustTier(entry: Pick<MemoryEntry, 'metadata'>): TrustTier | undefined {
  const tiers: TrustTier[] = [];
  for (const tag of entry.metadata.tags ?? []) {
    if (!tag.startsWith(MEMORY_TRUST_TIER_TAG_PREFIX)) continue;
    const parsed = TrustTierSchema.safeParse(tag.slice(MEMORY_TRUST_TIER_TAG_PREFIX.length));
    if (parsed.success) tiers.push(parsed.data);
  }
  return leastTrustedTier(tiers);
}

/** Tier recorded on a belief's metadata; `undefined` when absent or malformed. */
export function beliefTrustTier(belief: Pick<Belief, 'metadata'>): TrustTier | undefined {
  const parsed = TrustTierSchema.safeParse(belief.metadata?.['trustTier']);
  return parsed.success ? parsed.data : undefined;
}

/** Tier of a ranked item, for the sources `memory_write` can write to. */
export function rankedItemTrustTier(ranked: RankedMemoryItem): TrustTier | undefined {
  switch (ranked.source) {
    case 'belief':
      return beliefTrustTier(ranked.item as Belief);
    case 'agentic':
      return memoryEntryTrustTier(ranked.item as MemoryEntry);
    case 'adaptive':
      return memoryEntryTrustTier((ranked.item as ScoredMemoryEntry).entry);
    default:
      return undefined;
  }
}

/** True only for a RECORDED Tier 3 or 4; an unlabelled entry is not excluded. */
export function isUntrustedMemoryTier(tier: TrustTier | undefined): boolean {
  return tier !== undefined && TRUST_TIER_NUMERIC[tier] >= UNTRUSTED_TIER_FLOOR;
}

/** Line prefix naming a recorded tier; empty for an unlabelled entry. */
export function trustTierLabel(tier: TrustTier | undefined): string {
  return tier === undefined ? '' : `[tier ${tier}] `;
}

/**
 * Drop entries with a recorded Tier 3+ from every list a prompt prefix renders.
 * Returns a new object of the same shape; other fields are carried unchanged.
 */
export function withoutUntrustedMemory(ctx: UnifiedContext): UnifiedContext {
  return {
    ...ctx,
    beliefs: ctx.beliefs.filter((b) => !isUntrustedMemoryTier(beliefTrustTier(b))),
    similarMemories: ctx.similarMemories.filter(
      (m) => !isUntrustedMemoryTier(memoryEntryTrustTier(m))
    ),
    recentLearnings: ctx.recentLearnings.filter(
      (s) => !isUntrustedMemoryTier(memoryEntryTrustTier(s.entry))
    ),
    rankedMemories: ctx.rankedMemories.filter(
      (r) => !isUntrustedMemoryTier(rankedItemTrustTier(r))
    ),
  };
}
