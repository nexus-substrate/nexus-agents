import { describe, expect, it } from 'vitest';
import { VoteSchema } from '../consensus/types-core.js';
import { getVoterPrompts } from './voter-prompts.js';
import { parseVoteResponse, SyntheticVoteError } from './voter-response.js';

// Reconstructed from the old PR instructions; raw Claude JSON was not retained.
const RECONSTRUCTED_APPROVAL = JSON.stringify({
  decision: 'approve',
  reasoning: 'Read the diff and found no blocking defects. Existing tests cover the change.',
});

describe('PR-review vote response contract (#6957)', () => {
  it('rejects a reconstructed Claude approval without fabricating confidence', () => {
    // The live run retained parser errors, not raw responses. Reconstruct the
    // approval envelope suggested by the old PR-specific instructions.
    expect(() => parseVoteResponse(RECONSTRUCTED_APPROVAL, 'architect')).toThrow(
      SyntheticVoteError
    );
    expect(() => parseVoteResponse(RECONSTRUCTED_APPROVAL, 'architect')).toThrow(
      'expected number, received undefined'
    );
  });

  it('requires confidence in PR-review mode even when approving without findings', () => {
    for (const prompt of Object.values(getVoterPrompts())) {
      const addendum = prompt.slice(prompt.indexOf('PR-review mode'));
      expect(addendum).toContain('REQUIRED top-level decision, reasoning, and confidence');
      expect(addendum).toContain('confidence must be a number between 0 and 1');
    }
  });

  it('parses the complete PR-review system-prompt examples with both real schemas', () => {
    for (const prompt of Object.values(getVoterPrompts())) {
      const examples = [...prompt.matchAll(/```json\n([\s\S]*?)\n```/g)];
      // Without a complete example, reproduce the incomplete approval envelope
      // implied by the old system prompt through the same production parser.
      const responses =
        examples.length === 0
          ? [RECONSTRUCTED_APPROVAL]
          : examples.map((example) => example[1] ?? '');
      for (const response of responses) {
        const vote = parseVoteResponse(response, 'architect');
        expect(VoteSchema.safeParse(vote).success).toBe(true);
        expect(vote.confidence).toBeGreaterThan(0);
      }
      expect(examples).toHaveLength(2);
    }
  });
});
