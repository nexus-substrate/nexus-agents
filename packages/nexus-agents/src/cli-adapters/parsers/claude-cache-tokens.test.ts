/**
 * The claude parser must not silently drop cache-creation tokens (#4435).
 *
 * `ClaudeResult.usage` declares `cache_creation_input_tokens`, but the parser
 * only ever extracted `input_tokens`, `output_tokens` and
 * `cache_read_input_tokens`. Cache-CREATION tokens were typed and then thrown
 * away — and they are the expensive ones: Anthropic bills them at ~1.25x the
 * uncached input rate, versus ~0.1x for cache reads.
 *
 * They are also not a rare case. A voter panel writes the cache on its first
 * call, so every fresh panel loses its largest input measurement entirely.
 *
 * Raised by the contrarian voter on #4435's panel, which was deciding what to
 * do about cache READ tokens; the creation gap had gone unnoticed.
 *
 * @module cli-adapters/parsers/claude-cache-tokens.test
 */

import { describe, it, expect } from 'vitest';
import { ClaudeResponseParser } from './claude-parser.js';

function resultLine(usage: Record<string, number>): string {
  return JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'ok',
    session_id: 's1',
    usage,
  });
}

describe('claude parser cache-token extraction (#4435)', () => {
  const parser = new ClaudeResponseParser();

  it('extracts cache-creation tokens instead of discarding them', () => {
    const out = parser.extractUsage(
      resultLine({
        input_tokens: 2,
        output_tokens: 500,
        cache_creation_input_tokens: 4000,
        cache_read_input_tokens: 0,
      })
    );

    expect(out?.cacheCreationInputTokens).toBe(4000);
  });

  it('still extracts cache-read tokens', () => {
    const out = parser.extractUsage(
      resultLine({ input_tokens: 2, output_tokens: 500, cache_read_input_tokens: 3980 })
    );

    expect(out?.cachedInputTokens).toBe(3980);
  });

  it('keeps read and creation distinct — they bill at different rates', () => {
    // ~0.1x for reads, ~1.25x for creation. Collapsing them into one number
    // would make correct pricing impossible later.
    const out = parser.extractUsage(
      resultLine({
        input_tokens: 10,
        output_tokens: 20,
        cache_creation_input_tokens: 700,
        cache_read_input_tokens: 300,
      })
    );

    expect(out?.cacheCreationInputTokens).toBe(700);
    expect(out?.cachedInputTokens).toBe(300);
  });

  it('omits the field entirely when the vendor did not report it', () => {
    // Absent must stay absent — a fabricated 0 would read as "no cache write
    // happened", which is exactly the false certainty #4430 was about.
    const out = parser.extractUsage(resultLine({ input_tokens: 100, output_tokens: 50 }));

    expect(out?.cacheCreationInputTokens).toBeUndefined();
  });

  it('leaves the uncached input count untouched', () => {
    // inputTokens keeps meaning uncached input; this change is additive.
    const out = parser.extractUsage(
      resultLine({ input_tokens: 2, output_tokens: 500, cache_creation_input_tokens: 4000 })
    );

    expect(out?.inputTokens).toBe(2);
    expect(out?.outputTokens).toBe(500);
  });
});
